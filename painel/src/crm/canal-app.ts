// Canal "push do app" do CRM: entrega a mensagem na caixa de avisos do app do passageiro ou do motorista
// (e no push do sistema, quando o dono colocar a chave do Firebase). Sem WhatsApp, sem ritmo, sem teto diário.
// Contrato em docs/PUSH_APPS.md.

import crypto from "node:crypto";
import { alvoDoTelefone, entregar } from "../apps/avisos.ts";
import type { PapelApp } from "../apps/sessoes.ts";
import { registrar, type OrigemEnvio } from "./registro.ts";

export type CanalCrm = "whatsapp" | "app";
export const canalValido = (v: unknown): CanalCrm => (v === "app" ? "app" : "whatsapp");

export interface PedidoApp { telefone: string; nome: string; papel: PapelApp; titulo: string; texto: string; origem: OrigemEnvio; origemId: string }
export type ResultadoApp = { ok: true; logId: string } | { ok: false; erro: string; logId: string };

/** Entrega no app e grava a linha do histórico (canal "app") já ligada ao aviso, para o CRM mostrar entregue/lida. */
export async function entregarNoApp(e: string, p: PedidoApp): Promise<ResultadoApp> {
  const logId = crypto.randomUUID().slice(0, 12);
  const log = (estado: "sent" | "failed", erro = "") => registrar(e, { id: logId, canal: "app", origem: p.origem, origem_id: p.origemId, estado, telefone: p.telefone, nome: p.nome, titulo: p.titulo, previa: p.texto, erro });
  // O telefone pode ser de passageiro ou de motorista: tenta o papel do público primeiro.
  const outro: PapelApp = p.papel === "motorista" ? "passageiro" : "motorista";
  const pessoa = alvoDoTelefone(e, p.papel, p.telefone) ?? alvoDoTelefone(e, outro, p.telefone);
  if (!pessoa) { const erro = "Esse telefone não está no cadastro do app."; log("failed", erro); return { ok: false, erro, logId }; }
  try {
    await entregar(e, { papel: pessoa.papel, chave: pessoa.chave }, { titulo: p.titulo, texto: p.texto, origem: `crm-${p.origem}`, origemId: p.origemId, envioRef: logId });
    log("sent");
    return { ok: true, logId };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    log("failed", erro);
    return { ok: false, erro, logId };
  }
}
