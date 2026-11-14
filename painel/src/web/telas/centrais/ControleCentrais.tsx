// Controle financeiro de centrais: por central, exibir extrato, débito automático e conta online (Cobrança).
// A principal define débito e conta das associadas; a associada decide se a principal pode ver o extrato dela.
import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { Aviso, Cab, Carregando, Modal, dataBr, dinheiro, useCarregar, useSalvar } from "../demais/comum";
import { AbrirAssociada } from "./AbrirAssociada";
import { baixarCsvCentrais, pedirCentrais } from "./comum";

const DICAS = {
  extrato: "A associada decide se a central principal pode ver o extrato dela. A principal nunca vê nomes de motoristas ou passageiros.",
  debito: "Define de qual conta sai a cobrança da plataforma: da própria central ou da central principal.",
  conta: "Define qual conta online (recebimentos) a central usa: a própria ou a da central principal.",
};
const OPCOES = {
  exibirExtrato: ["Não permitir", "Permitir"],
  debitoAutomatico: ["Usar conta desta central", "Usar conta da central principal"],
  contaOnline: ["Conta própria", "Conta da central principal"],
} as const;
const Dica = ({ texto }: { texto: string }) => <span className="cc-dica" title={texto} aria-label={texto}><Info size={13} /></span>;

export function ControleCentrais() {
  const d = useCarregar(() => pedirCentrais("/controle"), []);
  const rede = useCarregar(() => pedirCentrais("/rede"), []);
  const { msg, salvar } = useSalvar();
  const [busca, setBusca] = useState(""), [abrir, setAbrir] = useState(false), [extrato, setExtrato] = useState<{ id: string; nome: string } | null>(null);
  const [vincular, setVincular] = useState("");
  const linhas = useMemo(() => (d.dados?.linhas ?? []).filter((l: any) => `${l.rotulo}`.toLowerCase().includes(busca.trim().toLowerCase())), [d.dados, busca]);
  const mudar = (id: string, campo: string, valor: string) => salvar(async () => { await pedirCentrais(`/controle/${id}`, "PUT", { [campo]: valor }); d.recarregar(); }, "Controle atualizado.");
  const atualizar = () => { d.recarregar(); rede.recarregar(); window.dispatchEvent(new Event("central-foco")); };
  const principalId = d.dados?.linhas?.[0]?.id;
  const plataforma = (rede.dados?.livres?.length ?? 0) > 0;
  return (
    <>
      <Cab titulo="Controle financeiro de centrais" sub="Por central: exibir extrato, débito automático e conta online">
        {rede.dados?.podeAbrir && <button className="botao primario" onClick={() => setAbrir(true)}>Abrir uma central associada</button>}
      </Cab>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao dm-filtros"><input type="search" placeholder="Buscar por central..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar por central" /></div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Central</th><th>Exibir extrato da central <Dica texto={DICAS.extrato} /></th><th>Débito automático <Dica texto={DICAS.debito} /></th><th>Conta online <Dica texto={DICAS.conta} /></th><th /></tr></thead>
          <tbody>
            {!d.dados ? <tr><td colSpan={5}><Carregando /></td></tr> : !linhas.length ? <tr><td colSpan={5} className="vazio">Nenhuma central encontrada.</td></tr> : linhas.map((l: any) => (
              <tr key={l.id}>
                <td>{l.rotulo}{l.tipo === "principal" && <span className="selo info cc-selo">Principal</span>}{!l.ativa && <span className="selo ruim cc-selo">Desativada</span>}</td>
                {(["exibirExtrato", "debitoAutomatico", "contaOnline"] as const).map((campo) => (
                  <td key={campo}>
                    {l.tipo === "principal" ? <span className="cc-fixo">{campo === "exibirExtrato" ? "—" : campo === "debitoAutomatico" ? "Usar conta desta central" : "Conta própria"}</span> : (
                      <select value={l.controle[campo]} disabled={!l.pode[campo]} onChange={(e) => mudar(l.id, campo, e.target.value)} aria-label={`${campo} de ${l.nome}`}>
                        {OPCOES[campo].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    )}
                  </td>
                ))}
                <td className="cc-acoes">
                  {(l.id === principalId || l.controle.exibirExtrato === "Permitir") && <button className="botao" onClick={() => setExtrato({ id: l.id, nome: l.nome })}>Ver extrato</button>}
                  {plataforma && l.tipo === "associada" && l.id !== principalId && <button className="botao" onClick={() => { if (confirm(`Desfazer o vínculo de ${l.nome} com a central principal?`)) salvar(async () => { await pedirCentrais(`/associadas/${l.id}`, "DELETE"); atualizar(); }, "Vínculo desfeito."); }}>Desvincular</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {plataforma && (
        <div className="dm-cartao dm-filtros">
          <strong>Plataforma: ligar uma empresa existente como associada</strong>
          <select value={vincular} onChange={(e) => setVincular(e.target.value)} aria-label="Empresa a ligar"><option value="">Escolha a empresa</option>{rede.dados.livres.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
          <button className="botao" disabled={!vincular} onClick={() => salvar(async () => { await pedirCentrais("/vincular", "POST", { centralId: vincular }); setVincular(""); atualizar(); }, "Empresa ligada à central principal.")}>Ligar</button>
        </div>
      )}
      <AbrirAssociada aberto={abrir} onFechar={() => setAbrir(false)} onCriada={atualizar} />
      <ExtratoJanela alvo={extrato} onFechar={() => setExtrato(null)} />
    </>
  );
}

function ExtratoJanela({ alvo, onFechar }: { alvo: { id: string; nome: string } | null; onFechar: () => void }) {
  const d = useCarregar(() => (alvo ? pedirCentrais(`/extrato/${alvo.id}?periodo=mes_atual`) : Promise.resolve(null)), [alvo?.id]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  return (
    <Modal aberto={!!alvo} onFechar={onFechar} titulo={`Extrato da central: ${alvo?.nome ?? ""}`} sub="Mês atual" larga>
      <Aviso erro={d.erro ?? msg?.erro} />
      {!x ? <Carregando /> : (
        <>
          <div className="dm-kpis">
            <div className="dm-kpi"><small>Saldo atual</small><strong>{dinheiro(x.saldoAtual)}</strong></div>
            <div className="dm-kpi"><small>Entradas</small><strong className="txt-ok">{dinheiro(x.totalEntradas)}</strong></div>
            <div className="dm-kpi"><small>Saídas</small><strong className="txt-ruim">{dinheiro(x.totalSaidas)}</strong></div>
          </div>
          <div className="tabela-rola"><table>
            <thead><tr><th>Dia</th><th>Descrição</th><th>Valor</th></tr></thead>
            <tbody>{!x.dias.length ? <tr><td colSpan={3} className="vazio">Sem movimentos no mês.</td></tr> : x.dias.flatMap((dia: any) => dia.movimentos.map((m: any) => (
              <tr key={m.id}><td>{dataBr(dia.dia)}</td><td>{m.descricao}{m.detalhe && <small className="bloco">{m.detalhe}</small>}</td><td className={m.tipo === "entrada" ? "txt-ok" : "txt-ruim"}>{m.tipo === "entrada" ? "+" : "-"}{dinheiro(m.valor)}</td></tr>
            )))}</tbody>
          </table></div>
          <div className="dm-rodape-modal"><button className="botao" onClick={() => salvar(() => baixarCsvCentrais(`/extrato/${alvo!.id}/csv?periodo=mes_atual`, "extrato-da-central.csv"), "CSV exportado.")}><Download size={14} /> Exportar CSV</button></div>
        </>
      )}
    </Modal>
  );
}
