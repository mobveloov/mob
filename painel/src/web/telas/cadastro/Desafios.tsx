// Cadastro › Desafios dos motoristas: lista por situação, detalhe com acompanhamento e relatório, e criação em 3 passos.
// Servidor: /api/gestao/desafios.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dataBr, dataHoraBr, dinheiro, Janela, Selo, useAviso, Vazio } from "./base";

interface Desafio { id: string; nome: string; tipo: string; meta: number; premio: number | null; inicio: string; fim: string; horaInicio?: string; horaFim?: string; aprovacao?: string; categorias?: string; criadoPor?: string; situacao: string; desafiados: number; participando: number; concluidos: number; gastoAtual: number; atualizadoPor?: string }
interface Prog { id: string; nome: string; feito: number; meta: number; situacao: string; aceitoEm: string | null; finalizadoEm: string | null; pago: boolean; valorPago: number; aguardandoAprovacao: boolean; app: number; macaneta: number; pendencia: number }
interface Detalhe { desafio: Desafio; motoristas: Prog[]; resumo: { desafiados: number; participando: number; concluidos: number; gastoMaximo: number; gastoEsperado: number; gastoReal: number } }
const TOM: Record<string, "ok" | "info" | "ruim" | "neutro" | "alerta"> = { Ativo: "ok", Aguardando: "info", Pausado: "alerta", Cancelado: "ruim", Finalizado: "neutro" };
const TIPOS = ["Desafio de corridas", "Corridas pendentes aceitas", "Corridas maçaneta"];
const ABAS = ["Todos", "Ativos", "Aguardando", "Cancelados", "Finalizados"] as const;

export default function Desafios() {
  const [aba, setAba] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const l = useCarregar(() => chamar<{ desafios: Desafio[]; kpis: Record<string, number> }>("GET", `/desafios${consulta({ status: aba, busca })}`), [aba, busca], 60_000);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const d = l.dados;
  const k = d?.kpis ?? {};

  return (
    <div className="cg-pagina-solta">
      <Cabecalho titulo="Desafios dos motoristas"><button className="cg-botao primario" onClick={() => setNovo(true)}><Plus size={16} /> Novo desafio</button></Cabecalho>
      <div className="cg-linha-tab">
        <div style={{ flex: "3 1 380px" }}><Abas itens={ABAS.map((id) => ({ id, rotulo: id, n: id === "Todos" ? undefined : k[id.toLowerCase()] ?? 0 }))} valor={aba as "Todos"} onChange={setAba} /></div>
        <input placeholder="Buscar" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {!d?.desafios.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum desafio." sub="Crie o primeiro em Novo desafio." /></div> : (
        <div className="cg-cartoes">{d.desafios.map((x) => (
          <div className="cg-cartao" key={x.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><h4>{x.nome}</h4><Selo tom={TOM[x.situacao] ?? "neutro"}>{x.situacao}</Selo></div>
            <span className="cg-mono">{x.tipo} · {dataBr(x.inicio)} a {dataBr(x.fim)}</span>
            <div className="cg-resumo-linha"><span>Meta</span><strong>{x.meta}</strong></div>
            <div className="cg-resumo-linha"><span>Recompensa</span><strong>{dinheiro(x.premio)}</strong></div>
            <div className="cg-resumo-linha"><span>Desafiados / participando / concluíram</span><strong>{x.desafiados} / {x.participando} / {x.concluidos}</strong></div>
            <button className="cg-botao" onClick={() => setAberto(x.id)}>Abrir</button>
          </div>))}
        </div>
      )}
      {novo && <Novo onFechar={() => setNovo(false)} onSalvo={() => l.recarregar()} />}
      {aberto && <Detalhes id={aberto} onFechar={() => setAberto(null)} onMudou={() => l.recarregar()} />}
    </div>
  );
}

function Detalhes({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const l = useCarregar(() => chamar<Detalhe>("GET", `/desafios/${id}`), [id]);
  const [parte, setParte] = useState<"config" | "relatorio">("config");
  const [filtro, setFiltro] = useState("Todos");
  const [busca, setBusca] = useState("");
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  if (!d) return <Janela aberta titulo="Desafio" onFechar={onFechar} largura="grande"><Vazio titulo="Carregando..." /></Janela>;
  const x = d.desafio, r = d.resumo;
  const lista = d.motoristas.filter((m) => (filtro === "Todos" || m.situacao === filtro) && (!busca || m.nome.toLowerCase().includes(busca.toLowerCase())));
  const fechado = x.situacao === "Cancelado" || x.situacao === "Finalizado";
  return (
    <Janela aberta titulo={x.nome} sub="Desafios dos motoristas" onFechar={onFechar} largura="grande"
      abas={<Abas itens={[{ id: "config" as const, rotulo: "Configurações do desafio" }, { id: "relatorio" as const, rotulo: "Relatório de Desempenho" }]} valor={parte} onChange={setParte} />}
      rodape={!fechado ? <>
        <button className="cg-botao" onClick={() => void tentar(async () => { await chamar("POST", `/desafios/${id}/ativar`, {}); l.recarregar(); onMudou(); })}>{x.situacao === "Pausado" ? "Ativar" : "Pausar"}</button>
        <button className="cg-botao perigo" onClick={() => confirm("Cancelar o desafio? Não dá para voltar.") && void tentar(async () => { await chamar("POST", `/desafios/${id}/cancelar`, {}); l.recarregar(); onMudou(); }, "Desafio cancelado.")}>Cancelar desafio</button>
      </> : undefined}>
      {aviso}
      {parte === "config" ? (
        <>
          <h4 className="cg-secao">Configurações do desafio</h4>
          <div className="cg-grade">
            {([["Status do desafio", <Selo key="s" tom={TOM[x.situacao] ?? "neutro"}>{x.situacao}</Selo>], ["Criado por", x.atualizadoPor || "ADM"], ["Período do desafio", `${dataBr(x.inicio)} ${x.horaInicio ?? ""} a ${dataBr(x.fim)} ${x.horaFim ?? ""}`],
              ["Quem vai receber o desafio?", `${r.desafiados} motoristas ativos`], ["Categorias selecionadas", x.categorias || "Todas"], ["Meta de solicitações", String(x.meta)],
              ["Recompensa em créditos do desafio", dinheiro(x.premio)], ["Aprovação da recompensa", x.aprovacao || "Automático"], ["Expectativa de gasto máximo", dinheiro(r.gastoMaximo)]] as Array<[string, React.ReactNode]>)
              .map(([rot, v]) => <div className="cg-cartao" key={rot}><small className="cg-mono">{rot}</small><div><strong>{v}</strong></div></div>)}
          </div>
          <h4 className="cg-secao">Acompanhamento do desafio</h4>
          <div className="cg-kpis">
            <div className="cg-kpi"><span>Motoristas participando</span><strong>{r.participando}</strong></div>
            <div className="cg-kpi"><span>Motoristas que completaram</span><strong>{r.concluidos}</strong></div>
            <div className="cg-kpi"><span>Expectativa de gasto atual</span><strong>{dinheiro(r.gastoEsperado)}</strong></div>
            <div className="cg-kpi"><span>Gasto total atual</span><strong>{dinheiro(r.gastoReal)}</strong></div>
          </div>
          <h4 className="cg-secao">Motoristas desafiados</h4>
          <div className="cg-linha-tab">
            <Abas itens={["Todos", "Pendente", "Participando", "Concluído"].map((id2) => ({ id: id2, rotulo: id2 }))} valor={filtro} onChange={setFiltro} />
            <input placeholder="Pesquisar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {!lista.length ? <Vazio titulo="Nenhum motorista." /> : (
            <div className="cg-rolagem"><table className="cg-tabela">
              <thead><tr><th>Motorista</th><th>Progresso</th><th>Quantidade de corridas</th><th>Situação</th><th>Aceito em</th><th className="direita">Ações</th></tr></thead>
              <tbody>{lista.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td><div className="cg-progresso"><i style={{ width: `${Math.min(100, m.meta ? (m.feito / m.meta) * 100 : 0)}%` }} /></div></td>
                  <td>{m.feito} / {m.meta}</td><td><Selo tom={m.situacao === "Concluído" ? "ok" : m.situacao === "Participando" ? "info" : "neutro"}>{m.situacao}</Selo></td><td>{dataHoraBr(m.aceitoEm)}</td>
                  <td className="direita">{m.aguardandoAprovacao ? <button className="cg-botao primario" onClick={() => void tentar(async () => { await chamar("POST", `/desafios/${id}/aprovar/${m.id}`, {}); l.recarregar(); onMudou(); }, "Recompensa paga.")}>Aprovar recompensa</button> : m.pago ? <Selo tom="ok">Pago</Selo> : null}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </>
      ) : (
        <>
          <h4 className="cg-secao">Relatório de Desempenho (BI)</h4>
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Motorista</th><th>Status</th><th>Valor Pago</th><th>Finalizado em</th><th>App</th><th>Maçaneta</th><th>Salvas da Pendência</th></tr></thead>
            <tbody>{d.motoristas.map((m) => <tr key={m.id}><td>{m.nome}</td><td>{m.situacao}</td><td>{dinheiro(m.valorPago)}</td><td>{dataHoraBr(m.finalizadoEm)}</td><td>{m.app}</td><td>{m.macaneta}</td><td>{m.pendencia}</td></tr>)}</tbody>
          </table></div>
          <p style={{ color: "var(--cg-suave)", fontSize: 12 }}>Os números de corridas (App, Maçaneta, Pendência) referem-se apenas ao período do desafio.</p>
        </>
      )}
    </Janela>
  );
}

function Novo({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [passo, setPasso] = useState(1);
  const [f, setF] = useState({ nome: "", tipo: TIPOS[0], inicio: "", horaInicio: "00:00", fim: "", horaFim: "23:59", meta: "", premio: "", aprovacao: "Automático", corridasMin: "", corridasMax: "", categorias: [] as string[] });
  const cats = useCarregar(() => chamar<{ categorias: string[] }>("GET", "/cidades"), []);
  const previa = useCarregar(() => (passo >= 2 ? chamar<{ motoristas: number; gastoMaximo: number }>("GET", `/desafios-previa${consulta({ categorias: f.categorias.join(","), corridasMin: f.corridasMin, corridasMax: f.corridasMax, premio: f.premio })}`) : Promise.resolve(null)), [passo, f.categorias, f.corridasMin, f.corridasMax, f.premio]);
  const { aviso, tentar } = useAviso();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
  const salvar = async () => {
    const corpo = { ...f, categorias: f.categorias.join(","), meta: n(f.meta), premio: n(f.premio) ?? 0, corridasMin: n(f.corridasMin), corridasMax: n(f.corridasMax) };
    if (await tentar(() => chamar("POST", "/desafios", corpo), "Desafio lançado.")) { onSalvo(); onFechar(); }
  };
  const podeAvancar = passo === 1 ? !!(f.nome && f.inicio && f.fim && Number(f.meta) > 0) : true;
  return (
    <Janela aberta titulo="Novo desafio" sub="Configurações do desafio" onFechar={onFechar}
      rodape={<>
        <button className="cg-botao" onClick={passo === 1 ? onFechar : () => setPasso(passo - 1)}>{passo === 1 ? "Cancelar" : "Voltar"}</button>
        {passo < 3 ? <button className="cg-botao primario" disabled={!podeAvancar} onClick={() => setPasso(passo + 1)}>Próximo</button> : <button className="cg-botao primario" onClick={() => void salvar()}>Lançar desafio</button>}
      </>}>
      {aviso}
      <div className="cg-etapas"><span className={passo === 1 ? "ativa" : ""}>1</span><span className={passo === 2 ? "ativa" : ""}>2</span><span className={passo === 3 ? "ativa" : ""}>3</span></div>
      {passo === 1 && (
        <div className="cg-grade">
          <Campo rotulo={`Nome do desafio * (${f.nome.length}/30)`} className="larga"><input maxLength={30} value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
          <Campo rotulo="Tipo do desafio *"><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value={TIPOS[0]}>Corridas finalizadas</option><option value={TIPOS[1]}>Corridas pendentes aceitas</option><option value={TIPOS[2]}>Corridas maçaneta</option></select></Campo>
          <Campo rotulo="Aprovação da recompensa *"><select value={f.aprovacao} onChange={(e) => set("aprovacao", e.target.value)}><option>Automático</option><option>Manual</option></select></Campo>
          <Campo rotulo="Data de início *"><input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Campo>
          <Campo rotulo="Hora de início *"><input type="time" value={f.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} /></Campo>
          <Campo rotulo="Data final *"><input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} /></Campo>
          <Campo rotulo="Hora final *"><input type="time" value={f.horaFim} onChange={(e) => set("horaFim", e.target.value)} /></Campo>
          <Campo rotulo="Meta do desafio *"><input type="number" min={1} value={f.meta} onChange={(e) => set("meta", e.target.value)} /></Campo>
          <Campo rotulo="Recompensa (R$) *"><input inputMode="decimal" value={f.premio} onChange={(e) => set("premio", e.target.value)} /></Campo>
        </div>
      )}
      {passo === 2 && (
        <>
          <h4 className="cg-secao">Quem vai receber os desafios?</h4>
          <p style={{ color: "var(--cg-suave)", margin: "0 0 8px" }}>Filtrar por corridas finalizadas. Motoristas que finalizaram entre:</p>
          <div className="cg-duplo"><input type="number" min={0} placeholder="mínimo" value={f.corridasMin} onChange={(e) => set("corridasMin", e.target.value)} /><span>e</span><input type="number" min={0} placeholder="máximo" value={f.corridasMax} onChange={(e) => set("corridasMax", e.target.value)} /><span>corridas</span></div>
          <h4 className="cg-secao">Categorias do motorista *</h4>
          <div className="cg-caixas">{(cats.dados?.categorias ?? []).map((c) => <label key={c}><input type="checkbox" checked={f.categorias.includes(c)} onChange={() => setF({ ...f, categorias: f.categorias.includes(c) ? f.categorias.filter((x) => x !== c) : [...f.categorias, c] })} />{c}</label>)}</div>
          <p style={{ color: "var(--cg-suave)", fontSize: 12 }}>Sem categoria marcada, o desafio vale para todas.</p>
        </>
      )}
      {passo === 3 && (
        <>
          <h4 className="cg-secao">Confirmar novo desafio</h4>
          <div className="cg-resumo-linha"><span>Motoristas desafiados</span><strong>{previa.dados ? previa.dados.motoristas : "Calculando..."}</strong></div>
          <div className="cg-resumo-linha"><span>Recompensa</span><strong>{dinheiro(Number(f.premio.replace(",", ".")) || 0)}</strong></div>
          <div className="cg-resumo-linha"><span>Expectativa de gasto máximo</span><strong>Até {dinheiro(previa.dados?.gastoMaximo)} (em créditos)</strong></div>
          <p style={{ color: "var(--cg-suave)", fontSize: 12 }}>Após a conclusão do desafio e a aprovação da recompensa, o valor é depositado na carteira de créditos do motorista.</p>
        </>
      )}
    </Janela>
  );
}
