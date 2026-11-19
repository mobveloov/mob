// Cadastro "Sugestões de Endereço" (Bot & Totem): apelidos que o bot troca pelo endereço real.
// Mesma regra do sistema de referência: apelido repetido é recusado; pode ter ponto no mapa ou só o endereço escrito.

import crypto from "node:crypto";
import { banco } from "../servidor/banco.ts";
import { parseCoordPaste } from "./coordenadas.ts";
import { normSuggestionText, pickSuggestion, suggestionScore } from "./sugestoes.ts";
import type { Local } from "./tipos.ts";

export interface Sugestao { id: string; nickname: string; address_text: string; lat: number | null; lng: number | null }

function tabela() {
  const db = banco();
  db.exec(`CREATE TABLE IF NOT EXISTS bot_sugestoes (
    empresa TEXT NOT NULL, id TEXT NOT NULL, apelido TEXT NOT NULL, apelido_norm TEXT NOT NULL, endereco TEXT NOT NULL DEFAULT '',
    lat REAL, lng REAL, criada TEXT NOT NULL, PRIMARY KEY (empresa, id));
    CREATE UNIQUE INDEX IF NOT EXISTS bot_sugestoes_apelido ON bot_sugestoes (empresa, apelido_norm);`);
  return db;
}

const lin = (r: Record<string, unknown>): Sugestao => ({ id: String(r.id), nickname: String(r.apelido), address_text: String(r.endereco), lat: r.lat as number | null, lng: r.lng as number | null });

export const contarSugestoes = (empresa: string): number => Number((tabela().prepare("SELECT COUNT(*) AS n FROM bot_sugestoes WHERE empresa = ?").get(empresa) as { n: number }).n);

/** Busca por pedaço do apelido (a tela não lista tudo: empresas grandes têm mais de cem). */
export function buscarSugestoes(empresa: string, busca: string, limite = 10): Sugestao[] {
  const b = normSuggestionText(busca);
  if (b.length < 2) return [];
  return (tabela().prepare("SELECT * FROM bot_sugestoes WHERE empresa = ? AND apelido_norm LIKE ? ORDER BY apelido LIMIT ?").all(empresa, `%${b}%`, limite) as Array<Record<string, unknown>>).map(lin);
}

export const todasSugestoes = (empresa: string): Sugestao[] =>
  (tabela().prepare("SELECT * FROM bot_sugestoes WHERE empresa = ?").all(empresa) as Array<Record<string, unknown>>).map(lin);

/** Cadastra. Com localização colada ("Nome : -21.02, -48.22") o ponto vale; senão vale o endereço escrito. */
export function adicionarSugestao(empresa: string, d: { nickname?: unknown; address?: unknown; lat?: unknown; lng?: unknown }): Sugestao {
  const colado = parseCoordPaste(String(d.address ?? ""));
  const nickname = String(d.nickname ?? "").trim().slice(0, 80) || colado?.name || "";
  const lat = colado ? colado.lat : d.lat != null && d.lat !== "" ? Number(d.lat) : null;
  const lng = colado ? colado.lng : d.lng != null && d.lng !== "" ? Number(d.lng) : null;
  const endereco = colado ? "" : String(d.address ?? "").trim().slice(0, 200);
  if (!nickname || (!endereco && (lat == null || lng == null))) throw new Error("Preencha o apelido e cole a localização do Google Maps.");
  if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) throw new Error("Localização inválida.");
  const norm = normSuggestionText(nickname);
  if (!norm) throw new Error("Apelido inválido.");
  const db = tabela();
  if (db.prepare("SELECT 1 FROM bot_sugestoes WHERE empresa = ? AND apelido_norm = ?").get(empresa, norm)) throw new Error("Já existe uma sugestão com esse apelido.");
  const id = crypto.randomUUID().slice(0, 8);
  db.prepare("INSERT INTO bot_sugestoes (empresa, id, apelido, apelido_norm, endereco, lat, lng, criada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresa, id, nickname, norm, endereco, lat, lng, new Date().toISOString());
  return { id, nickname, address_text: endereco, lat, lng };
}

export function excluirSugestao(empresa: string, id: string) {
  const r = tabela().prepare("DELETE FROM bot_sugestoes WHERE empresa = ? AND id = ?").run(empresa, id);
  if (!r.changes) throw new Error("Sugestão não encontrada.");
}

/** O texto do passageiro é o apelido de uma sugestão? Devolve o local (ponto do mapa ou endereço escrito). */
export function localDaSugestao(empresa: string, texto: string, notaMinima = 30): Local | null {
  const rows = todasSugestoes(empresa);
  if (!rows.length) return null;
  const s = pickSuggestion(rows, texto);
  if (!s || suggestionScore(texto, s.nickname) < notaMinima) return null;
  return s.lat != null && s.lng != null ? { texto: s.nickname, lat: s.lat, lng: s.lng } : { texto: s.address_text || s.nickname };
}
