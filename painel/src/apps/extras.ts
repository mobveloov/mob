// Funções a mais dos apps do passageiro e do motorista (comparação com os apps de referência: docs/APPS_COMPARACAO.md).
//
// - Perfil, favoritos e bloqueios (passageiro <-> motorista), preferências de categoria do motorista.
// - Carteira (saldo, extrato, pagamento com saldo, taxa de cancelamento) e saques do motorista (a central paga o Pix).
// - Documentos do motorista (CNH, documento do veículo, foto), com aprovação pela central.
// - Desafios e indicações (código de indicação, progresso e prêmio na carteira).
// - Notificações da central (cadastro "Notificações do app"), objetos perdidos e reclamações (vão para os cadastros).
// - Link público para acompanhar a viagem ("compartilhar").
// Tudo por empresa: a empresa vem do token do app (ou do login do painel, nas rotas da central).

import crypto from "node:crypto";
import fs from "node:fs";
import express, { type Request, type Response } from "express";
import { cadastroPorId } from "../comum/cadastros.ts";
import { configDosApps, tiposDeDocumento } from "../config/apps.ts";
import { mensagensDaPessoa, receberDaPessoa } from "../config/comunicacao.ts";
import { criar, listar } from "../cadastros/armazem.ts";
import { aindaAgendada, avaliarPassageiro, listarProprias, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import { banco, transacao } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { ajustes } from "./ajustes.ts";
import { arquivo, num, txt } from "./armazem.ts";
import type { Lugares, Veiculo } from "./perfil.ts";
import type { PapelApp, SessaoApp } from "./sessoes.ts";
import { contaParaDesafio, TIPOS_DESAFIO_CORRIDA } from "../gestao/desafio-regra.ts";

const arred = (n: number) => Math.round(n * 100) / 100;
const hojeIso = () => agoraBr().toISOString().slice(0, 10);

// ====================================================================== pessoas (perfil e preferências)

export interface Documento { arquivo: string; mime: string; situacao: "Enviado" | "Aprovado" | "Recusado"; motivo: string; em: string }
export interface Pessoa {
  email: string;
  /** Passageiro: ids de motoristas. Motorista: telefones de passageiros. */
  favoritos: string[];
  bloqueados: string[];
  /** Motorista: categorias que ele quer receber (vazio = todas as habilitadas no cadastro). */
  categorias: string[];
  codigo: string;
  indicadoPor: string;
  /** Prêmios de desafios já pagos (id do desafio). */
  premios: string[];
  documentos: Record<string, Documento>;
  /** Senha do app (scrypt "sal:hash"). Vazia: a conta só entra por código. */
  senha: string;
  /** Nome do arquivo da foto de perfil (no motorista, a foto do rosto). */
  foto: string;
  cidadeId: string;
  /** Pedido de exclusão da conta (a central conclui). */
  exclusaoPedidaEm: string;
  /** Passageiro: casa, trabalho e favoritos. */
  lugares: Lugares;
  /** Motorista: formas de pagamento que aceita (vazio = todas) e opcionais que oferece (ids). */
  pagamentos: string[];
  filtros: string[];
  /** Motorista: veículos cadastrados (um ativo). */
  veiculos: Veiculo[];
}
const PESSOA_VAZIA: Pessoa = {
  email: "", favoritos: [], bloqueados: [], categorias: [], codigo: "", indicadoPor: "", premios: [], documentos: {},
  senha: "", foto: "", cidadeId: "", exclusaoPedidaEm: "", lugares: { casa: null, trabalho: null, favoritos: [] }, pagamentos: [], filtros: [], veiculos: [],
};

function linhaPessoa(empresaId: string, papel: PapelApp, chave: string): Pessoa | null {
  const r = banco().prepare("SELECT dados FROM app_pessoas WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { dados: string } | undefined;
  return r ? { ...PESSOA_VAZIA, ...JSON.parse(r.dados) } : null;
}

/** Perfil da pessoa no app (cria na primeira vez, com o código de indicação). */
export function pessoa(empresaId: string, papel: PapelApp, chave: string): Pessoa {
  const p = linhaPessoa(empresaId, papel, chave);
  if (p) return p;
  const nova: Pessoa = { ...PESSOA_VAZIA, codigo: novoCodigo(empresaId) };
  salvarPessoa(empresaId, papel, chave, nova);
  return nova;
}

export function salvarPessoa(empresaId: string, papel: PapelApp, chave: string, p: Pessoa) {
  banco().prepare(`INSERT INTO app_pessoas (empresa, papel, chave, codigo, indicado_por, dados) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (empresa, papel, chave) DO UPDATE SET codigo = excluded.codigo, indicado_por = excluded.indicado_por, dados = excluded.dados`)
    .run(empresaId, papel, chave, p.codigo, p.indicadoPor, JSON.stringify(p));
}

function novoCodigo(empresaId: string): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    const c = Array.from(crypto.randomBytes(6), (b) => letras[b % letras.length]).join("");
    if (!banco().prepare("SELECT 1 FROM app_pessoas WHERE empresa = ? AND codigo = ?").get(empresaId, c)) return c;
  }
}

const doCodigo = (empresaId: string, codigo: string) =>
  banco().prepare("SELECT papel, chave FROM app_pessoas WHERE empresa = ? AND codigo = ?").get(empresaId, codigo.toUpperCase()) as { papel: PapelApp; chave: string } | undefined;

/** Forma de pagamento aceita e opcionais pedidos: o motorista tem que oferecer tudo o que o passageiro pediu. */
export function atendeAsExigencias(m: Pessoa | null | undefined, c: CorridaPropria): boolean {
  if (m?.pagamentos.length && !m.pagamentos.some((x) => normal(x) === normal(c.pagamento))) return false;
  if (c.opcionais?.length && !c.opcionais.every((o) => m?.filtros.includes(o))) return false;
  return true;
}

/**
 * Foto das preferências de todos (uma consulta só), para uma rodada do despacho. Antes, cada par corrida x motorista
 * consultava o banco (a carga de 500 corridas ficou 4 vezes mais lenta).
 */
export function filtrosDoDespacho(empresaId: string) {
  const mot = new Map<string, Pessoa>(), pas = new Map<string, Pessoa>();
  for (const r of banco().prepare("SELECT papel, chave, dados FROM app_pessoas WHERE empresa = ?").all(empresaId) as Array<{ papel: PapelApp; chave: string; dados: string }>) {
    (r.papel === "motorista" ? mot : pas).set(r.chave, { ...PESSOA_VAZIA, ...JSON.parse(r.dados) });
  }
  return {
    podeAtender(c: CorridaPropria, motoristaId: string) {
      const m = mot.get(motoristaId);
      if (m?.bloqueados.includes(c.passageiro.telefone)) return false;
      if (m?.categorias.length && !m.categorias.some((x) => normal(x) === normal(c.categoria))) return false;
      if (!atendeAsExigencias(m, c)) return false;
      return !pas.get(c.passageiro.telefone)?.bloqueados.includes(motoristaId);
    },
    ehFavorito: (telefone: string, motoristaId: string) => !!pas.get(telefone)?.favoritos.includes(motoristaId),
  };
}

/** O motorista pode atender esta corrida? (bloqueio de qualquer um dos lados e categorias que ele escolheu) */
export function podeAtender(empresaId: string, c: CorridaPropria, motoristaId: string): boolean {
  const m = linhaPessoa(empresaId, "motorista", motoristaId);
  if (m?.bloqueados.includes(c.passageiro.telefone)) return false;
  if (m?.categorias.length && !m.categorias.some((x) => normal(x) === normal(c.categoria))) return false;
  if (!atendeAsExigencias(m, c)) return false;
  const p = linhaPessoa(empresaId, "passageiro", c.passageiro.telefone);
  return !p?.bloqueados.includes(motoristaId);
}

/** O passageiro marcou este motorista como favorito? (o despacho dá preferência) */
export function ehFavorito(empresaId: string, telefonePassageiro: string, motoristaId: string): boolean {
  return !!linhaPessoa(empresaId, "passageiro", telefonePassageiro)?.favoritos.includes(motoristaId);
}

// ====================================================================== carteira

export interface Lancamento { id: string; valor: number; descricao: string; corridaId: string | null; em: string; por: string }

export function lancar(empresaId: string, papel: PapelApp, chave: string, valor: number, descricao: string, por: string, corridaId: string | null = null): Lancamento {
  if (!Number.isFinite(valor) || valor === 0) throw new Error("Valor inválido.");
  const l: Lancamento = { id: crypto.randomUUID(), valor: arred(valor), descricao: descricao.slice(0, 120), corridaId, em: agoraBr().toISOString(), por: por.slice(0, 80) };
  banco().prepare("INSERT INTO carteira (empresa, id, papel, chave, valor, descricao, corrida_id, em, por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, l.id, papel, chave, l.valor, l.descricao, corridaId, l.em, l.por);
  return l;
}

export function saldo(empresaId: string, papel: PapelApp, chave: string): number {
  const r = banco().prepare("SELECT COALESCE(SUM(valor), 0) AS s FROM carteira WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { s: number };
  return arred(r.s);
}

export function extrato(empresaId: string, papel: PapelApp, chave: string, limite = 100): Lancamento[] {
  return (banco().prepare("SELECT id, valor, descricao, corrida_id AS corridaId, em, por FROM carteira WHERE empresa = ? AND papel = ? AND chave = ? ORDER BY em DESC, rowid DESC LIMIT ?")
    .all(empresaId, papel, chave, limite) as unknown as Lancamento[]);
}

/** Lançamento ligado a uma corrida, uma vez só (pagamento com saldo, taxa). */
function lancarUmaVez(empresaId: string, papel: PapelApp, chave: string, valor: number, descricao: string, corridaId: string, por: string) {
  const ja = banco().prepare("SELECT 1 FROM carteira WHERE empresa = ? AND papel = ? AND chave = ? AND corrida_id = ? AND descricao = ?").get(empresaId, papel, chave, corridaId, descricao.slice(0, 120));
  if (!ja) lancar(empresaId, papel, chave, valor, descricao, por, corridaId);
}

export const PAGAMENTO_SALDO = "Saldo da carteira";

/** Depois que a corrida finaliza: pago com saldo -> sai do passageiro e entra para o motorista. */
export function aposFinalizar(empresaId: string, c: CorridaPropria) {
  if (c.status !== "finalizada" || c.pagamento !== PAGAMENTO_SALDO || !c.valor || !c.motoristaId) return;
  transacao(() => {
    lancarUmaVez(empresaId, "passageiro", c.passageiro.telefone, -c.valor!, `Corrida OS ${c.os}`, c.id, "sistema");
    lancarUmaVez(empresaId, "motorista", c.motoristaId!, c.valor!, `Corrida OS ${c.os} (paga com saldo)`, c.id, "sistema");
  });
}

/** Depois que o passageiro cancela com taxa: a taxa sai da carteira dele e vai para o motorista. */
export function aposCancelar(empresaId: string, c: CorridaPropria) {
  if (c.status !== "cancelada" || !c.taxaCancelamento || !c.motoristaId) return;
  transacao(() => {
    lancarUmaVez(empresaId, "passageiro", c.passageiro.telefone, -c.taxaCancelamento!, `Taxa de cancelamento OS ${c.os}`, c.id, "sistema");
    lancarUmaVez(empresaId, "motorista", c.motoristaId!, c.taxaCancelamento!, `Taxa de cancelamento OS ${c.os}`, c.id, "sistema");
  });
}

/** Pagamento com saldo só se o saldo cobre a estimativa. */
export function conferirPagamento(empresaId: string, telefone: string, pagamento: string, estimativa: number | null) {
  if (pagamento !== PAGAMENTO_SALDO) return;
  const s = saldo(empresaId, "passageiro", telefone);
  if (estimativa == null || s < estimativa) throw new Error(`Saldo insuficiente (R$ ${s.toFixed(2).replace(".", ",")}). Escolha outra forma de pagamento.`);
}

// ------------------------------------------------------------------ saques do motorista

export interface Saque { id: string; motoristaId: string; nome: string; valor: number; chavePix: string; situacao: "Pendente" | "Pago" | "Recusado"; motivo: string; em: string; resolvidoEm: string | null; resolvidoPor: string }

export function pedirSaque(empresaId: string, motoristaId: string, nome: string, valor: number, chavePix: string): Saque {
  const v = arred(valor);
  const pix = chavePix.trim().slice(0, 120);
  if (!(v >= 10)) throw new Error("O saque mínimo é R$ 10,00.");
  if (pix.length < 5) throw new Error("Informe a chave Pix.");
  return transacao(() => {
    if (saldo(empresaId, "motorista", motoristaId) < v) throw new Error("Saldo insuficiente para este saque.");
    if (banco().prepare("SELECT 1 FROM saques WHERE empresa = ? AND motorista = ? AND situacao = 'Pendente'").get(empresaId, motoristaId)) throw new Error("Você já tem um saque esperando a central.");
    const s: Saque = { id: crypto.randomUUID(), motoristaId, nome: nome.slice(0, 80), valor: v, chavePix: pix, situacao: "Pendente", motivo: "", em: agoraBr().toISOString(), resolvidoEm: null, resolvidoPor: "" };
    banco().prepare("INSERT INTO saques (empresa, id, motorista, situacao, em, dados) VALUES (?, ?, ?, ?, ?, ?)").run(empresaId, s.id, motoristaId, s.situacao, s.em, JSON.stringify(s));
    // O valor fica reservado (sai do saldo agora; volta se a central recusar).
    lancar(empresaId, "motorista", motoristaId, -v, "Saque solicitado (Pix)", "app do motorista");
    return s;
  });
}

export function saques(empresaId: string, motoristaId?: string): Saque[] {
  const linhas = motoristaId
    ? banco().prepare("SELECT dados FROM saques WHERE empresa = ? AND motorista = ? ORDER BY em DESC").all(empresaId, motoristaId)
    : banco().prepare("SELECT dados FROM saques WHERE empresa = ? ORDER BY situacao = 'Pendente' DESC, em DESC LIMIT 300").all(empresaId);
  return linhas.map((r) => JSON.parse(String((r as { dados: string }).dados)) as Saque);
}

export function resolverSaque(empresaId: string, id: string, pago: boolean, por: string, motivo = ""): Saque {
  return transacao(() => {
    const r = banco().prepare("SELECT dados FROM saques WHERE empresa = ? AND id = ?").get(empresaId, id) as { dados: string } | undefined;
    if (!r) throw new Error("Saque não encontrado.");
    const s = JSON.parse(r.dados) as Saque;
    if (s.situacao !== "Pendente") throw new Error("Este saque já foi resolvido.");
    s.situacao = pago ? "Pago" : "Recusado"; s.motivo = motivo.slice(0, 200); s.resolvidoEm = agoraBr().toISOString(); s.resolvidoPor = por.slice(0, 80);
    banco().prepare("UPDATE saques SET situacao = ?, dados = ? WHERE empresa = ? AND id = ?").run(s.situacao, JSON.stringify(s), empresaId, id);
    if (!pago) lancar(empresaId, "motorista", s.motoristaId, s.valor, `Saque recusado (estorno)${s.motivo ? `: ${s.motivo}` : ""}`, por);
    return s;
  });
}

/** Saldos de todos (tela Carteiras do painel). */
export function saldos(empresaId: string) {
  return banco().prepare("SELECT papel, chave, ROUND(SUM(valor), 2) AS saldo, COUNT(*) AS lancamentos, MAX(em) AS ultimo FROM carteira WHERE empresa = ? GROUP BY papel, chave ORDER BY ultimo DESC")
    .all(empresaId) as Array<{ papel: PapelApp; chave: string; saldo: number; lancamentos: number; ultimo: string }>;
}

// ====================================================================== documentos do motorista

/** Documentos que o app aceita: os configurados no painel (Gerais do App) e as fotos das laterais do veículo. */
/** Documentos a mais da Machine (certidão, alvará e documentos do veículo): a central envia, o app não exige. */
export const DOCUMENTOS_MACHINE: Record<string, string> = {
  antecedentes: "Certidão de antecedentes criminais", alvara: "Alvará",
  autonomiaFrente: "Autonomia (frente)", autonomiaVerso: "Autonomia (verso)", fotoVeiculo: "Foto do veículo",
};
export const tiposDoApp = (empresaId: string): Record<string, string> => ({
  ...tiposDeDocumento(empresaId),
  lateralEsquerda: "Foto da lateral esquerda do veículo", lateralDireita: "Foto da lateral direita do veículo",
  ...DOCUMENTOS_MACHINE,
});
export const TIPOS_DOCUMENTO: Record<string, string> = {
  cnh: "CNH (frente e verso)", residencia: "Comprovante de residência", crlv: "CRLV do veículo",
  lateralEsquerda: "Foto da lateral esquerda do veículo", lateralDireita: "Foto da lateral direita do veículo",
  /** Do app antigo; continuam valendo. */
  veiculo: "Documento do veículo (CRLV)", foto: "Foto do rosto",
  ...DOCUMENTOS_MACHINE,
};
const MIME_DOC: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
export const MAX_DOC = 5 * 1024 * 1024;

function cabecalhoDoc(ext: string, b: Uint8Array) {
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === "pdf") return Buffer.from(b.subarray(0, 5)).toString("latin1") === "%PDF-";
  return false;
}

export function enviarDocumento(empresaId: string, motoristaId: string, tipo: string, mime: string, bytes: Uint8Array): Documento {
  if (!tiposDoApp(empresaId)[tipo]) throw new Error("Tipo de documento inválido.");
  const ext = MIME_DOC[String(mime).split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("Envie uma foto (JPG ou PNG) ou um PDF.");
  if (!bytes?.length || bytes.length > MAX_DOC) throw new Error("Arquivo vazio ou maior que 5 MB.");
  if (!cabecalhoDoc(ext, bytes)) throw new Error("O arquivo não é uma foto ou PDF válido.");
  if (!/^[\w-]{6,64}$/.test(motoristaId)) throw new Error("Motorista inválido.");
  const nome = `${tipo}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const pasta = arquivo(empresaId, "documentos", motoristaId);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(arquivo(empresaId, "documentos", motoristaId, nome), bytes, { mode: 0o600 });
  const p = pessoa(empresaId, "motorista", motoristaId);
  const antigo = p.documentos[tipo]?.arquivo;
  const d: Documento = { arquivo: nome, mime: Object.keys(MIME_DOC).find((k) => MIME_DOC[k] === ext)!, situacao: "Enviado", motivo: "", em: agoraBr().toISOString() };
  p.documentos = { ...p.documentos, [tipo]: d };
  salvarPessoa(empresaId, "motorista", motoristaId, p);
  if (antigo) fs.rmSync(arquivo(empresaId, "documentos", motoristaId, antigo), { force: true });
  return d;
}

/** Exclui o arquivo de um documento do motorista (o motorista volta a ver "Pendente"). */
export function removerDocumento(empresaId: string, motoristaId: string, tipo: string): void {
  if (!/^[\w-]{6,64}$/.test(motoristaId) || !tiposDoApp(empresaId)[tipo]) throw new Error("Tipo de documento inválido.");
  const p = linhaPessoa(empresaId, "motorista", motoristaId);
  const d = p?.documentos[tipo];
  if (!p || !d) throw new Error("Documento não encontrado.");
  const { [tipo]: _tirado, ...resto } = p.documentos;
  p.documentos = resto;
  salvarPessoa(empresaId, "motorista", motoristaId, p);
  fs.rmSync(arquivo(empresaId, "documentos", motoristaId, d.arquivo), { force: true });
}

export function arquivoDoDocumento(empresaId: string, motoristaId: string, tipo: string): { caminho: string; mime: string } | null {
  if (!/^[\w-]{6,64}$/.test(motoristaId) || !tiposDoApp(empresaId)[tipo]) return null;
  const d = linhaPessoa(empresaId, "motorista", motoristaId)?.documentos[tipo];
  if (!d) return null;
  const caminho = arquivo(empresaId, "documentos", motoristaId, d.arquivo);
  return fs.existsSync(caminho) ? { caminho, mime: d.mime } : null;
}

export function avaliarDocumento(empresaId: string, motoristaId: string, tipo: string, aprovado: boolean, motivo = ""): Documento {
  if (!tiposDoApp(empresaId)[tipo]) throw new Error("Tipo de documento inválido.");
  const p = linhaPessoa(empresaId, "motorista", motoristaId);
  const d = p?.documentos[tipo];
  if (!p || !d) throw new Error("Documento não encontrado.");
  if (!aprovado && !motivo.trim()) throw new Error("Diga o motivo da recusa (o motorista vê).");
  const novo: Documento = { ...d, situacao: aprovado ? "Aprovado" : "Recusado", motivo: aprovado ? "" : motivo.trim().slice(0, 200) };
  p.documentos = { ...p.documentos, [tipo]: novo };
  salvarPessoa(empresaId, "motorista", motoristaId, p);
  return novo;
}

/** Documentos de todos os motoristas (tela do painel). */
export function documentosDosMotoristas(empresaId: string) {
  const cad = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  return (banco().prepare("SELECT chave, dados FROM app_pessoas WHERE empresa = ? AND papel = 'motorista'").all(empresaId) as Array<{ chave: string; dados: string }>)
    .map((r) => ({ motoristaId: r.chave, nome: String(cad.get(r.chave)?.nome ?? ""), telefone: String(cad.get(r.chave)?.telefone ?? ""), documentos: (JSON.parse(r.dados) as Pessoa).documentos ?? {} }))
    .filter((x) => Object.keys(x.documentos).length);
}

// ====================================================================== desafios e indicações

export interface Progresso { id: string; nome: string; tipo: string; meta: number; feito: number; premio: number | null; fim: string | null; regras: string; ganho: boolean }

/** Desafios ativos para esta pessoa, com o progresso. Meta atingida: o prêmio entra na carteira (uma vez). */
export function desafios(empresaId: string, papel: PapelApp, chave: string): Progresso[] {
  const hoje = hojeIso();
  const p = pessoa(empresaId, papel, chave);
  const corridas = listarProprias(empresaId);
  const lista = listar(empresaId, cadastroPorId("desafios")!).filter((d) => d.ativo === true && d.cancelado !== true && String(d.inicio ?? "") <= hoje && (!d.fim || String(d.fim) >= hoje));
  const out: Progresso[] = [];
  for (const d of lista) {
    const tipo = String(d.tipo ?? "");
    const ini = String(d.inicio ?? "0000"), fim = d.fim ? String(d.fim) : "9999";
    let feito = 0;
    if (TIPOS_DESAFIO_CORRIDA.includes(tipo)) {
      if (papel !== "motorista") continue;
      const cats = String(d.categorias ?? "").split(",").map((x) => normal(x)).filter(Boolean);
      feito = corridas.filter((c) => c.motoristaId === chave && contaParaDesafio(tipo, c) && (c.finalizadaEm ?? "").slice(0, 10) >= ini && (c.finalizadaEm ?? "").slice(0, 10) <= fim
        && (!cats.length || cats.includes(normal(c.categoria)))).length;
    } else if (tipo === "Indicação de passageiro" || tipo === "Indicação de motorista") {
      const papelIndicado: PapelApp = tipo === "Indicação de passageiro" ? "passageiro" : "motorista";
      const indicados = (banco().prepare("SELECT chave FROM app_pessoas WHERE empresa = ? AND papel = ? AND indicado_por = ?").all(empresaId, papelIndicado, p.codigo) as Array<{ chave: string }>).map((r) => r.chave);
      // Conta quem já fez pelo menos uma corrida finalizada.
      feito = indicados.filter((k) => corridas.some((c) => c.status === "finalizada" && (papelIndicado === "passageiro" ? c.passageiro.telefone === k : c.motoristaId === k))).length;
    } else continue;
    const meta = Number(d.meta) || 0;
    const premio = typeof d.premio === "number" ? d.premio : null;
    let ganho = p.premios.includes(d.id);
    if (!ganho && meta > 0 && feito >= meta && premio && premio > 0 && d.aprovacao !== "Manual") { // manual: a central aprova em Desafios
      lancar(empresaId, papel, chave, premio, `Prêmio: ${String(d.nome)}`, "sistema");
      p.premios = [...p.premios, d.id];
      salvarPessoa(empresaId, papel, chave, p);
      ganho = true;
    }
    out.push({ id: d.id, nome: String(d.nome), tipo, meta, feito, premio, fim: d.fim ? String(d.fim) : null, regras: String(d.regras ?? ""), ganho });
  }
  return out;
}

// ====================================================================== notificações da central

export function notificacoes(empresaId: string, papel: PapelApp) {
  const hoje = hojeIso();
  const publico = papel === "passageiro" ? "Passageiros" : "Motoristas";
  return listar(empresaId, cadastroPorId("notificacoes")!)
    .filter((n) => n.ativa === true && (n.publico === "Todos" || n.publico === publico) && (!n.inicio || String(n.inicio) <= hoje) && (!n.fim || String(n.fim) >= hoje))
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
    .slice(0, 50)
    .map((n) => ({ id: n.id, titulo: String(n.titulo ?? ""), texto: String(n.texto ?? ""), em: String(n.inicio ?? n.criadoEm ?? "").slice(0, 10) }));
}

// ====================================================================== link público de acompanhamento

function htmlAcompanhar(empresaId: string, c: CorridaPropria | null) {
  const m = D.marca(empresaId);
  const esc = (s: string) => s.replace(/[&<>"']/g, (x) => `&#${x.charCodeAt(0)};`);
  const corpo = !c ? "<p>Este link não vale mais.</p>" : `
    <h2>${esc(STATUS_TEXTO[c.status])}</h2>
    <p><b>Embarque:</b> ${esc(c.embarque.texto)}</p>
    ${c.paradas?.length ? `<p><b>Paradas:</b> ${c.paradas.map((p) => esc(p.texto)).join(" → ")}</p>` : ""}
    ${c.destino ? `<p><b>Destino:</b> ${esc(c.destino.texto)}</p>` : ""}
    ${c.motorista ? `<p><b>Motorista:</b> ${esc(c.motorista.split(" ")[0])}</p>` : ""}
    <p class="sub">Atualiza sozinho a cada 20 segundos.</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="20"><meta name="robots" content="noindex"><title>${esc(m.nomeExibido)}: acompanhar viagem</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:${esc(m.cores.fundo)};color:${esc(m.cores.texto)}}main{max-width:480px;margin:0 auto;padding:20px 16px}
h1{font-size:1.2rem;color:${esc(m.cores.primaria)};margin:0 0 12px}h2{margin:0 0 12px}.sub{opacity:.7;font-size:.9rem}</style></head>
<body><main><h1>${esc(m.nomeExibido)}</h1>${corpo}</main></body></html>`;
}

/** Corrida do link (só enquanto aberta ou até 2 horas depois de terminar). */
export function corridaDoLink(empresaId: string, codigo: string): CorridaPropria | null {
  if (!/^[\w-]{10,40}$/.test(codigo)) return null;
  const c = listarProprias(empresaId).find((x) => x.compartilhamento === codigo);
  if (!c) return null;
  const fim = c.finalizadaEm ?? (c.status === "cancelada" || c.status === "nao_atendida" ? c.historico.at(-1)?.em : null);
  if (fim && agoraBr().getTime() - Date.parse(fim) > 2 * 3600_000) return null;
  return c;
}

// ====================================================================== rotas

type Ctx = { empresaId: string; sessao: SessaoApp; token: string };
const ctx = (req: Request) => (req as Request & { app_: Ctx }).app_;
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status((e as { status?: number }).status ?? 400).json({ erro: e instanceof Error ? e.message : String(e) }); }
};
const so = (papel: PapelApp) => (req: Request, res: Response, next: express.NextFunction) => (ctx(req).sessao.papel === papel ? next() : res.status(403).json({ erro: "Esta função é do outro app." }));

/** A corrida é desta pessoa? */
function minhaCorrida(req: Request): CorridaPropria {
  const { empresaId, sessao } = ctx(req);
  const c = listarProprias(empresaId).find((x) => x.id === req.params.id);
  const minha = c && (sessao.papel === "passageiro" ? c.passageiro.telefone === sessao.chave : c.motoristaId === sessao.chave);
  if (!c || !minha) throw new Error("Corrida não encontrada.");
  return c;
}

/** Rotas públicas (antes do token): o link de acompanhar. */
export const rotasPublicasExtras = express.Router({ mergeParams: true });
rotasPublicasExtras.get("/acompanhar/:codigo", (req, res) => {
  const empresaId = (req.params as Record<string, string>).empresa; // vem do roteador de cima (/:empresa)
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.send(htmlAcompanhar(empresaId, corridaDoLink(empresaId, String(req.params.codigo))));
});

/** Rotas com o token do app. */
export const rotasExtras = express.Router({ mergeParams: true });

const pessoaNome = (empresaId: string, papel: PapelApp, chave: string) =>
  String(listar(empresaId, cadastroPorId(papel === "motorista" ? "motoristas" : "clientes")!).find((x) => (papel === "motorista" ? x.id : String(x.telefone)) === chave)?.nome ?? "");
rotasExtras.get("/config", ok((req, res) => res.json(configDosApps(ctx(req).empresaId))));
rotasExtras.get("/central/mensagens", ok((req, res) => { const { empresaId, sessao } = ctx(req); res.json({ mensagens: mensagensDaPessoa(empresaId, sessao.papel, sessao.chave) }); }));
rotasExtras.post("/central/mensagens", ok((req, res) => { const { empresaId, sessao } = ctx(req); res.json({ mensagem: receberDaPessoa(empresaId, sessao.papel, sessao.chave, pessoaNome(empresaId, sessao.papel, sessao.chave), String(req.body?.texto ?? "")) }); }));
rotasExtras.get("/perfil", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const p = pessoa(empresaId, sessao.papel, sessao.chave);
  res.json({ email: p.email, codigo: p.codigo, indicadoPor: p.indicadoPor, favoritos: p.favoritos, bloqueados: p.bloqueados, categorias: p.categorias });
}));
rotasExtras.post("/perfil", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const p = pessoa(empresaId, sessao.papel, sessao.chave);
  if (req.body?.email !== undefined) {
    const e = String(req.body.email).trim().toLowerCase().slice(0, 120);
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("E-mail inválido.");
    p.email = e;
  }
  if (req.body?.indicadoPor) {
    if (p.indicadoPor) throw new Error("O código de indicação já foi informado.");
    const cod = String(req.body.indicadoPor).trim().toUpperCase();
    const quem = doCodigo(empresaId, cod);
    if (!quem) throw new Error("Código de indicação não encontrado.");
    if (quem.papel === sessao.papel && quem.chave === sessao.chave) throw new Error("Não vale indicar a si mesmo.");
    p.indicadoPor = cod;
  }
  salvarPessoa(empresaId, sessao.papel, sessao.chave, p);
  res.json({ email: p.email, codigo: p.codigo, indicadoPor: p.indicadoPor });
}));

// Favoritos e bloqueios: sempre a partir de uma corrida em que a pessoa esteve (não dá para chutar ids).
function alternar(req: Request, lista: "favoritos" | "bloqueados") {
  const { empresaId, sessao } = ctx(req);
  const c = minhaCorrida(req);
  const alvo = sessao.papel === "passageiro" ? c.motoristaId : c.passageiro.telefone;
  if (!alvo) throw new Error("Esta corrida não teve motorista.");
  if (lista === "favoritos" && sessao.papel !== "passageiro") throw new Error("Favoritos são do app do passageiro.");
  const p = pessoa(empresaId, sessao.papel, sessao.chave);
  const ligar = req.body?.ligar !== false;
  const sem = p[lista].filter((x) => x !== alvo);
  p[lista] = ligar ? [...sem, alvo].slice(-200) : sem;
  if (ligar && lista === "bloqueados") p.favoritos = p.favoritos.filter((x) => x !== alvo);
  if (ligar && lista === "favoritos") p.bloqueados = p.bloqueados.filter((x) => x !== alvo);
  salvarPessoa(empresaId, sessao.papel, sessao.chave, p);
  return { favorito: p.favoritos.includes(alvo), bloqueado: p.bloqueados.includes(alvo) };
}
rotasExtras.post("/corridas/:id/favorito", ok((req, res) => res.json(alternar(req, "favoritos"))));
rotasExtras.post("/corridas/:id/bloquear", ok((req, res) => res.json(alternar(req, "bloqueados"))));

/** Favoritos do passageiro, com nome e carro (para a tela). */
rotasExtras.get("/favoritos", so("passageiro"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const p = pessoa(empresaId, "passageiro", sessao.chave);
  const cad = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  const mostrar = (id: string) => ({ id, nome: String(cad.get(id)?.nome ?? "Motorista"), veiculo: String(cad.get(id)?.veiculo ?? ""), placa: String(cad.get(id)?.placa ?? "") });
  res.json({ favoritos: p.favoritos.map(mostrar), bloqueados: p.bloqueados.map(mostrar) });
}));
rotasExtras.post("/favoritos/:motoristaId/remover", so("passageiro"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const p = pessoa(empresaId, "passageiro", sessao.chave);
  const id = String(req.params.motoristaId);
  p.favoritos = p.favoritos.filter((x) => x !== id); p.bloqueados = p.bloqueados.filter((x) => x !== id);
  salvarPessoa(empresaId, "passageiro", sessao.chave, p);
  res.json({ ok: true });
}));

// Preferências do motorista: só categorias em que ele está habilitado no cadastro.
rotasExtras.get("/preferencias", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const cad = listar(empresaId, cadastroPorId("motoristas")!).find((m) => m.id === sessao.chave);
  const habilitadas = String(cad?.categorias ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const todas = listar(empresaId, cadastroPorId("categorias")!).filter((c) => c.ativa !== false).map((c) => String(c.nome));
  const podem = habilitadas.length ? todas.filter((c) => habilitadas.some((h) => normal(h) === normal(c))) : todas;
  const p = pessoa(empresaId, "motorista", sessao.chave);
  const aj = ajustes(empresaId);
  res.json({ podem, escolhidas: p.categorias, pagamentos: p.pagamentos, filtros: p.filtros, pagamentosDisponiveis: aj.pagamentos, filtrosDisponiveis: aj.opcionais });
}));
rotasExtras.post("/preferencias", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const escolhidas = Array.isArray(req.body?.categorias) ? req.body.categorias.map((x: unknown) => txt(x, 60)).filter(Boolean).slice(0, 20) : [];
  const p = pessoa(empresaId, "motorista", sessao.chave);
  p.categorias = escolhidas;
  const aj = ajustes(empresaId);
  if (Array.isArray(req.body?.pagamentos)) p.pagamentos = req.body.pagamentos.map((x: unknown) => txt(x, 40)).filter((x: string) => aj.pagamentos.includes(x));
  if (Array.isArray(req.body?.filtros)) p.filtros = req.body.filtros.map((x: unknown) => txt(x, 20)).filter((x: string) => aj.opcionais.some((o) => o.id === x));
  salvarPessoa(empresaId, "motorista", sessao.chave, p);
  res.json({ escolhidas, pagamentos: p.pagamentos, filtros: p.filtros });
}));

// Carteira
rotasExtras.get("/carteira", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const m = D.marca(empresaId);
  res.json({
    saldo: saldo(empresaId, sessao.papel, sessao.chave), extrato: extrato(empresaId, sessao.papel, sessao.chave),
    saques: sessao.papel === "motorista" ? saques(empresaId, sessao.chave) : undefined,
    recarga: `Para pôr saldo, fale com a central${m.textos.suporteTelefone ? ` (${m.textos.suporteTelefone})` : ""}. O valor entra na hora em que a central confirmar.`,
  });
}));
rotasExtras.post("/saques", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const cad = listar(empresaId, cadastroPorId("motoristas")!).find((m) => m.id === sessao.chave);
  res.json({ saque: pedirSaque(empresaId, sessao.chave, String(cad?.nome ?? ""), Number(req.body?.valor), String(req.body?.chavePix ?? "")) });
}));

// Documentos do motorista (corpo cru com o Content-Type do arquivo)
rotasExtras.get("/documentos", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const docs = pessoa(empresaId, "motorista", sessao.chave).documentos;
  res.json({ tipos: tiposDoApp(empresaId), documentos: Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, { situacao: d.situacao, motivo: d.motivo, em: d.em }])) });
}));
rotasExtras.post("/documentos/:tipo", so("motorista"), (req, res, next) => {
  if (Number(req.headers["content-length"] ?? 0) > MAX_DOC) return res.status(413).json({ erro: "Arquivo maior que 5 MB." });
  express.raw({ type: () => true, limit: MAX_DOC })(req, res, (err?: unknown) => (err ? res.status(413).json({ erro: "Arquivo maior que 5 MB." }) : next()));
}, ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const d = enviarDocumento(empresaId, sessao.chave, String(req.params.tipo), String(req.headers["content-type"] ?? ""), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  res.json({ documento: { situacao: d.situacao, em: d.em } });
}));

// Desafios, indicação e notificações
rotasExtras.get("/desafios", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  res.json({ codigo: pessoa(empresaId, sessao.papel, sessao.chave).codigo, desafios: desafios(empresaId, sessao.papel, sessao.chave) });
}));
rotasExtras.get("/notificacoes", ok((req, res) => res.json({ notificacoes: notificacoes(ctx(req).empresaId, ctx(req).sessao.papel) })));

// Objeto perdido e reclamação/contestação: viram registros nos cadastros da central.
rotasExtras.post("/corridas/:id/objeto", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = minhaCorrida(req);
  const descricao = txt(req.body?.descricao, 200);
  if (descricao.length < 3) throw new Error("Descreva o objeto.");
  const r = criar(empresaId, cadastroPorId("objetos")!, {
    descricao, os: c.os, data: hojeIso(), passageiro: `${c.passageiro.nome} ${c.passageiro.telefone}`, motorista: c.motorista,
    situacao: sessao.papel === "motorista" ? "Com o motorista" : "Procurando", observacao: `Aberto pelo app do ${sessao.papel}.`,
  }, `app do ${sessao.papel}`);
  res.json({ registro: { id: r.id, situacao: r.situacao } });
}));
const ASSUNTOS = ["Cobrança", "Comportamento", "Atraso", "Rota", "Veículo", "Outro"];
rotasExtras.post("/corridas/:id/ocorrencia", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = minhaCorrida(req);
  const assunto = ASSUNTOS.includes(req.body?.assunto) ? req.body.assunto : "Outro";
  const descricao = txt(req.body?.descricao, 1000);
  if (descricao.length < 5) throw new Error("Conte o que aconteceu.");
  const r = criar(empresaId, cadastroPorId("ocorrencias")!, {
    os: c.os, data: hojeIso(), quem: sessao.papel === "passageiro" ? "Passageiro" : "Motorista",
    contato: sessao.papel === "passageiro" ? `${c.passageiro.nome} ${c.passageiro.telefone}` : `${c.motorista} ${c.telefoneMotorista}`,
    assunto, descricao, situacao: "Aberta",
  }, `app do ${sessao.papel}`);
  res.json({ registro: { id: r.id, situacao: r.situacao } });
}));

// Nota do motorista para o passageiro
rotasExtras.post("/corridas/:id/avaliar-passageiro", so("motorista"), ok(async (req, res) => {
  const { empresaId } = ctx(req);
  const c = minhaCorrida(req);
  const feita = await avaliarPassageiro(empresaId, c.id, Number(req.body?.nota), txt(req.body?.comentario, 500), "app do motorista");
  res.json({ avaliacaoPassageiro: feita.avaliacaoPassageiro });
}));

// Corridas agendadas do passageiro
rotasExtras.get("/agendadas", so("passageiro"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const l = listarProprias(empresaId).filter((c) => c.passageiro.telefone === sessao.chave && c.status === "procurando" && aindaAgendada(c));
  res.json({ agendadas: l.map((c) => ({ id: c.id, os: c.os, agendadaPara: c.agendadaPara, embarque: c.embarque.texto, destino: c.destino?.texto ?? "", categoria: c.categoria, valor: c.estimativa.valor })) });
}));

// ====================================================================== central (painel, com login do painel)

export const rotasExtrasCentral = express.Router();
const emp = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;

rotasExtrasCentral.get("/carteiras", ok((req, res) => {
  const e = emp(req);
  const mot = new Map(listar(e, cadastroPorId("motoristas")!).map((m) => [m.id, String(m.nome ?? "")]));
  const cli = new Map(listar(e, cadastroPorId("clientes")!).map((c) => [String(c.telefone), String(c.nome ?? "")]));
  res.json({
    saldos: saldos(e).map((s) => ({ ...s, nome: s.papel === "motorista" ? mot.get(s.chave) ?? "" : cli.get(s.chave) ?? "" })),
    saques: saques(e),
  });
}));
rotasExtrasCentral.get("/carteiras/:papel/:chave", ok((req, res) => {
  const papel = req.params.papel === "motorista" ? "motorista" : "passageiro";
  res.json({ saldo: saldo(emp(req), papel, req.params.chave), extrato: extrato(emp(req), papel, req.params.chave, 300) });
}));
rotasExtrasCentral.post("/carteiras/lancar", exigirPapel("admin"), ok((req, res) => {
  const papel: PapelApp = req.body?.papel === "motorista" ? "motorista" : "passageiro";
  let chave = String(req.body?.chave ?? "").trim();
  if (papel === "passageiro") chave = chave.replace(/\D/g, "");
  if (!chave) throw new Error(papel === "passageiro" ? "Informe o telefone do passageiro." : "Escolha o motorista.");
  const valor = num(req.body?.valor);
  if (valor == null || valor === 0 || Math.abs(valor) > 10_000) throw new Error("Valor inválido.");
  const descricao = txt(req.body?.descricao, 120) || (valor > 0 ? "Crédito da central" : "Débito da central");
  res.json({ lancamento: lancar(emp(req), papel, chave, valor, descricao, quem(req)), saldo: saldo(emp(req), papel, chave) });
}));
rotasExtrasCentral.post("/saques/:id/:acao", exigirPapel("admin"), ok((req, res) => {
  const acao = req.params.acao;
  if (acao !== "pagar" && acao !== "recusar") throw new Error("Ação inválida.");
  res.json({ saque: resolverSaque(emp(req), req.params.id, acao === "pagar", quem(req), txt(req.body?.motivo, 200)) });
}));
rotasExtrasCentral.get("/documentos", ok((req, res) => res.json({ tipos: tiposDoApp(emp(req)), motoristas: documentosDosMotoristas(emp(req)) })));
rotasExtrasCentral.get("/documentos/:motoristaId/:tipo", ok((req, res) => {
  const a = arquivoDoDocumento(emp(req), req.params.motoristaId, req.params.tipo);
  if (!a) return res.status(404).json({ erro: "Documento não encontrado." });
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  fs.createReadStream(a.caminho).pipe(res);
}));
rotasExtrasCentral.post("/documentos/:motoristaId/:tipo", exigirPapel("admin", "operador"), ok((req, res) => {
  res.json({ documento: avaliarDocumento(emp(req), req.params.motoristaId, req.params.tipo, req.body?.aprovado === true, txt(req.body?.motivo, 200)) });
}));
