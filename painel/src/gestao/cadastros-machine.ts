// Cadastro › Passe Livre (ofertas e resultados) e Cadastro › Clientes › Consulta de cartões (rotas da gestão).
//
//   GET    /passe-livre                                catálogo de ofertas (Admin)
//   POST   /passe-livre/ofertas   PUT|DELETE /passe-livre/ofertas/:id   (Admin; no máximo 3 ofertas)
//   GET    /passe-livre/resultados?periodo=hoje|ontem|7d|30d|mes|outro&de&ate   receita e taxa não cobrada (Admin)
//   GET    /cartoes-clientes?busca&bandeira&status&pagina   cartões tokenizados                    (Gestor)
//   DELETE /cartoes-clientes/:id                                                                   (Admin)
//
// Cartões: o painel NUNCA guarda número de cartão; só o que o gateway devolve (bandeira, final de 4 dígitos, validade e
// se foi validado). Sem integração de cartão, a lista fica vazia.

import crypto from "node:crypto";
import type { Router } from "express";
import { comprasDoPeriodo, comRotulo, MAX_OFERTAS, ofertas, removerOferta, resultados, salvarOferta } from "../config/passe-livre.ts";
import { arquivoDoBanco, banco } from "../servidor/banco.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { contem, emp, hojeBr, ok, paginar, registros, soAdmin, soGestor, texto } from "./comum.ts";

/** Telefone só com DDD e número (sem o 55 do país). */
export const telefoneBase = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d; };

const naoAchou = (msg: string) => Object.assign(new Error(msg), { status: 404 });

// ====================================================================== Passe Livre

/** Período da aba Resultados: atalho (hoje, ontem, 7d, 30d, mes) ou datas. */
function periodoDoPasse(q: Record<string, unknown>): [string, string] {
  const hoje = hojeBr(), dia = (n: number) => new Date(Date.parse(`${hoje}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  switch (String(q.periodo ?? "hoje")) {
    case "ontem": return [dia(1), dia(1)];
    case "7d": return [dia(6), hoje];
    case "30d": return [dia(29), hoje];
    case "mes": return [`${hoje.slice(0, 7)}-01`, hoje];
    case "outro": {
      const de = String(q.de ?? ""), ate = String(q.ate ?? de);
      if (!/^d{4}-d{2}-d{2}$/.test(de) || !/^d{4}-d{2}-d{2}$/.test(ate) || ate < de) throw new Error("Escolha as datas do período.");
      return [de, ate];
    }
    default: return [hoje, hoje];
  }
}

export function rotasPasseLivre(r: Router) {
  r.get("/passe-livre", soAdmin, ok((req, res) => res.json({ ofertas: ofertas(emp(req)).map(comRotulo), maximo: MAX_OFERTAS })));
  r.post("/passe-livre/ofertas", soAdmin, ok((req, res) => res.json({ ofertas: salvarOferta(emp(req), req.body ?? {}).map(comRotulo), maximo: MAX_OFERTAS })));
  r.put("/passe-livre/ofertas/:id", soAdmin, ok((req, res) => res.json({ ofertas: salvarOferta(emp(req), { ...(req.body ?? {}), id: req.params.id }).map(comRotulo), maximo: MAX_OFERTAS })));
  r.delete("/passe-livre/ofertas/:id", soAdmin, ok((req, res) => res.json({ ofertas: removerOferta(emp(req), String(req.params.id)).map(comRotulo), maximo: MAX_OFERTAS })));
  r.get("/passe-livre/resultados", soAdmin, ok((req, res) => {
    const [de, ate] = periodoDoPasse(req.query);
    res.json({ ...resultados(emp(req), de, ate), compras: comprasDoPeriodo(emp(req), de, ate, 50) });
  }));
}

// ====================================================================== Consulta de cartões

export const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"] as const;
export interface CartaoTokenizado { id: string; telefone: string; nome: string; bandeira: string; final: string; validade: string; validado: boolean; gateway: string; criadoEm: string }

const criadas = new Set<string>();
function tabelaCartoes() {
  const db = banco(), arq = arquivoDoBanco();
  if (!criadas.has(arq)) {
    db.exec(`CREATE TABLE IF NOT EXISTS cartoes_tokenizados (
      empresa TEXT NOT NULL, id TEXT NOT NULL, telefone TEXT NOT NULL, nome TEXT NOT NULL, bandeira TEXT NOT NULL, final TEXT NOT NULL,
      validade TEXT NOT NULL, validado INTEGER NOT NULL DEFAULT 0, gateway TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL, PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS cartoes_tokenizados_tel ON cartoes_tokenizados (empresa, telefone);`);
    criadas.add(arq);
  }
  return db;
}

/**
 * Guarda um cartão tokenizado devolvido pelo gateway de pagamento (quando houver integração). Só entram a bandeira, os 4
 * últimos dígitos e a validade (MM/AA): qualquer coisa que pareça número de cartão é recusada.
 */
export function registrarCartaoTokenizado(empresaId: string, c: { telefone: string; nome?: string; bandeira: string; final: string; validade?: string; validado?: boolean; gateway?: string }): CartaoTokenizado {
  const final = String(c.final ?? "").trim();
  if (!/^\d{4}$/.test(final)) throw new Error("Informe só os 4 últimos dígitos do cartão.");
  const validade = String(c.validade ?? "").trim();
  if (validade && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(validade)) throw new Error("A validade precisa ser MM/AA.");
  const bandeira = (BANDEIRAS as readonly string[]).find((b) => normal(b) === normal(c.bandeira)) ?? "Outra";
  const telefone = telefoneBase(c.telefone);
  if (telefone.length < 10) throw new Error("Telefone do passageiro precisa de DDD e número.");
  const linha: CartaoTokenizado = { id: crypto.randomUUID(), telefone, nome: texto(c.nome, 80), bandeira, final, validade, validado: c.validado === true, gateway: texto(c.gateway, 40), criadoEm: agoraBr().toISOString() };
  tabelaCartoes().prepare("INSERT INTO cartoes_tokenizados (empresa, id, telefone, nome, bandeira, final, validade, validado, gateway, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, linha.id, linha.telefone, linha.nome, linha.bandeira, linha.final, linha.validade, linha.validado ? 1 : 0, linha.gateway, linha.criadoEm);
  return linha;
}

export function cartoesDaEmpresa(empresaId: string): CartaoTokenizado[] {
  const nomes = new Map<string, string>(registros(empresaId, "clientes").map((c) => [telefoneBase(c.telefone), String(c.nome ?? "")]));
  return (tabelaCartoes().prepare("SELECT id, telefone, nome, bandeira, final, validade, validado, gateway, criado_em AS criadoEm FROM cartoes_tokenizados WHERE empresa = ? ORDER BY criado_em DESC, id").all(empresaId) as Array<Omit<CartaoTokenizado, "validado"> & { validado: number }>)
    .map((c) => ({ ...c, validado: c.validado === 1, nome: c.nome || nomes.get(c.telefone) || "" }));
}

export function rotasCartoes(r: Router) {
  r.get("/cartoes-clientes", soGestor, ok((req, res) => {
    const todos = cartoesDaEmpresa(emp(req));
    const busca = texto(req.query.busca, 80), bandeira = texto(req.query.bandeira, 30), status = texto(req.query.status, 20);
    const lista = todos.filter((c) => (!bandeira || c.bandeira === bandeira) && (!status || (status === "Validado" ? c.validado : !c.validado))
      && (!busca || contem(c.nome, busca) || c.telefone.includes(telefoneBase(busca) || "x") || c.final === busca.trim()));
    const { itens, paginacao } = paginar(lista, req.query.pagina);
    res.json({ cartoes: itens, paginacao, bandeiras: BANDEIRAS, kpis: { total: todos.length, validados: todos.filter((c) => c.validado).length, naoValidados: todos.filter((c) => !c.validado).length } });
  }));
  r.delete("/cartoes-clientes/:id", soAdmin, ok((req, res) => {
    const feito = tabelaCartoes().prepare("DELETE FROM cartoes_tokenizados WHERE empresa = ? AND id = ?").run(emp(req), String(req.params.id));
    if (!feito.changes) throw naoAchou("Cartão não encontrado.");
    res.json({ ok: true });
  }));
}

