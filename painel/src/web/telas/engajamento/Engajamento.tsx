// Mapa de engajamento no formato da Machine: abas Motoristas, Passageiros e Histórico; filtros de situação e
// categoria (motoristas); uma seção por indicador, com régua dos limites, três cartões e o menu Ações.
import { useEffect, useRef, useState } from "react";
import { useSessao } from "../../App";
import { Titulo } from "../../componentes/ui";
import { Aviso, dhAno, useDados } from "../corridas/comum";
import { Secao, eng, num, type Ind, type Papel } from "./pecas";
import "./engajamento.css";

type Aba = Papel | "historico";
interface Mapa {
  papel: Papel; total: number; indicadores: Ind[];
  filtros: { situacoes: Array<{ id: string; rotulo: string; pct: number }>; categorias: Array<{ id: string; nome: string }> } | null;
}
interface Acao { id: string; em: string; por: string; papel: Papel; indicador: string; faixa: string; tipo: string; destinatarios: number; detalhe: string }
const TIPOS: Record<string, string> = { notificacao: "Notificação", mensagem: "Mensagem", cupom: "Cupom", desafio: "Desafio", status: "Alteração de situação" };

/** Lista suspensa com caixas de marcar (situação e categoria), com Todos, Limpar e Aplicar. */
function Multi({ rotulo, itens, marcados, onAplicar }: { rotulo: string; itens: Array<{ id: string; nome: string; extra?: string }>; marcados: string[]; onAplicar: (ids: string[]) => void }) {
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<string[]>(marcados);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) setSel(marcados); }, [aberto, marcados.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  const troca = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="me-dropdown" ref={ref}>
      <button type="button" className="me-dropdown__botao" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{rotulo}<span className="me-chevron" /></button>
      {aberto && (
        <div className="me-dropdown__painel">
          <ul className="me-dropdown__itens">
            {itens.map((i) => (
              <li key={i.id}><label className="me-dropdown__item"><input type="checkbox" checked={sel.includes(i.id)} onChange={() => troca(i.id)} /><span className="me-dropdown__item-label">{i.nome}</span>{i.extra && <em>{i.extra}</em>}</label></li>
            ))}
          </ul>
          <div className="me-dropdown__rodape">
            <button type="button" onClick={() => setSel(itens.map((i) => i.id))}>Todos</button>
            <button type="button" onClick={() => setSel([])}>Limpar</button>
            <button type="button" className="aplicar" disabled={!sel.length} onClick={() => { onAplicar(sel); setAberto(false); }}>Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Engajamento() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const [aba, setAba] = useState<Aba>("motoristas");
  const [abertas, setAbertas] = useState<string[]>([]);
  const [situacoes, setSituacoes] = useState<string[]>(["A"]);
  const [categorias, setCategorias] = useState<string[] | null>(null);
  const papel = aba === "historico" ? null : aba;
  const q = papel === "motoristas" ? `&situacao=${situacoes.join(",")}${categorias ? `&categoria=${categorias.join(",")}` : ""}` : "";
  const mapa = useDados<Mapa | null>(() => (papel ? eng<Mapa>(`/mapa?papel=${papel}${q}`) : Promise.resolve(null)), [papel, q]);
  const hist = useDados<{ acoes: Acao[] } | null>(() => (aba === "historico" ? eng<{ acoes: Acao[] }>("/historico") : Promise.resolve(null)), [aba]);
  const d = mapa.dados;
  const alternar = (id: string) => setAbertas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const filtro = papel === "motoristas" ? { situacao: situacoes.join(","), ...(categorias ? { categoria: categorias.join(",") } : {}) } : {};
  const nomeSit = d?.filtros ? (situacoes.length === 1 ? d.filtros.situacoes.find((s) => s.id === situacoes[0])?.rotulo ?? "Situação" : `${situacoes.length} situações`) : "";
  const todasCat = d?.filtros ? !categorias || categorias.length === d.filtros.categorias.length : true;

  return (
    <div className="mapa-engajamento">
      <Titulo titulo="Mapa de engajamento" sub="Como motoristas e passageiros se comportam" />
      <div className="me-tabs" role="tablist">
        {([["motoristas", "Motoristas"], ["passageiros", "Passageiros"], ["historico", "Histórico"]] as Array<[Aba, string]>).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={`me-tabs__item ${aba === id ? "me-tabs__item--ativo" : ""}`} onClick={() => setAba(id)}>{nome}</button>
        ))}
      </div>
      <Aviso texto={mapa.erro || hist.erro} erro />
      {papel && (
        <div className="me-filtros">
          <p className="me-filtros__contagem">{d ? num(d.total, 0) : "…"}<span>&nbsp;{papel === "motoristas" ? "Motoristas" : "Passageiros"}</span></p>
          {d?.filtros && (
            <div className="me-filtros__lista">
              <Multi rotulo={nomeSit} itens={d.filtros.situacoes.map((s) => ({ id: s.id, nome: s.rotulo, extra: `${s.pct}%` }))} marcados={situacoes} onAplicar={setSituacoes} />
              <Multi rotulo={todasCat ? "Todas as categorias" : `${categorias!.length} categorias`} itens={d.filtros.categorias.map((c) => ({ id: c.id, nome: c.nome }))} marcados={categorias ?? d.filtros.categorias.map((c) => c.id)} onAplicar={(ids) => setCategorias(ids.length === d.filtros!.categorias.length ? null : ids)} />
            </div>
          )}
        </div>
      )}
      {papel && !d && !mapa.erro && <p className="oc-vazio">Carregando...</p>}
      {papel && d && d.indicadores.map((i) => (
        <Secao key={`${papel}-${i.id}`} papel={papel} ind={i} aberta={abertas.includes(i.id)} onAlternar={() => alternar(i.id)} filtro={filtro} podeAgir podeSalvar={admin} onMudou={mapa.recarregar} />
      ))}
      {aba === "historico" && hist.dados && (
        hist.dados.acoes.length === 0 ? <p className="oc-vazio">Nenhuma ação feita pelo mapa de engajamento ainda.</p> : (
          <table className="me-hist-tabela">
            <thead><tr><th>Quando</th><th>Quem fez</th><th>Para</th><th>Indicador e faixa</th><th>Ação</th><th>Pessoas</th><th>Detalhe</th></tr></thead>
            <tbody>
              {hist.dados.acoes.map((a) => (
                <tr key={a.id}><td>{dhAno(a.em)}</td><td>{a.por}</td><td>{a.papel === "motoristas" ? "Motoristas" : "Passageiros"}</td><td>{a.indicador} · {a.faixa}</td><td>{TIPOS[a.tipo] ?? a.tipo}</td><td>{num(a.destinatarios, 0)}</td><td>{a.detalhe}</td></tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
