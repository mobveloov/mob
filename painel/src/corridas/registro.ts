// Registro de cada corrida: (1) eventos (linha do tempo da OS: "Histórico da OS" do painel) e (2) trajeto real
// (pontos de GPS que o app do motorista envia durante a corrida). Tudo no banco SQLite, por empresa.
// Sem dependência das telas nem do despacho: quem muda a corrida só chama registrarEvento / registrarPonto.

import { banco } from "../servidor/banco.ts";
import { agoraBr, arred } from "../servidor/util.ts";

export type TipoEvento =
  | "criada" | "despacho_consulta" | "despacho_encontrados" | "sem_motorista" | "oferta_enviada" | "oferta_aceita" | "oferta_recusada" | "oferta_expirada" | "oferta_perdida" | "oferta_saiu"
  | "atribuida" | "a_caminho" | "chegou" | "iniciou" | "finalizou" | "cancelou" | "voltou_a_procurar" | "nao_atendida"
  | "sem_aceite_60s" | "motorista_atrasado" | "nota_baixa" | "taxa_cancelamento" | "tarifa_recalculada" | "proximo" | "espera_prolongada"
  | "mudanca_valor" | "mudanca_pagamento" | "alteracao" | "avaliacao" | "avaliacao_passageiro" | "outro";

export interface EventoCorrida {
  id: number; em: string; tipo: TipoEvento; descricao: string; usuario: string; canal: string; dados: Record<string, unknown> | null;
}

const MAX_EVENTOS_POR_CORRIDA = 500;

/** Quem fez, pelo texto "por" que as corridas já guardam: app do motorista, app do passageiro, despacho, sistema ou o e-mail de quem usa o painel. */
export function canalDoPor(por: string): string {
  const p = String(por ?? "").toLowerCase();
  if (p.includes("app do motorista")) return "App do motorista";
  if (p.includes("app do passageiro") || p.includes("passageiro")) return "App do passageiro";
  if (p.includes("despacho")) return "Despacho automático";
  if (p.includes("bot") || p.includes("whatsapp")) return "WhatsApp";
  if (p.includes("totem")) return "Totem";
  if (!p || p === "sistema") return "Sistema";
  return "Painel";
}

/** Grava um evento da corrida. Nunca atrapalha a corrida: erro de gravação só vai para o log. */
export function registrarEvento(empresaId: string, corridaId: string, e: { tipo: TipoEvento; descricao: string; usuario?: string; canal?: string; dados?: Record<string, unknown>; em?: string }) {
  try {
    const db = banco();
    const em = e.em ?? agoraBr().toISOString();
    db.prepare("INSERT INTO corrida_eventos (empresa, corrida_id, em, tipo, descricao, usuario, canal, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(empresaId, corridaId, em, e.tipo, String(e.descricao).slice(0, 400), String(e.usuario ?? "").slice(0, 120), String(e.canal ?? "").slice(0, 40), e.dados ? JSON.stringify(e.dados) : "");
    // Limite por corrida (loops estranhos não podem encher o banco): guarda só os últimos.
    const n = (db.prepare("SELECT COUNT(*) AS n FROM corrida_eventos WHERE empresa = ? AND corrida_id = ?").get(empresaId, corridaId) as { n: number }).n;
    if (n > MAX_EVENTOS_POR_CORRIDA) db.prepare("DELETE FROM corrida_eventos WHERE seq IN (SELECT seq FROM corrida_eventos WHERE empresa = ? AND corrida_id = ? ORDER BY seq LIMIT ?)").run(empresaId, corridaId, n - MAX_EVENTOS_POR_CORRIDA);
  } catch (err) { console.error("[registro] evento:", err instanceof Error ? err.message : err); }
}

export function eventosDaCorrida(empresaId: string, corridaId: string): EventoCorrida[] {
  const linhas = banco().prepare("SELECT seq, em, tipo, descricao, usuario, canal, dados FROM corrida_eventos WHERE empresa = ? AND corrida_id = ? ORDER BY em, seq").all(empresaId, corridaId) as Array<{ seq: number; em: string; tipo: TipoEvento; descricao: string; usuario: string; canal: string; dados: string }>;
  return linhas.map((l) => ({ id: l.seq, em: l.em, tipo: l.tipo, descricao: l.descricao, usuario: l.usuario, canal: l.canal, dados: l.dados ? (JSON.parse(l.dados) as Record<string, unknown>) : null }));
}

// ====================================================================== trajeto real

export type FaseTrajeto = "embarque" | "viagem";
export interface PontoTrajeto { lat: number; lng: number; em: string; fase: FaseTrajeto }

/** Limites: pontos guardados por corrida (depois disso o trajeto é simplificado) e pontos devolvidos para desenhar. */
export const MAX_PONTOS_GUARDADOS = 2500;
export const MAX_PONTOS_MAPA = 1500;
const ALVO_APOS_SIMPLIFICAR = 1200;

const kmEntre = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const ultimo = new Map<string, { lat: number; lng: number; t: number; fase: FaseTrajeto; n: number }>();
const chaveDe = (empresaId: string, corridaId: string) => `${empresaId}|${corridaId}`;

/** Distância de um ponto ao segmento a-b, em metros (projeção plana: serve para trechos de cidade). */
function distanciaAoSegmentoM(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = 111_320, c = Math.cos((p.lat * Math.PI) / 180);
  const x = (q: { lat: number; lng: number }) => [(q.lng - p.lng) * k * c, (q.lat - p.lat) * k];
  const [ax, ay] = x(a), [bx, by] = x(b);
  const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
  const t = d2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / d2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Douglas-Peucker (sem recursão): mantém as pontas, as mudanças de fase e os pontos que mais se afastam da reta. */
export function simplificar<T extends { lat: number; lng: number; fase?: string }>(pontos: T[], toleranciaM: number): T[] {
  if (pontos.length <= 2) return pontos.slice();
  const manter = new Array<boolean>(pontos.length).fill(false);
  manter[0] = manter[pontos.length - 1] = true;
  for (let i = 1; i < pontos.length; i++) if (pontos[i].fase !== pontos[i - 1].fase) { manter[i] = true; manter[i - 1] = true; }
  const pilha: Array<[number, number]> = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop()!;
    let maior = -1, onde = -1;
    for (let k = i + 1; k < j; k++) { const d = distanciaAoSegmentoM(pontos[k], pontos[i], pontos[j]); if (d > maior) { maior = d; onde = k; } }
    if (maior > toleranciaM && onde > 0) { manter[onde] = true; pilha.push([i, onde], [onde, j]); }
  }
  return pontos.filter((_, i) => manter[i]);
}

/** Simplifica até caber em `alvo` pontos (aumenta a tolerância aos poucos). */
function reduzirAte<T extends { lat: number; lng: number; fase?: string }>(pontos: T[], alvo: number): T[] {
  let tol = 4, r = pontos;
  for (let i = 0; i < 12 && r.length > alvo; i++) { r = simplificar(pontos, tol); tol *= 2; }
  if (r.length > alvo) { const passo = Math.ceil(r.length / alvo); r = r.filter((_, i) => i % passo === 0 || i === r.length - 1); }
  return r;
}

/**
 * Guarda um ponto do trajeto. Ignora ponto parado (menos de 8 m do anterior, até 30 s) e ponto com menos de 2 s do anterior.
 * Passando de MAX_PONTOS_GUARDADOS, o trajeto da corrida é simplificado (mesma forma, menos pontos).
 */
export function registrarPonto(empresaId: string, corridaId: string, lat: number, lng: number, fase: FaseTrajeto) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const k = chaveDe(empresaId, corridaId), agora = Date.now();
    const db = banco();
    let u = ultimo.get(k);
    if (!u) {
      const l = db.prepare("SELECT lat, lng, fase, em FROM corrida_pontos WHERE empresa = ? AND corrida_id = ? ORDER BY seq DESC LIMIT 1").get(empresaId, corridaId) as { lat: number; lng: number; fase: FaseTrajeto; em: string } | undefined;
      const n = (db.prepare("SELECT COUNT(*) AS n FROM corrida_pontos WHERE empresa = ? AND corrida_id = ?").get(empresaId, corridaId) as { n: number }).n;
      u = { lat: l?.lat ?? NaN, lng: l?.lng ?? NaN, t: 0, fase: l?.fase ?? fase, n };
      ultimo.set(k, u);
      if (ultimo.size > 5000) for (const x of [...ultimo.keys()].slice(0, 2500)) ultimo.delete(x);
    }
    if (u.n > 0 && u.fase === fase) {
      const dt = agora - u.t;
      if (dt < (process.env.NODE_ENV === "test" ? 0 : 2000)) return;
      if (dt < 30_000 && kmEntre(u, { lat, lng }) * 1000 < 8) return;
    }
    db.prepare("INSERT INTO corrida_pontos (empresa, corrida_id, em, lat, lng, fase) VALUES (?, ?, ?, ?, ?, ?)").run(empresaId, corridaId, agoraBr().toISOString(), lat, lng, fase);
    u.lat = lat; u.lng = lng; u.t = agora; u.fase = fase; u.n++;
    if (u.n > MAX_PONTOS_GUARDADOS) {
      const todos = db.prepare("SELECT seq, em, lat, lng, fase FROM corrida_pontos WHERE empresa = ? AND corrida_id = ? ORDER BY seq").all(empresaId, corridaId) as Array<{ seq: number; em: string; lat: number; lng: number; fase: FaseTrajeto }>;
      const fica = new Set(reduzirAte(todos, ALVO_APOS_SIMPLIFICAR).map((p) => p.seq));
      const del = db.prepare("DELETE FROM corrida_pontos WHERE seq = ?");
      for (const p of todos) if (!fica.has(p.seq)) del.run(p.seq);
      u.n = fica.size;
    }
  } catch (err) { console.error("[registro] ponto:", err instanceof Error ? err.message : err); }
}

/** Pontos gravados da corrida, na ordem, já simplificados para desenhar (no máximo MAX_PONTOS_MAPA). */
export function pontosDaCorrida(empresaId: string, corridaId: string, max = MAX_PONTOS_MAPA): PontoTrajeto[] {
  const l = (banco().prepare("SELECT em, lat, lng, fase FROM corrida_pontos WHERE empresa = ? AND corrida_id = ? ORDER BY seq").all(empresaId, corridaId) as unknown as PontoTrajeto[]);
  return l.length > max ? reduzirAte(l, max) : l;
}

/** Distância percorrida (km, pelos pontos gravados), tempo e horários de cada fase do trajeto. */
export function medirTrajeto(pontos: PontoTrajeto[]) {
  const fase = (f: FaseTrajeto) => {
    const l = pontos.filter((p) => p.fase === f);
    let km = 0;
    for (let i = 1; i < l.length; i++) km += kmEntre(l[i - 1], l[i]);
    const minutos = l.length > 1 ? Math.max(0, Math.round((Date.parse(l[l.length - 1].em) - Date.parse(l[0].em)) / 60_000)) : null;
    return { km: l.length > 1 ? arred(km, 3) : null, minutos, primeiro: l[0]?.em ?? null, ultimo: l[l.length - 1]?.em ?? null, pontos: l.length };
  };
  return { embarque: fase("embarque"), viagem: fase("viagem") };
}

export { kmEntre as distanciaKm };

/** Só para os testes: esquece o cache do último ponto. */
export const esquecerPontosDaMemoria = () => ultimo.clear();
