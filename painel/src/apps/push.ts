// Notificação push dos apps, com o Firebase DA PRÓPRIA EMPRESA (Firebase Cloud Messaging, API HTTP v1).
//
// A conta de serviço do Firebase (o JSON baixado no console do Firebase) fica FORA do Git, em um destes lugares:
//   1. variável de ambiente FIREBASE_SERVICO_<EMPRESA> (id da empresa em maiúsculas, "-" vira "_"),
//      com o caminho do arquivo JSON ou o próprio JSON;
//   2. arquivo DADOS_DIR/empresas/<id>/apps/firebase-servico.json;
//   3. variável FCM_CONTA_SERVICO_JSON (caminho do JSON ou o próprio JSON), valendo para todas as empresas do servidor.
// Sem conta de serviço o push fica desligado e os apps seguem pelo tempo real (SSE) com o app aberto.
// Um único projeto Firebase da empresa atende os dois apps (passageiro e motorista).

import crypto from "node:crypto";
import fs from "node:fs";
import { arquivo, gravar, ler } from "./armazem.ts";
import type { Alvo } from "./eventos.ts";

interface ContaServico { project_id: string; client_email: string; private_key: string; token_uri?: string }
interface TokenAparelho { papel: string; chave: string; token: string; em: number }

type Busca = typeof fetch;
let busca: Busca = (...a) => fetch(...a);
/** Só para os testes. */
export const definirBuscaDeTeste = (f: Busca | null) => { busca = f ?? ((...a) => fetch(...a)); acessos.clear(); };

const arqTokens = (empresaId: string) => arquivo(empresaId, "push.json");

export function contaServico(empresaId: string): ContaServico | null {
  const valida = (b: unknown) => { const c = b as Partial<ContaServico> | null; return c?.project_id && c.client_email && c.private_key ? (c as ContaServico) : null; };
  const deVariavel = (v?: string) => { const t = v?.trim(); if (!t) return null; try { return valida(JSON.parse(t.startsWith("{") ? t : fs.readFileSync(t, "utf8"))); } catch { return null; } };
  const propria = deVariavel(process.env[`FIREBASE_SERVICO_${empresaId.toUpperCase().replace(/-/g, "_")}`]);
  if (propria) return propria;
  let doArquivo: ContaServico | null = null;
  try { doArquivo = valida(ler<unknown>(arquivo(empresaId, "firebase-servico.json"), null)); } catch { /* sem arquivo */ }
  return doArquivo ?? deVariavel(process.env.FCM_CONTA_SERVICO_JSON);
}

export const pushLigado = (empresaId: string) => contaServico(empresaId) != null;

export function registrarToken(empresaId: string, alvo: Alvo, token: string) {
  if (!/^[\w:.-]{20,4096}$/.test(token)) throw new Error("Token de notificação inválido.");
  const l = ler<TokenAparelho[]>(arqTokens(empresaId), []).filter((t) => t.token !== token);
  // No máximo 5 aparelhos por pessoa.
  const meus = l.filter((t) => t.papel === alvo.papel && t.chave === alvo.chave);
  const outros = l.filter((t) => !(t.papel === alvo.papel && t.chave === alvo.chave));
  gravar(arqTokens(empresaId), [...outros, ...meus.slice(-4), { ...alvo, token, em: Date.now() }]);
}

function removerToken(empresaId: string, token: string) {
  gravar(arqTokens(empresaId), ler<TokenAparelho[]>(arqTokens(empresaId), []).filter((t) => t.token !== token));
}

// ------------------------------------------------------------------ acesso (OAuth com a conta de serviço)

const acessos = new Map<string, { token: string; expira: number }>();

async function tokenDeAcesso(conta: ContaServico): Promise<string> {
  const guardado = acessos.get(conta.client_email);
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token;
  const uri = conta.token_uri ?? "https://oauth2.googleapis.com/token";
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: conta.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: uri, iat: agora, exp: agora + 3600 })}`;
  const assinatura = crypto.createSign("RSA-SHA256").update(corpo).sign(conta.private_key).toString("base64url");
  const r = await busca(uri, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${assinatura}` }).toString(),
  });
  if (!r.ok) throw new Error(`Firebase recusou a conta de serviço (${r.status}).`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  acessos.set(conta.client_email, { token: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

// ------------------------------------------------------------------ envio

export interface Aviso { titulo: string; texto: string; dados?: Record<string, string>; canal?: "corridas" | "chat" | "geral" | "chegada" | "emergencia" }

/** Como ficou o push do sistema (com o app fechado) de uma mensagem. */
export type SituacaoPush = "enviado" | "sem_chave" | "sem_aparelho" | "falha";
export interface ResultadoPush { situacao: SituacaoPush; aceitos: number; erro: string }

/** Manda push para todos os aparelhos da pessoa e diz o que aconteceu. Nunca lança erro: push é um extra. */
export async function avisarDetalhado(empresaId: string, alvo: Alvo, aviso: Aviso): Promise<ResultadoPush> {
  const conta = contaServico(empresaId);
  // Sem a chave do Firebase (modo simulado): a mensagem fica só dentro do app, que busca a lista de avisos.
  if (!conta) return { situacao: "sem_chave", aceitos: 0, erro: "" };
  const tokens = ler<TokenAparelho[]>(arqTokens(empresaId), []).filter((t) => t.papel === alvo.papel && t.chave === alvo.chave);
  if (!tokens.length) return { situacao: "sem_aparelho", aceitos: 0, erro: "" };
  let ok = 0, erro = "";
  try {
    const acesso = await tokenDeAcesso(conta);
    for (const t of tokens) {
      const r = await busca(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(conta.project_id)}/messages:send`, {
        method: "POST", headers: { authorization: `Bearer ${acesso}`, "content-type": "application/json" },
        body: JSON.stringify({ message: {
          token: t.token,
          notification: { title: aviso.titulo.slice(0, 80), body: aviso.texto.slice(0, 200) },
          data: aviso.dados ?? {},
          android: { priority: "high", notification: { channel_id: aviso.canal ?? "geral", sound: "default" } },
        } }),
      });
      if (r.ok) ok++;
      else {
        erro = `FCM respondeu ${r.status}`;
        if (r.status === 404 || r.status === 400) removerToken(empresaId, t.token); // aparelho saiu ou token velho
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("[apps] push", empresaId, erro);
  }
  return { situacao: ok ? "enviado" : "falha", aceitos: ok, erro };
}

/** Manda push para todos os aparelhos da pessoa. Nunca lança erro: push é um extra. Devolve quantos foram aceitos. */
export async function avisar(empresaId: string, alvo: Alvo, aviso: Aviso): Promise<number> {
  return (await avisarDetalhado(empresaId, alvo, aviso)).aceitos;
}

export const aparelhosDaPessoa = (empresaId: string, alvo: Alvo) => ler<TokenAparelho[]>(arqTokens(empresaId), []).filter((t) => t.papel === alvo.papel && t.chave === alvo.chave).length;
