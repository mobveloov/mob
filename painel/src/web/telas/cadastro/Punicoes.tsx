// Cadastro › Punições (Gestão Disciplinar): bloqueio temporário de motoristas. O despacho não oferece corridas a quem está punido.
// Servidor: /api/gestao/punicoes.

import { useState } from "react";
import { Gavel } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, ComFiltros, consulta, dataHoraBr, Janela, Paginacao, useAviso, Vazio } from "./base";

interface Linha { id: string; motoristaId: string; nome: string; cpf: string; motivo: string; fim: string; tempoRestante: string }

export default function Punicoes() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<{ punicoes: Linha[]; paginacao: { atual: number; totalPaginas: number } }>("GET", `/punicoes${consulta({ busca: termo, pagina })}`), [termo, pagina], 60_000);
  const [aplicar, setAplicar] = useState(false);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Punições" sub="Gestão Disciplinar"><button className="cg-botao primario" onClick={() => setAplicar(true)}><Gavel size={16} /> Aplicar Punição</button></Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setTermo(busca); }}>
          <Campo rotulo="Buscar Motorista"><input placeholder="Nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          <button className="cg-botao primario cheio">Filtrar</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setBusca(""); setTermo(""); setPagina(1); }}>Limpar</button>
        </form>
      }>
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Motorista Punido</th><th>Motivo</th><th>Liberado Em</th><th>Tempo Restante</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.punicoes.map((p) => (
              <tr key={p.id}>
                <td><div className="cg-pessoa"><span className="cg-avatar">{p.nome.slice(0, 1).toUpperCase()}</span><div><strong>{p.nome}</strong><small>{p.cpf}</small></div></div></td>
                <td>{p.motivo}</td><td>{dataHoraBr(p.fim)}</td><td><strong>{p.tempoRestante}</strong></td>
                <td className="direita"><button className="cg-botao" onClick={() => confirm(`Liberar ${p.nome} agora?`) && void tentar(async () => { await chamar("DELETE", `/punicoes/${p.id}`); l.recarregar(); }, "Motorista liberado.")}>Liberar</button></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.punicoes.length && <Vazio titulo="Nenhum motorista punido." sub="Os bloqueios temporários aparecem aqui." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {aplicar && <Aplicar onFechar={() => setAplicar(false)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function Aplicar({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [busca, setBusca] = useState("");
  const [mot, setMot] = useState<{ id: string; nome: string } | null>(null);
  const [f, setF] = useState({ tempo: "", unidade: "horas", motivo: "" });
  const achados = useCarregar(() => (busca.length >= 2 && !mot ? chamar<{ motoristas: Array<{ id: string; nome: string; cpf: string }> }>("GET", `/motoristas-busca${consulta({ q: busca })}`) : Promise.resolve(null)), [busca, mot]);
  const { aviso, tentar } = useAviso();
  const salvar = async () => { if (await tentar(() => chamar("POST", "/punicoes", { motoristaId: mot?.id, tempo: Number(f.tempo), unidade: f.unidade, motivo: f.motivo }), "Motorista bloqueado.")) { onSalvo(); onFechar(); } };
  return (
    <Janela aberta titulo="Aplicar Punição" sub="Bloqueio Temporário" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Bloquear</button></>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Motorista *"><input value={mot ? mot.nome : busca} placeholder="Digite para buscar..." onChange={(e) => { setMot(null); setBusca(e.target.value); }} /></Campo>
        {!mot && achados.dados?.motoristas.map((m) => <button key={m.id} className="cg-botao" onClick={() => setMot(m)}>{m.nome} <small className="cg-mono">{m.cpf}</small></button>)}
        <div className="cg-duplo">
          <Campo rotulo="Tempo *"><input type="number" min={1} value={f.tempo} onChange={(e) => setF({ ...f, tempo: e.target.value })} /></Campo>
          <Campo rotulo="Unidade *"><select value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}><option value="horas">Horas</option><option value="dias">Dias</option></select></Campo>
        </div>
        <Campo rotulo="Motivo *"><textarea value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}
