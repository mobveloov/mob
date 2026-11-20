// Cadastro › Áreas: lista com filtro por nome, criar/editar com prioridade, cor e área de risco/bloqueio (com horários),
// e a Visão geral com todas as áreas no mapa (Mapa/Satélite e Gravar a vista). Leaflet + OpenStreetMap. Servidor: /api/gestao/areas.

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, ComFiltros, Interruptor, useAviso, Vazio } from "./base";
import MapaAreas, { type Ponto, type Vista } from "./MapaAreas";

interface Horario { de: string; ate: string }
interface Area { id: string; nome: string; fuso: string; poligono: Ponto[]; prioridade?: number; cor?: string; bloqueio?: { ativo: boolean; horarios: Horario[] } }

export const CORES: Record<string, string> = { Vermelho: "#ef4444", Amarelo: "#eab308", Azul: "#3b82f6", Verde: "#22c55e", Laranja: "#f97316", Roxo: "#a855f7", Rosa: "#ec4899", Cinza: "#6b7280" };
const CHAVE_VISTA = "areas-vista-geral";
const lerVista = (): Vista | null => { try { const v = JSON.parse(localStorage.getItem(CHAVE_VISTA) ?? "null"); return v && Number.isFinite(v.lat) ? v : null; } catch { return null; } };

export default function Areas() {
  const l = useCarregar(() => chamar<{ areas: Area[]; fusos: Record<string, string> }>("GET", "/areas"), []);
  const [tela, setTela] = useState<"lista" | "geral">("lista");
  const [filtro, setFiltro] = useState("");
  const [aplicado, setAplicado] = useState("");
  const [ordem, setOrdem] = useState<"asc" | "desc">("asc");
  const [editando, setEditando] = useState<Area | "nova" | null>(null);
  const { aviso, tentar } = useAviso();
  const areas = l.dados?.areas ?? [];
  const mostradas = useMemo(() => areas.filter((a) => a.nome.toLowerCase().includes(aplicado.toLowerCase())).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR") * (ordem === "asc" ? 1 : -1)), [areas, aplicado, ordem]);

  if (tela === "geral") return <div className="cg-pagina-solta">{aviso}<VisaoGeral areas={areas} onVoltar={() => setTela("lista")} /></div>;
  // Como na Machine, criar e alterar abrem uma página (não uma janela); "Voltar" leva de volta à lista.
  if (editando) return <div className="cg-pagina-solta"><Formulario a={editando === "nova" ? null : editando} outras={areas} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} /></div>;
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Áreas">
        <button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Criar Área</button>
        <button className="cg-botao" onClick={() => setTela("geral")}>Visão Geral</button>
      </Cabecalho>
      <p style={{ margin: "0 0 12px", color: "var(--cg-suave)", fontSize: 13 }}>As áreas são delimitações geográficas definidas dentro do mapa, que podem ser utilizadas para a criação de áreas de bloqueio e permissão, ou no próprio despacho por áreas.</p>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); }}>
          <Campo rotulo="Nome"><input value={filtro} maxLength={100} onChange={(e) => setFiltro(e.target.value)} /></Campo>
          <button className="cg-botao primario cheio" type="submit">Filtrar</button>
          <button className="cg-botao cheio" type="button" onClick={() => { setFiltro(""); setAplicado(""); }}>Limpar filtros</button>
        </form>
      }>
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th><button className="cg-ordenar" onClick={() => setOrdem(ordem === "asc" ? "desc" : "asc")} title="Ordenar por nome">Nome {ordem === "asc" ? "▲" : "▼"}</button></th><th /></tr></thead>
          <tbody>{!mostradas.length ? <tr><td colSpan={2}><Vazio titulo="Nenhum resultado encontrado." /></td></tr> : mostradas.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.nome}</strong></td>
              <td className="direita"><div className="cg-acoes" style={{ justifyContent: "flex-end" }}>
                <button className="cg-botao" title="Editar" onClick={() => setEditando(a)}>Editar</button>
                <button className="cg-botao perigo" title="Excluir" aria-label={`Excluir ${a.nome}`} onClick={() => confirm(`Excluir a área ${a.nome}?`) && void tentar(async () => { await chamar("DELETE", `/areas/${a.id}`); l.recarregar(); }, "Área excluída.")}><Trash2 size={15} /></button>
              </div></td>
            </tr>))}</tbody>
        </table></div></div>
      </ComFiltros>
    </div>
  );
}

/** Visão geral: todas as áreas no mapa, Mapa/Satélite e Gravar (guarda a vista neste navegador). */
function VisaoGeral({ areas, onVoltar }: { areas: Area[]; onVoltar: () => void }) {
  const [satelite, setSatelite] = useState(false);
  const [vista, setVista] = useState<Vista | null>(null);
  const [gravada, setGravada] = useState<Vista | null>(lerVista);
  const { aviso, setAviso } = useAviso();
  const gravar = () => {
    if (!vista) return;
    try { localStorage.setItem(CHAVE_VISTA, JSON.stringify(vista)); setGravada(vista); setAviso({ texto: "Vista gravada neste navegador." }); } catch { setAviso({ texto: "Não foi possível gravar a vista.", erro: true }); }
  };
  return (
    <div>
      {aviso}
      <Cabecalho titulo="Visão Geral" />
      <div className="cg-acoes" style={{ marginBottom: 10 }}>
        <div className="cg-abas" style={{ margin: 0 }} role="group">
          <button className={!satelite ? "ativa" : ""} onClick={() => setSatelite(false)} title="Mostrar mapa de ruas">Mapa</button>
          <button className={satelite ? "ativa" : ""} onClick={() => setSatelite(true)} title="Mostrar imagens de satélite">Satélite</button>
        </div>
        {gravada && <span style={{ color: "var(--cg-suave)", fontSize: 12 }}>Vista gravada: zoom {gravada.zoom}</span>}
      </div>
      {areas.some((a) => a.poligono.length >= 3)
        ? <MapaAreas areas={areas.map((a) => ({ id: a.id, nome: a.nome, poligono: a.poligono, cor: CORES[a.cor ?? "Laranja"], bloqueio: !!a.bloqueio?.ativo }))} satelite={satelite} vistaInicial={gravada} onVista={setVista} grande />
        : <div className="cg-tabela-caixa"><Vazio titulo="Nenhuma área desenhada." sub="Crie uma área e desenhe o perímetro no mapa." /></div>}
      <div className="cg-acoes" style={{ marginTop: 12 }}>
        <button className="cg-botao" onClick={onVoltar}>Voltar</button>
        <button className="cg-botao primario" onClick={gravar} disabled={!vista} title="Guarda o centro e o zoom atuais neste navegador">Gravar</button>
      </div>
    </div>
  );
}

function Formulario({ a, outras, onFechar, onSalvo }: { a: Area | null; outras: Area[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(a?.nome ?? "");
  const fuso = a?.fuso ?? "America/Sao_Paulo"; // a Machine não pergunta o fuso: vale o da central
  const [prioridade, setPrioridade] = useState(a?.prioridade ?? 1);
  const [cor, setCor] = useState(a?.cor ?? "Laranja");
  const [bloqueia, setBloqueia] = useState(!!a?.bloqueio?.ativo);
  const [horarios, setHorarios] = useState<Horario[]>(a?.bloqueio?.horarios ?? []);
  const [pontos, setPontos] = useState<Ponto[]>(a?.poligono ?? []);
  const [satelite, setSatelite] = useState(false);
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const corpo = { nome, fuso, poligono: pontos, prioridade, cor, bloqueio: { ativo: bloqueia, horarios: bloqueia ? horarios : [] } };
    if (await tentar(() => (a ? chamar("PUT", `/areas/${a.id}`, corpo) : chamar("POST", "/areas", corpo)), "Área salva.")) { onSalvo(); onFechar(); }
  };
  const mudarHorario = (i: number, campo: keyof Horario, v: string) => setHorarios(horarios.map((h, j) => (j === i ? { ...h, [campo]: v } : h)));
  const corDesenho = bloqueia ? "#ef4444" : CORES[cor] ?? "#22c55e";
  return (
    <div>
      <Cabecalho titulo={a ? "Alterando Área" : "Criando Área"} />
      {aviso}
      <p className="cg-info-bloco" style={{ margin: "0 0 10px" }}>Campos com <b>*</b> são obrigatórios.</p>
      <p className="cg-info-bloco" style={{ margin: "0 0 12px" }}><strong>Clique na área para entrar ou sair do modo de edição.</strong></p>
      <div className="cg-grade" style={{ marginBottom: 12 }}>
        <Campo rotulo="Nome *"><input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Prioridade *"><input type="number" min={1} max={5} value={prioridade} title="1 a 5. Em áreas sobrepostas, vale a de maior prioridade." onChange={(e) => setPrioridade(Math.min(5, Math.max(1, Math.round(Number(e.target.value) || 1))))} /></Campo>
      </div>
      <div className="cg-cabecalho" style={{ margin: "0 0 8px" }}>
        <div><h2 style={{ margin: 0, fontSize: 16 }}>Área Delimitada</h2><p style={{ textTransform: "none", letterSpacing: 0 }}>Toque no mapa para criar pontos ({pontos.length}).</p></div>
        <div className="cg-acoes">
          <div className="cg-cores" role="group" aria-label="Cor da área">
            {Object.keys(CORES).map((c) => <button key={c} type="button" className={`cg-cor ${cor === c ? "ativa" : ""}`} style={{ background: CORES[c] }} title="Clique para mudar a cor" aria-label={c} aria-pressed={cor === c} onClick={() => setCor(c)}><strong>{c}</strong></button>)}
          </div>
          <div className="cg-abas" style={{ margin: 0 }} role="group">
            <button className={!satelite ? "ativa" : ""} onClick={() => setSatelite(false)}>Mapa</button>
            <button className={satelite ? "ativa" : ""} onClick={() => setSatelite(true)}>Satélite</button>
          </div>
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos(pontos.slice(0, -1))}>Desfazer</button>
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos([])}>Limpar</button>
        </div>
      </div>
      <MapaAreas areas={outras.filter((o) => o.id !== a?.id).map((o) => ({ id: o.id, nome: o.nome, poligono: o.poligono, cor: CORES[o.cor ?? "Laranja"], bloqueio: !!o.bloqueio?.ativo }))} desenho={pontos} onDesenho={setPontos} corDesenho={corDesenho} satelite={satelite} grande />
      <div className="cg-tabela-caixa" style={{ marginTop: 14, padding: 16 }}>
        <h4 style={{ margin: "0 0 6px" }}>Área de risco/bloqueio</h4>
        <p style={{ margin: "0 0 10px", color: "var(--cg-suave)", fontSize: 13 }}>Definir uma área de bloqueio impede solicitações de corridas em regiões específicas, útil para locais com alta criminalidade ou sem cobertura. É possível configurar horários para ativação programada, mas, se não houver horário definido, o bloqueio será contínuo.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Interruptor ligado={bloqueia} onChange={setBloqueia} />
          <div><p style={{ margin: 0 }}>Bloquear solicitações nesta área</p><small style={{ color: "var(--cg-suave)" }}>{bloqueia ? "Ativado" : "Desativado"}</small></div>
        </div>
        {bloqueia && (
          <div style={{ marginTop: 12 }}>
            {!horarios.length && <p style={{ color: "var(--cg-suave)", fontSize: 12 }}>Sem horários: o bloqueio vale o dia todo.</p>}
            {horarios.map((h, i) => (
              <div className="cg-duplo" key={i} style={{ marginBottom: 8, maxWidth: 420 }}>
                <Campo rotulo="Das"><input type="time" value={h.de} onChange={(e) => mudarHorario(i, "de", e.target.value)} /></Campo>
                <Campo rotulo="Até"><input type="time" value={h.ate} onChange={(e) => mudarHorario(i, "ate", e.target.value)} /></Campo>
                <button className="cg-botao perigo" aria-label="Remover horário" style={{ alignSelf: "flex-end" }} onClick={() => setHorarios(horarios.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>))}
            {horarios.length < 8 && <button className="cg-botao" onClick={() => setHorarios([...horarios, { de: "22:00", ate: "06:00" }])}><Plus size={14} /> Adicionar horário</button>}
          </div>
        )}
      </div>
      <div className="cg-acoes" style={{ marginTop: 14 }}>
        <button className="cg-botao" onClick={onFechar}>Voltar</button>
        <button className="cg-botao primario" onClick={() => void salvar()}>{a ? "Salvar" : "Criar"}</button>
      </div>
    </div>
  );
}
