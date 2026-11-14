// Cadastro › Plantão: cobre horários de pouca demanda; motoristas escalados têm prioridade nas filas do despacho
// enquanto o plantão vale. Lista com filtros, Criar plantão e Gerenciar (datas, horas e motoristas). Servidor: /api/areas/plantoes.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, ComFiltros, chamar as chamarBase, Janela, Selo, useAviso, Vazio } from "../cadastro/base";

interface Plantao { id: string; inicio: string; fim: string; quantidade: number; valendo: boolean }
interface Escalado { id: string; viatura: string; nome: string; telefone: string }
interface Detalhe { id: string; inicio: string; fim: string; valendo: boolean; escalados: Escalado[] }
interface Achado { id: string; viatura: string; nome: string; telefone: string }

const chamar = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamarBase<T>(metodo, caminho, corpo, "/api/areas");
const dataHoraBr = (s: string) => { const [d, h] = s.split("T"); return `${d.split("-").reverse().join("/")} ${h}`; };
const partes = (s: string) => { const [d, h] = s.split("T"); return { data: d, hora: h ?? "" }; };

const FILTRO_VAZIO = { dataInicial: "", horaInicial: "", dataFinal: "", horaFinal: "" };

export default function PlantaoTela() {
  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [aplicado, setAplicado] = useState(FILTRO_VAZIO);
  const q = new URLSearchParams(Object.entries(aplicado).filter(([, v]) => v)).toString();
  const l = useCarregar(() => chamar<{ plantoes: Plantao[] }>("GET", `/plantoes${q ? `?${q}` : ""}`), [q]);
  const [criando, setCriando] = useState(false);
  const [gerenciando, setGerenciando] = useState<string | null>(null);
  const { aviso, tentar } = useAviso();
  const lista = l.dados?.plantoes ?? [];

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Plantão" sub="Cobertura de horários de pouca demanda"><button className="cg-botao primario" onClick={() => setCriando(true)}><Plus size={16} /> Criar plantão</button></Cabecalho>
      <p style={{ margin: "0 0 12px", color: "var(--cg-suave)", fontSize: 13 }}>Funcionalidade para cobrir horários em que há pouca demanda e menos motoristas trabalhando também. Motoristas que estão designados no plantão têm prioridade nas filas.</p>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); }}>
          <Campo rotulo="Data inicial"><input type="date" value={filtro.dataInicial} onChange={(e) => setFiltro({ ...filtro, dataInicial: e.target.value })} /></Campo>
          <Campo rotulo="Hora inicial"><input type="time" value={filtro.horaInicial} onChange={(e) => setFiltro({ ...filtro, horaInicial: e.target.value })} /></Campo>
          <Campo rotulo="Data final"><input type="date" value={filtro.dataFinal} onChange={(e) => setFiltro({ ...filtro, dataFinal: e.target.value })} /></Campo>
          <Campo rotulo="Hora final"><input type="time" value={filtro.horaFinal} onChange={(e) => setFiltro({ ...filtro, horaFinal: e.target.value })} /></Campo>
          <button className="cg-botao primario cheio" type="submit">Filtrar</button>
          <button className="cg-botao cheio" type="button" onClick={() => { setFiltro(FILTRO_VAZIO); setAplicado(FILTRO_VAZIO); }}>Limpar filtros</button>
        </form>
      }>
        {l.erro && <div className="cg-aviso erro">{String(l.erro)}</div>}
        {!lista.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum resultado encontrado." sub="Crie um plantão com Criar plantão." /></div> : (
          <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th className="centro">Motoristas</th><th>Data inicial</th><th>Data final</th><th>Situação</th><th /></tr></thead>
            <tbody>{lista.map((p) => (
              <tr key={p.id}>
                <td className="centro"><strong>{p.quantidade}</strong></td>
                <td>{dataHoraBr(p.inicio)}</td><td>{dataHoraBr(p.fim)}</td>
                <td>{p.valendo ? <Selo tom="ok">Em vigor</Selo> : <Selo tom="neutro">{p.fim < new Date().toISOString().slice(0, 16) ? "Encerrado" : "Agendado"}</Selo>}</td>
                <td className="direita"><div className="cg-acoes" style={{ justifyContent: "flex-end" }}>
                  <button className="cg-botao" onClick={() => setGerenciando(p.id)}>Gerenciar</button>
                  <button className="cg-botao perigo" aria-label="Excluir plantão" onClick={() => confirm("Excluir este plantão?") && void tentar(async () => { await chamar("DELETE", `/plantoes/${p.id}`); l.recarregar(); }, "Plantão excluído.")}><Trash2 size={15} /></button>
                </div></td>
              </tr>))}</tbody>
          </table></div></div>
        )}
      </ComFiltros>
      {criando && <Criar onFechar={() => setCriando(false)} onCriado={(id) => { setCriando(false); l.recarregar(); setGerenciando(id); }} />}
      {gerenciando && <Gerenciar id={gerenciando} onFechar={() => { setGerenciando(null); l.recarregar(); }} />}
    </div>
  );
}

function Criar({ onFechar, onCriado }: { onFechar: () => void; onCriado: (id: string) => void }) {
  const [f, setF] = useState({ dataInicial: "", horaInicial: "", dataFinal: "", horaFinal: "" });
  const { aviso, tentar } = useAviso();
  const criar = async () => {
    let id = "";
    if (await tentar(async () => { id = (await chamar<{ plantao: { id: string } }>("POST", "/plantoes", f)).plantao.id; }, "Plantão criado.")) onCriado(id);
  };
  return (
    <Janela aberta titulo="Criando Plantão" sub="Campos com * são obrigatórios" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void criar()}>Criar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Data inicial *"><input type="date" value={f.dataInicial} onChange={(e) => setF({ ...f, dataInicial: e.target.value })} /></Campo>
        <Campo rotulo="Hora inicial" dica="Vazio = 00:00"><input type="time" value={f.horaInicial} onChange={(e) => setF({ ...f, horaInicial: e.target.value })} /></Campo>
        <Campo rotulo="Data final *"><input type="date" value={f.dataFinal} onChange={(e) => setF({ ...f, dataFinal: e.target.value })} /></Campo>
        <Campo rotulo="Hora final" dica="Vazio = 23:59"><input type="time" value={f.horaFinal} onChange={(e) => setF({ ...f, horaFinal: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}

function Gerenciar({ id, onFechar }: { id: string; onFechar: () => void }) {
  const d = useCarregar(() => chamar<{ plantao: Detalhe }>("GET", `/plantoes/${id}`), [id]);
  const [datas, setDatas] = useState<{ dataInicial: string; horaInicial: string; dataFinal: string; horaFinal: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const { aviso, tentar } = useAviso();
  const p = d.dados?.plantao;
  if (p && !datas) { const i = partes(p.inicio), f = partes(p.fim); setDatas({ dataInicial: i.data, horaInicial: i.hora, dataFinal: f.data, horaFinal: f.hora }); }

  const procurar = async (v: string) => {
    setBusca(v); setEscolhido(null);
    if (!v.trim()) return setAchados([]);
    try { setAchados((await chamar<{ motoristas: Achado[] }>("GET", `/motoristas/busca?q=${encodeURIComponent(v)}`)).motoristas); } catch { setAchados([]); }
  };
  const adicionar = async () => {
    if (!escolhido) return;
    if (await tentar(() => chamar("POST", `/plantoes/${id}/motoristas`, { motoristaId: escolhido.id }), "Motorista adicionado.")) { setBusca(""); setAchados([]); setEscolhido(null); d.recarregar(); }
  };
  return (
    <Janela aberta titulo="Gerenciar Plantão" sub={p ? `${dataHoraBr(p.inicio)} a ${dataHoraBr(p.fim)}${p.valendo ? " · em vigor" : ""}` : ""} onFechar={onFechar} largura="grande" rodape={<button className="cg-botao" onClick={onFechar}>Fechar</button>}>
      {aviso}
      {datas && (
        <div className="cg-grade" style={{ marginBottom: 12 }}>
          <Campo rotulo="Data inicial"><input type="date" value={datas.dataInicial} onChange={(e) => setDatas({ ...datas, dataInicial: e.target.value })} /></Campo>
          <Campo rotulo="Hora inicial"><input type="time" value={datas.horaInicial} onChange={(e) => setDatas({ ...datas, horaInicial: e.target.value })} /></Campo>
          <Campo rotulo="Data final"><input type="date" value={datas.dataFinal} onChange={(e) => setDatas({ ...datas, dataFinal: e.target.value })} /></Campo>
          <Campo rotulo="Hora final"><input type="time" value={datas.horaFinal} onChange={(e) => setDatas({ ...datas, horaFinal: e.target.value })} /></Campo>
          <button className="cg-botao primario" style={{ alignSelf: "flex-end" }} onClick={() => void tentar(() => chamar("PUT", `/plantoes/${id}`, datas), "Datas salvas.").then((ok) => ok && d.recarregar())}>Salvar datas</button>
        </div>
      )}
      <div className="cg-duplo" style={{ marginBottom: 12, alignItems: "flex-end" }}>
        <Campo rotulo="Vtr / Motorista" dica="Procure pelo nome, nº da viatura ou telefone."><input value={escolhido ? `${escolhido.viatura ? `${escolhido.viatura} · ` : ""}${escolhido.nome}` : busca} onChange={(e) => void procurar(e.target.value)} placeholder="Digite para procurar" /></Campo>
        <button className="cg-botao primario" disabled={!escolhido} onClick={() => void adicionar()}><Plus size={14} /> Adicionar Motorista</button>
      </div>
      {!escolhido && achados.length > 0 && (
        <div className="cg-caixas" style={{ marginBottom: 12 }}>
          {achados.map((a) => <label key={a.id} onClick={() => setEscolhido(a)}><span>{a.viatura || "—"}</span><strong>{a.nome}</strong><small>{a.telefone}</small></label>)}
        </div>
      )}
      {!p?.escalados.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum motorista neste plantão." sub="Adicione motoristas acima." /></div> : (
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Vtr</th><th>Motorista</th><th>Telefone</th><th /></tr></thead>
          <tbody>{p.escalados.map((m) => (
            <tr key={m.id}><td>{m.viatura || "—"}</td><td><strong>{m.nome}</strong></td><td>{m.telefone}</td>
              <td className="direita"><button className="cg-botao perigo" aria-label={`Tirar ${m.nome} do plantão`} onClick={() => void tentar(() => chamar("DELETE", `/plantoes/${id}/motoristas/${m.id}`), "Motorista removido.").then((ok) => ok && d.recarregar())}><Trash2 size={15} /></button></td></tr>))}</tbody>
        </table></div></div>
      )}
    </Janela>
  );
}
