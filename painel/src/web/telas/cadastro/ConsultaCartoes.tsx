// Cadastro › Clientes › Consulta de cartões: cartões tokenizados dos passageiros (bandeira, final, validade, validado ou não).
// O painel nunca guarda nem mostra o número completo. Sem integração de cartão a lista fica vazia. Servidor: /api/gestao/cartoes-clientes.

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useSessao } from "../../App";
import { podeCargo } from "../../../comum/cargos";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, chamar, consulta, mascaraTel, Paginacao, Selo, useAviso, Vazio } from "./base";

interface Cartao { id: string; telefone: string; nome: string; bandeira: string; final: string; validade: string; validado: boolean; gateway: string; criadoEm: string }
interface Resposta { cartoes: Cartao[]; bandeiras: string[]; paginacao: { atual: number; totalPaginas: number }; kpis: { total: number; validados: number; naoValidados: number } }

export default function ConsultaCartoes() {
  const { sessao } = useSessao();
  const admin = podeCargo(sessao.usuario.papel, "admin");
  const [busca, setBusca] = useState(""), [bandeira, setBandeira] = useState(""), [status, setStatus] = useState(""), [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/cartoes-clientes${consulta({ busca, bandeira, status, pagina })}`), [busca, bandeira, status, pagina]);
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  const semFiltro = !busca && !bandeira && !status;
  const mudar = (f: () => void) => { f(); setPagina(1); };
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Consulta de cartões" sub="Cartões salvos pelos passageiros" />
      <p style={{ color: "var(--cg-suave)", margin: "0 0 14px" }}>Só aparecem a bandeira, o final e a validade. O número completo do cartão nunca é guardado aqui: ele fica com o meio de pagamento.</p>
      <div className="cg-kpis">
        <div className="cg-kpi"><span>Cartões</span><strong>{d?.kpis.total ?? 0}</strong></div>
        <div className="cg-kpi"><span>Validados</span><strong>{d?.kpis.validados ?? 0}</strong></div>
        <div className="cg-kpi"><span>Não validados</span><strong>{d?.kpis.naoValidados ?? 0}</strong></div>
      </div>
      <div className="cg-filtros-linha">
        <input placeholder="Buscar por nome, telefone ou final" aria-label="Buscar" value={busca} onChange={(e) => mudar(() => setBusca(e.target.value))} />
        <select aria-label="Bandeira" value={bandeira} onChange={(e) => mudar(() => setBandeira(e.target.value))}><option value="">Bandeira (todas)</option>{(d?.bandeiras ?? []).map((b) => <option key={b}>{b}</option>)}</select>
        <select aria-label="Situação do cartão" value={status} onChange={(e) => mudar(() => setStatus(e.target.value))}><option value="">Situação (todas)</option><option value="Validado">Validado</option><option value="Não validado">Não validado</option></select>
      </div>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      <div className="cg-tabela-caixa">
        {d && !d.cartoes.length ? <Vazio titulo={semFiltro ? "Nenhum cartão cadastrado." : "Nenhum cartão encontrado."} sub={semFiltro ? "Os cartões dos passageiros aparecem aqui quando o pagamento por cartão no app estiver ligado." : "Ajuste os filtros."} /> : (
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Passageiro</th><th>Cartão</th><th>Validade</th><th>Situação</th>{admin && <th className="direita">Ações</th>}</tr></thead>
            <tbody>{d?.cartoes.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nome || "Sem nome"}</strong><br /><small className="cg-mono">{mascaraTel(c.telefone)}</small></td>
                <td><CreditCard size={14} style={{ verticalAlign: "-2px" }} /> {c.bandeira} •••• {c.final}</td>
                <td>{c.validade || "—"}</td>
                <td><Selo tom={c.validado ? "ok" : "alerta"}>{c.validado ? "Validado" : "Não validado"}</Selo></td>
                {admin && <td className="direita"><button className="cg-botao perigo" onClick={() => confirm(`Remover o cartão ${c.bandeira} final ${c.final}?`) && void tentar(async () => { await chamar("DELETE", `/cartoes-clientes/${c.id}`); l.recarregar(); }, "Cartão removido.")}>Remover</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
        {!!d?.cartoes.length && <Paginacao atual={d.paginacao.atual} total={d.paginacao.totalPaginas} onChange={setPagina} />}
      </div>
    </div>
  );
}
