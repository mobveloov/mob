import { useState } from "react";
import { Plus, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { waOptOutKey } from "../../crm/optout.ts";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { crm, quandoReal, type DescadastroCrm } from "./api";
import { useAdmin, useRetorno } from "./comum";

const ORIGEM: Record<string, string> = { resposta: "Respondeu a mensagem", atendente: "Atendente (contato)", conversas: "Atendente (Conversas)" };
function formatarTelefone(p: string) {
  const d = p.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

/** CRM › Comunicação › Descadastros: quem pediu para não receber mais WhatsApp. */
export default function Descadastros() {
  const { dados, erro, recarregar } = useCarregar(() => crm.descadastros(), [], 15_000);
  const [filtro, setFiltro] = useState<"descadastrado" | "autorizado" | "todos">("descadastrado");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState("");
  const [reativando, setReativando] = useState<DescadastroCrm | null>(null);
  const { tentar, caixa } = useRetorno();
  const admin = useAdmin();

  const linhas = (dados?.descadastros ?? []).filter((r) => filtro === "todos" || r.estado === filtro);
  const s = busca.trim().toLowerCase(), sk = waOptOutKey(s);
  const mostradas = s ? linhas.filter((r) => r.nome.toLowerCase().includes(s) || (sk.length >= 4 && r.chave.includes(sk))) : linhas;

  const adicionar = async () => {
    const d = novo.replace(/\D/g, "");
    if (waOptOutKey(d).length < 10) return alert("Digite o número com DDD.");
    if (!confirm(`Descadastrar ${formatarTelefone(d)} das mensagens de WhatsApp do CRM?`)) return;
    if (await tentar(() => crm.descadastrar(d), "Número descadastrado.")) { setNovo(""); recarregar(); }
  };

  return (
    <div className="pilha">
      <Cartao>
        <p>Quem respondeu <b>NÃO QUERO MAIS</b> ou <b>DESCADASTRAR</b> (ou PARAR, SAIR, CANCELAR logo depois de uma campanha) não recebe mais WhatsApp do CRM: campanhas, gatilhos e jornadas. Push e In-App continuam. A conferência é feita antes de cada envio.</p>
      </Cartao>
      <div className="linha-filtro">
        <div className="periodo">
          {(["descadastrado", "autorizado", "todos"] as const).map((f) => (
            <button key={f} className={filtro === f ? "chip ativo" : "chip"} onClick={() => setFiltro(f)}>{f === "descadastrado" ? "Descadastrados" : f === "autorizado" ? "Reativados" : "Todos"}</button>
          ))}
        </div>
        <div className="acoes">
          <span style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", left: 10, top: 13 }} /><input style={{ paddingLeft: 30 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou número" /></span>
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Descadastrar número" />
          <button className="botao" disabled={!novo.trim()} onClick={adicionar}><Plus size={14} /> Descadastrar</button>
        </div>
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !mostradas.length ? <Cartao><p className="vazio"><ShieldOff size={16} /> {filtro === "descadastrado" ? "Ninguém descadastrado do WhatsApp." : "Nada para mostrar."}</p></Cartao> : (
        <Cartao>
          <div className="tabela-rola"><table>
            <thead><tr><th>Nome</th><th>Número</th><th>Data</th><th>Status</th><th>Como</th><th></th></tr></thead>
            <tbody>{mostradas.map((r) => (
              <tr key={r.chave}>
                <td>{r.nome || "Sem nome"}</td>
                <td>{formatarTelefone(r.telefone)}</td>
                <td>{quandoReal(r.em)}{r.estado === "autorizado" && <small className="sub"><br />reativado {quandoReal(r.reativado_em)}{r.reativado_por ? ` por ${r.reativado_por}` : ""}</small>}</td>
                <td><span className={`selo ${r.estado === "descadastrado" ? "ruim" : "ok"}`}>{r.estado === "descadastrado" ? "Descadastrado" : "Autorizado"}</span></td>
                <td>{ORIGEM[r.origem] ?? (r.origem || "-")}
                  {r.texto && <small className="sub"><br />"{r.texto}"</small>}
                  {r.por && <small className="sub"><br />por {r.por}</small>}
                  {r.estado === "autorizado" && r.autorizacao && <small className="sub"><br />Autorização: {r.autorizacao}</small>}
                </td>
                <td>{admin && r.estado === "descadastrado" && <button className="botao" onClick={() => setReativando(r)}>Reativar</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Cartao>
      )}
      <Gaveta aberta={!!reativando} onFechar={() => setReativando(null)} titulo="Reativar WhatsApp">
        {reativando && <Reativar linha={reativando} onFeito={() => { setReativando(null); recarregar(); }} />}
      </Gaveta>
    </div>
  );
}

function Reativar({ linha, onFeito }: { linha: DescadastroCrm; onFeito: () => void }) {
  const [aut, setAut] = useState("");
  const [ok, setOk] = useState(false);
  const { tentar, caixa, setMsg } = useRetorno();
  const salvar = async () => {
    if (aut.trim().length < 5) return setMsg({ texto: "Descreva quando e como o passageiro autorizou voltar a receber.", erro: true });
    if (!ok) return setMsg({ texto: "Confirme que o passageiro autorizou de forma expressa.", erro: true });
    if (await tentar(() => crm.reativar(linha.telefone, aut.trim()))) onFeito();
  };
  return (
    <div className="pilha">
      <p>{linha.nome || "Sem nome"} · {formatarTelefone(linha.telefone)} pediu para sair em {quandoReal(linha.em)}. Só reative com uma nova autorização expressa do passageiro. Fica registrado quem reativou e quando.</p>
      <label>Como o passageiro autorizou?
        <textarea rows={3} value={aut} onChange={(e) => setAut(e.target.value)} style={{ width: "100%" }} placeholder='Ex.: em 10/11 às 14h ele escreveu no WhatsApp "quero voltar a receber as promoções".' />
      </label>
      <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> O passageiro autorizou de forma expressa a voltar a receber mensagens pelo WhatsApp.</label>
      {caixa}
      <div className="acoes"><button className="botao" onClick={onFeito}>Cancelar</button><button className="botao primario" onClick={salvar}><ShieldCheck size={14} /> Reativar</button></div>
    </div>
  );
}
