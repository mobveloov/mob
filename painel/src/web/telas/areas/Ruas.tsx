// Cadastro › Ruas (regras de via): corrige o nome de exibição de uma rua para a central, dentro do traçado desenhado no mapa.
// Leaflet + OpenStreetMap. Servidor: /api/areas/ruas (só o administrador grava).

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar as chamarBase, Interruptor, Janela, Selo, useAviso, Vazio } from "../cadastro/base";
import MapaAreas, { type Ponto } from "../cadastro/MapaAreas";

interface Regra { id: string; nomeExibicao: string; nomeNoMapa: string; poligono: Ponto[]; ativa: boolean }
const chamar = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamarBase<T>(metodo, caminho, corpo, "/api/areas");

export default function RuasTela() {
  const l = useCarregar(() => chamar<{ regras: Regra[] }>("GET", "/ruas"), []);
  const [editando, setEditando] = useState<Regra | "nova" | null>(null);
  const { aviso, tentar } = useAviso();
  const regras = l.dados?.regras ?? [];
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Ruas" sub="Regras de via"><button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Criar nova regra</button></Cabecalho>
      <div className="cg-tabela-caixa" style={{ padding: 16, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>O que são regras de via?</h3>
        <p style={{ margin: 0, color: "var(--cg-suave)", fontSize: 13 }}>Regras de via corrigem o nome de exibição de uma rua para a sua central, dentro do traçado desenhado no mapa — útil quando o nome retornado pelo mapa não é o mesmo usado pelos moradores da região. Vale nos endereços achados pela busca e pela localização enviada.</p>
      </div>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      {!regras.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhuma regra de via criada." sub="Crie a primeira em Criar nova regra." /></div> : (
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Nome de exibição</th><th>Nome no mapa</th><th className="centro">Pontos do traçado</th><th>Situação</th><th /></tr></thead>
          <tbody>{regras.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.nomeExibicao}</strong></td>
              <td>{r.nomeNoMapa || <span style={{ color: "var(--cg-suave)" }}>Qualquer rua do traçado</span>}</td>
              <td className="centro">{r.poligono.length}</td>
              <td>{r.ativa ? <Selo tom="ok">Ativa</Selo> : <Selo tom="neutro">Desligada</Selo>}</td>
              <td className="direita"><div className="cg-acoes" style={{ justifyContent: "flex-end" }}>
                <button className="cg-botao" onClick={() => setEditando(r)}>Editar</button>
                <button className="cg-botao perigo" aria-label={`Excluir ${r.nomeExibicao}`} onClick={() => confirm(`Excluir a regra ${r.nomeExibicao}?`) && void tentar(async () => { await chamar("DELETE", `/ruas/${r.id}`); l.recarregar(); }, "Regra excluída.")}><Trash2 size={15} /></button>
              </div></td>
            </tr>))}</tbody>
        </table></div></div>
      )}
      {editando && <Formulario r={editando === "nova" ? null : editando} outras={regras} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function Formulario({ r, outras, onFechar, onSalvo }: { r: Regra | null; outras: Regra[]; onFechar: () => void; onSalvo: () => void }) {
  const [nomeExibicao, setNomeExibicao] = useState(r?.nomeExibicao ?? "");
  const [nomeNoMapa, setNomeNoMapa] = useState(r?.nomeNoMapa ?? "");
  const [ativa, setAtiva] = useState(r?.ativa ?? true);
  const [pontos, setPontos] = useState<Ponto[]>(r?.poligono ?? []);
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const corpo = { nomeExibicao, nomeNoMapa, ativa, poligono: pontos };
    if (await tentar(() => (r ? chamar("PUT", `/ruas/${r.id}`, corpo) : chamar("POST", "/ruas", corpo)), "Regra salva.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={r ? "Editar regra de via" : "Criar nova regra"} sub="Nome de exibição da rua" onFechar={onFechar} largura="grande" rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void salvar()}>{r ? "Salvar regra" : "Criar"}</button></>}>
      {aviso}
      <div className="cg-grade" style={{ marginBottom: 12 }}>
        <Campo rotulo="Nome de exibição *" dica="O nome que a sua central vai ver."><input value={nomeExibicao} maxLength={80} onChange={(e) => setNomeExibicao(e.target.value)} /></Campo>
        <Campo rotulo="Nome no mapa" dica="Opcional. Vazio = vale para qualquer rua dentro do traçado."><input value={nomeNoMapa} maxLength={80} onChange={(e) => setNomeNoMapa(e.target.value)} placeholder="Ex.: Rua Doutor Silva" /></Campo>
        <Campo rotulo="Situação"><Interruptor ligado={ativa} onChange={setAtiva} rotulo={ativa ? "Ativa" : "Desligada"} /></Campo>
      </div>
      <div className="cg-cabecalho" style={{ margin: "0 0 8px" }}>
        <div><strong>Traçado da rua</strong><p style={{ textTransform: "none", letterSpacing: 0 }}>Toque no mapa e contorne a rua ({pontos.length} pontos, mínimo 3).</p></div>
        <div className="cg-acoes">
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos(pontos.slice(0, -1))}>Desfazer</button>
          <button className="cg-botao" disabled={!pontos.length} onClick={() => setPontos([])}>Limpar</button>
        </div>
      </div>
      <MapaAreas areas={outras.filter((o) => o.id !== r?.id).map((o) => ({ id: o.id, nome: o.nomeExibicao, poligono: o.poligono, cor: "#3b82f6" }))} desenho={pontos} onDesenho={setPontos} grande />
    </Janela>
  );
}
