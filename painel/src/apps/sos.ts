// Alerta de pânico (SOS) dos apps. Contrato para os apps nativos em docs/SOS.md.
//
// O app (motorista ou passageiro) abre o alerta em POST /api/apps/<empresa>/sos. O servidor:
//   1. grava na tabela sos_alertas (SQLite), com quem pediu, telefone, posição, endereço, corrida e motivo;
//   2. avisa quem opera o painel (sino, faixa vermelha e tela "Alertas de segurança", que consultam a cada poucos segundos);
//   3. avisa os motoristas PRÓXIMOS (raio em Configurações > Gerais > Motorista; 0 desliga) por tempo real, por push
//      (Firebase da empresa, se houver) e pela lista de avisos do app;
//   4. manda o texto ao WhatsApp de emergência da empresa, se houver um configurado.
// Situação do alerta: aberto -> atendido (alguém da central assumiu) -> encerrado (com observação).

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { gerais } from "../config/gerais.ts";
import type { CorridaPropria } from "../corridas/index.ts";
import { corridaAtual, corridaDoApp, motoristasOnline } from "./despacho.ts";
import { provedorDaEmpresa } from "../crm/whatsapp.ts";
import { enderecoDoPonto, linhaReta } from "../enderecos/index.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr } from "../servidor/util.ts";
import { soDigitos } from "./armazem.ts";
import { emitir } from "./eventos.ts";
import { avisar } from "./push.ts";
import type { PapelApp } from "./sessoes.ts";

export type SituacaoSos = "aberto" | "atendido" | "encerrado";
export interface Sos {
  id: string; papel: PapelApp; chave: string; nome: string; telefone: string;
  lat: number | null; lng: number | null; endereco: string;
  corridaId: string; os: string; motivo: string;
  em: string; situacao: SituacaoSos; atendidoPor: string; atendidoEm: string; encerradoPor: string; encerradoEm: string; observacao: string;
  /** Quantos motoristas próximos foram avisados. */
  notificados: number;
}
interface Linha {
  id: string; papel: string; chave: string; nome: string; telefone: string; lat: number | null; lng: number | null; endereco: string;
  corrida_id: string; os: string; motivo: string; em: string; situacao: string; atendido_por: string; atendido_em: string;
  encerrado_por: string; encerrado_em: string; observacao: string; notificados: number;
}
const paraSos = (l: Linha): Sos => ({
  id: l.id, papel: l.papel as PapelApp, chave: l.chave, nome: l.nome, telefone: l.telefone, lat: l.lat, lng: l.lng, endereco: l.endereco,
  corridaId: l.corrida_id, os: l.os, motivo: l.motivo, em: l.em, situacao: l.situacao as SituacaoSos, atendidoPor: l.atendido_por, atendidoEm: l.atendido_em,
  encerradoPor: l.encerrado_por, encerradoEm: l.encerrado_em, observacao: l.observacao, notificados: l.notificados,
});

const MOTIVOS_MAX = 300;
/** Pedido repetido da mesma pessoa em menos que isso não abre outro alerta: atualiza a posição do que já está aberto. */
const REPETIDO_MS = 2 * 60_000;

/** Só para os testes: troca o envio de WhatsApp. */
type EnvioWhats = (empresaId: string, telefone: string, texto: string) => Promise<unknown>;
let envioWhats: EnvioWhats = (e, t, x) => provedorDaEmpresa(e).enviar(t, x);
export const definirEnvioWhatsDeTeste = (f: EnvioWhats | null) => { envioWhats = f ?? ((e, t, x) => provedorDaEmpresa(e).enviar(t, x)); };

const agoraIso = () => agoraBr().toISOString();
const um = (empresaId: string, id: string) => {
  const l = banco().prepare("SELECT * FROM sos_alertas WHERE empresa = ? AND id = ?").get(empresaId, id) as unknown as Linha | undefined;
  return l ? paraSos(l) : null;
};

function config(empresaId: string) {
  try { const m = gerais(empresaId).motorista; return { raioKm: m.raioPanicoKm, duracaoMin: m.duracaoPanicoMin, emergencia: gerais(empresaId).suporte.whatsappEmergencia }; }
  catch { return { raioKm: 3, duracaoMin: 30, emergencia: "" }; }
}

/** Quem fez o pedido: nome e telefone do cadastro. */
function quem(empresaId: string, papel: PapelApp, chave: string, c: CorridaPropria | null, nomeApp: string, telefoneApp: string) {
  if (papel === "motorista") {
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === chave);
    return { nome: String(m?.nome ?? c?.motorista ?? nomeApp ?? ""), telefone: String(m?.telefone ?? c?.telefoneMotorista ?? telefoneApp ?? "") };
  }
  return { nome: String(c?.passageiro?.nome || nomeApp || ""), telefone: String(c?.passageiro?.telefone || telefoneApp || chave) };
}

export interface PedidoSos { corridaId?: string; lat?: number; lng?: number; motivo?: string; nome?: string; telefone?: string }

/** Abre o alerta e avisa todo mundo. Devolve o alerta já gravado (o aviso aos motoristas e ao WhatsApp segue em segundo plano). */
export function abrirSos(empresaId: string, papel: PapelApp, chave: string, p: PedidoSos): Sos {
  let c: CorridaPropria | null = null;
  if (p.corridaId) c = corridaDoApp(empresaId, p.corridaId, papel, chave);
  else { try { const a = corridaAtual(empresaId, papel, chave); if (a && ["a_caminho", "no_local", "em_andamento"].includes(a.status)) c = a; } catch { /* sem corrida */ } }

  let lat = Number.isFinite(p.lat) && Math.abs(p.lat!) <= 90 ? p.lat! : null;
  let lng = Number.isFinite(p.lng) && Math.abs(p.lng!) <= 180 ? p.lng! : null;
  if ((lat == null || lng == null) && papel === "motorista") { // sem GPS no pedido: usa a última posição do motorista online
    const o = motoristasOnline(empresaId).find((m) => m.id === chave);
    if (o) { lat = o.lat; lng = o.lng; }
  }
  if (lat == null || lng == null) { lat = null; lng = null; }

  const db = banco();
  // Já tem um alerta desta pessoa aberto agora: só atualiza a posição.
  const recente = db.prepare("SELECT * FROM sos_alertas WHERE empresa = ? AND papel = ? AND chave = ? AND situacao != 'encerrado' AND em >= ? ORDER BY em DESC LIMIT 1")
    .get(empresaId, papel, chave, new Date(agoraBr().getTime() - REPETIDO_MS).toISOString()) as unknown as Linha | undefined;
  if (recente) {
    if (lat != null && lng != null) db.prepare("UPDATE sos_alertas SET lat = ?, lng = ? WHERE empresa = ? AND id = ?").run(lat, lng, empresaId, recente.id);
    return um(empresaId, recente.id)!;
  }

  const { nome, telefone } = quem(empresaId, papel, chave, c, String(p.nome ?? ""), String(p.telefone ?? ""));
  let endereco = "";
  if (lat != null && lng != null) { try { endereco = enderecoDoPonto(empresaId, lat, lng)?.texto ?? ""; } catch { /* sem endereço */ } }
  const id = crypto.randomUUID();
  const motivo = String(p.motivo ?? "").replace(/[<>]/g, "").trim().slice(0, MOTIVOS_MAX);
  db.prepare("INSERT INTO sos_alertas (empresa, id, papel, chave, nome, telefone, lat, lng, endereco, corrida_id, os, motivo, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, id, papel, chave, nome.slice(0, 120), telefone.slice(0, 30), lat, lng, endereco, c?.id ?? "", c?.os ?? "", motivo, agoraIso());
  console.warn(`[apps] SOS na empresa ${empresaId}, ${papel}${c ? `, OS ${c.os}` : ""}`);
  const s = um(empresaId, id)!;
  const n = avisarMotoristasProximos(empresaId, s);
  if (n) db.prepare("UPDATE sos_alertas SET notificados = ? WHERE empresa = ? AND id = ?").run(n, empresaId, id);
  void avisarWhatsApp(empresaId, s);
  return um(empresaId, id)!;
}

// ------------------------------------------------------------------ quem recebe

/** O que o motorista próximo vê: sem telefone nem identificação, só quem é (primeiro nome), onde e a que distância. */
export function sosParaMotorista(s: Sos, distanciaKm: number | null) {
  return {
    id: s.id, papel: s.papel, nome: s.nome.split(" ")[0] ?? "", lat: s.lat, lng: s.lng, endereco: s.endereco, em: s.em,
    distanciaKm, situacao: s.situacao,
    texto: `${s.papel === "motorista" ? "Um motorista" : "Um passageiro"} pediu ajuda${s.endereco ? ` perto de ${s.endereco}` : ""}${distanciaKm != null ? `, a ${distanciaKm.toFixed(1).replace(".", ",")} km de você` : ""}.`,
  };
}

/** Motoristas online dentro do raio (menos quem pediu). */
function motoristasNoRaio(empresaId: string, s: Sos, raioKm: number) {
  if (!(raioKm > 0) || s.lat == null || s.lng == null) return [];
  const centro = { lat: s.lat, lng: s.lng };
  return motoristasOnline(empresaId) // quem está em modo fantasma também recebe: é segurança
    .filter((m) => !(s.papel === "motorista" && m.id === s.chave))
    .map((m) => ({ id: m.id, km: linhaReta(centro, m) }))
    .filter((m) => m.km <= raioKm);
}

function avisarMotoristasProximos(empresaId: string, s: Sos): number {
  const { raioKm } = config(empresaId);
  const alvos = motoristasNoRaio(empresaId, s, raioKm);
  for (const m of alvos) {
    const v = sosParaMotorista(s, Math.round(m.km * 10) / 10);
    emitir(empresaId, { papel: "motorista", chave: m.id }, "sos", v);
    void avisar(empresaId, { papel: "motorista", chave: m.id }, {
      titulo: "EMERGÊNCIA perto de você", texto: v.texto, canal: "emergencia",
      dados: { tipo: "sos", sosId: s.id, lat: s.lat == null ? "" : String(s.lat), lng: s.lng == null ? "" : String(s.lng) },
    });
  }
  return alvos.length;
}

async function avisarWhatsApp(empresaId: string, s: Sos) {
  const numero = soDigitos(config(empresaId).emergencia);
  if (!numero) return;
  const onde = s.lat != null && s.lng != null ? `${s.endereco ? `${s.endereco}\n` : ""}https://www.google.com/maps?q=${s.lat},${s.lng}` : "posição não informada";
  const texto = `ALERTA DE SEGURANÇA (SOS)\n${s.papel === "motorista" ? "Motorista" : "Passageiro"}: ${s.nome || "sem nome"}${s.telefone ? ` (${s.telefone})` : ""}\n${s.os ? `OS ${s.os}\n` : ""}${s.motivo ? `Motivo: ${s.motivo}\n` : ""}Local: ${onde}`;
  try { await envioWhats(empresaId, numero, texto); } catch (e) { console.error("[apps] SOS por WhatsApp:", e instanceof Error ? e.message : e); }
}

// ------------------------------------------------------------------ consulta

export function listarSos(empresaId: string, filtro: { situacao?: string; limite?: number } = {}): Sos[] {
  const lim = Math.min(500, Math.max(1, filtro.limite ?? 200));
  const sit = ["aberto", "atendido", "encerrado", "pendentes"].includes(filtro.situacao ?? "") ? filtro.situacao! : "";
  const where = sit === "pendentes" ? "AND situacao != 'encerrado'" : sit ? "AND situacao = ?" : "";
  const args: unknown[] = [empresaId, ...(sit && sit !== "pendentes" ? [sit] : []), lim];
  return (banco().prepare(`SELECT * FROM sos_alertas WHERE empresa = ? ${where} ORDER BY em DESC, rowid DESC LIMIT ?`).all(...(args as never[])) as unknown as Linha[]).map(paraSos);
}
/** Alertas que ainda pedem ação da central (abertos e atendidos), do mais novo para o mais velho. */
export const sosPendentes = (empresaId: string) => listarSos(empresaId, { situacao: "pendentes" });
export const sosAbertos = (empresaId: string) => listarSos(empresaId, { situacao: "aberto" });
export const sosDaCorrida = (empresaId: string): Set<string> =>
  new Set((banco().prepare("SELECT corrida_id FROM sos_alertas WHERE empresa = ? AND corrida_id != ''").all(empresaId) as unknown as Array<{ corrida_id: string }>).map((x) => x.corrida_id));

/** Estado dos alertas da própria pessoa (últimas 24 h), para o app mostrar "Alerta enviado / recebido / atendido". */
export function sosDaPessoa(empresaId: string, papel: PapelApp, chave: string): Array<Pick<Sos, "id" | "em" | "situacao" | "atendidoPor" | "observacao" | "lat" | "lng" | "endereco" | "os">> {
  const desde = new Date(agoraBr().getTime() - 24 * 3_600_000).toISOString();
  return (banco().prepare("SELECT * FROM sos_alertas WHERE empresa = ? AND papel = ? AND chave = ? AND em >= ? ORDER BY em DESC LIMIT 10").all(empresaId, papel, chave, desde) as unknown as Linha[])
    .map(paraSos).map((s) => ({ id: s.id, em: s.em, situacao: s.situacao, atendidoPor: s.atendidoPor, observacao: s.situacao === "encerrado" ? s.observacao : "", lat: s.lat, lng: s.lng, endereco: s.endereco, os: s.os }));
}

/** Alertas de outras pessoas, ainda valendo, dentro do raio da posição atual do motorista. */
export function sosProximos(empresaId: string, motoristaId: string, posicao?: { lat: number; lng: number }) {
  const { raioKm, duracaoMin } = config(empresaId);
  if (!(raioKm > 0)) return [];
  const eu = motoristasOnline(empresaId).find((m) => m.id === motoristaId);
  const ref = posicao ?? (eu ? { lat: eu.lat, lng: eu.lng } : null);
  if (!ref) return [];
  const desde = new Date(agoraBr().getTime() - duracaoMin * 60_000).toISOString();
  return (banco().prepare("SELECT * FROM sos_alertas WHERE empresa = ? AND situacao != 'encerrado' AND em >= ? AND lat IS NOT NULL ORDER BY em DESC LIMIT 50").all(empresaId, desde) as unknown as Linha[])
    .map(paraSos)
    .filter((s) => !(s.papel === "motorista" && s.chave === motoristaId))
    .map((s) => ({ s, km: linhaReta(ref, { lat: s.lat!, lng: s.lng! }) }))
    .filter((x) => x.km <= raioKm)
    .map((x) => sosParaMotorista(x.s, Math.round(x.km * 10) / 10));
}

// ------------------------------------------------------------------ ação da central

function avisarQuemPediu(empresaId: string, s: Sos, titulo: string, texto: string) {
  const alvo = { papel: s.papel, chave: s.chave };
  emitir(empresaId, alvo, "sos_estado", { id: s.id, situacao: s.situacao, atendidoPor: s.atendidoPor, observacao: s.situacao === "encerrado" ? s.observacao : "" });
  void avisar(empresaId, alvo, { titulo, texto, canal: "geral", dados: { tipo: "sos_estado", sosId: s.id, situacao: s.situacao } });
}

export function atenderSos(empresaId: string, id: string, por: string): Sos {
  const s = um(empresaId, id);
  if (!s) throw new Error("Alerta não encontrado.");
  if (s.situacao === "encerrado") throw new Error("Este alerta já foi encerrado.");
  if (s.situacao === "atendido") return s; // quem chegou primeiro fica
  banco().prepare("UPDATE sos_alertas SET situacao = 'atendido', atendido_por = ?, atendido_em = ? WHERE empresa = ? AND id = ?").run(por.slice(0, 120), agoraIso(), empresaId, id);
  const novo = um(empresaId, id)!;
  avisarQuemPediu(empresaId, novo, "A central está cuidando do seu alerta", "Alguém da central assumiu o seu pedido de ajuda. Se for grave, ligue 190.");
  return novo;
}

export function encerrarSos(empresaId: string, id: string, por: string, observacao: string): Sos {
  const s = um(empresaId, id);
  if (!s) throw new Error("Alerta não encontrado.");
  if (s.situacao === "encerrado") return s;
  const obs = String(observacao ?? "").replace(/[<>]/g, "").trim().slice(0, 1000);
  const agora = agoraIso();
  banco().prepare("UPDATE sos_alertas SET situacao = 'encerrado', encerrado_por = ?, encerrado_em = ?, observacao = ?, atendido_por = CASE WHEN atendido_por = '' THEN ? ELSE atendido_por END, atendido_em = CASE WHEN atendido_em = '' THEN ? ELSE atendido_em END WHERE empresa = ? AND id = ?")
    .run(por.slice(0, 120), agora, obs, por.slice(0, 120), agora, empresaId, id);
  const novo = um(empresaId, id)!;
  avisarQuemPediu(empresaId, novo, "Alerta encerrado", "A central encerrou o seu pedido de ajuda.");
  // Os motoristas que viram o aviso deixam de vê-lo.
  const alvos = s.lat != null && s.lng != null ? motoristasNoRaio(empresaId, s, config(empresaId).raioKm) : [];
  for (const m of alvos) emitir(empresaId, { papel: "motorista", chave: m.id }, "sos_fim", { id: s.id });
  return novo;
}
