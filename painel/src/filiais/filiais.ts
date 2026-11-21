// Filiais de cada empresa (Cadastro › Filiais): nome, cidade, endereço, responsável e se está ativa.
// Motoristas e operadores se ligam a UMA filial por vez (tabela filiais_vinculos). Toda consulta leva a empresa do login,
// então uma empresa nunca vê nem mexe nas filiais de outra.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { banco, transacao } from "../servidor/banco.ts";
import { idValido, listarUsuarios } from "../servidor/dados.ts";

export type TipoVinculo = "motorista" | "operador";
export interface Filial {
  id: string; nome: string; cidade: string; endereco: string; responsavel: string; telefone: string; ativa: boolean; criadaEm: string;
  /** Onde fica a filial no mapa (opcionais): UF, coordenadas, zoom, raio de cobertura em km e áreas desenhadas que ela cobre. */
  uf: string; lat: number | null; lng: number | null; zoom: number | null; raioKm: number; areaIds: string[];
}
export interface FilialComTotais extends Filial { motoristas: number; operadores: number }

export class ErroFilial extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const limpo = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const exigirEmpresa = (empresaId: string) => { if (!idValido(empresaId)) throw new ErroFilial("Empresa inválida."); };

type Linha = { id: string; nome: string; cidade: string; endereco: string; responsavel: string; telefone: string; ativa: number; criada_em: string };
type LinhaGeo = Linha & { uf: string | null; lat: number | null; lng: number | null; zoom: number | null; raio_km: number | null; areas: string | null };
const SELECT = "SELECT f.id, f.nome, f.cidade, f.endereco, f.responsavel, f.telefone, f.ativa, f.criada_em, g.uf, g.lat, g.lng, g.zoom, g.raio_km, g.areas FROM filiais f LEFT JOIN filiais_geo g ON g.empresa = f.empresa AND g.id = f.id";
const listaDeIds = (v: string | null): string[] => { try { const a = JSON.parse(v ?? "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const paraFilial = (l: LinhaGeo): Filial => ({
  id: l.id, nome: l.nome, cidade: l.cidade, endereco: l.endereco, responsavel: l.responsavel, telefone: l.telefone, ativa: l.ativa === 1, criadaEm: l.criada_em,
  uf: l.uf ?? "", lat: l.lat ?? null, lng: l.lng ?? null, zoom: l.zoom ?? null, raioKm: l.raio_km ?? 0, areaIds: listaDeIds(l.areas),
});

export function listarFiliais(empresaId: string): FilialComTotais[] {
  exigirEmpresa(empresaId);
  const db = banco();
  const linhas = db.prepare(`${SELECT} WHERE f.empresa = ? ORDER BY f.nome COLLATE NOCASE`).all(empresaId) as unknown as LinhaGeo[];
  const contas = new Map<string, { motorista: number; operador: number }>();
  // Só conta quem ainda existe (motorista apagado ou usuário removido não entra na conta).
  const vivos = { motorista: new Set(listar(empresaId, cadastroPorId("motoristas")!).map((m) => m.id)), operador: new Set(listarUsuarios().filter((u) => u.empresaId === empresaId).map((u) => u.id)) };
  for (const r of db.prepare("SELECT filial_id AS f, tipo, chave FROM filiais_vinculos WHERE empresa = ?").all(empresaId) as Array<{ f: string; tipo: TipoVinculo; chave: string }>) {
    if (!vivos[r.tipo]?.has(r.chave)) continue;
    const c = contas.get(r.f) ?? { motorista: 0, operador: 0 };
    c[r.tipo]++;
    contas.set(r.f, c);
  }
  return linhas.map((l) => ({ ...paraFilial(l), motoristas: contas.get(l.id)?.motorista ?? 0, operadores: contas.get(l.id)?.operador ?? 0 }));
}

export function filial(empresaId: string, id: string): Filial | null {
  exigirEmpresa(empresaId);
  const l = banco().prepare(`${SELECT} WHERE f.empresa = ? AND f.id = ?`).get(empresaId, String(id)) as unknown as LinhaGeo | undefined;
  return l ? paraFilial(l) : null;
}
function exigir(empresaId: string, id: string): Filial {
  const f = filial(empresaId, id);
  if (!f) throw new ErroFilial("Filial não encontrada.", 404);
  return f;
}

function dadosLimpos(d: Record<string, unknown>) {
  const nome = limpo(d.nome, 80);
  if (nome.length < 2) throw new ErroFilial("Informe o nome da filial.");
  return { nome, cidade: limpo(d.cidade, 80), endereco: limpo(d.endereco, 160), responsavel: limpo(d.responsavel, 80), telefone: limpo(d.telefone, 20).replace(/[^\d()+\s-]/g, ""), ativa: d.ativa === false || d.ativa === "false" ? 0 : 1 };
}
const num = (v: unknown, min: number, max: number, rotulo: string): number | null => {
  if (v === "" || v == null) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ErroFilial(`${rotulo} inválida.`);
  return n;
};
/** Localização da filial no mapa. Só vale se latitude e longitude vierem juntas. */
function geoLimpa(d: Record<string, unknown>) {
  const lat = num(d.lat, -90, 90, "Latitude"), lng = num(d.lng, -180, 180, "Longitude");
  if ((lat == null) !== (lng == null)) throw new ErroFilial("Informe latitude e longitude juntas.");
  const zoom = num(d.zoom, 3, 19, "Zoom");
  const raio = num(d.raioKm, 0, 200, "Raio") ?? 0;
  const uf = limpo(d.uf, 2).toUpperCase().replace(/[^A-Z]/g, "");
  const areaIds = Array.isArray(d.areaIds) ? [...new Set(d.areaIds.map((x) => limpo(x, 80)).filter(Boolean))].slice(0, 50) : [];
  return { lat, lng, zoom: zoom == null ? null : Math.round(zoom), raio, uf, areas: JSON.stringify(areaIds) };
}
function gravarGeo(empresaId: string, id: string, d: Record<string, unknown>) {
  const g = geoLimpa(d);
  banco().prepare(`INSERT INTO filiais_geo (empresa, id, uf, lat, lng, zoom, raio_km, areas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (empresa, id) DO UPDATE SET uf = excluded.uf, lat = excluded.lat, lng = excluded.lng, zoom = excluded.zoom, raio_km = excluded.raio_km, areas = excluded.areas`)
    .run(empresaId, id, g.uf, g.lat, g.lng, g.zoom, g.raio, g.areas);
}
const nomeRepetido = (empresaId: string, nome: string, ignorar?: string) =>
  listarFiliais(empresaId).some((f) => f.id !== ignorar && f.nome.toLowerCase() === nome.toLowerCase());

export function criarFilial(empresaId: string, d: Record<string, unknown>, por: string): Filial {
  exigirEmpresa(empresaId);
  const v = dadosLimpos(d);
  if (nomeRepetido(empresaId, v.nome)) throw new ErroFilial("Já existe uma filial com este nome.");
  geoLimpa(d);
  const id = crypto.randomUUID();
  banco().prepare("INSERT INTO filiais (empresa, id, nome, cidade, endereco, responsavel, telefone, ativa, criada_em, por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, id, v.nome, v.cidade, v.endereco, v.responsavel, v.telefone, v.ativa, new Date().toISOString(), limpo(por, 120));
  gravarGeo(empresaId, id, d);
  return exigir(empresaId, id);
}

export function atualizarFilial(empresaId: string, id: string, d: Record<string, unknown>): Filial {
  const atual = exigir(empresaId, id);
  const v = dadosLimpos({ ...atual, ...d });
  if (nomeRepetido(empresaId, v.nome, id)) throw new ErroFilial("Já existe uma filial com este nome.");
  geoLimpa({ ...atual, ...d });
  banco().prepare("UPDATE filiais SET nome = ?, cidade = ?, endereco = ?, responsavel = ?, telefone = ?, ativa = ? WHERE empresa = ? AND id = ?")
    .run(v.nome, v.cidade, v.endereco, v.responsavel, v.telefone, v.ativa, empresaId, id);
  gravarGeo(empresaId, id, { ...atual, ...d });
  return exigir(empresaId, id);
}

/** Remove a filial e solta as pessoas ligadas a ela. As corridas antigas ficam como estão. */
export function removerFilial(empresaId: string, id: string) {
  exigir(empresaId, id);
  transacao(() => {
    banco().prepare("DELETE FROM filiais_vinculos WHERE empresa = ? AND filial_id = ?").run(empresaId, id);
    banco().prepare("DELETE FROM filiais WHERE empresa = ? AND id = ?").run(empresaId, id);
    banco().prepare("DELETE FROM filiais_geo WHERE empresa = ? AND id = ?").run(empresaId, id);
  });
}

// ------------------------------------------------------------------ vínculos

/** Quem pode ser ligado: motoristas do cadastro da empresa e usuários da equipe da empresa. */
function existe(empresaId: string, tipo: TipoVinculo, chave: string): boolean {
  if (tipo === "motorista") return listar(empresaId, cadastroPorId("motoristas")!).some((m) => m.id === chave);
  return listarUsuarios().some((u) => u.id === chave && u.empresaId === empresaId && u.papel !== "plataforma");
}

/** Liga as pessoas à filial (cada pessoa fica em uma só: quem estava em outra muda para esta). Devolve quantas foram ligadas. */
export function vincular(empresaId: string, filialId: string, tipo: TipoVinculo, chaves: unknown): number {
  exigir(empresaId, filialId);
  if (!Array.isArray(chaves) || !chaves.length) throw new ErroFilial("Escolha pelo menos uma pessoa.");
  const lista = [...new Set(chaves.map((c) => String(c)).filter(Boolean))].slice(0, 500);
  for (const c of lista) if (!existe(empresaId, tipo, c)) throw new ErroFilial(tipo === "motorista" ? "Motorista não encontrado." : "Usuário não encontrado.", 404);
  transacao(() => {
    const up = banco().prepare(`INSERT INTO filiais_vinculos (empresa, tipo, chave, filial_id) VALUES (?, ?, ?, ?)
      ON CONFLICT (empresa, tipo, chave) DO UPDATE SET filial_id = excluded.filial_id`);
    for (const c of lista) up.run(empresaId, tipo, c, filialId);
  });
  return lista.length;
}

export function desvincular(empresaId: string, filialId: string, tipo: TipoVinculo, chave: string) {
  exigir(empresaId, filialId);
  banco().prepare("DELETE FROM filiais_vinculos WHERE empresa = ? AND tipo = ? AND chave = ? AND filial_id = ?").run(empresaId, tipo, chave, filialId);
}

/** Coloca a pessoa em uma filial (ou tira, com id vazio). Para a tela Equipe. */
export function definirFilialDe(empresaId: string, tipo: TipoVinculo, chave: string, filialId: unknown) {
  const id = String(filialId ?? "").trim();
  if (!id) { banco().prepare("DELETE FROM filiais_vinculos WHERE empresa = ? AND tipo = ? AND chave = ?").run(empresaId, tipo, chave); return; }
  vincular(empresaId, id, tipo, [chave]);
}

/** Id da filial da pessoa (ou null). */
export function filialDe(empresaId: string, tipo: TipoVinculo, chave: string): string | null {
  if (!idValido(empresaId)) return null;
  const r = banco().prepare("SELECT filial_id AS f FROM filiais_vinculos WHERE empresa = ? AND tipo = ? AND chave = ?").get(empresaId, tipo, chave) as { f: string } | undefined;
  return r?.f ?? null;
}

/** Mapa pessoa -> filial (para telas e relatórios que mostram a filial de várias pessoas). */
export function filiaisPorPessoa(empresaId: string, tipo: TipoVinculo): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of banco().prepare("SELECT chave, filial_id AS f FROM filiais_vinculos WHERE empresa = ? AND tipo = ?").all(empresaId, tipo) as Array<{ chave: string; f: string }>) m.set(r.chave, r.f);
  return m;
}

export function pessoasDaFilial(empresaId: string, filialId: string, tipo: TipoVinculo): string[] {
  exigirEmpresa(empresaId);
  return (banco().prepare("SELECT chave FROM filiais_vinculos WHERE empresa = ? AND filial_id = ? AND tipo = ?").all(empresaId, filialId, tipo) as Array<{ chave: string }>).map((r) => r.chave);
}

/** Filial que o usuário é obrigado a respeitar nas consultas: Operador e Gestor ligados a uma filial só enxergam as corridas dela. ADMIN e ADMIN Mestre veem tudo. */
export function filialForcada(empresaId: string, usuario: { id: string; papel: string }): string | null {
  if (usuario.papel !== "operador" && usuario.papel !== "gestor") return null;
  return filialDe(empresaId, "operador", usuario.id);
}

/** A filial gravada na corrida manda (quem pediu, ou o motorista na hora de atender). Corrida antiga, sem filial, vale pela filial do motorista. */
export function corridaDaFilial(c: { filialId?: string; motoristaId: string | null }, filialId: string, motoristas: Set<string>): boolean {
  if (c.filialId) return c.filialId === filialId;
  return !!c.motoristaId && motoristas.has(c.motoristaId);
}
