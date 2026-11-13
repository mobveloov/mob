// Peças comuns das telas do grupo Corridas: pedidos ao servidor (/api/operacao), janela, paginação e mapa (Leaflet + OpenStreetMap).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./corridas.css";

export class ErroOp extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function op<T = any>(caminho: string, corpo?: unknown, metodo?: string): Promise<T> {
  const init: RequestInit = { method: metodo ?? (corpo !== undefined ? "POST" : "GET"), credentials: "same-origin", headers: { "Content-Type": "application/json" } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(`/api/operacao${caminho}`, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroOp((j as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return j as T;
}
export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Datas do servidor: horário de Brasília guardado como UTC. Mostrar sempre pelas partes do texto.
export const dh = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : "—");
export const dhAno = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : "—");
export const hora = (s?: string | null) => (s ? s.slice(11, 16) : "—");
export const dia = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
export const reais = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const km = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
export const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const soDig = (s: string) => s.replace(/\D/g, "");
export const fone = (s?: string | null) => {
  const d = soDig(s ?? "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : s || "—";
};
export const zap = (s?: string | null) => { const d = soDig(s ?? ""); return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : ""; };
export const GRUPO_CLASSE: Record<string, string> = { finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta", aberta: "info" };

export function useDados<T>(fn: () => Promise<T>, deps: unknown[], intervaloMs?: number) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fn().then((d) => { if (vivo) { setDados(d); setErro(null); } }).catch((e) => vivo && setErro(msgErro(e))).finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  useEffect(() => {
    if (!intervaloMs) return;
    const t = setInterval(() => setN((x) => x + 1), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return { dados, erro, carregando, recarregar: () => setN((x) => x + 1) };
}

export function Aviso({ texto, erro }: { texto?: string | null; erro?: boolean }) {
  return texto ? <div className={`oc-aviso ${erro ? "erro" : ""}`}>{texto}</div> : null;
}

export function Janela({ aberta = true, onFechar, titulo, sub, tamanho, nivel, acoes, rodape, children }: {
  aberta?: boolean; onFechar: () => void; titulo: ReactNode; sub?: ReactNode; tamanho?: "larga" | "media" | "estreita"; nivel?: "alto" | "centro";
  acoes?: ReactNode; rodape?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onFechar());
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className={`oc-fundo ${nivel ?? ""}`} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`oc-janela ${tamanho ?? ""}`} role="dialog" aria-modal="true">
        <div className="oc-jtopo">
          <div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
          <div className="oc-fila">{acoes}<button className="oc-x" onClick={onFechar} aria-label="Fechar"><X size={20} /></button></div>
        </div>
        <div className="oc-jcorpo">{children}</div>
        {rodape && <div className="oc-jpe">{rodape}</div>}
      </div>
    </div>
  );
}

export function Paginacao({ pagina, paginas, total, onMudar, rotulo = "registros" }: { pagina: number; paginas: number; total: number; onMudar: (p: number) => void; rotulo?: string }) {
  return (
    <div className="oc-pag">
      <span>{total} {rotulo} · página {pagina} de {paginas}</span>
      <div>
        <button className="oc-btn peq" disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)} aria-label="Página anterior"><ChevronLeft size={14} /></button>
        <button className="oc-btn peq" disabled={pagina >= paginas} onClick={() => onMudar(pagina + 1)} aria-label="Próxima página"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export const Selo = ({ tom, children }: { tom?: string; children: ReactNode }) => <span className={`oc-selo ${tom ?? ""}`}>{children}</span>;
export const Dado = ({ r, v }: { r: string; v: ReactNode }) => <div className="oc-dado"><span>{r}</span><b>{v === "" || v == null ? "—" : v}</b></div>;
export const Vazio = ({ children }: { children: ReactNode }) => <div className="oc-vazio">{children}</div>;

// ------------------------------------------------------------------ mapa
export const CENTRO_PADRAO: [number, number] = [-15.78, -47.93];

export function pino(cor: string, texto = "", forma: "redondo" | "ponto" = "redondo") {
  return L.divIcon({
    className: "", iconSize: forma === "ponto" ? [16, 16] : [30, 30], iconAnchor: forma === "ponto" ? [8, 8] : [15, 15],
    html: `<div class="oc-pin" style="background:${cor};${forma === "ponto" ? "width:16px;height:16px;" : ""}">${texto}</div>`,
  });
}

/** Mapa OpenStreetMap. Devolve a referência do div e o mapa (só depois de montar). */
export function useMapa(centro: [number, number] = CENTRO_PADRAO, zoom = 12, ativo = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [mapa, setMapa] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!ativo || !ref.current) return;
    const m = L.map(ref.current, { zoomControl: true }).setView(centro, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
    setMapa(m);
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => { clearTimeout(t); m.remove(); setMapa(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);
  return { ref, mapa };
}
export { L };
