// Transação com Pix (formato da Machine): uma linha por corrida paga com Pix, com situação Paga, Estornada, Processando, Em disputa ou Chargeback.
// Sem operadora de Pix: a situação nasce da corrida e o administrador registra à mão estorno, disputa ou chargeback.
import { useEffect, useState } from "react";
import { Aviso as AvisoOp, Janela, Paginacao, Selo, Vazio, dh, msgErro, op, qs, useDados } from "../corridas/comum";
import { BotaoExportar, PERIODO_30, SeletorPeriodo, brl, paramsPeriodo, useAdmin, type PeriodoPag } from "../corridas/pagamentos-comum";
import { Cab } from "./comum";

const TOM: Record<string, string> = { Paga: "ok", Estornada: "ruim", Processando: "info", "Em disputa": "alerta", Chargeback: "ruim" };

export function TransacaoPix() {
  const admin = useAdmin();
  const [per, setPer] = useState<PeriodoPag>(PERIODO_30);
  const [os, setOs] = useState(""), [motorista, setMotorista] = useState(""), [situacao, setSituacao] = useState("");
  const [f, setF] = useState({ os: "", motorista: "", situacao: "" });
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [marcar, setMarcar] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setF({ os, motorista, situacao }); setPagina(1); }, 350); return () => clearTimeout(t); }, [os, motorista, situacao]);
  const filtro = { ...f, ...paramsPeriodo(per) };
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/pix${qs({ ...filtro, pagina })}`), [JSON.stringify(filtro), pagina]);
  return (
    <>
      <Cab titulo="Transação com Pix" sub="Pagamentos de corridas feitos por Pix, por OS">
        <BotaoExportar caminho={`/pix/exportar${qs(filtro)}`} nome="transacoes-pix.csv" onErro={setErroAcao} />
      </Cab>
      <div className="dm-cartao dm-filtros">
        <label>Buscar por OS<input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Nº da OS" /></label>
        <label>Período<SeletorPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} /></label>
        <label>Nome do motorista<input value={motorista} onChange={(e) => setMotorista(e.target.value)} /></label>
        <label>Situação do pagamento<select value={situacao} onChange={(e) => setSituacao(e.target.value)}><option value="">Todas</option>{(dados?.situacoes ?? []).map((s: string) => <option key={s}>{s}</option>)}</select></label>
        <button className="botao" onClick={() => { setOs(""); setMotorista(""); setSituacao(""); setPer(PERIODO_30); setPagina(1); }}>Limpar filtro</button>
      </div>
      <div className="dm-kpis">
        <div className="dm-kpi"><small>Total pago por Pix</small><strong>{brl(dados?.totalPago ?? 0)}</strong></div>
        <div className="dm-kpi"><small>Líquido da bandeira</small><strong>{brl(dados?.liquidoBandeira ?? 0)}</strong></div>
        <div className="dm-kpi"><small>Líquido dos motoristas</small><strong>{brl(dados?.liquidoMotoristas ?? 0)}</strong></div>
        <div className="dm-kpi"><small>Em disputa ou chargeback</small><strong>{(dados?.resumo?.["Em disputa"]?.qtd ?? 0) + (dados?.resumo?.Chargeback?.qtd ?? 0)}</strong></div>
      </div>
      <AvisoOp texto={erro} erro /><AvisoOp texto={erroAcao} erro />
      <div className="dm-cartao">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table>
            <thead><tr><th>Nº OS</th><th>Situação do pagamento</th><th>Data</th><th>Passageiro</th><th>Motorista</th><th>Valor líquido da bandeira</th><th>Valor líquido do motorista</th>{admin && <th />}</tr></thead>
            <tbody>{dados.itens.map((x: any) => (
              <tr key={x.id}><td className="forte">{x.os}</td>
                <td><Selo tom={TOM[x.situacao]}>{x.situacao}</Selo>{x.motivo && <small className="bloco">{x.motivo}</small>}{!x.automatica && x.marcadaPor && <small className="bloco">por {x.marcadaPor}</small>}</td>
                <td>{dh(x.data)}</td><td>{x.passageiro}</td><td>{x.motorista || "—"}</td><td>{brl(x.liquidoBandeira)}</td><td>{brl(x.liquidoMotorista)}<small className="bloco">de {brl(x.valor)}</small></td>
                {admin && <td><button className="botao" onClick={() => setMarcar(x)}>Registrar</button></td>}</tr>))}</tbody>
          </table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="transações" />
        </>}
      </div>
      {marcar && <ModalSituacao item={marcar} situacoes={dados?.situacoes ?? []} onFechar={() => setMarcar(null)} onFeito={() => { setMarcar(null); recarregar(); }} />}
    </>
  );
}

function ModalSituacao({ item, situacoes, onFechar, onFeito }: { item: any; situacoes: string[]; onFechar: () => void; onFeito: () => void }) {
  const [situacao, setSituacao] = useState(item.situacao === "Paga" ? "Estornada" : item.situacao), [motivo, setMotivo] = useState(item.motivo ?? "");
  const [erro, setErro] = useState<string | null>(null), [ocupado, setOcupado] = useState(false);
  return (
    <Janela onFechar={onFechar} titulo={`Pix da OS ${item.os}`} sub="Registro da central: não altera a carteira de ninguém nem chama operadora. Estorno e chargeback geram uma pendência Pix no app." tamanho="estreita"
      rodape={<><button className="oc-btn" onClick={onFechar}>Cancelar</button><button className="oc-btn pri" disabled={ocupado} onClick={async () => {
        setOcupado(true); setErro(null);
        try { await op(`/pix/${encodeURIComponent(item.id)}/situacao`, { situacao, motivo }); onFeito(); } catch (e) { setErro(msgErro(e)); } finally { setOcupado(false); }
      }}>Salvar</button></>}>
      <label>Situação<select value={situacao} onChange={(e) => setSituacao(e.target.value)}>{situacoes.map((s) => <option key={s}>{s}</option>)}<option value="automatica">Voltar ao automático (pela corrida)</option></select></label>
      <label>Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: contestação do titular" /></label>
      <AvisoOp texto={erro} erro />
    </Janela>
  );
}
