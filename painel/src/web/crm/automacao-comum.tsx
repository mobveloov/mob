// Peças comuns das abas Gatilhos, Fila, Régua e Notificações.

import { useEffect, useState, type ReactNode } from "react";
import { Pause, Play, PauseCircle } from "lucide-react";
import { quandoReal } from "./api";
import { automacao } from "./api-automacao";
import { useGestor, useRetorno } from "./comum";
import { useCarregar } from "../componentes/ui";

export const PAGINA = 50;

export function useAtrasado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

export const ROTULO_ENVIO: Record<string, string> = { sent: "Enviado", failed: "Falhou", skipped: "Pulado", pending: "Pendente", processing: "Processando", canceled: "Cancelado" };
export const classeEnvio = (s: string) => (s === "sent" ? "ok" : s === "failed" ? "ruim" : s === "pending" || s === "processing" ? "info" : s === "skipped" ? "alerta" : "");

/** "em 5 min", "em 2h05"... até a hora marcada (ms). */
export function ate(ms: number | null): string {
  if (!ms) return "";
  const dif = ms - Date.now();
  if (dif <= 0) return "na próxima rodada (até 1 min)";
  const m = Math.round(dif / 60000);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `em ${h}h${String(m % 60).padStart(2, "0")}` : `em ${Math.floor(h / 24)} dia(s)`;
}

export const hora = (ms: number | null | undefined) => (ms ? quandoReal(ms) : "-");

export function Paginador({ pagina, total, onPagina }: { pagina: number; total: number; onPagina: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / PAGINA));
  const de = total === 0 ? 0 : pagina * PAGINA + 1, ateN = Math.min(total, (pagina + 1) * PAGINA);
  return (
    <div className="linha-filtro">
      <small className="sub">Mostrando {de.toLocaleString("pt-BR")}–{ateN.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</small>
      <div className="acoes">
        <button className="botao" disabled={pagina === 0} onClick={() => onPagina(pagina - 1)}>Anterior</button>
        <button className="botao" disabled={pagina + 1 >= paginas} onClick={() => onPagina(pagina + 1)}>Próxima</button>
      </div>
    </div>
  );
}

/** Número grande clicável (filtro) ou só informativo. */
export function Contagem({ rotulo, valor, tom, ativo, onClick }: { rotulo: string; valor: ReactNode; tom?: "ok" | "ruim" | "alerta" | "info"; ativo?: boolean; onClick?: () => void }) {
  const corpo = <><span>{rotulo}</span><strong>{typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}</strong></>;
  if (!onClick) return <div className={`kpi ${tom ?? ""}`}>{corpo}</div>;
  return <button type="button" className={`kpi ${tom ?? ""}`} style={{ textAlign: "left", cursor: "pointer", outline: ativo ? "2px solid var(--primaria)" : undefined }} onClick={onClick}>{corpo}</button>;
}

/** "Pausar todos os envios do CRM": segura campanhas, gatilhos e jornadas até continuar. Estado guardado no servidor. */
export function BarraPausa() {
  const { dados, recarregar } = useCarregar(() => automacao.limites(), [], 10_000);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  if (!dados) return null;
  const p = dados.pausa;
  return (
    <>
      {caixa}
      <div className={`cartao linha-filtro${p.pausado ? " alerta" : ""}`} style={p.pausado ? { borderColor: "var(--alerta)" } : undefined}>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PauseCircle size={18} />
          <span>
            <strong>{p.pausado ? "Envios do CRM pausados" : "Envios do CRM em andamento"}</strong><br />
            <small className="sub">
              {p.pausado
                ? `Nada sai (campanhas, gatilhos, jornadas) até você continuar${p.por ? ` · pausado por ${p.por}` : ""}. A fila fica guardada.`
                : `Hoje: ${dados.enviadosHoje} enviadas de ${dados.tetoHoje} permitidas no WhatsApp (teto diário com aquecimento, ajuste em Régua).`}
            </small>
          </span>
        </span>
        {gestor && (
          <button className={p.pausado ? "botao primario" : "botao"} onClick={() => tentar(() => automacao.pausar(!p.pausado), p.pausado ? "Envios do CRM continuam." : "Envios do CRM pausados.").then(recarregar)}>
            {p.pausado ? <><Play size={14} /> Continuar</> : <><Pause size={14} /> Pausar todos os envios</>}
          </button>
        )}
      </div>
    </>
  );
}
