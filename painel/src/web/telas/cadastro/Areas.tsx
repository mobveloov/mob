// Cadastro › Áreas de Atuação: cidades com fuso e perímetro desenhado no mapa (Leaflet + OpenStreetMap). Servidor: /api/gestao/areas.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, Janela, useAviso, Vazio } from "./base";
import MapaAreas, { type Ponto } from "./MapaAreas";

interface Area { id: string; nome: string; fuso: string; poligono: Ponto[] }

export default function Areas() {
  const l = useCarregar(() => chamar<{ areas: Area[]; fusos: Record<string, string> }>("GET", "/areas"), []);
  const [editando, setEditando] = useState<Area | "nova" | null>(null);
  const { aviso, tentar } = useAviso();
  const areas = l.dados?.areas ?? [];

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Áreas de Atuação" sub="Gerencie os perímetros e configurações das cidades."><button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Nova Área</button></Cabecalho>
      {!!areas.length && <div style={{ marginBottom: 16 }}><MapaAreas areas={areas} grande /></div>}
      {!areas.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhuma área cadastrada." sub="Crie a primeira com Nova Área." /></div> : (
        <div className="cg-cartoes">{areas.map((a) => (
          <div className="cg-cartao" key={a.id}>
            <h4>{a.nome}</h4>
            <span className="cg-mono">ID: {a.id.slice(0, 8)} · {a.fuso} · {a.poligono.length ? `${a.poligono.length} pontos` : "sem perímetro"}</span>
            <div className="cg-acoes">
              <button className="cg-botao" onClick={() => setEditando(a)}>Editar</button>
              <button className="cg-botao perigo" onClick={() => confirm(`Excluir a área ${a.nome}?`) && void tentar(async () => { await chamar("DELETE", `/areas/${a.id}`); l.recarregar(); }, "Área excluída.")}>Excluir</button>
            </div>
          </div>))}
        </div>
      )}
      {editando && <Formulario a={editando === "nova" ? null : editando} fusos={l.dados?.fusos ?? {}} outras={areas} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function Formulario({ a, fusos, outras, onFechar, onSalvo }: { a: Area | null; fusos: Record<string, string>; outras: Area[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(a?.nome ?? "");
  const [fuso, setFuso] = useState(a?.fuso ?? "America/Sao_Paulo");
  const [pontos, setPontos] = useState<Ponto[]>(a?.poligono ?? []);
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    if (await tentar(() => (a ? chamar("PUT", `/areas/${a.id}`, { nome, fuso, poligono: pontos }) : chamar("POST", "/areas", { nome, fuso, poligono: pontos })), "Área salva.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={a ? "Editar Área" : "Nova Área"} sub="Configuração de Perímetro" onFechar={onFechar} largura="grande" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar Área</button></>}>
      {aviso}
      <div className="cg-grade" style={{ marginBottom: 12 }}>
        <Campo rotulo="Nome da Cidade"><input value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Fuso Horário"><select value={fuso} onChange={(e) => setFuso(e.target.value)}>{Object.entries(fusos).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      </div>
      <div className="cg-cabecalho" style={{ margin: "0 0 8px" }}>
        <div><strong>Desenhar Área</strong><p style={{ textTransform: "none", letterSpacing: 0 }}>Toque no mapa para criar pontos ({pontos.length})</p></div>
        <div className="cg-acoes">
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos(pontos.slice(0, -1))}>Desfazer</button>
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos([])}>Limpar</button>
        </div>
      </div>
      <MapaAreas areas={outras.filter((o) => o.id !== a?.id)} desenho={pontos} onDesenho={setPontos} grande />
    </Janela>
  );
}
