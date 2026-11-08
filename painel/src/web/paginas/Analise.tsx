import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { api, diasAtrasIso, hojeIso, type Filtro, type Relatorio } from "../api";
import { useSessao } from "../App";
import { Cartao, Periodo, Titulo } from "../componentes/ui";
import { RelatorioIa } from "../componentes/RelatorioIa";

/** Análise com IA de um período inteiro: relatório completo e plano de ação. */
export default function Analise() {
  const { marca } = useSessao();
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(29), fim: hojeIso() });
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function gerar() {
    setGerando(true); setErro(null);
    try { setRel(await api.relatorio(filtro)); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setGerando(false); }
  }
  return (
    <>
      <Titulo titulo={`Análise com ${marca.assistente.nome}`} sub="Relatório e plano de ação escritos por IA, em cima dos números das corridas." />
      <Cartao>
        <p>Escolha o período. {marca.assistente.nome} junta as corridas de todas as integrações, calcula os números e escreve a análise. Você não precisa enviar nada.</p>
        <div className="linha-filtro">
          <Periodo valor={filtro} onChange={setFiltro} rapidos={false} />
          <button className="botao primario" onClick={gerar} disabled={gerando}>{gerando ? <Loader2 size={16} className="gira" /> : <Sparkles size={16} />} {gerando ? "Analisando..." : "Gerar relatório"}</button>
        </div>
        <ul className="dicas">
          <li>Os números são calculados no código. A IA só escreve os textos em cima deles.</li>
          <li>O relatório traz alertas, resumo, cancelamentos, categorias, valores, motoristas, distâncias, horários, casos fora do padrão e recomendações.</li>
          <li>O plano de ação traz problemas, 3 ações imediatas, metas e checklist para aprovar.</li>
          <li>Em <Link to="/corridas">Consultar corridas</Link>, "Exportar relatório" faz o mesmo com o filtro da tela.</li>
        </ul>
      </Cartao>
      {erro && <div className="aviso erro">{erro}</div>}
      <RelatorioIa rel={rel} onFechar={() => setRel(null)} nomeBase={`analise-${filtro.inicio}_a_${filtro.fim}`} />
    </>
  );
}
