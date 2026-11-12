// Cadastro › Indicações: painel de crescimento (embaixadores, metas batidas, comissões) e recompensas. Servidor: /api/gestao/indicacoes.

import { useState } from "react";
import { api, type Registro } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dataHoraBr, dinheiro, Selo, useAviso, Vazio } from "./base";

interface Resposta {
  periodo: { inicio: string; fim: string };
  kpis: { total: number; metas: number; pago: number; gastoTotal: number };
  historico: Array<{ em: string; papelNovato: string; novato: string; papelEmbaixador: string; embaixador: string; metaBatida: boolean; comissao: number }>;
  motoristas: Array<{ nome: string; convites: number; ganho: number }>;
  passageiros: Array<{ nome: string; convites: number; ganho: number }>;
}
const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["esta_semana", "Esta Semana"], ["semana_passada", "Semana Passada"], ["este_mes", "Este Mês"], ["mes_passado", "Mês Passado"], ["este_ano", "Este Ano"], ["todo", "Todo o Período"], ["personalizado", "Personalizado..."]];

export default function Indicacoes() {
  const [f, setF] = useState({ periodo: "este_mes", inicio: "", fim: "" });
  const [filtro, setFiltro] = useState(f);
  const [aba, setAba] = useState<"historico" | "motoristas" | "passageiros">("historico");
  const l = useCarregar(() => chamar<Resposta>("GET", `/indicacoes${consulta(filtro)}`), [filtro]);
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      <Cabecalho titulo="Dashboard de Indicações" sub="Acompanhe as métricas de crescimento e embaixadores da sua cidade.">
        <select aria-label="Período" value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value })} style={{ width: 180 }}>{PERIODOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        {f.periodo === "personalizado" && <><input type="date" aria-label="Início" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} style={{ width: 150 }} /><span>até</span><input type="date" aria-label="Fim" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} style={{ width: 150 }} /></>}
        <button className="cg-botao primario" onClick={() => setFiltro(f)}>Filtrar</button>
      </Cabecalho>
      <div className="cg-kpis">
        <div className="cg-kpi"><span>Total de Indicações</span><strong>{d?.kpis.total ?? 0}</strong><small>Usuários que se cadastraram via link</small></div>
        <div className="cg-kpi"><span>Metas Batidas</span><strong>{d?.kpis.metas ?? 0}</strong><small>Novatos que completaram as corridas</small></div>
        <div className="cg-kpi"><span>Pago p/ Embaixadores</span><strong>{dinheiro(d?.kpis.pago)}</strong><small>Comissões pagas por trazer gente</small></div>
        <div className="cg-kpi"><span>Gasto Total com Ação</span><strong>{dinheiro(d?.kpis.gastoTotal)}</strong><small>Comissões + Bônus Boas Vindas</small></div>
      </div>
      <Abas itens={[{ id: "historico" as const, rotulo: "Histórico Completo" }, { id: "motoristas" as const, rotulo: "Top Motoristas" }, { id: "passageiros" as const, rotulo: "Top Passageiros" }]} valor={aba} onChange={setAba} />
      <div className="cg-tabela-caixa">
        {aba === "historico" && (
          <>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--cg-borda)" }}><strong>Últimos Cadastros por Indicação</strong> <small className="cg-mono">Mostrando até 100 registros</small></div>
            {!d?.historico.length ? <Vazio titulo="Nenhum registro encontrado neste período." /> : (
              <div className="cg-rolagem"><table className="cg-tabela">
                <thead><tr><th>Data/Hora</th><th>Quem Indicou (Embaixador)</th><th>Novo Usuário (Novato)</th><th>Status da Meta</th><th>Comissão Prometida</th></tr></thead>
                <tbody>{d.historico.map((h, i) => <tr key={i}><td>{dataHoraBr(h.em)}</td><td>{h.embaixador} <small className="cg-mono">{h.papelEmbaixador}</small></td><td>{h.novato} <small className="cg-mono">{h.papelNovato}</small></td>
                  <td><Selo tom={h.metaBatida ? "ok" : "alerta"}>{h.metaBatida ? "Meta batida" : "Pendente"}</Selo></td><td>{dinheiro(h.comissao)}</td></tr>)}</tbody>
              </table></div>
            )}
          </>
        )}
        {aba !== "historico" && (
          <>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--cg-borda)" }}><strong>{aba === "motoristas" ? "Top Motoristas Embaixadores" : "Top Passageiros Embaixadores"}</strong></div>
            {!d?.[aba].length ? <Vazio titulo={aba === "motoristas" ? "Nenhum motorista indicou neste período." : "Nenhum passageiro indicou neste período."} /> : (
              <div className="cg-rolagem"><table className="cg-tabela">
                <thead><tr><th>Posição</th><th>{aba === "motoristas" ? "Motorista" : "Passageiro"}</th><th>Total de Convites</th><th>Total Ganho (Comissões)</th></tr></thead>
                <tbody>{d[aba].map((x, i) => <tr key={x.nome + i}><td>{i + 1}º</td><td>{x.nome}</td><td>{x.convites}</td><td>{dinheiro(x.ganho)}</td></tr>)}</tbody>
              </table></div>
            )}
          </>
        )}
      </div>
      <Recompensas onMudou={() => l.recarregar()} />
    </div>
  );
}

/** Recompensas por indicação: um desafio de indicação para passageiro e outro para motorista (prêmio por meta batida). */
function Recompensas({ onMudou }: { onMudou: () => void }) {
  const r = useCarregar(() => api.registros("desafios"), []);
  const { aviso, tentar } = useAviso();
  const TIPOS = ["Indicação de passageiro", "Indicação de motorista"];
  const salvar = (tipo: string, atual: Registro | undefined, premio: number, meta: number, ativo: boolean) => tentar(async () => {
    const corpo = { ...(atual ?? {}), nome: atual?.nome ?? `Recompensa: ${tipo}`, tipo, meta, premio, ativo, inicio: atual?.inicio ?? new Date().toISOString().slice(0, 10) };
    if (atual) await api.salvarRegistro("desafios", atual.id, corpo); else await api.criarRegistro("desafios", corpo);
    r.recarregar(); onMudou();
  }, "Recompensa salva.");
  return (
    <div className="cg-tabela-caixa" style={{ marginTop: 16, padding: 16 }}>
      {aviso}
      <strong>Recompensas de indicação</strong>
      <div className="cg-cartoes" style={{ marginTop: 12 }}>{TIPOS.map((tipo) => {
        const atual = r.dados?.registros.find((x) => x.tipo === tipo);
        return <Linha key={tipo + (atual?.id ?? "")} tipo={tipo} atual={atual} onSalvar={salvar} />;
      })}</div>
    </div>
  );
}

function Linha({ tipo, atual, onSalvar }: { tipo: string; atual?: Registro; onSalvar: (t: string, a: Registro | undefined, premio: number, meta: number, ativo: boolean) => void }) {
  const [premio, setPremio] = useState(String(atual?.premio ?? ""));
  const [meta, setMeta] = useState(String(atual?.meta ?? "1"));
  const [ativo, setAtivo] = useState(atual ? atual.ativo === true : true);
  return (
    <div className="cg-cartao">
      <h4>{tipo}</h4>
      <Campo rotulo="Recompensa (R$)"><input inputMode="decimal" value={premio} onChange={(e) => setPremio(e.target.value)} /></Campo>
      <Campo rotulo="Meta de corridas do novato"><input type="number" min={1} value={meta} onChange={(e) => setMeta(e.target.value)} /></Campo>
      <label className="cg-interruptor"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /><i /><span>Ativa</span></label>
      <button className="cg-botao primario" onClick={() => onSalvar(tipo, atual, Number(premio.replace(",", ".")) || 0, Number(meta) || 1, ativo)}>Salvar</button>
    </div>
  );
}
