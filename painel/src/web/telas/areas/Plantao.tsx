// Cadastro › Plantão: cobre horários de pouca demanda; motoristas escalados têm prioridade nas filas do despacho
// enquanto o plantão vale. Lista com filtros, Criar plantão e Gerenciar (datas, horas e motoristas). Servidor: /api/areas/plantoes.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, ComFiltros, chamar as chamarBase, useAviso, Vazio } from "../cadastro/base";

interface Plantao { id: string; inicio: string; fim: string; quantidade: number; valendo: boolean }
interface Escalado { id: string; viatura: string; nome: string; telefone: string }
interface Detalhe { id: string; inicio: string; fim: string; valendo: boolean; escalados: Escalado[] }
interface Achado { id: string; viatura: string; nome: string; telefone: string }

const chamar = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamarBase<T>(metodo, caminho, corpo, "/api/areas");
const dataHoraBr = (s: string) => { const [d, h] = s.split("T"); return `${d.split("-").reverse().join("/")} ${h}`; };
const dataHoraSeg = (s: string) => `${dataHoraBr(s)}:00`;
const mesQueVem = (hoje: string) => { const d = new Date(`${hoje}T12:00:00`); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); };
const partes = (s: string) => { const [d, h] = s.split("T"); return { data: d, hora: h ?? "" }; };

const FILTRO_VAZIO = { dataInicial: "", horaInicial: "", dataFinal: "", horaFinal: "" };
const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
// Como na Machine, a lista abre filtrada de hoje até um mês adiante.
const filtroPadrao = () => ({ dataInicial: hojeIso(), horaInicial: "", dataFinal: mesQueVem(hojeIso()), horaFinal: "" });

export default function PlantaoTela() {
  const [filtro, setFiltro] = useState(filtroPadrao);
  const [aplicado, setAplicado] = useState(filtro);
  const q = new URLSearchParams(Object.entries(aplicado).filter(([, v]) => v)).toString();
  const l = useCarregar(() => chamar<{ plantoes: Plantao[] }>("GET", `/plantoes${q ? `?${q}` : ""}`), [q]);
  const [criando, setCriando] = useState<Plantao | "novo" | null>(null);
  const [gerenciando, setGerenciando] = useState<string | null>(null);
  const { aviso, tentar } = useAviso();
  const [ordem, setOrdem] = useState<{ campo: "inicio" | "fim"; dir: 1 | -1 } | null>(null);
  const [pagina, setPagina] = useState(1);
  const todos = l.dados?.plantoes ?? [];
  const ordenados = ordem ? [...todos].sort((x, y) => x[ordem.campo].localeCompare(y[ordem.campo]) * ordem.dir) : todos;
  const POR_PAGINA = 10;
  const paginas = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas);
  const lista = ordenados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  const de = (atual - 1) * POR_PAGINA + 1;
  const ordenarPor = (campo: "inicio" | "fim") => setOrdem(ordem?.campo === campo ? { campo, dir: ordem.dir === 1 ? -1 : 1 } : { campo, dir: 1 });
  const seta = (campo: "inicio" | "fim") => (ordem?.campo === campo ? (ordem.dir === 1 ? " ▲" : " ▼") : "");

  // Como na Machine, Criar, Alterar e Gerenciar abrem uma página; "Voltar" leva de volta à lista.
  if (criando) return <div className="cg-pagina-solta"><Criar existente={criando === "novo" ? null : criando} onFechar={() => setCriando(null)} onCriado={(id) => { setCriando(null); l.recarregar(); if (id) setGerenciando(id); }} /></div>;
  if (gerenciando) return <div className="cg-pagina-solta"><Gerenciar id={gerenciando} onFechar={() => { setGerenciando(null); l.recarregar(); }} /></div>;
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Plantão"><button className="cg-botao primario" onClick={() => setCriando("novo")}><Plus size={16} /> Criar Plantão</button></Cabecalho>
      <p style={{ margin: "0 0 12px", color: "var(--cg-suave)", fontSize: 13 }}>Funcionalidade para cobrir horários em que há pouca demanda e menos motoristas trabalhando também. Motoristas que estão designados no plantão tem prioridade nas filas.</p>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(1); }}>
          <Campo rotulo="Data Inicial"><input type="date" value={filtro.dataInicial} onChange={(e) => setFiltro({ ...filtro, dataInicial: e.target.value })} /></Campo>
          <Campo rotulo="Hora Inicial"><input type="time" value={filtro.horaInicial} onChange={(e) => setFiltro({ ...filtro, horaInicial: e.target.value })} /></Campo>
          <Campo rotulo="Data Final"><input type="date" value={filtro.dataFinal} onChange={(e) => setFiltro({ ...filtro, dataFinal: e.target.value })} /></Campo>
          <Campo rotulo="Hora Final"><input type="time" value={filtro.horaFinal} onChange={(e) => setFiltro({ ...filtro, horaFinal: e.target.value })} /></Campo>
          <button className="cg-botao primario cheio" type="submit">Filtrar</button>
          <button className="cg-botao cheio" type="button" onClick={() => { setFiltro(FILTRO_VAZIO); setAplicado(FILTRO_VAZIO); }}>Limpar filtros</button>
        </form>
      }>
        {l.erro && <div className="cg-aviso erro">{String(l.erro)}</div>}
        {l.dados && <div className="cg-resumo-lista">{lista.length ? `Exibindo ${de}-${de + lista.length - 1} de ${ordenados.length} ${ordenados.length === 1 ? "resultado" : "resultados"}.` : ""}</div>}
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th className="centro">Motoristas</th><th><button className="cg-ordenar" onClick={() => ordenarPor("inicio")} title="Ordenar">Data Hora Inicial{seta("inicio")}</button></th><th><button className="cg-ordenar" onClick={() => ordenarPor("fim")} title="Ordenar">Data Hora Final{seta("fim")}</button></th><th /></tr></thead>
          <tbody>{!l.dados ? <tr><td colSpan={4}><Vazio titulo="Carregando..." /></td></tr> : !lista.length ? <tr><td colSpan={4}><Vazio titulo="Nenhum resultado encontrado." /></td></tr> : lista.map((p) => (
            <tr key={p.id}>
              <td className="centro"><strong>{p.quantidade}</strong></td>
              <td>{dataHoraSeg(p.inicio)}</td><td>{dataHoraSeg(p.fim)}</td>
              <td className="direita"><div className="cg-acoes" style={{ justifyContent: "flex-end" }}>
                <button className="cg-botao" title="Gerenciar" onClick={() => setGerenciando(p.id)}>Gerenciar</button>
                <button className="cg-botao" title="Editar" onClick={() => setCriando(p)}>Editar</button>
                <button className="cg-botao perigo" title="Excluir" aria-label="Excluir plantão" onClick={() => confirm("Excluir este plantão?") && void tentar(async () => { await chamar("DELETE", `/plantoes/${p.id}`); l.recarregar(); }, "Plantão excluído.")}><Trash2 size={15} /></button>
              </div></td>
            </tr>))}</tbody>
        </table></div></div>
        {paginas > 1 && (
          <nav className="cg-paginas" aria-label="Páginas">
            <button className="cg-botao" disabled={atual <= 1} onClick={() => setPagina(atual - 1)} aria-label="Página anterior">←</button>
            {Array.from({ length: paginas }, (_, k) => k + 1).map((n) => <button key={n} className={`cg-botao ${n === atual ? "primario" : ""}`} onClick={() => setPagina(n)} aria-current={n === atual ? "page" : undefined}>{n}</button>)}
            <button className="cg-botao" disabled={atual >= paginas} onClick={() => setPagina(atual + 1)} aria-label="Próxima página">→</button>
          </nav>
        )}
      </ComFiltros>
    </div>
  );
}

function Criar({ existente, onFechar, onCriado }: { existente: Plantao | null; onFechar: () => void; onCriado: (id: string) => void }) {
  const [f, setF] = useState(() => { if (!existente) return { dataInicial: "", horaInicial: "", dataFinal: "", horaFinal: "" }; const i = partes(existente.inicio), e = partes(existente.fim); return { dataInicial: i.data, horaInicial: i.hora, dataFinal: e.data, horaFinal: e.hora }; });
  const { aviso, tentar } = useAviso();
  const criar = async () => {
    let id = "";
    if (await tentar(async () => { if (existente) { await chamar("PUT", `/plantoes/${existente.id}`, f); } else id = (await chamar<{ plantao: { id: string } }>("POST", "/plantoes", f)).plantao.id; }, existente ? "Plantão salvo." : "Plantão criado.")) onCriado(id);
  };
  return (
    <div>
      <Cabecalho titulo={existente ? "Alterando Plantão" : "Criando Plantão"} />
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Data Inicial *"><input type="date" value={f.dataInicial} onChange={(e) => setF({ ...f, dataInicial: e.target.value })} /></Campo>
        <Campo rotulo="Hora Inicial" ><input type="time" value={f.horaInicial} title="Vazio = 00:00" onChange={(e) => setF({ ...f, horaInicial: e.target.value })} /></Campo>
        <Campo rotulo="Data Final *"><input type="date" value={f.dataFinal} onChange={(e) => setF({ ...f, dataFinal: e.target.value })} /></Campo>
        <Campo rotulo="Hora Final"><input type="time" value={f.horaFinal} title="Vazio = 23:59" onChange={(e) => setF({ ...f, horaFinal: e.target.value })} /></Campo>
      </div>
      <div className="cg-acoes" style={{ marginTop: 14 }}>
        <button className="cg-botao" onClick={onFechar}>Voltar</button>
        <button className="cg-botao primario" onClick={() => void criar()}>{existente ? "Salvar" : "Criar"}</button>
      </div>
    </div>
  );
}

function Gerenciar({ id, onFechar }: { id: string; onFechar: () => void }) {
  const d = useCarregar(() => chamar<{ plantao: Detalhe }>("GET", `/plantoes/${id}`), [id]);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const { aviso, tentar } = useAviso();
  const p = d.dados?.plantao;
  const i = p ? partes(p.inicio) : { data: "", hora: "" }, f = p ? partes(p.fim) : { data: "", hora: "" };
  const dia = (v: string) => (v ? v.split("-").reverse().join("/") : "");

  const procurar = async (v: string) => {
    setBusca(v); setEscolhido(null);
    if (v.trim().length < 2) return setAchados([]);
    try { setAchados((await chamar<{ motoristas: Achado[] }>("GET", `/motoristas/busca?q=${encodeURIComponent(v)}`)).motoristas); } catch { setAchados([]); }
  };
  const adicionar = async () => {
    if (!escolhido) return;
    if (await tentar(() => chamar("POST", `/plantoes/${id}/motoristas`, { motoristaId: escolhido.id }), "Motorista adicionado.")) { setBusca(""); setAchados([]); setEscolhido(null); d.recarregar(); }
  };
  const n = p?.escalados.length ?? 0;
  return (
    <div>
      <Cabecalho titulo="Gerenciar Plantão" />
      {aviso}
      <div className="cg-grade" style={{ marginBottom: 12 }}>
        <Campo rotulo="Data Inicial"><input disabled value={dia(i.data)} readOnly /></Campo>
        <Campo rotulo="Hora Inicial"><input disabled value={i.hora} readOnly /></Campo>
        <Campo rotulo="Data Final"><input disabled value={dia(f.data)} readOnly /></Campo>
        <Campo rotulo="Hora Final"><input disabled value={f.hora} readOnly /></Campo>
      </div>
      <div className="cg-duplo" style={{ marginBottom: 12, alignItems: "flex-end" }}>
        <Campo rotulo="Vtr / Motorista"><input value={escolhido ? `${escolhido.viatura ? `${escolhido.viatura} · ` : ""}${escolhido.nome}` : busca} maxLength={50} onChange={(e) => void procurar(e.target.value)} autoComplete="off" /></Campo>
        <button className="cg-botao primario" disabled={!escolhido} onClick={() => void adicionar()}>Adicionar Motorista</button>
        <button className="cg-botao" onClick={onFechar}>Voltar</button>
      </div>
      {!escolhido && achados.length > 0 && (
        <div className="cg-caixas" style={{ marginBottom: 12 }}>
          {achados.map((a) => <label key={a.id} onClick={() => setEscolhido(a)}><span>{a.viatura || "—"}</span><strong>{a.nome}</strong><small>{a.telefone}</small></label>)}
        </div>
      )}
      {p && <div className="cg-resumo-lista">{n ? `Exibindo 1-${n} de ${n} ${n === 1 ? "resultado" : "resultados"}.` : ""}</div>}
      <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
        <thead><tr><th>Vtr</th><th>Motorista</th><th>Telefone</th><th /></tr></thead>
        <tbody>{!n ? <tr><td colSpan={4}><Vazio titulo="Nenhum resultado encontrado." /></td></tr> : p!.escalados.map((m) => (
          <tr key={m.id}><td>{m.viatura || "—"}</td><td><strong>{m.nome}</strong></td><td>{m.telefone}</td>
            <td className="direita"><button className="cg-botao perigo" title="Remover" aria-label={`Remover ${m.nome} do plantão`} onClick={() => void tentar(() => chamar("DELETE", `/plantoes/${id}/motoristas/${m.id}`), "Motorista removido.").then((ok) => ok && d.recarregar())}><Trash2 size={15} /></button></td></tr>))}</tbody>
      </table></div></div>
    </div>
  );
}
