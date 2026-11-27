// Peças comuns das telas do grupo Corridas: pedidos ao servidor (/api/operacao), janela, paginação e mapa (Leaflet + OpenStreetMap).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./corridas.css";
import { baseDoMapa } from "../../../comum/mapa-base.ts";
import { invalidarDepois } from "../../../comum/mapa-seguro.ts";
import { aplicarVista, CENTRO_BRASIL, desenharCobertura, mapaNaoMexido, type CentroDoMapa } from "../../../comum/mapa-centro.ts";
import { buscarCentro } from "../../centro-mapa";

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
/** Só até o servidor dizer onde a empresa atua: o Brasil inteiro, nunca um ponto fixo. */
export const CENTRO_PADRAO: [number, number] = CENTRO_BRASIL;

export function pino(cor: string, texto = "", forma: "redondo" | "ponto" = "redondo") {
  return L.divIcon({
    className: "", iconSize: forma === "ponto" ? [16, 16] : [30, 30], iconAnchor: forma === "ponto" ? [8, 8] : [15, 15],
    html: `<div class="oc-pin" style="background:${cor};${forma === "ponto" ? "width:16px;height:16px;" : ""}">${texto}</div>`,
  });
}

/**
 * Mapa OpenStreetMap. Devolve a referência do div e o mapa (só depois de montar).
 * Sem `centro`, o mapa abre na cidade da filial escolhida (`filial`; vazio = todas) com a área de cobertura desenhada,
 * e recentra ao trocar a filial. Com `centro`, a tela manda na vista (`areas: false` não desenha a cobertura).
 */
export function useMapa(centro?: [number, number], zoom = 12, ativo = true, opcoes: { filial?: string; areas?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mapa, setMapa] = useState<L.Map | null>(null);
  const [vista, setVista] = useState<CentroDoMapa | null>(null);
  const inicial = centro ?? CENTRO_PADRAO;
  useEffect(() => {
    if (!ativo || !ref.current) return;
    const m = L.map(ref.current, { zoomControl: true }).setView(inicial, centro ? zoom : 4);
    baseDoMapa(L, m);
    setMapa(m);
    const cancela = invalidarDepois(m, 150);
    return () => { cancela(); m.remove(); setMapa(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);
  const filial = opcoes.filial ?? "";
  const desenhar = opcoes.areas !== false;
  const aplicada = useRef<string | null>(null);
  const cobertura = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa || (centro && !desenhar)) return;
    let vivo = true;
    void buscarCentro(filial).then((c) => {
      if (!vivo || !c) return;
      setVista(c);
      if (desenhar) cobertura.current = desenharCobertura(L, mapa, c.areas, cobertura.current);
      // Sem centro dado pela tela: a vista vem do servidor (na primeira vez só se ninguém mexeu; ao trocar a filial, sempre).
      if (!centro && (aplicada.current === null ? mapaNaoMexido(mapa, inicial) : aplicada.current !== filial)) aplicarVista(L, mapa, c);
      aplicada.current = filial;
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, filial, desenhar]);
  return { ref, mapa, vista };
}
export { L };
