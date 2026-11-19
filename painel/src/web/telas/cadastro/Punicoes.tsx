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
      <Cabecalho titulo="Punições" sub="Gestão Disciplinar"><button className="cg-botao primario" onClick={() => setAplicar(true)}><Gavel size={16} /> Gerenciar Punição</button></Cabecalho>
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

const TEMPOS: Array<[string, string, number, string]> = [["15", "15 minutos", 15, "minutos"], ["30", "30 minutos", 30, "minutos"], ["45", "45 minutos", 45, "minutos"], ["60", "1 hora", 1, "horas"], ["120", "2 horas", 2, "horas"], ["180", "3 horas", 3, "horas"], ["360", "6 horas", 6, "horas"], ["720", "12 horas", 12, "horas"], ["1440", "24 horas", 24, "horas"], ["2880", "48 horas", 48, "horas"]];
interface Passada { id: string; motivo: string; inicio: string; fim: string; por: string; liberadaEm: string | null; emVigor: boolean }
interface Achado { id: string; nome: string; cpf: string; email: string; telefone: string; cidade: string }

/** "Gerenciar Punição" da Machine: motorista, aba Nova punição (tempo de 15 min a 48 h e motivo) e aba Histórico de punições. */
function Aplicar({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [busca, setBusca] = useState("");
  const [mot, setMot] = useState<Achado | null>(null);
  const [aba, setAba] = useState<"nova" | "historico">("nova");
  const [f, setF] = useState({ tempo: "", motivo: "" });
  const achados = useCarregar(() => (busca.length >= 2 && !mot ? chamar<{ motoristas: Achado[] }>("GET", `/motoristas-busca${consulta({ q: busca })}`) : Promise.resolve(null)), [busca, mot]);
  const hist = useCarregar(() => (mot ? chamar<{ punicoes: Passada[] }>("GET", `/punicoes-historico/${mot.id}`) : Promise.resolve(null)), [mot?.id]);
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const t = TEMPOS.find(([v]) => v === f.tempo);
    if (!mot) { alert("Escolha o motorista."); return; }
    if (!t) { alert("Selecione o tempo de punição."); return; }
    if (await tentar(() => chamar("POST", "/punicoes", { motoristaId: mot.id, tempo: t[2], unidade: t[3], motivo: f.motivo }), "Motorista bloqueado.")) { onSalvo(); hist.recarregar(); setF({ tempo: "", motivo: "" }); setAba("historico"); }
  };
  const n = hist.dados?.punicoes.length ?? 0;
  return (
    <Janela aberta titulo="Gerenciar Punição" sub={mot ? undefined : "Escolha o motorista"} onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button>{aba === "nova" && <button className="cg-botao primario" onClick={() => void salvar()}>Aplicar</button>}</>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        {!mot ? (
          <>
            <Campo rotulo="Motorista *"><input value={busca} placeholder="Digite para buscar..." onChange={(e) => setBusca(e.target.value)} /></Campo>
            {achados.dados?.motoristas.map((m) => <button key={m.id} className="cg-botao" onClick={() => setMot(m)}>{m.nome} <small className="cg-mono">{m.cpf}</small></button>)}
          </>
        ) : (
          <>
            <div><strong>{mot.nome}</strong><div><small>{[mot.cidade, mot.telefone, mot.email].filter(Boolean).join(" · ")}</small></div><button className="cg-botao" onClick={() => { setMot(null); setBusca(""); }}>Trocar motorista</button></div>
            <div className="cg-abas" role="tablist"><button role="tab" aria-selected={aba === "nova"} className={aba === "nova" ? "ativo" : ""} onClick={() => setAba("nova")}>Nova punição</button><button role="tab" aria-selected={aba === "historico"} className={aba === "historico" ? "ativo" : ""} onClick={() => setAba("historico")}>Histórico de punições ({n})</button></div>
            {aba === "nova" ? (
              <>
                <small>Campos com * são obrigatórios.</small>
                <Campo rotulo="Selecione o tempo de punição: *"><select value={f.tempo} onChange={(e) => setF({ ...f, tempo: e.target.value })}><option value="">Selecione</option>{TEMPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
                <Campo rotulo="Motivo da punição:"><textarea value={f.motivo} maxLength={300} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo>
              </>
            ) : !n ? <Vazio titulo="Nenhuma punição registrada para este motorista." /> : (
              <div className="cg-rolagem"><table className="cg-tabela"><thead><tr><th>Aplicada em</th><th>Até</th><th>Motivo</th><th>Situação</th></tr></thead>
                <tbody>{hist.dados!.punicoes.map((p) => <tr key={p.id}><td>{dataHoraBr(p.inicio)}</td><td>{dataHoraBr(p.fim)}</td><td>{p.motivo}</td><td>{p.emVigor ? "Em vigor" : p.liberadaEm ? "Liberada" : "Cumprida"}</td></tr>)}</tbody></table></div>
            )}
          </>
        )}
      </div>
    </Janela>
  );
}
