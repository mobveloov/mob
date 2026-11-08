import { useMemo, useState } from "react";
import { api, dataHora, diasAtrasIso, hojeIso, numero, type Filtro } from "../api";
import { Avisos, Barras, Cartao, Kpi, Periodo, Titulo, useCarregar } from "../componentes/ui";

/** Avaliações (NPS): notas das corridas, por motorista e por nota, de todas as origens. */
export default function Avaliacoes() {
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(29), fim: hojeIso() });
  const { dados, erro } = useCarregar(() => api.corridas({ ...filtro, grupo: "finalizada" }), [JSON.stringify(filtro)]);
  const av = useMemo(() => (dados?.corridas ?? []).filter((c) => c.avaliacao != null), [dados]);
  const notas = [5, 4, 3, 2, 1].map((n) => ({ rotulo: `${n} ★`, valor: av.filter((c) => Math.round(c.avaliacao!) === n).length }));
  const promotores = av.filter((c) => c.avaliacao! >= 5).length, detratores = av.filter((c) => c.avaliacao! <= 3).length;
  const nps = av.length ? Math.round(((promotores - detratores) / av.length) * 100) : null;
  const media = av.length ? av.reduce((a, c) => a + c.avaliacao!, 0) / av.length : null;
  const porMotorista = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const c of av) if (c.motorista) m.set(c.motorista, [...(m.get(c.motorista) ?? []), c.avaliacao!]);
    return [...m.entries()].map(([nome, l]) => ({ nome, media: l.reduce((a, b) => a + b, 0) / l.length, qtd: l.length })).sort((a, b) => a.media - b.media);
  }, [av]);
  return (
    <>
      <Titulo titulo="Avaliações" sub="Notas que os passageiros deram às corridas finalizadas." />
      <Cartao><Periodo valor={filtro} onChange={setFiltro} rapidos={false} /></Cartao>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      <div className="kpis">
        <Kpi rotulo="Nota média" valor={media != null ? numero(media, 2) : "—"} detalhe={`${av.length} avaliações`} />
        <Kpi rotulo="NPS" valor={nps != null ? String(nps) : "—"} detalhe="% notas 5 menos % notas até 3" tom={nps != null && nps < 50 ? "alerta" : "ok"} />
        <Kpi rotulo="Corridas avaliadas" valor={dados?.resumo.finalizadas ? `${numero((av.length / dados.resumo.finalizadas) * 100, 0)}%` : "—"} detalhe={`de ${numero(dados?.resumo.finalizadas)} finalizadas`} />
      </div>
      <div className="grade">
        <Cartao titulo="Notas"><Barras itens={notas} /></Cartao>
        <Cartao titulo="Motoristas (menor nota primeiro)">
          <Barras itens={porMotorista.slice(0, 15).map((m) => ({ rotulo: m.nome, valor: Math.round(m.media * 100) / 100, extra: `${m.qtd} aval.` }))} formato={(n) => numero(n, 2)} />
        </Cartao>
        <Cartao titulo="Notas baixas (até 3)" className="largo">
          {!av.filter((c) => c.avaliacao! <= 3).length ? <p className="vazio">Nenhuma nota baixa no período.</p> : (
            <ul className="lista">{av.filter((c) => c.avaliacao! <= 3).slice(0, 50).map((c) => (
              <li key={c.id}><strong>OS {c.os}</strong> · {c.avaliacao} ★ · {c.motorista || "—"}<br /><small>{dataHora(c.solicitadaEm)} · {c.passageiro || c.telefonePassageiro} · {c.categoria}</small></li>
            ))}</ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
