// Chat com a central (suporte), fora da corrida: o motorista e o passageiro falam com a central por texto ou áudio,
// e a central responde pelo painel. Fica na tabela app_suporte do banco (por empresa).
// O áudio usa o mesmo cuidado do chat da corrida (tipo, tamanho e começo do arquivo conferidos).

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { banco } from "../servidor/banco.ts";
import { soDigitos } from "./armazem.ts";
import { caminhoDoAudio, salvarArquivoDeAudio } from "./chat.ts";
import { emitir } from "./eventos.ts";
import { avisar } from "./push.ts";
import type { PapelApp } from "./sessoes.ts";

export interface MensagemSuporte {
  id: string; de: "eu" | "central"; texto?: string; em: string;
  audio?: { id: string; mime: string; bytes: number; segundos: number | null };
}
interface Linha { id: string; de: string; texto: string | null; audio: string | null; em: string }

const MAX_POR_CONVERSA = 500;
const paraApp = (l: Linha): MensagemSuporte => ({ id: l.id, de: l.de === "central" ? "central" : "eu", ...(l.texto ? { texto: l.texto } : {}), ...(l.audio ? { audio: JSON.parse(l.audio) } : {}), em: l.em });

export function mensagensDoSuporte(empresaId: string, papel: PapelApp, chave: string, limite = 200): MensagemSuporte[] {
  const l = banco().prepare("SELECT id, de, texto, audio, em FROM app_suporte WHERE empresa = ? AND papel = ? AND chave = ? ORDER BY em DESC, rowid DESC LIMIT ?").all(empresaId, papel, chave, limite) as unknown as Linha[];
  return l.reverse().map(paraApp);
}

/** Marca como lido pela pessoa (o que a central escreveu até agora). */
export const naoLidasDoSuporte = (empresaId: string, papel: PapelApp, chave: string): number =>
  (banco().prepare("SELECT COUNT(*) AS n FROM app_suporte WHERE empresa = ? AND papel = ? AND chave = ? AND de = 'central' AND lida = 0").get(empresaId, papel, chave) as { n: number }).n;

export function marcarSuporteLido(empresaId: string, papel: PapelApp, chave: string) {
  banco().prepare("UPDATE app_suporte SET lida = 1 WHERE empresa = ? AND papel = ? AND chave = ? AND de = 'central' AND lida = 0").run(empresaId, papel, chave);
}

function gravar(empresaId: string, papel: PapelApp, chave: string, de: "pessoa" | "central", texto: string | null, audio: MensagemSuporte["audio"] | null): MensagemSuporte {
  const total = (banco().prepare("SELECT COUNT(*) AS n FROM app_suporte WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { n: number }).n;
  if (total >= MAX_POR_CONVERSA) throw new Error("Esta conversa chegou ao limite de mensagens. Fale por telefone ou WhatsApp.");
  const l: Linha = { id: crypto.randomUUID(), de, texto, audio: audio ? JSON.stringify(audio) : null, em: new Date().toISOString() };
  banco().prepare("INSERT INTO app_suporte (empresa, id, papel, chave, de, texto, audio, em, lida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, l.id, papel, chave, de, l.texto, l.audio, l.em, de === "central" ? 0 : 1);
  return paraApp({ ...l, de });
}

const limpo = (v: unknown) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, 1000);

/** A pessoa escreve para a central. */
export function escreverParaCentral(empresaId: string, papel: PapelApp, chave: string, texto: string): MensagemSuporte {
  const t = limpo(texto);
  if (!t) throw new Error("Escreva a mensagem.");
  const m = gravar(empresaId, papel, chave, "pessoa", t, null);
  emitir(empresaId, { papel, chave }, "suporte", { mensagem: m });
  return m;
}

export function audioParaCentral(empresaId: string, papel: PapelApp, chave: string, tipo: string, bytes: Uint8Array, segundos?: number): MensagemSuporte {
  const a = salvarArquivoDeAudio(empresaId, tipo, bytes, segundos);
  const m = gravar(empresaId, papel, chave, "pessoa", null, a);
  emitir(empresaId, { papel, chave }, "suporte", { mensagem: m });
  return m;
}

/** O áudio de uma conversa, só se ele for desta pessoa. */
export function arquivoDoAudioDoSuporte(empresaId: string, papel: PapelApp, chave: string, audioId: string) {
  const l = banco().prepare("SELECT audio FROM app_suporte WHERE empresa = ? AND papel = ? AND chave = ? AND audio LIKE ?").get(empresaId, papel, chave, `%${audioId.replace(/[^\w-]/g, "")}%`) as { audio: string } | undefined;
  const a = l ? (JSON.parse(l.audio) as NonNullable<MensagemSuporte["audio"]>) : null;
  return a && a.id === audioId ? caminhoDoAudio(empresaId, a.id, a.mime) : null;
}

/** A central responde (pelo painel). A pessoa recebe na hora e por notificação. */
export function responderPelaCentral(empresaId: string, papel: PapelApp, chave: string, texto: string): MensagemSuporte {
  const t = limpo(texto);
  if (!t) throw new Error("Escreva a resposta.");
  const m = gravar(empresaId, papel, chave, "central", t, null);
  emitir(empresaId, { papel, chave }, "suporte", { mensagem: m });
  void avisar(empresaId, { papel, chave }, { titulo: "Central", texto: t.slice(0, 120), dados: { tipo: "suporte" }, canal: "chat" });
  return m;
}

/** Conversas para o painel: última mensagem e quantas a central ainda não respondeu. */
export function conversasDoSuporte(empresaId: string) {
  const linhas = banco().prepare(`
    SELECT papel, chave, MAX(em) AS ultima,
      SUM(CASE WHEN de = 'pessoa' THEN 1 ELSE 0 END) AS dela, SUM(CASE WHEN de = 'central' THEN 1 ELSE 0 END) AS nossa
    FROM app_suporte WHERE empresa = ? GROUP BY papel, chave ORDER BY ultima DESC LIMIT 200`).all(empresaId) as unknown as Array<{ papel: PapelApp; chave: string; ultima: string; dela: number; nossa: number }>;
  const mot = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  const cli = new Map(listar(empresaId, cadastroPorId("clientes")!).map((c) => [soDigitos(c.telefone), c]));
  return linhas.map((l) => {
    const reg = l.papel === "motorista" ? mot.get(l.chave) : cli.get(l.chave);
    const ultima = banco().prepare("SELECT de, texto, audio FROM app_suporte WHERE empresa = ? AND papel = ? AND chave = ? ORDER BY em DESC, rowid DESC LIMIT 1").get(empresaId, l.papel, l.chave) as { de: string; texto: string | null; audio: string | null };
    return {
      papel: l.papel, chave: l.chave, nome: String(reg?.nome ?? ""), telefone: String(reg?.telefone ?? ""), ultimaEm: l.ultima,
      ultima: ultima.texto ?? (ultima.audio ? "Mensagem de áudio" : ""), aguardandoResposta: ultima.de === "pessoa",
    };
  });
}
