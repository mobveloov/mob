// Ajuda › Termos de uso, Central de suporte e Ouvidoria (rotas da gestão).
//
//   GET  /termos-painel                      texto, versão e o aceite do usuário (Admin vê quem já aceitou)
//   POST /termos-painel/aceitar              registra o aceite da versão em vigor
//   GET  /suporte                            contatos de suporte da plataforma
//   PUT  /suporte                            muda os contatos (só o ADMIN Mestre, dono da plataforma)
//   GET  /ouvidoria?status&tipo&busca&pagina lista (Admin: todas; os demais: só as suas)
//   POST /ouvidoria                          registra reclamação, sugestão ou elogio e devolve o protocolo
//   PUT  /ouvidoria/:id {status,resposta}    muda a situação e responde (Admin)
//
// Contatos de suporte: variáveis SUPORTE_WHATSAPP, SUPORTE_EMAIL, SUPORTE_TELEFONE, SUPORTE_SITE e SUPORTE_HORARIO (padrão) ou o que o
// dono da plataforma gravar na tela. Sem nenhum, a tela avisa que o contato ainda não foi informado (nada é inventado).

import crypto from "node:crypto";
import path from "node:path";
import type { Router } from "express";
import { podeCargo } from "../comum/cargos.ts";
import { ajuda } from "../config/ajuda.ts";
import { gravarConfig, lerConfig } from "../config/armazem.ts";
import { TERMOS_PAINEL_ATUALIZADO_EM, TERMOS_PAINEL_TEXTO, TERMOS_PAINEL_VERSAO } from "../config/termos-painel.ts";
import { raiz } from "../servidor/dados.ts";
import { arquivoDoBanco, banco, transacao } from "../servidor/banco.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";
import { agoraBr } from "../servidor/util.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { contem, emp, ok, paginar, quem, texto } from "./comum.ts";

// ====================================================================== Termos de uso

interface Aceite { versao: string; em: string; nome: string }
const aceitesDa = (empresaId: string) => lerConfig<{ aceites?: Record<string, Aceite> }>(empresaId, "termos-painel", {}).aceites ?? {};

export function rotasTermosPainel(r: Router) {
  r.get("/termos-painel", ok((req, res) => {
    const aceites = aceitesDa(emp(req)), meu = aceites[req.ctx!.usuario.email.toLowerCase()] ?? null;
    const admin = podeCargo(req.ctx!.usuario.papel, "admin");
    res.json({
      versao: TERMOS_PAINEL_VERSAO, atualizadoEm: TERMOS_PAINEL_ATUALIZADO_EM, texto: TERMOS_PAINEL_TEXTO,
      aceite: meu && meu.versao === TERMOS_PAINEL_VERSAO ? meu : null, aceiteAnterior: meu && meu.versao !== TERMOS_PAINEL_VERSAO ? meu : null,
      ...(admin ? { aceitos: Object.entries(aceites).map(([email, a]) => ({ email, ...a })).sort((a, b) => b.em.localeCompare(a.em)) } : {}),
    });
  }));
  r.post("/termos-painel/aceitar", ok((req, res) => {
    const e = emp(req), u = req.ctx!.usuario;
    const aceites = aceitesDa(e);
    const aceite: Aceite = { versao: TERMOS_PAINEL_VERSAO, em: agoraBr().toISOString(), nome: texto(u.nome, 80) };
    aceites[u.email.toLowerCase()] = aceite;
    gravarConfig(e, "termos-painel", { aceites });
    res.json({ aceite });
  }));
}

// ====================================================================== Central de suporte

export interface ContatosSuporte { whatsapp: string; email: string; telefone: string; site: string; horario: string }
const arquivoSuporte = () => path.join(raiz(), "suporte-plataforma.json");
const soNumeros = (v: unknown) => String(v ?? "").replace(/[^\d+]/g, "").slice(0, 20);

export function contatosDeSuporte(): ContatosSuporte {
  const g = lerJson<Partial<ContatosSuporte>>(arquivoSuporte(), {});
  const env = process.env;
  return {
    whatsapp: soNumeros(g.whatsapp || env.SUPORTE_WHATSAPP), email: texto(g.email || env.SUPORTE_EMAIL, 120), telefone: soNumeros(g.telefone || env.SUPORTE_TELEFONE),
    site: texto(g.site || env.SUPORTE_SITE, 200), horario: texto(g.horario || env.SUPORTE_HORARIO, 120),
  };
}

export function rotasSuporte(r: Router) {
  r.get("/suporte", ok((req, res) => {
    const a = ajuda(emp(req));
    res.json({ plataforma: contatosDeSuporte(), matriz: a.contato, tutoriais: a.tutoriais.length, duvidas: a.duvidas.length, editavel: req.ctx!.usuario.papel === "plataforma" });
  }));
  r.put("/suporte", exigirPapel(), ok((req, res) => {
    const b = req.body ?? {};
    const email = texto(b.email, 120), site = texto(b.site, 200);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    if (site && !/^https?:\/\//i.test(site)) throw new Error("O site precisa começar com http:// ou https://.");
    gravarJson(arquivoSuporte(), { whatsapp: soNumeros(b.whatsapp), email, telefone: soNumeros(b.telefone), site, horario: texto(b.horario, 120) }, { espacos: 1 });
    res.json({ plataforma: contatosDeSuporte() });
  }));
}

// ====================================================================== Ouvidoria

export const TIPOS_OUVIDORIA = ["Reclamação", "Sugestão", "Elogio"] as const;
export const STATUS_OUVIDORIA = ["Aberto", "Em análise", "Respondido", "Encerrado"] as const;
export interface Manifestacao { id: string; protocolo: string; tipo: string; assunto: string; mensagem: string; nome: string; contato: string; email: string; status: string; resposta: string; criadoEm: string; atualizadoEm: string; respondidoPor: string }

const criadas = new Set<string>();
function tabela() {
  const db = banco(), arq = arquivoDoBanco();
  if (!criadas.has(arq)) {
    db.exec(`CREATE TABLE IF NOT EXISTS ouvidoria (
      empresa TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, protocolo TEXT NOT NULL, tipo TEXT NOT NULL, assunto TEXT NOT NULL, mensagem TEXT NOT NULL,
      nome TEXT NOT NULL, contato TEXT NOT NULL DEFAULT '', email TEXT NOT NULL, status TEXT NOT NULL, resposta TEXT NOT NULL DEFAULT '',
      criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, respondido_por TEXT NOT NULL DEFAULT '', PRIMARY KEY (empresa, id));
      CREATE UNIQUE INDEX IF NOT EXISTS ouvidoria_protocolo ON ouvidoria (empresa, protocolo);`);
    criadas.add(arq);
  }
  return db;
}
const COLUNAS = "id, protocolo, tipo, assunto, mensagem, nome, contato, email, status, resposta, criado_em AS criadoEm, atualizado_em AS atualizadoEm, respondido_por AS respondidoPor";

/** Registra a manifestação e devolve o protocolo (OUV-AAAA-000001, em sequência por empresa). */
export function registrarManifestacao(empresaId: string, e: { tipo: unknown; assunto: unknown; mensagem: unknown; contato?: unknown; nome: string; email: string }): Manifestacao {
  const tipo = (TIPOS_OUVIDORIA as readonly string[]).find((t) => t === e.tipo);
  if (!tipo) throw new Error("Escolha o tipo: reclamação, sugestão ou elogio.");
  const assunto = texto(e.assunto, 120), mensagem = texto(e.mensagem, 3000);
  if (assunto.length < 3) throw new Error("Escreva o assunto.");
  if (mensagem.length < 10) throw new Error("Conte com mais detalhes (pelo menos 10 letras).");
  const agora = agoraBr().toISOString();
  return transacao(() => {
    const db = tabela();
    const seq = ((db.prepare("SELECT MAX(seq) AS m FROM ouvidoria WHERE empresa = ?").get(empresaId) as { m: number | null }).m ?? 0) + 1;
    const id = crypto.randomUUID(), protocolo = `OUV-${agora.slice(0, 4)}-${String(seq).padStart(6, "0")}`;
    db.prepare("INSERT INTO ouvidoria (empresa, id, seq, protocolo, tipo, assunto, mensagem, nome, contato, email, status, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aberto', ?, ?)")
      .run(empresaId, id, seq, protocolo, tipo, assunto, mensagem, texto(e.nome, 80), texto(e.contato, 120), e.email.toLowerCase(), agora, agora);
    return db.prepare(`SELECT ${COLUNAS} FROM ouvidoria WHERE empresa = ? AND id = ?`).get(empresaId, id) as unknown as Manifestacao;
  });
}

export function rotasOuvidoria(r: Router) {
  r.get("/ouvidoria", ok((req, res) => {
    const e = emp(req), admin = podeCargo(req.ctx!.usuario.papel, "admin");
    const busca = texto(req.query.busca, 80), status = texto(req.query.status, 20), tipo = texto(req.query.tipo, 20);
    const todas = (tabela().prepare(`SELECT ${COLUNAS} FROM ouvidoria WHERE empresa = ? ORDER BY seq DESC`).all(e) as unknown as Manifestacao[])
      .filter((m) => admin || m.email === req.ctx!.usuario.email.toLowerCase());
    const lista = todas.filter((m) => (!status || m.status === status) && (!tipo || m.tipo === tipo) && (!busca || contem(m.protocolo, busca) || contem(m.assunto, busca) || contem(m.nome, busca)));
    const { itens, paginacao } = paginar(lista, req.query.pagina);
    res.json({
      manifestacoes: itens, paginacao, todas: admin, tipos: TIPOS_OUVIDORIA, situacoes: STATUS_OUVIDORIA,
      kpis: { total: todas.length, abertas: todas.filter((m) => m.status === "Aberto").length, emAnalise: todas.filter((m) => m.status === "Em análise").length, respondidas: todas.filter((m) => m.status === "Respondido" || m.status === "Encerrado").length },
    });
  }));
  r.post("/ouvidoria", ok((req, res) => {
    const u = req.ctx!.usuario, b = req.body ?? {};
    res.json({ manifestacao: registrarManifestacao(emp(req), { tipo: b.tipo, assunto: b.assunto, mensagem: b.mensagem, contato: b.contato, nome: u.nome, email: u.email }) });
  }));
  r.put("/ouvidoria/:id", exigirPapel("admin"), ok((req, res) => {
    const e = emp(req), id = String(req.params.id), b = req.body ?? {};
    const atual = tabela().prepare(`SELECT ${COLUNAS} FROM ouvidoria WHERE empresa = ? AND id = ?`).get(e, id) as unknown as Manifestacao | undefined;
    if (!atual) throw Object.assign(new Error("Protocolo não encontrado."), { status: 404 });
    const status = (STATUS_OUVIDORIA as readonly string[]).find((s) => s === b.status) ?? atual.status;
    const resposta = b.resposta === undefined ? atual.resposta : texto(b.resposta, 3000);
    if ((status === "Respondido") && !resposta) throw new Error("Escreva a resposta antes de marcar como respondido.");
    tabela().prepare("UPDATE ouvidoria SET status = ?, resposta = ?, atualizado_em = ?, respondido_por = ? WHERE empresa = ? AND id = ?")
      .run(status, resposta, agoraBr().toISOString(), resposta && resposta !== atual.resposta ? quem(req) : atual.respondidoPor, e, id);
    res.json({ manifestacao: tabela().prepare(`SELECT ${COLUNAS} FROM ouvidoria WHERE empresa = ? AND id = ?`).get(e, id) });
  }));
}
