// Provedores de WhatsApp. O bot só conhece a interface ProvedorWhatsApp.
// - Evolution API: instância da PRÓPRIA empresa (URL e token dela, nos segredos da empresa). Nunca compartilhada.
// - Simulado: guarda as mensagens enviadas na memória. Para testes e para a tela "Testar conversa".

import type { Recebida, SituacaoConexao } from "./tipos.ts";

export interface Conexao { situacao: SituacaoConexao; qr?: string; codigo?: string; detalhe?: string }

export interface ProvedorWhatsApp {
  readonly tipo: "evolution" | "simulado";
  enviarTexto(telefone: string, texto: string): Promise<void>;
  /** Cria/liga a instância e aponta o webhook para o painel. Devolve o QR quando falta ler. */
  conectar(webhookUrl: string): Promise<Conexao>;
  situacao(): Promise<Conexao>;
  desconectar(): Promise<void>;
  /** Traduz o corpo do webhook do provedor em mensagens recebidas (ignora as enviadas pelo próprio número). */
  lerWebhook(corpo: unknown): Recebida[];
}

export const soDigitos = (t: unknown) => String(t ?? "").replace(/\D/g, "");

// ------------------------------------------------------------------ simulado

/** Mensagens enviadas pelo provedor simulado, por empresa. */
const caixas = new Map<string, Array<{ telefone: string; texto: string; em: string }>>();
export const caixaSimulada = (empresaId: string) => caixas.get(empresaId) ?? [];
export const limparCaixaSimulada = (empresaId: string) => caixas.delete(empresaId);

/** QR de mentira (SVG) para a tela de conexão no modo simulado. */
const QR_SIMULADO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/>${
    Array.from({ length: 21 * 21 }, (_, i) => ((i * 7919) % 13 < 5 ? `<rect x="${i % 21}" y="${Math.floor(i / 21)}" width="1" height="1"/>` : "")).join("")
  }</svg>`,
).toString("base64")}`;

export function provedorSimulado(empresaId: string): ProvedorWhatsApp {
  return {
    tipo: "simulado",
    async enviarTexto(telefone, texto) {
      const l = caixas.get(empresaId) ?? [];
      l.push({ telefone: soDigitos(telefone), texto, em: new Date().toISOString() });
      caixas.set(empresaId, l.slice(-500));
    },
    async conectar() { return { situacao: "conectado", qr: QR_SIMULADO, detalhe: "Modo simulado: nenhuma mensagem sai de verdade." }; },
    async situacao() { return { situacao: "conectado", detalhe: "Modo simulado." }; },
    async desconectar() { /* nada */ },
    lerWebhook(corpo) {
      const c = (corpo ?? {}) as Record<string, unknown>;
      const telefone = soDigitos(c.telefone);
      if (!telefone) return [];
      const local = c.local as { lat?: unknown; lng?: unknown; texto?: unknown } | undefined;
      return [{
        id: String(c.id ?? `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        telefone, nome: c.nome ? String(c.nome).slice(0, 60) : undefined,
        texto: c.texto != null ? String(c.texto).slice(0, 1000) : undefined,
        local: local && Number.isFinite(Number(local.lat)) && Number.isFinite(Number(local.lng))
          ? { lat: Number(local.lat), lng: Number(local.lng), texto: String(local.texto ?? "") } : undefined,
      }];
    },
  };
}

// ------------------------------------------------------------------ Evolution API (v2)

type FetchLike = typeof fetch;

export interface DadosEvolution { urlApi: string; token: string; instancia: string; fetch?: FetchLike }

const ESTADO: Record<string, SituacaoConexao> = { open: "conectado", connecting: "aguardando_qr", close: "desconectado" };

export function provedorEvolution(d: DadosEvolution): ProvedorWhatsApp {
  const base = d.urlApi.trim().replace(/\/+$/, "");
  const inst = encodeURIComponent(d.instancia);
  const f = d.fetch ?? fetch;
  const configurado = Boolean(base && d.token && d.instancia);

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (!configurado) throw new Error("Falta o endereço, o token ou a instância do WhatsApp.");
    const r = await f(`${base}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", apikey: d.token },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await r.text();
    let json: unknown = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { json = { bruto: texto.slice(0, 200) }; }
    if (!r.ok) {
      const msg = (json as { response?: { message?: unknown }; message?: unknown }).response?.message ?? (json as { message?: unknown }).message;
      const e = new Error(`WhatsApp respondeu ${r.status}${msg ? `: ${String(Array.isArray(msg) ? msg.join("; ") : msg).slice(0, 160)}` : ""}`);
      (e as Error & { status?: number }).status = r.status;
      throw e;
    }
    return json as T;
  }

  const EVENTOS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];
  const qrDe = (j: Record<string, unknown>) => {
    const q = (j.qrcode ?? j) as { base64?: string; code?: string; pairingCode?: string };
    return { qr: q.base64 || undefined, codigo: q.pairingCode || undefined };
  };

  async function situacao(): Promise<Conexao> {
    if (!configurado) return { situacao: "nao_configurado" };
    try {
      const j = await chamar<{ instance?: { state?: string }; state?: string }>("GET", `/instance/connectionState/${inst}`);
      const estado = j.instance?.state ?? j.state ?? "";
      return { situacao: ESTADO[estado] ?? "desconectado", detalhe: estado || undefined };
    } catch (e) {
      if ((e as { status?: number }).status === 404) return { situacao: "desconectado", detalhe: "Instância ainda não criada." };
      return { situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    tipo: "evolution",
    async enviarTexto(telefone, texto) {
      await chamar("POST", `/message/sendText/${inst}`, { number: soDigitos(telefone), text: texto });
    },
    async conectar(webhookUrl) {
      const webhook = { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: EVENTOS };
      const s = await situacao();
      if (s.situacao === "desconectado" && s.detalhe === "Instância ainda não criada.") {
        const j = await chamar<Record<string, unknown>>("POST", "/instance/create", {
          instanceName: d.instancia, qrcode: true, integration: "WHATSAPP-BAILEYS", webhook,
        });
        return { situacao: "aguardando_qr", ...qrDe(j) };
      }
      if (s.situacao === "erro") return s;
      await chamar("POST", `/webhook/set/${inst}`, { webhook });
      if (s.situacao === "conectado") return s;
      const j = await chamar<Record<string, unknown>>("GET", `/instance/connect/${inst}`);
      return { situacao: "aguardando_qr", ...qrDe(j) };
    },
    situacao,
    async desconectar() { await chamar("DELETE", `/instance/logout/${inst}`); },
    lerWebhook(corpo) {
      const c = (corpo ?? {}) as { event?: string; data?: unknown };
      const evento = String(c.event ?? "").toLowerCase().replace(/_/g, ".");
      if (evento !== "messages.upsert") return [];
      const lista = Array.isArray(c.data) ? c.data : [c.data];
      const out: Recebida[] = [];
      for (const item of lista) {
        const m = (item ?? {}) as {
          key?: { remoteJid?: string; fromMe?: boolean; id?: string }; pushName?: string;
          message?: { conversation?: string; extendedTextMessage?: { text?: string };
            locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string } };
        };
        const jid = m.key?.remoteJid ?? "";
        if (!jid || m.key?.fromMe || !jid.endsWith("@s.whatsapp.net")) continue; // ignora grupos, status e as próprias
        const loc = m.message?.locationMessage;
        const texto = m.message?.conversation ?? m.message?.extendedTextMessage?.text;
        out.push({
          id: String(m.key?.id ?? `${jid}-${Date.now()}`), telefone: soDigitos(jid.split("@")[0]), nome: m.pushName?.slice(0, 60),
          texto: texto ? texto.slice(0, 1000) : undefined,
          local: loc && Number.isFinite(loc.degreesLatitude) && Number.isFinite(loc.degreesLongitude)
            ? { lat: loc.degreesLatitude!, lng: loc.degreesLongitude!, texto: [loc.name, loc.address].filter(Boolean).join(" - ") } : undefined,
        });
      }
      return out.filter((r) => r.texto || r.local);
    },
  };
}
