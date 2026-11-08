// Envio de WhatsApp. Cada empresa usa a SUA instância (URL e token dela). Nunca uma instância compartilhada.
// "simulado" não manda nada para fora: guarda as mensagens na memória (para testes e para conhecer o CRM).

import * as A from "./armazem.ts";

export type ResultadoEnvio = { ok: true; id?: string } | { ok: false; erro: string; /** Erro passageiro: volta para a fila. */ temporario: boolean };

export interface ProvedorWhatsApp {
  nome: string;
  enviar(telefone: string, texto: string): Promise<ResultadoEnvio>;
  /** Está pronto para enviar? Devolve o que falta. */
  pendencias(): Promise<string[]>;
}

// ------------------------------------------------------------------ simulado

export interface MensagemSimulada { telefone: string; texto: string; em: string }
const caixas = new Map<string, MensagemSimulada[]>();

export const caixaSimulada = (empresaId: string) => caixas.get(empresaId) ?? [];
export const limparCaixaSimulada = (empresaId: string) => caixas.delete(empresaId);

/** Simulado: telefone terminado em 0000 falha de vez; em 9999 dá erro passageiro (para testar a fila). */
export function provedorSimulado(empresaId: string): ProvedorWhatsApp {
  return {
    nome: "simulado",
    async enviar(telefone, texto) {
      if (telefone.endsWith("0000")) return { ok: false, erro: "Número sem WhatsApp (simulado).", temporario: false };
      if (telefone.endsWith("9999")) return { ok: false, erro: "Instabilidade (simulada).", temporario: true };
      const l = caixas.get(empresaId) ?? [];
      l.unshift({ telefone, texto, em: new Date().toISOString() });
      caixas.set(empresaId, l.slice(0, 200));
      return { ok: true, id: `sim-${Date.now()}` };
    },
    async pendencias() { return []; },
  };
}

// ------------------------------------------------------------------ Evolution API (instância da empresa)

export function provedorEvolution(cred: A.CredWhatsApp, f: typeof fetch = fetch): ProvedorWhatsApp {
  const faltam = () => [!cred.url && "Informe a URL da sua instância.", !cred.token && "Informe o token da instância.", !cred.instancia && "Informe o nome da instância."].filter((x): x is string => !!x);
  const base = cred.url.replace(/\/+$/, "");
  return {
    nome: "evolution",
    async enviar(telefone, texto) {
      if (faltam().length) return { ok: false, erro: "WhatsApp não configurado.", temporario: false };
      try {
        A.validarUrl(base);
        const r = await f(`${base}/message/sendText/${encodeURIComponent(cred.instancia)}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: cred.token },
          body: JSON.stringify({ number: telefone, text: texto }), signal: AbortSignal.timeout(20_000),
        });
        if (r.ok) {
          const d = (await r.json().catch(() => ({}))) as { key?: { id?: string } };
          return { ok: true, id: d.key?.id };
        }
        // 429 e 5xx: passageiro (volta para a fila). 4xx: o número ou a mensagem têm problema.
        const temporario = r.status === 429 || r.status >= 500;
        return { ok: false, erro: `O WhatsApp recusou (HTTP ${r.status}).`, temporario };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, erro: /URL|https/.test(msg) ? msg : "Sem resposta do WhatsApp.", temporario: !/URL|https/.test(msg) };
      }
    },
    async pendencias() {
      const l = faltam();
      if (l.length) return l;
      try {
        A.validarUrl(base);
        const r = await f(`${base}/instance/connectionState/${encodeURIComponent(cred.instancia)}`, { headers: { apikey: cred.token }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return [`A instância não respondeu (HTTP ${r.status}). Confira a URL, o token e o nome.`];
        const d = (await r.json().catch(() => ({}))) as { instance?: { state?: string } };
        return d.instance?.state && d.instance.state !== "open" ? ["O WhatsApp da instância não está conectado. Leia o QR code na sua instância."] : [];
      } catch (e) {
        return [e instanceof Error && /URL|https/.test(e.message) ? e.message : "Não consegui falar com a instância."];
      }
    },
  };
}

// ------------------------------------------------------------------ escolha por empresa

let deTeste: ((empresaId: string) => ProvedorWhatsApp) | null = null;
/** Só para testes: troca o provedor de todas as empresas. */
export const definirProvedorDeTeste = (f: typeof deTeste) => { deTeste = f; };

export function provedorDaEmpresa(empresaId: string): ProvedorWhatsApp {
  if (deTeste) return deTeste(empresaId);
  return A.config(empresaId).provedor === "evolution" ? provedorEvolution(A.credWhatsApp(empresaId)) : provedorSimulado(empresaId);
}
