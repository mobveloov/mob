// Provedores de WhatsApp por API: Z-API, Z-Pro e Meta (WhatsApp Cloud API). Mesma interface do Evolution e do simulado.
// Chaves e tokens vêm dos segredos da empresa (nunca do código). Testes usam um fetch de mentira.

import crypto from "node:crypto";
import type { Conexao, ProvedorWhatsApp } from "./provedores.ts";
import { soDigitos } from "./provedores.ts";
import type { Recebida } from "./tipos.ts";

type FetchLike = typeof fetch;

/** Baixa um arquivo público (só https), com limite de tamanho. */
async function baixarUrl(url: string, mimetype: string, f: FetchLike, headers?: Record<string, string>) {
  if (!/^https:\/\//i.test(url)) return null;
  const r = await f(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return null;
  const bytes = Buffer.from(await r.arrayBuffer());
  return bytes.length && bytes.length <= 20_000_000 ? { bytes, mimetype } : null;
}

// ------------------------------------------------------------------ Z-API e Z-Pro

export interface DadosZapi {
  /** Endereço da instância, ex.: https://api.z-api.io/instances/<id>. */
  urlApi: string; token: string; clientToken?: string; fetch?: FetchLike;
}

/** Corpo que a Z-API/Z-Pro manda no webhook de mensagem recebida. Grupos são ignorados. */
export function lerWebhookZapi(corpo: unknown): Recebida[] {
  const b = (corpo ?? {}) as Record<string, unknown>;
  if (b.type && b.type !== "ReceivedCallback") return [];
  const phone = String(b.phone ?? "");
  if (!phone || b.isGroup === true || b.isNewsletter === true || /-group$|@g\.us$|status@broadcast/i.test(phone)) return [];
  const daCentral = b.fromMe === true;
  const txt = (b.text as { message?: unknown } | undefined)?.message ?? (typeof b.text === "string" ? b.text : undefined) ?? b.caption;
  const texto = txt != null && String(txt).trim() ? String(txt).slice(0, 1000) : undefined;
  if (daCentral && !String(texto ?? "").trim().startsWith("#")) return [];
  const loc = b.location as { latitude?: unknown; longitude?: unknown; name?: unknown; address?: unknown } | undefined;
  const lat = Number(loc?.latitude), lng = Number(loc?.longitude);
  const au = b.audio as { audioUrl?: unknown; mimeType?: unknown } | undefined;
  const r: Recebida = {
    id: String(b.messageId ?? b.id ?? `${phone}-${Date.now()}`), telefone: soDigitos(phone),
    nome: daCentral ? undefined : b.senderName ? String(b.senderName).slice(0, 60) : undefined,
    texto, daCentral: daCentral || undefined,
    local: loc && loc.latitude != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, texto: [loc.name, loc.address].filter(Boolean).join(" - ") } : undefined,
    audio: au?.audioUrl ? { url: String(au.audioUrl), mimetype: String(au.mimeType ?? "audio/ogg") } : undefined,
  };
  return r.texto || r.local || r.audio ? [r] : [];
}

export function provedorZapi(d: DadosZapi, tipo: "zapi" | "zpro" = "zapi"): ProvedorWhatsApp {
  const base = d.urlApi.trim().replace(/\/+$/, "");
  const f = d.fetch ?? fetch;
  const configurado = Boolean(base && d.token);
  const nome = tipo === "zpro" ? "Z-Pro" : "Z-API";

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (!configurado) throw new Error("Falta o endereço ou o token do WhatsApp.");
    const r = await f(`${base}/token/${d.token}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(d.clientToken ? { "Client-Token": d.clientToken } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await r.text();
    let json: unknown = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { json = { bruto: texto.slice(0, 200) }; }
    if (!r.ok) {
      const msg = (json as { error?: unknown; message?: unknown }).error ?? (json as { message?: unknown }).message;
      throw new Error(`${nome} respondeu ${r.status}${msg ? `: ${String(msg).slice(0, 160)}` : ""}`);
    }
    return json as T;
  }

  async function situacao(): Promise<Conexao> {
    if (!configurado) return { situacao: "nao_configurado" };
    try {
      const j = await chamar<{ connected?: boolean; error?: string }>("GET", "/status");
      if (j.connected) return { situacao: "conectado" };
      return { situacao: "desconectado", detalhe: j.error ? String(j.error).slice(0, 160) : undefined };
    } catch (e) {
      return { situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    tipo,
    async enviarTexto(telefone, texto) { await chamar("POST", "/send-text", { phone: soDigitos(telefone), message: texto }); },
    async enviarImagem(telefone, url, legenda) { await chamar("POST", "/send-image", { phone: soDigitos(telefone), image: url, caption: legenda }); },
    async conectar(webhookUrl) {
      const s = await situacao();
      if (s.situacao === "erro" || s.situacao === "nao_configurado") return s;
      await chamar("PUT", "/update-every-webhooks", { value: webhookUrl, notifySentByMe: true });
      if (s.situacao === "conectado") return s;
      const j = await chamar<{ value?: string; connected?: boolean }>("GET", "/qr-code/image");
      if (j.connected) return { situacao: "conectado" };
      const v = String(j.value ?? "");
      return { situacao: "aguardando_qr", qr: v ? (v.startsWith("data:") ? v : `data:image/png;base64,${v}`) : undefined };
    },
    situacao,
    async desconectar() { await chamar("GET", "/disconnect"); },
    lerWebhook: lerWebhookZapi,
    async baixarAudio(a) { return a.url ? baixarUrl(a.url, a.mimetype, f) : null; },
  };
}

// ------------------------------------------------------------------ Meta (WhatsApp Cloud API)

export interface DadosMeta { token: string; phoneId: string; wabaId?: string; fetch?: FetchLike }

const GRAPH = "https://graph.facebook.com/v20.0";

/** Mensagem atrasada: a Meta reenvia por dias o que não foi entregue. Com mais de 10 min, o bot não responde. */
export function metaAtrasada(timestamp: unknown, agora = Date.now(), maxMs = 10 * 60_000): boolean {
  const s = Number(timestamp);
  return Number.isFinite(s) && s > 0 && agora - s * 1000 > maxMs;
}

/** A assinatura X-Hub-Signature-256 confere com o App Secret? (corpo cru, como chegou) */
export function metaAssinaturaOk(corpoCru: string, cabecalho: string | undefined, appSecret: string): boolean {
  const sig = (cabecalho ?? "").trim().toLowerCase();
  if (!appSecret || !/^sha256=[0-9a-f]{64}$/.test(sig)) return false;
  const esperado = crypto.createHmac("sha256", appSecret).update(corpoCru).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(sig.slice(7)));
}

export function lerWebhookMeta(corpo: unknown, phoneId?: string, agora = Date.now()): Recebida[] {
  const out: Recebida[] = [];
  const entradas = ((corpo as { entry?: unknown[] })?.entry ?? []) as Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>;
  for (const e of entradas) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {};
    const meta = (v.metadata ?? {}) as { phone_number_id?: unknown };
    if (phoneId && meta.phone_number_id != null && String(meta.phone_number_id) !== phoneId) continue; // aviso de outro número
    const nomes = new Map<string, string>();
    for (const c of (v.contacts ?? []) as Array<{ wa_id?: string; profile?: { name?: string } }>) if (c.wa_id && c.profile?.name) nomes.set(c.wa_id, c.profile.name);
    for (const m of (v.messages ?? []) as Array<Record<string, unknown>>) {
      const from = soDigitos(m.from);
      if (!from || metaAtrasada(m.timestamp, agora)) continue;
      const inter = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
      const texto = m.type === "text" ? (m.text as { body?: string } | undefined)?.body
        : m.type === "interactive" ? (inter?.button_reply?.title ?? inter?.list_reply?.title)
          : m.type === "button" ? (m.button as { text?: string } | undefined)?.text : undefined;
      const loc = m.type === "location" ? (m.location as { latitude?: number; longitude?: number; name?: string; address?: string } | undefined) : undefined;
      const au = m.type === "audio" ? (m.audio as { id?: string; mime_type?: string } | undefined) : undefined;
      const r: Recebida = {
        id: String(m.id ?? `${from}-${agora}`), telefone: from, nome: nomes.get(from)?.slice(0, 60),
        texto: texto ? String(texto).slice(0, 1000) : undefined,
        local: loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
          ? { lat: loc.latitude!, lng: loc.longitude!, texto: [loc.name, loc.address].filter(Boolean).join(" - ") } : undefined,
        audio: au?.id ? { id: au.id, mimetype: au.mime_type ?? "audio/ogg" } : undefined,
      };
      if (r.texto || r.local || r.audio) out.push(r);
    }
  }
  return out;
}

export function provedorMeta(d: DadosMeta): ProvedorWhatsApp {
  const f = d.fetch ?? fetch;
  const configurado = Boolean(d.token && d.phoneId);
  const aut = { "Content-Type": "application/json", Authorization: `Bearer ${d.token}` };

  async function enviar(corpo: Record<string, unknown>) {
    if (!configurado) throw new Error("Falta o token ou o phone id da Meta.");
    const r = await f(`${GRAPH}/${encodeURIComponent(d.phoneId)}/messages`, {
      method: "POST", headers: aut, body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }), signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      let msg = ""; try { msg = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? ""; } catch { /* corpo não é JSON */ }
      throw new Error(`A Meta respondeu ${r.status}${msg ? `: ${msg.slice(0, 160)}` : ""}`);
    }
  }
  async function situacao(): Promise<Conexao> {
    if (!configurado) return { situacao: "nao_configurado" };
    try {
      const r = await f(`${GRAPH}/${encodeURIComponent(d.phoneId)}?fields=display_phone_number`, { headers: aut, signal: AbortSignal.timeout(15_000) });
      if (r.ok) return { situacao: "conectado", detalhe: ((await r.json()) as { display_phone_number?: string }).display_phone_number };
      return { situacao: "erro", detalhe: `A Meta respondeu ${r.status}. Confira o token e o phone id.` };
    } catch (e) { return { situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) }; }
  }
  return {
    tipo: "meta",
    enviarTexto: (telefone, texto) => enviar({ to: soDigitos(telefone), type: "text", text: { body: texto } }),
    enviarImagem: (telefone, url, legenda) => enviar({ to: soDigitos(telefone), type: "image", image: { link: url, caption: legenda } }),
    async conectar() {
      const s = await situacao();
      return s.situacao === "conectado"
        ? { ...s, detalhe: `${s.detalhe ? `${s.detalhe}. ` : ""}Cadastre o endereço de entrada e a senha de verificação no painel da Meta (WhatsApp, Configuração, Webhook).` } : s;
    },
    situacao,
    async desconectar() { /* a Meta não tem "sair": remova o webhook no painel da Meta */ },
    lerWebhook: (corpo) => lerWebhookMeta(corpo, d.phoneId),
    async baixarAudio(a) {
      if (!a.id || !configurado) return null;
      const r = await f(`${GRAPH}/${encodeURIComponent(a.id)}`, { headers: aut, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return null;
      const j = (await r.json()) as { url?: string; mime_type?: string };
      return j.url ? baixarUrl(j.url, j.mime_type ?? a.mimetype, f, { Authorization: `Bearer ${d.token}` }) : null;
    },
  };
}
