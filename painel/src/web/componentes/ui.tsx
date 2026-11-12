import { useEffect, useState, type ReactNode } from "react";
import { Hammer, X } from "lucide-react";
import { diasAtrasIso, hojeIso, type Filtro } from "../api";

export function Titulo({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="titulo">
      <div><h1>{titulo}</h1>{sub && <p>{sub}</p>}</div>
      <div className="acoes">{children}</div>
    </div>
  );
}

/** Tela que ainda vai ser entregue: título certo (igual ao do menu) e um aviso. */
export function EmConstrucao({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <>
      <Titulo titulo={titulo} sub={sub} />
      <section className="cartao construcao">
        <span className="ind-icone cor-ambar"><Hammer size={26} /></span>
        <h2>Em construção</h2>
        <p>Esta tela está sendo preparada e vai ficar igual às demais do painel. Enquanto isso, as outras telas do menu continuam funcionando normalmente.</p>
      </section>
    </>
  );
}

export function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "ok" | "ruim" | "alerta" | "info" }) {
  return (
    <div className={`kpi ${tom ?? ""}`}>
      <span>{rotulo}</span>
      <strong>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </div>
  );
}

/** Lista de barras horizontais: rótulo, barra proporcional e valor. */
export function Barras({ itens, formato = (n) => String(n) }: { itens: Array<{ rotulo: string; valor: number; extra?: string }>; formato?: (n: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="vazio">Sem dados no período.</p>;
  return (
    <ul className="barras">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <span className="rot" title={i.rotulo}>{i.rotulo}</span>
          <span className="trilho"><span style={{ width: `${(i.valor / max) * 100}%` }} /></span>
          <span className="val">{formato(i.valor)}{i.extra && <small> {i.extra}</small>}</span>
        </li>
      ))}
    </ul>
  );
}

/** Avisos da busca (integração fora do ar, sem dados...) e erros. Ignora vazios e repetidos. */
export function Avisos({ lista }: { lista: Array<string | null | undefined> }) {
  const l = [...new Set(lista.filter((x): x is string => !!x))];
  return <>{l.map((a) => <div key={a} className="aviso">{a}</div>)}</>;
}

export function Cartao({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return <section className={`cartao ${className ?? ""}`}>{titulo && <h2>{titulo}</h2>}{children}</section>;
}

/** Período: atalhos de tempo + datas. */
export function Periodo({ valor, onChange, rapidos = true }: { valor: Filtro; onChange: (f: Filtro) => void; rapidos?: boolean }) {
  const atalhos: Array<[string, Filtro]> = [
    ...(rapidos ? ([["15 min", { ultimasHoras: 0.25 }], ["1 hora", { ultimasHoras: 1 }], ["4 horas", { ultimasHoras: 4 }]] as Array<[string, Filtro]>) : []),
    ["Hoje", { inicio: hojeIso(), fim: hojeIso() }],
    ["7 dias", { inicio: diasAtrasIso(6), fim: hojeIso() }],
    ["30 dias", { inicio: diasAtrasIso(29), fim: hojeIso() }],
  ];
  const igual = (a: Filtro) => a.ultimasHoras === valor.ultimasHoras && (a.ultimasHoras || (a.inicio === valor.inicio && a.fim === valor.fim));
  return (
    <div className="periodo">
      {atalhos.map(([r, f]) => (
        <button key={r} className={igual(f) ? "chip ativo" : "chip"} onClick={() => onChange({ ...valor, ultimasHoras: undefined, inicio: undefined, fim: undefined, ...f })}>{r}</button>
      ))}
      <input type="date" value={valor.inicio ?? ""} onChange={(e) => onChange({ ...valor, ultimasHoras: undefined, inicio: e.target.value })} aria-label="Data inicial" />
      <span>até</span>
      <input type="date" value={valor.fim ?? ""} onChange={(e) => onChange({ ...valor, ultimasHoras: undefined, fim: e.target.value })} aria-label="Data final" />
    </div>
  );
}

export function Gaveta({ aberta, onFechar, titulo, children, larga }: { aberta: boolean; onFechar: () => void; titulo: string; children: ReactNode; larga?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  if (!aberta) return null;
  return (
    <div className="fundo" onClick={onFechar}>
      <div className={`gaveta ${larga ? "larga" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="gaveta-topo"><h2>{titulo}</h2><button className="icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button></div>
        <div className="gaveta-corpo">{children}</div>
      </div>
    </div>
  );
}

/** Carrega dados e recarrega quando as dependências mudam. */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[], intervaloMs?: number) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fn().then((d) => { if (vivo) { setDados(d); setErro(null); } }).catch((e) => vivo && setErro(String(e.message ?? e))).finally(() => vivo && setCarregando(false));
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
