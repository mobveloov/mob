import { api, dataHora, dinheiro, numero, STATUS_UI } from "../api";
import { useSessao } from "../App";
import { Avisos, Cartao, Kpi, Titulo, useCarregar } from "../componentes/ui";

/** Acompanhamento ao vivo: corridas em aberto e as últimas 2 horas, de todas as origens. */
export default function Acompanhamento() {
  const { marca } = useSessao();
  const { dados, erro, carregando } = useCarregar(() => api.corridas({ ultimasHoras: 2 }), [], 20_000);
  const abertas = dados?.corridas.filter((c) => c.grupo === "aberta") ?? [];
  const recentes = dados?.corridas.filter((c) => c.grupo !== "aberta").slice(0, 30) ?? [];
  const origem = (n: string) => (marca.mostrarOrigem && (dados?.opcoes.origens.length ?? 0) > 1 ? <span className="selo">{n}</span> : null);
  return (
    <>
      <Titulo titulo="Acompanhamento" sub={`Atualiza sozinho a cada 20 segundos${carregando ? " · atualizando..." : ""}`} />
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      <div className="kpis">
        <Kpi rotulo="Em aberto agora" valor={numero(abertas.length)} tom="info" />
        <Kpi rotulo="Últimas 2 horas" valor={numero(dados?.resumo.total)} />
        <Kpi rotulo="Canceladas (2h)" valor={numero(dados?.resumo.canceladas)} tom="ruim" />
        <Kpi rotulo="Não atendidas (2h)" valor={numero(dados?.resumo.naoAtendidas)} tom="alerta" />
      </div>
      <div className="grade">
        <Cartao titulo="Em aberto">
          {!abertas.length ? <p className="vazio">Nenhuma corrida em aberto.</p> : (
            <ul className="lista">{abertas.map((c) => (
              <li key={c.id}><strong>OS {c.os}</strong> <span className={`selo ${STATUS_UI[c.grupo].classe}`}>{c.statusTexto}</span> {origem(c.origemNome)}<br />
                <small>{dataHora(c.solicitadaEm)} · {c.embarque || c.cidade} · {c.motorista || "sem motorista"}</small></li>
            ))}</ul>
          )}
        </Cartao>
        <Cartao titulo="Recentes">
          {!recentes.length ? <p className="vazio">Nada nas últimas 2 horas.</p> : (
            <ul className="lista">{recentes.map((c) => (
              <li key={c.id}><strong>OS {c.os}</strong> <span className={`selo ${STATUS_UI[c.grupo].classe}`}>{c.statusTexto}</span> {origem(c.origemNome)} {dinheiro(c.valor)}<br />
                <small>{dataHora(c.solicitadaEm)} · {c.categoria} · {c.motorista || "—"}{c.motivoCancelamento ? ` · ${c.motivoCancelamento}` : ""}</small></li>
            ))}</ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
