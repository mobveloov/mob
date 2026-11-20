// Campo de data como texto com máscara dd/mm/aaaa (igual aos filtros da Machine). Guarda e devolve AAAA-MM-DD ("" se incompleta).
import { useEffect, useState } from "react";

export const mascaraData = (s: string) => { const d = s.replace(/\D/g, "").slice(0, 8); return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
export const mascaraHora = (s: string) => { const d = s.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };
export const isoParaBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export const brParaIso = (br: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br); if (!m) return ""; const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`); return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[3]}-${m[2]}-${m[1]}` ? "" : `${m[3]}-${m[2]}-${m[1]}`; };

export function DataBr({ valor, onChange, ...resto }: { valor: string; onChange: (iso: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [txt, setTxt] = useState(isoParaBr(valor));
  useEffect(() => { if (valor !== brParaIso(txt)) setTxt(isoParaBr(valor)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [valor]);
  return <input {...resto} type="text" inputMode="numeric" maxLength={10} placeholder={resto.placeholder ?? "dd/mm/aaaa"} value={txt} onChange={(e) => { const m = mascaraData(e.target.value); setTxt(m); onChange(brParaIso(m)); }} />;
}
