// Central de notificações: o sino do topo, com a lista, "Somente não lidas" e seleção para marcar como lidas.
// Também mostra, acima do conteúdo, a faixa do alerta para empresas mais grave que estiver valendo.
import { BannerGlobal, type ItemBanner } from "../../componentes/BannerGlobal";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useSosAbertos } from "../../sos-vivo";
import { pedirConfig } from "./comum";
import "./demais.css";

interface Item { chave: string; nivel: "urgente" | "atencao" | "aviso" | "info"; titulo: string; texto: string; em: string; rota: string; lida: boolean }
const hora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;

export function Sino() {
  const sos = useSosAbertos();
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
      <button className={`botao-tema${sos.abertos ? " dm-sino-sos" : ""}`} onClick={() => { setAberto(!aberto); if (!aberto) carregar(); }} aria-label={`Central de notificações${sos.abertos ? `, ${sos.abertos} alerta de SOS aberto` : ""}${dados?.naoLidas ? `, ${dados.naoLidas} não lidas` : ""}`} aria-expanded={aberto} title="Central de notificações">
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

/** Faixa no topo do conteúdo: alertas para empresas valendo agora e, se houver, o aviso de corridas que pedem atenção do operador. */
export function FaixaAlerta() {
  const sos = useSosAbertos();
  const [alertas, setAlertas] = useState<Array<{ id: string; tipo: string; conteudo: string; empresaAlvo: string }>>([]);
  const [ocorrencias, setOcorrencias] = useState(0);
  const [fechados, setFechados] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    const ler = () => {
      pedirConfig<{ alertas: any[] }>("/alertas/ativos").then((r) => vivo && setAlertas(r.alertas ?? [])).catch(() => undefined);
      fetch("/api/operacao/ocorrencias?horas=1", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((r) => vivo && setOcorrencias(r?.semCiencia ?? r?.total ?? 0)).catch(() => undefined);
    };
    ler(); const t = setInterval(ler, 300_000);
    // A tela de ocorrências avisa quando a central registra ciência: o aviso some na hora.
    window.addEventListener("ocorrencias-mudou", ler);
    return () => { vivo = false; clearInterval(t); window.removeEventListener("ocorrencias-mudou", ler); };
  }, []);
  const itens: ItemBanner[] = [
    ...(sos.abertos + sos.atendidos > 0 ? [{
      id: "sos:vivo", tom: "vermelho" as const,
      titulo: <><strong>SOS:</strong> {sos.abertos > 0 ? `${sos.abertos} pedido${sos.abertos > 1 ? "s" : ""} de ajuda em aberto` : `${sos.atendidos} alerta${sos.atendidos > 1 ? "s" : ""} de segurança em atendimento`}{sos.itens[0] ? ` (${sos.itens[0].nome || sos.itens[0].papel}${sos.itens[0].os ? `, OS ${sos.itens[0].os}` : ""})` : ""}. <Link to="/alertas-seguranca">Abrir alertas de segurança</Link></>,
    }] : []),
    ...alertas.filter((a) => !fechados.includes(a.id)).map((a) => ({ id: a.id, tom: (a.tipo === "Urgente" ? "vermelho" : "amarelo") as "vermelho" | "amarelo", titulo: <><strong>{a.tipo}{a.empresaAlvo !== "Todos" ? ` (${a.empresaAlvo})` : ""}:</strong> {a.conteudo}</> })),
    ...(ocorrencias > 0 ? [{ id: "ocorrencia_aberta", tom: "amarelo" as const, titulo: <>Há corridas que podem requerer atenção do operador. Acione a <Link to="/ocorrencias">tela de ocorrências</Link> e registre ciência nas corridas para liberar este alerta</> }] : []),
  ].sort((a, b) => (a.tom === b.tom ? 0 : a.tom === "vermelho" ? -1 : 1));
  return <BannerGlobal itens={itens} aoFechar={(id) => id !== "ocorrencia_aberta" && id !== "sos:vivo" && setFechados((f) => [...f, id])} />;
}
