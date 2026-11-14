// Peças das telas de pagamentos (Pix, pendências e taxas de cancelamento): período, exportar CSV e quem é administrador.
import { useState } from "react";
import { Download } from "lucide-react";
import { msgErro } from "./comum";
import { useAdmin } from "../demais/comum";
import "./corridas.css";

export { useAdmin };

export interface PeriodoPag { periodo: string; inicio: string; fim: string }
export const PERIODO_30: PeriodoPag = { periodo: "ultimos_30", inicio: "", fim: "" };
const OPCOES: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["ultimos_7", "Últimos 7 dias"], ["ultimos_30", "Últimos 30 dias"], ["semana", "Esta semana"], ["semana_passada", "Semana passada"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["todos", "Todo o período"], ["personalizado", "Personalizado"]];

/** Parâmetros de período para a URL (vazios quando é "todos" sem datas). */
export const paramsPeriodo = (p: PeriodoPag) => ({ periodo: p.periodo, inicio: p.periodo === "personalizado" ? p.inicio : "", fim: p.periodo === "personalizado" ? p.fim : "" });

export function SeletorPeriodo({ valor, onChange }: { valor: PeriodoPag; onChange: (p: PeriodoPag) => void }) {
  return (
    <span className="oc-fila" style={{ gap: 6 }}>
      <select value={valor.periodo} onChange={(e) => onChange({ ...valor, periodo: e.target.value })} aria-label="Período">{OPCOES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      {valor.periodo === "personalizado" && <>
        <input type="date" value={valor.inicio} onChange={(e) => onChange({ ...valor, inicio: e.target.value })} aria-label="Data de início" />
        <input type="date" value={valor.fim} onChange={(e) => onChange({ ...valor, fim: e.target.value })} aria-label="Data do final" />
      </>}
    </span>
  );
}

/** Baixa um CSV do servidor (a proteção contra fórmula é feita lá). */
export async function baixarCsvOp(caminho: string, nome: string) {
  let emp = "";
  try { emp = localStorage.getItem("empresa") ?? ""; } catch { /* sem armazenamento */ }
  const r = await fetch(`/api/operacao${caminho}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function BotaoExportar({ caminho, nome, onErro }: { caminho: string; nome: string; onErro: (m: string | null) => void }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button className="oc-btn" disabled={ocupado} onClick={async () => { setOcupado(true); onErro(null); try { await baixarCsvOp(caminho, nome); } catch (e) { onErro(msgErro(e)); } finally { setOcupado(false); } }}>
      <Download size={14} /> Exportar
    </button>
  );
}

/** Cabeçalho do op() sem a empresa escolhida: o servidor da central usa X-Empresa só para o usuário da plataforma. */
export const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
