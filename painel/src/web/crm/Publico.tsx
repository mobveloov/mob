import { useState } from "react";
import { BellOff, Bell, ListPlus, Trash2 } from "lucide-react";
import { dinheiro } from "../api";
import { Avisos, Cartao, Kpi, Titulo, useCarregar } from "../componentes/ui";
import { crm, quando, type Regras } from "./api";
import { EditorRegras, useRetorno } from "./comum";

/** CRM › Público e listas: passageiros e motoristas (cadastro + corridas), segmentos e listas salvas. */
export default function CrmPublico() {
  const [regras, setRegras] = useState<Regras>({ tipo: "passageiro" });
  const [busca, setBusca] = useState("");
  const r = { ...regras, busca: busca || undefined };
  const { dados, erro, recarregar } = useCarregar(() => crm.publico(r), [JSON.stringify(r)]);
  const listas = useCarregar(() => crm.listas(), []);
  const { tentar, caixa } = useRetorno();
  const [nomeLista, setNomeLista] = useState("");
  const [modo, setModo] = useState<"dinamica" | "fixa">("dinamica");

  const salvarLista = async () => {
    const ok = await tentar(() => crm.novaLista({ nome: nomeLista, modo, regras }), (x) => modo === "fixa" ? `Lista salva com ${x.total ?? 0} pessoas.` : "Segmento salvo. Ele recalcula a cada uso.");
    if (ok) { setNomeLista(""); listas.recarregar(); }
  };

  return (
    <>
      <Titulo titulo="Público e listas" sub="Passageiros e motoristas do seu cadastro, com o que fizeram nas corridas. Monte segmentos e salve como lista." />
      {caixa}
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      <div className="grade" style={{ gridTemplateColumns: "minmax(320px, 1fr) minmax(280px, 380px)" }}>
        <Cartao titulo="Segmento">
          <EditorRegras regras={regras} onChange={setRegras} opcoes={dados?.opcoes} listas={listas.dados?.listas} />
        </Cartao>
        <Cartao titulo="Salvar como lista">
          <div className="form">
            <label>Nome<input value={nomeLista} onChange={(e) => setNomeLista(e.target.value)} placeholder="Ex.: Sumidos de Cidade Norte" /></label>
            <label className="check"><input type="radio" checked={modo === "dinamica"} onChange={() => setModo("dinamica")} /> Segmento (recalcula sempre)</label>
            <label className="check"><input type="radio" checked={modo === "fixa"} onChange={() => setModo("fixa")} /> Lista fixa (guarda as pessoas de agora)</label>
            <button className="botao primario" disabled={nomeLista.trim().length < 2} onClick={salvarLista}><ListPlus size={14} /> Salvar</button>
          </div>
          <h3 className="sub" style={{ marginTop: 16 }}>Listas salvas</h3>
          {!listas.dados?.listas.length ? <p className="vazio">Nenhuma lista ainda.</p> : (
            <ul className="lista">
              {listas.dados.listas.map((l) => (
                <li key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span><strong>{l.nome}</strong><br /><small>{l.regras.tipo === "motorista" ? "Motoristas" : "Passageiros"} · {l.modo === "fixa" ? "fixa" : "segmento"} · {l.total} pessoas</small></span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button className="botao" onClick={() => setRegras({ tipo: l.regras.tipo, listaId: l.id })}>Ver</button>
                    <button className="icone" aria-label={`Apagar ${l.nome}`} onClick={() => confirm(`Apagar a lista "${l.nome}"?`) && tentar(() => crm.apagarLista(l.id), "Lista apagada.").then(() => listas.recarregar())}><Trash2 size={14} /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
      {dados && (
        <div className="kpis">
          <Kpi rotulo="No segmento" valor={dados.total} />
          <Kpi rotulo="Recebem WhatsApp" valor={dados.destinatarios} tom="ok" />
          <Kpi rotulo="Sem telefone" valor={dados.semTelefone} tom={dados.semTelefone ? "alerta" : undefined} />
          <Kpi rotulo="Não querem receber" valor={dados.optOut} />
        </div>
      )}
      <Cartao>
        <div className="linha-filtro"><strong>{regras.tipo === "motorista" ? "Motoristas" : "Passageiros"}</strong><input placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        {!dados ? <p className="vazio">Carregando...</p> : !dados.contatos.length ? <p className="vazio">Ninguém neste segmento.</p> : (
          <div className="tabela-rola"><table>
            <thead><tr><th>Nome</th><th>Telefone</th><th>Cidade</th><th className="num">Corridas</th><th className="num">Dias sem corrida</th>{regras.tipo === "passageiro" && <th className="num">Gasto</th>}<th>Última</th><th>Categorias</th><th>Recebe?</th></tr></thead>
            <tbody>{dados.contatos.map((c) => (
              <tr key={c.chave}>
                <td className="forte">{c.nome || "—"}{c.situacao && c.situacao !== "Ativo" && <> <span className="selo alerta">{c.situacao}</span></>}</td>
                <td>{c.telefone || "—"}</td><td>{c.cidade || "—"}</td><td className="num">{c.corridas}</td>
                <td className="num">{c.diasSemCorrida ?? "—"}</td>{regras.tipo === "passageiro" && <td className="num">{dinheiro(c.gasto)}</td>}
                <td>{quando(c.ultimaCorrida)}</td><td><small>{c.categorias.join(", ") || "—"}</small></td>
                <td>
                  <button className="botao" title={c.optOut ? "Voltar a receber mensagens" : "Marcar que não quer receber"} onClick={() => tentar(() => crm.optOut(c.chave, !c.optOut), c.optOut ? `${c.nome} volta a receber.` : `${c.nome} não recebe mais.`).then(recarregar)}>
                    {c.optOut ? <><BellOff size={14} /> Não</> : <><Bell size={14} /> Sim</>}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {dados?.cortado && <p className="sub">Mostrando 500 de {dados.total}. Use o segmento para achar quem você procura.</p>}
      </Cartao>
    </>
  );
}
