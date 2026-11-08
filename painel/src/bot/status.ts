// Mensagens de status: o bot olha de tempos em tempos a corrida própria ligada a cada conversa
// (status mudado pela central, pelo app do motorista ou pelo próprio painel) e avisa o passageiro quando muda.

import * as A from "./armazem.ts";
import { corridasDoBot } from "./corridas.ts";
import { enviar, fecharCorrida, provedorDe, type Dependencias } from "./fluxo.ts";
import { marcador, textoStatus } from "./textos.ts";

/** Olha a corrida aberta de uma conversa e avisa o passageiro se mudou. Devolve o texto enviado (ou null). */
export function atualizarStatus(empresaId: string, conversaId: string, deps: Dependencias = {}): Promise<string | null> {
  return A.naFila(empresaId, conversaId, async () => {
    const c = A.conversa(empresaId, conversaId);
    const corrida = c?.corrida;
    if (!c || !corrida || corrida.grupo !== "aberta") return null;
    const d = await corridasDoBot().detalhar(empresaId, corrida.id);
    if (!d) return null; // corrida apagada no painel: deixa como está
    const anterior = corrida.status;
    const mudouMotorista = Boolean(d.motorista && d.motorista !== corrida.motorista && d.status === "a_caminho");
    if (d.status === anterior && !mudouMotorista) return null;
    const texto = textoStatus(marcador(empresaId), d.status, { ...d, anterior });
    corrida.status = d.status;
    corrida.grupo = d.grupo;
    if (d.motorista) corrida.motorista = d.motorista;
    if (d.valor != null) corrida.valor = d.valor;
    if (d.grupo !== "aberta") {
      fecharCorrida(c, {});
      c.etapa = d.grupo === "finalizada" ? "avaliacao" : "inicio";
    }
    if (texto) c.mensagens.push({ de: "bot", texto, em: new Date().toISOString() });
    A.salvarConversa(empresaId, c);
    if (texto) await enviar(empresaId, deps.provedor ?? provedorDe(empresaId), c.id, [texto]);
    return texto;
  });
}

/** Uma rodada: todas as corridas abertas das empresas com o bot ligado. */
export async function verificarTodas() {
  for (const empresaId of A.empresasComBot()) {
    const abertas = Object.values(A.conversas(empresaId)).filter((c) => c.corrida?.grupo === "aberta");
    for (const c of abertas) {
      await atualizarStatus(empresaId, c.id).catch((e) => console.error("[bot] status", empresaId, e instanceof Error ? e.message : e));
    }
  }
}

let relogio: NodeJS.Timeout | null = null;
let rodando = false;

/** Liga a verificação periódica (padrão: a cada 10 s; BOT_STATUS_SEGUNDOS muda). */
export function iniciarStatus() {
  if (relogio) return;
  const seg = Math.max(3, Number(process.env.BOT_STATUS_SEGUNDOS) || 10);
  relogio = setInterval(() => {
    if (rodando) return;
    rodando = true;
    verificarTodas().finally(() => { rodando = false; });
  }, seg * 1000);
  relogio.unref();
}

export function pararStatus() {
  if (relogio) clearInterval(relogio);
  relogio = null;
}
