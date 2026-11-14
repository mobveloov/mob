// Cadastro › Áreas: lista com filtro por nome, criar/editar com prioridade, cor e área de risco/bloqueio (com horários),
// e a Visão geral com todas as áreas no mapa (Mapa/Satélite e Gravar a vista). Leaflet + OpenStreetMap. Servidor: /api/gestao/areas.

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, Interruptor, Janela, Selo, useAviso, Vazio } from "./base";
import MapaAreas, { type Ponto, type Vista } from "./MapaAreas";

interface Horario { de: string; ate: string }
interface Area { id: string; nome: string; fuso: string; poligono: Ponto[]; prioridade?: number; cor?: string; bloqueio?: { ativo: boolean; horarios: Horario[] } }

export const CORES: Record<string, string> = { Vermelho: "#ef4444", Amarelo: "#eab308", Azul: "#3b82f6", Verde: "#22c55e", Laranja: "#f97316", Roxo: "#a855f7", Rosa: "#ec4899", Cinza: "#6b7280" };
const CHAVE_VISTA = "areas-vista-geral";
const lerVista = (): Vista | null => { try { const v = JSON.parse(localStorage.getItem(CHAVE_VISTA) ?? "null"); return v && Number.isFinite(v.lat) ? v : null; } catch { return null; } };

export default function Areas() {
  const l = useCarregar(() => chamar<{ areas: Area[]; fusos: Record<string, string> }>("GET", "/areas"), []);
  const [aba, setAba] = useState<"lista" | "geral">("lista");
  const [filtro, setFiltro] = useState("");
  const [aplicado, setAplicado] = useState("");
  const [editando, setEditando] = useState<Area | "nova" | null>(null);
  const { aviso, tentar } = useAviso();
  const areas = l.dados?.areas ?? [];
  const mostradas = useMemo(() => areas.filter((a) => a.nome.toLowerCase().includes(aplicado.toLowerCase())), [areas, aplicado]);

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Áreas" sub="Delimitações geográficas no mapa">
        <button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Criar área</button>
      </Cabecalho>
      <p style={{ margin: "0 0 12px", color: "var(--cg-suave)", fontSize: 13 }}>As áreas são delimitações geográficas definidas dentro do mapa, que podem ser utilizadas para a criação de áreas de bloqueio e permissão, ou no próprio despacho por áreas (a área de maior prioridade vale quando elas se sobrepõem).</p>
      <Abas itens={[{ id: "lista", rotulo: "Áreas", n: areas.length }, { id: "geral", rotulo: "Visão geral" }]} valor={aba} onChange={setAba} />
      {aba === "geral" ? <VisaoGeral areas={areas} /> : (
        <>
          <form className="cg-duplo" style={{ marginBottom: 12, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); }}>
            <Campo rotulo="Nome"><input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nome" /></Campo>
            <button className="cg-botao primario" type="submit" style={{ alignSelf: "flex-end" }}>Filtrar</button>
            <button className="cg-botao" type="button" style={{ alignSelf: "flex-end" }} onClick={() => { setFiltro(""); setAplicado(""); }}>Limpar filtros</button>
          </form>
          {!mostradas.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum resultado encontrado." sub={areas.length ? "Ajuste o filtro." : "Crie a primeira área com Criar área."} /></div> : (
            <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
              <thead><tr><th>Nome</th><th className="centro">Prioridade</th><th>Bloqueio</th><th>Cor</th><th>Fuso</th><th className="centro">Pontos</th><th /></tr></thead>
              <tbody>{mostradas.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.nome}</strong></td>
                  <td className="centro">{a.prioridade ?? 1}</td>
                  <td>{a.bloqueio?.ativo ? <Selo tom="ruim">{a.bloqueio.horarios.length ? `Bloqueio em ${a.bloqueio.horarios.length} horário(s)` : "Bloqueio contínuo"}</Selo> : <Selo tom="neutro">Sem bloqueio</Selo>}</td>
                  <td><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 4, background: CORES[a.cor ?? "Laranja"], verticalAlign: "middle", marginRight: 6 }} />{a.cor ?? "Laranja"}</td>
                  <td>{a.fuso}</td>
                  <td className="centro">{a.poligono.length || "—"}</td>
                  <td className="direita"><div className="cg-acoes" style={{ justifyContent: "flex-end" }}>
                    <button className="cg-botao" onClick={() => setEditando(a)}>Editar</button>
                    <button className="cg-botao perigo" aria-label={`Excluir ${a.nome}`} onClick={() => confirm(`Excluir a área ${a.nome}?`) && void tentar(async () => { await chamar("DELETE", `/areas/${a.id}`); l.recarregar(); }, "Área excluída.")}><Trash2 size={15} /></button>
                  </div></td>
                </tr>))}</tbody>
            </table></div></div>
          )}
        </>
      )}
      {editando && <Formulario a={editando === "nova" ? null : editando} fusos={l.dados?.fusos ?? {}} outras={areas} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

/** Visão geral: todas as áreas no mapa, Mapa/Satélite e Gravar (guarda a vista neste navegador). */
function VisaoGeral({ areas }: { areas: Area[] }) {
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
      <div className="cg-acoes" style={{ marginBottom: 10 }}>
        <div className="cg-abas" style={{ margin: 0 }} role="group">
          <button className={!satelite ? "ativa" : ""} onClick={() => setSatelite(false)} title="Mostrar mapa de ruas">Mapa</button>
          <button className={satelite ? "ativa" : ""} onClick={() => setSatelite(true)} title="Mostrar imagens de satélite">Satélite</button>
        </div>
        <button className="cg-botao primario" onClick={gravar} disabled={!vista} title="Guarda o centro e o zoom atuais">Gravar</button>
        {gravada && <span style={{ color: "var(--cg-suave)", fontSize: 12 }}>Vista gravada: zoom {gravada.zoom}</span>}
      </div>
      {areas.some((a) => a.poligono.length >= 3)
        ? <MapaAreas areas={areas.map((a) => ({ id: a.id, nome: a.nome, poligono: a.poligono, cor: CORES[a.cor ?? "Laranja"], bloqueio: !!a.bloqueio?.ativo }))} satelite={satelite} vistaInicial={gravada} onVista={setVista} grande />
        : <div className="cg-tabela-caixa"><Vazio titulo="Nenhuma área desenhada." sub="Crie uma área e desenhe o perímetro no mapa." /></div>}
    </div>
  );
}

function Formulario({ a, fusos, outras, onFechar, onSalvo }: { a: Area | null; fusos: Record<string, string>; outras: Area[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(a?.nome ?? "");
  const [fuso, setFuso] = useState(a?.fuso ?? "America/Sao_Paulo");
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
    <Janela aberta titulo={a ? "Editar Área" : "Criando Área"} sub="Campos com * são obrigatórios" onFechar={onFechar} largura="grande" rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void salvar()}>{a ? "Salvar Área" : "Criar"}</button></>}>
      {aviso}
      <div className="cg-grade" style={{ marginBottom: 12 }}>
        <Campo rotulo="Nome *"><input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Prioridade *" dica="1 a 5. Em áreas sobrepostas, vale a de maior prioridade."><input type="number" min={1} max={5} value={prioridade} onChange={(e) => setPrioridade(Math.min(5, Math.max(1, Math.round(Number(e.target.value) || 1))))} /></Campo>
        <Campo rotulo="Cor no mapa"><select value={cor} onChange={(e) => setCor(e.target.value)}>{Object.keys(CORES).map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Fuso Horário"><select value={fuso} onChange={(e) => setFuso(e.target.value)}>{Object.entries(fusos).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      </div>
      <div className="cg-cabecalho" style={{ margin: "0 0 8px" }}>
        <div><strong>Área delimitada</strong><p style={{ textTransform: "none", letterSpacing: 0 }}>Toque no mapa para criar pontos ({pontos.length}). A escala (500 m) fica no canto do mapa.</p></div>
        <div className="cg-acoes">
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
        <Interruptor ligado={bloqueia} onChange={setBloqueia} rotulo={bloqueia ? "Bloquear solicitações nesta área: ativado" : "Bloquear solicitações nesta área: desativado"} />
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
    </Janela>
  );
}
