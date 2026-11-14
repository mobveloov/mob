// Peças comuns do Funil de Clientes e do Mapa de Bairros: período (Hoje, Ontem, 7 dias, Este mês, Personalizado) e download com a empresa escolhida.

import { useState } from "react";
import { empresaEscolhidaAgora } from "../../api";
import { chamar as chamarBase } from "../cadastro/base";
import "./areas.css";

export const chamarAreas = <T,>(caminho: string) => chamarBase<T>("GET", caminho, undefined, "/api/areas");

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

export type AtalhoPeriodo = "hoje" | "ontem" | "semana" | "mes" | "personalizado";
const ROTULOS: Record<AtalhoPeriodo, string> = { hoje: "Hoje", ontem: "Ontem", semana: "Últimos 7 dias", mes: "Este mês", personalizado: "Personalizado" };

function intervalo(a: AtalhoPeriodo, de: string, ate: string) {
  const hoje = iso(new Date());
  if (a === "ontem") return { inicio: diasAtras(1), fim: diasAtras(1) };
  if (a === "semana") return { inicio: diasAtras(6), fim: hoje };
  if (a === "mes") return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
  if (a === "personalizado") return { inicio: de || hoje, fim: ate || de || hoje };
  return { inicio: hoje, fim: hoje };
}

export function usePeriodo() {
  const [atalho, setAtalho] = useState<AtalhoPeriodo>("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const { inicio, fim } = intervalo(atalho, de, ate);
  const controle = (
    <div className="ar-periodo">
      <select aria-label="Período" value={atalho} onChange={(e) => setAtalho(e.target.value as AtalhoPeriodo)}>
        {(Object.keys(ROTULOS) as AtalhoPeriodo[]).map((k) => <option key={k} value={k}>{ROTULOS[k]}</option>)}
      </select>
      {atalho === "personalizado" && <>
        <input type="date" aria-label="Data inicial" value={de} onChange={(e) => setDe(e.target.value)} />
        <input type="date" aria-label="Data final" value={ate} onChange={(e) => setAte(e.target.value)} />
      </>}
    </div>
  );
  return { inicio, fim, controle, qs: `inicio=${inicio}&fim=${fim}` };
}

/** Baixa um arquivo do servidor (precisa do cookie e da empresa escolhida, por isso não é um link simples). */
export async function baixar(caminho: string, nome: string) {
  const headers: Record<string, string> = {};
  const emp = empresaEscolhidaAgora();
  if (emp) headers["X-Empresa"] = emp;
  const r = await fetch(`/api/areas${caminho}`, { credentials: "same-origin", headers });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
