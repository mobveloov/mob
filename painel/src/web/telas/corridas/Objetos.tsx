// Objetos perdidos (Machine): abas Abertos e Finalizados, período, "Mais filtros" e menu por linha (Finalizar, Dados do passageiro, Chat com motorista).
import { useState } from "react";
import { CheckCircle2, Filter, MoreVertical } from "lucide-react";
import { Aviso, Janela, Paginacao, Selo, Vazio, dia, fone, msgErro, op, qs, useDados } from "./comum";
import "./corridas.css";

const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somaDias = (n: number) => new Date(Date.now() - 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["semana", "Semana passada"], ["mes", "Mês passado"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["pers", "Personalizado"]];
/** Segunda a domingo da semana anterior. */
const semanaPassada = () => { const h = new Date(Date.now() - 3 * 3600_000); const dow = (h.getUTCDay() + 6) % 7; return { dataIni: somaDias(-dow - 7), dataFim: somaDias(-dow - 1) }; };
const mesPassado = () => { const h = new Date(Date.now() - 3 * 3600_000); const ini = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1)); const fim = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0)); return { dataIni: ini.toISOString().slice(0, 10), dataFim: fim.toISOString().slice(0, 10) }; };
const VAZIO = { os: "", motorista: "", passageiro: "" };

export default function Objetos() {
  const [aba, setAba] = useState<"pendente" | "resolvido">("pendente");
  const [periodo, setPeriodo] = useState("30");
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const [maisAberto, setMaisAberto] = useState(false);
  const [rasc, setRasc] = useState(VAZIO), [f, setF] = useState(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [menu, setMenu] = useState<string | null>(null);
  const [passageiro, setPassageiro] = useState<any>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const faixa = periodo === "hoje" ? { dataIni: hojeIso(), dataFim: hojeIso() } : periodo === "semana" ? semanaPassada() : periodo === "mes" ? mesPassado()
    : periodo === "7" ? { dataIni: somaDias(-6), dataFim: hojeIso() } : periodo === "30" ? { dataIni: somaDias(-29), dataFim: hojeIso() }
    : periodo === "pers" ? { dataIni: de, dataFim: ate } : {};
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/objetos${qs({ status: aba, ...faixa, ...f, pagina })}`), [aba, JSON.stringify(faixa), JSON.stringify(f), pagina]);
  const fazer = async (fn: () => Promise<unknown>) => { setErroAcao(null); try { await fn(); recarregar(); } catch (e) { setErroAcao(msgErro(e)); } };
  async function verPassageiro(o: any) {
    setMenu(null); setErroAcao(null);
    try {
      if (o.os) { const d = await op<any>(`/corridas/${encodeURIComponent(o.os)}`); setPassageiro({ nome: d.passageiro.nome, telefone: d.passageiro.telefone, cpf: d.passageiro.cpf, os: o.os }); }
      else setPassageiro({ nome: o.passageiro, telefone: "", cpf: "", os: "" });
    } catch { setPassageiro({ nome: o.passageiro, telefone: "", cpf: "", os: o.os }); }
  }
  const total = dados?.itens.length ?? 0;
  const de1 = dados ? (dados.pagina - 1) * 20 + 1 : 0;
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Objetos perdidos</h1></div>
      <div className="oc-card oc-fila" style={{ justifyContent: "space-between" }}>
        <div className="oc-fila">
          {([["pendente", "Abertos"], ["resolvido", "Finalizados"]] as const).map(([k, r]) => <button key={k} className={`oc-chip ${aba === k ? "on" : ""}`} onClick={() => { setAba(k); setPagina(1); }}>{r}</button>)}
        </div>
        <div className="oc-fila">
          <select style={{ maxWidth: 200 }} value={periodo} onChange={(e) => { setPeriodo(e.target.value); setPagina(1); }} aria-label="Período">{PERIODOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
          {periodo === "pers" && <><input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" /><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" /></>}
          <input id="nomeCliente_filter" name="nomeCliente" placeholder="Buscar passageiro" value={f.passageiro} onChange={(e) => { setF({ ...f, passageiro: e.target.value }); setPagina(1); }} style={{ maxWidth: 200 }} />
          <button className="oc-btn" onClick={() => { setRasc(f); setMaisAberto(true); }}><Filter size={16} /> Mais filtros</button>
        </div>
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!dados?.total && <>
          <p className="suave" style={{ marginTop: 0 }}>Exibindo {de1}-{de1 + total - 1} de {dados.total} {dados.total === 1 ? "resultado" : "resultados"}.</p>
          <div className="oc-rola"><table><thead><tr><th>Data</th><th>Dados informados da corrida</th><th>Passageiro</th><th>Descrição do objeto perdido</th><th>Motorista</th><th>Status</th><th /></tr></thead>
            <tbody>{dados.itens.map((o: any) => (
              <tr key={o.id}><td>{dia(o.data)}</td><td className="forte">{o.os ? `OS ${o.os}` : "—"}</td>
                <td>{o.passageiro || "—"}</td>
                <td style={{ whiteSpace: "normal", minWidth: 200 }}>{o.descricao}{o.ondeEsta && <><br /><small>Onde está: {o.ondeEsta}</small></>}{o.observacao && <><br /><small>{o.observacao}</small></>}</td>
                <td>{o.motorista || "—"}</td>
                <td><Selo tom={o.resolvido ? "ok" : "alerta"}>{o.resolvido ? "Finalizado" : "Aberto"}</Selo></td>
                <td style={{ position: "relative" }}>
                  <button className="oc-btn peq" aria-label={`Ações do objeto ${o.descricao}`} onClick={() => setMenu(menu === o.id ? null : o.id)}><MoreVertical size={14} /></button>
                  {menu === o.id && <div className="oc-card" style={{ position: "absolute", right: 0, zIndex: 5, minWidth: 190, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="oc-btn peq" onClick={() => { setMenu(null); void fazer(() => op(`/objetos/${o.id}/status`, {})); }}><CheckCircle2 size={13} /> {o.resolvido ? "Reabrir" : "Finalizar"}</button>
                    <button className="oc-btn peq" onClick={() => void verPassageiro(o)}>Dados do passageiro</button>
                    <a className="oc-btn peq" style={{ textDecoration: "none", textAlign: "center" }} href="/conversas" onClick={() => setMenu(null)}>Chat com motorista</a>
                    <button className="oc-btn peq ruim" onClick={() => { setMenu(null); if (confirm("Apagar este registro? Não dá para desfazer.")) void fazer(() => op(`/objetos/${o.id}`, undefined, "DELETE")); }}>Excluir registro</button>
                  </div>}
                </td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="registros" />
        </>}
      </div>
      {maisAberto && (
        <Janela onFechar={() => setMaisAberto(false)} titulo="Filtro de pesquisa" sub="Você pode filtrar um ou mais campos" tamanho="estreita"
          rodape={<><button className="oc-btn" type="button" onClick={() => { setRasc(VAZIO); setF({ ...f, os: "", motorista: "" }); setPagina(1); setMaisAberto(false); }}>Limpar filtros</button><button className="oc-btn pri" type="button" onClick={() => { setF({ ...f, os: rasc.os, motorista: rasc.motorista }); setPagina(1); setMaisAberto(false); }}>Filtrar</button></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="oc-l">Nome/VTR do motorista<input id="nomeTaxista_filter" value={rasc.motorista} onChange={(e) => setRasc({ ...rasc, motorista: e.target.value })} /></label>
            <label className="oc-l">Nº OS<input id="n_os" type="number" value={rasc.os} onChange={(e) => setRasc({ ...rasc, os: e.target.value })} /></label>
          </div>
        </Janela>
      )}
      {passageiro && (
        <Janela onFechar={() => setPassageiro(null)} titulo="Dados do passageiro" tamanho="estreita" nivel="centro">
          <div className="oc-dado"><span>Nome</span><b>{passageiro.nome || "—"}</b></div>
          <div className="oc-dado"><span>Telefone</span><b>{passageiro.telefone ? fone(passageiro.telefone) : "—"}</b></div>
          <div className="oc-dado"><span>CPF</span><b>{passageiro.cpf || "—"}</b></div>
          <div className="oc-dado"><span>Corrida</span><b>{passageiro.os ? `OS ${passageiro.os}` : "—"}</b></div>
        </Janela>
      )}
    </div>
  );
}
