// Central de notificações: o sino do topo, com a lista, "Somente não lidas" e seleção para marcar como lidas.
// Também mostra, acima do conteúdo, a faixa do alerta para empresas mais grave que estiver valendo.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCircle2, RefreshCw, X } from "lucide-react";
import { pedirConfig } from "./comum";
import "./demais.css";

interface Item { chave: string; nivel: "urgente" | "atencao" | "aviso" | "info"; titulo: string; texto: string; em: string; rota: string; lida: boolean }
const hora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;

export function Sino() {
  const [aberto, setAberto] = useState(false);
  const [so, setSo] = useState(false);
  const [dados, setDados] = useState<{ total: number; naoLidas: number; itens: Item[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const carregar = useCallback(async () => {
    try { setDados(await pedirConfig(`/central-notificacoes${so ? "?somenteNaoLidas=1" : ""}`)); setErro(null); } catch (e) { setErro((e as Error).message); }
  }, [so]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 60_000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);
  async function marcar(corpo: { chaves?: string[]; todas?: boolean }) {
    try { await pedirConfig("/central-notificacoes/lidas", "POST", corpo); setSel(new Set()); await carregar(); } catch (e) { setErro((e as Error).message); }
  }
  const itens = dados?.itens ?? [];
  const alternar = (c: string) => setSel((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  return (
    <div className="dm-sino" ref={caixa}>
      <button className="botao-tema" onClick={() => { setAberto(!aberto); if (!aberto) carregar(); }} aria-label={`Central de notificações${dados?.naoLidas ? `, ${dados.naoLidas} não lidas` : ""}`} aria-expanded={aberto} title="Central de notificações">
        <Bell size={18} />{!!dados?.naoLidas && <span className="dm-sino-n">{dados.naoLidas > 99 ? "99+" : dados.naoLidas}</span>}
      </button>
      {aberto && (
        <div className="dm-sino-painel" role="dialog" aria-label="Central de notificações">
          <div className="dm-sino-topo"><strong>Central de notificações</strong><button className="botao-tema" onClick={() => setAberto(false)} aria-label="Fechar"><X size={16} /></button></div>
          <div className="dm-sino-barra">
            <span className="selo info">Todos {dados?.total ?? 0}</span>
            <label className="dm-check"><input type="checkbox" checked={so} onChange={(e) => setSo(e.target.checked)} /> Somente não lidas</label>
            <button className="botao" onClick={carregar} aria-label="Atualizar"><RefreshCw size={13} /></button>
          </div>
          <div className="dm-sino-barra">
            <small>{sel.size} {sel.size === 1 ? "item selecionado" : "itens selecionados"}</small>
            <button className="botao" disabled={!sel.size} onClick={() => marcar({ chaves: [...sel] })}><Check size={13} /> Marcar como lida</button>
            <button className="botao" disabled={!dados?.naoLidas} onClick={() => marcar({ todas: true })}>Marcar todas</button>
          </div>
          {erro && <div className="aviso erro" role="alert">{erro}</div>}
          <div className="dm-sino-lista">
            {!itens.length ? <div className="dm-vazio-pequeno"><CheckCircle2 size={28} /><h4>Tudo em dia!</h4>Você não tem nenhuma notificação no momento.</div> : (
              <>
                {itens.map((i) => (
                  <div key={i.chave} className={`dm-sino-item ${i.lida ? "lida" : ""}`}>
                    <input type="checkbox" checked={sel.has(i.chave)} onChange={() => alternar(i.chave)} aria-label={`Selecionar: ${i.titulo}`} />
                    <div>
                      <span className={`selo ${i.nivel === "urgente" ? "ruim" : i.nivel === "atencao" ? "alerta" : i.nivel === "aviso" ? "info" : ""}`}>{i.nivel === "urgente" ? "Urgente" : i.nivel === "atencao" ? "Atenção" : i.nivel === "aviso" ? "Aviso" : "Informação"}</span>
                      <strong>{i.titulo}</strong><p>{i.texto}</p>
                      <small>{hora(i.em)} · <Link to={i.rota} onClick={() => { marcar({ chaves: [i.chave] }); setAberto(false); }}>Abrir</Link></small>
                    </div>
                  </div>
                ))}
                <p className="vazio">Você chegou ao fim das notificações.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Faixa no topo do conteúdo com o alerta para empresas mais grave que está valendo. */
export function FaixaAlerta() {
  const [a, setA] = useState<{ id: string; tipo: string; conteudo: string; empresaAlvo: string } | null>(null);
  const [fechado, setFechado] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = () => pedirConfig<{ alertas: any[] }>("/alertas/ativos").then((r) => vivo && setA(r.alertas[0] ?? null)).catch(() => undefined);
    ler(); const t = setInterval(ler, 300_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!a || fechado === a.id) return null;
  return (
    <div className={`aviso ${a.tipo === "Urgente" ? "erro" : ""} dm-faixa`} role="alert">
      <span><strong>{a.tipo}{a.empresaAlvo !== "Todos" ? ` (${a.empresaAlvo})` : ""}:</strong> {a.conteudo}</span>
      <button className="botao-tema" onClick={() => setFechado(a.id)} aria-label="Dispensar alerta"><X size={14} /></button>
    </div>
  );
}
