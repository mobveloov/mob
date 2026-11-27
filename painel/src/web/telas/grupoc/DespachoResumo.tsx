// Config › Despacho (Machine): resumo só de leitura do jeito que a central despacha (disparos, quantos motoristas e a que distância)
// e o link para as configurações (Gerais › Despacho). As regras do funil do painel de referência ficam logo abaixo.

import { Aviso, Cab, Carregando, pedirConfig, useCarregar } from "../demais/comum";
import { RegrasDespacho } from "../demais/ConfigRegras";

const NOME_TIPO: Record<string, string> = { proximidade: "Despacho por Proximidade", apoio_proximidade: "Despacho por Ponto de apoio (fila) + Proximidade", area_proximidade: "Despacho por Área (fila) + Proximidade" };
const km = (n: number) => String(n).replace(".", ",");

export function DespachoResumo() {
  const d = useCarregar(() => pedirConfig("/bandeira"), []);
  const b = d.dados;
  // Valores reais do despacho (Regras de Despacho): tentativas e tempo em pendência da empresa e das filiais.
  const rg = useCarregar(() => pedirConfig("/despacho"), []).dados as { maxTentativas?: number; tempoPendencia?: number; pendenciaFilial?: Record<string, number> } | null;
  const tentativas = rg?.maxTentativas ?? b?.tentativas ?? 0;
  const pendMin = rg?.tempoPendencia ?? b?.expiracaoPendenciaMin ?? 0;
  const proprios = Object.values(rg?.pendenciaFilial ?? {});
  const incluindo = (x: { secundarios: boolean; transbordo: boolean }) => {
    const partes = [x.secundarios && "motoristas de apoio", x.transbordo && "de bandeiras parceiras"].filter(Boolean);
    return partes.length ? `, incluindo ${partes.join(" e ")}` : "";
  };
  return (
    <>
      <Cab titulo="Despacho" />
      <Aviso erro={d.erro} />
      {!b ? <Carregando /> : (
        <section className="dm-cartao">
          <p>Nesta seção você encontra as configurações de despacho de sua central. Para alterá-las, acesse as <a href="/config-gerais?aba=despacho">configurações de despacho</a>.</p>
          <p>Sua central está configurada por: <strong>{NOME_TIPO[b.tipoDespacho]}</strong></p>
          <div className="tabela-rola"><table>
            <thead><tr><th>Disparo *</th><th>Tipo de despacho</th><th>Onde Toca</th></tr></thead>
            <tbody>
              {b.disparos.map((x: any, i: number) => (
                <tr key={i}><td>{i + 1}º Disparo</td><td>Proximidade</td><td>Toca em {x.motoristas > 0 ? `${x.motoristas} motoristas` : "todos os motoristas disponíveis"} {x.km > 0 ? `a menos de ${km(x.km)} km` : "dentro do raio inicial"}{incluindo(x)}</td></tr>
              ))}
              <tr><td>{tentativas + 1}º Disparo</td><td>Pendência **</td><td>A corrida fica disponível para os motoristas a menos de {km(b.distanciaPendenciaKm)} km{incluindo({ secundarios: true, transbordo: true })}, durante mais {pendMin} minutos antes de se tornar não atendida{proprios.length ? ` (${proprios.length} ${proprios.length === 1 ? "filial tem" : "filiais têm"} tempo próprio, de ${Math.min(...proprios)} a ${Math.max(...proprios)} minutos)` : ""}</td></tr>
            </tbody>
          </table></div>
          <p className="sub">* Os disparos ocorrem em intervalos de 10 segundos.</p>
          <p className="sub">** Corridas de aplicativos entram em pendência.</p>
          <p className="sub">As corridas oriundas de aplicativos são disparadas por proximidade e seguem as respectivas configurações.</p>
        </section>
      )}
      <h2 className="dm-sep">Regras do funil de despacho (painel de referência)</h2>
      <RegrasDespacho />
    </>
  );
}
