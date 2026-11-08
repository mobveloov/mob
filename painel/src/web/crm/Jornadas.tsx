import { useEffect, useRef, useState } from "react";
import { Play, Plus, Save, Trash2 } from "lucide-react";
import { Cartao, Gaveta, Titulo, useCarregar } from "../componentes/ui";
import { crm, quando, type Jornada } from "./api";
import { EditorRegras, useAdmin, useRetorno, Variaveis } from "./comum";

const NOVA: Partial<Jornada> = { nome: "", ativa: false, gatilho: { tipo: "sem-corrida", dias: 15 }, publico: { tipo: "passageiro" }, texto: "Oi {primeiro_nome}! Faz {dias_sem_corrida} dias que você não pede uma corrida com a {empresa}. Estamos esperando você!", cupom: "" };
const GATILHO: Record<string, string> = { "sem-corrida": "Sem corrida há", cancelou: "Cancelou a última corrida há até" };

/** CRM › Jornadas e gatilhos: mensagem automática quando a pessoa some ou cancela. Roda sozinha a cada hora. */
export default function CrmJornadas() {
  const { dados, erro, recarregar } = useCarregar(() => crm.jornadas(), [], 15_000);
  const [editando, setEditando] = useState<Partial<Jornada> | null>(null);
  const { tentar, caixa } = useRetorno();
  const admin = useAdmin();
  return (
    <>
      <Titulo titulo="Jornadas e gatilhos" sub="Mensagens automáticas: quem some ou cancela recebe uma vez (até voltar a pedir). Confere a cada hora.">
        {admin && <button className="botao primario" onClick={() => setEditando({ ...NOVA })}><Plus size={14} /> Nova jornada</button>}
      </Titulo>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {!admin && <div className="aviso">Só o administrador cria e liga jornadas.</div>}
      <div className="grade">
        {dados?.jornadas.map((j) => (
          <Cartao key={j.id} titulo={j.nome}>
            <p><span className={`selo ${j.ativa ? "ok" : ""}`}>{j.ativa ? "Ligada" : "Desligada"}</span> <small className="sub">{GATILHO[j.gatilho.tipo]} {j.gatilho.dias} dias · {j.publico.tipo === "motorista" ? "motoristas" : "passageiros"}{j.cupom ? ` · cupom ${j.cupom}` : ""}</small></p>
            <p style={{ whiteSpace: "pre-wrap" }}>{j.texto}</p>
            <div className="dado"><span>Pessoas alcançadas</span><strong>{j.alcancados}</strong></div>
            <div className="dado"><span>Enviadas / na fila</span><strong>{j.enviados} / {j.pendentes}</strong></div>
            <div className="dado"><span>Última conferência</span><strong>{quando(j.ultimaRodada)}</strong></div>
            {admin && (
              <div className="acoes">
                <button className="botao" onClick={() => setEditando(j)}>Editar</button>
                <button className="botao" onClick={() => tentar(() => crm.salvarJornada(j.id, { ...j, ativa: !j.ativa }), j.ativa ? "Jornada desligada." : "Jornada ligada.").then(recarregar)}>{j.ativa ? "Desligar" : "Ligar"}</button>
                <button className="botao" onClick={() => tentar(() => crm.rodarJornada(j.id), (r) => `${r.naFila} mensagens na fila.`).then(recarregar)}><Play size={14} /> Conferir agora</button>
                <button className="icone" aria-label="Apagar" onClick={() => confirm(`Apagar "${j.nome}"?`) && tentar(() => crm.apagarJornada(j.id), "Jornada apagada.").then(recarregar)}><Trash2 size={14} /></button>
              </div>
            )}
          </Cartao>
        ))}
        {dados && !dados.jornadas.length && <Cartao><p className="vazio">Nenhuma jornada ainda.</p></Cartao>}
      </div>
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando?.id ? "Editar jornada" : "Nova jornada"} larga>
        {editando && <Editor inicial={editando} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
    </>
  );
}

function Editor({ inicial, onSalvo }: { inicial: Partial<Jornada>; onSalvo: () => void }) {
  const [j, setJ] = useState<Partial<Jornada>>(inicial);
  const [alcance, setAlcance] = useState<number | null>(null);
  const cupons = useCarregar(() => crm.cupons(), []);
  const { tentar, caixa } = useRetorno();
  const campo = useRef<HTMLTextAreaElement>(null);
  const g = j.gatilho ?? { tipo: "sem-corrida", dias: 15 };
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => crm.contarJornada({ gatilho: g, publico: j.publico }).then((r) => vivo && setAlcance(r.total)).catch(() => {}), 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([g, j.publico])]);
  const inserir = (v: string) => { const t = j.texto ?? "", i = campo.current?.selectionStart ?? t.length; setJ({ ...j, texto: t.slice(0, i) + v + t.slice(i) }); };
  const salvar = async () => {
    const corpo = { nome: j.nome, ativa: j.ativa, gatilho: g, publico: j.publico, texto: j.texto, cupom: j.cupom };
    const r = j.id ? await tentar(() => crm.salvarJornada(j.id!, corpo)) : await tentar(() => crm.novaJornada(corpo));
    if (r) onSalvo();
  };
  return (
    <div className="form">
      {caixa}
      <label>Nome<input value={j.nome ?? ""} onChange={(e) => setJ({ ...j, nome: e.target.value })} placeholder="Ex.: Sumiu há 15 dias" /></label>
      <h3 className="sub">Gatilho</h3>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        <label>Quando
          <select value={g.tipo} onChange={(e) => setJ({ ...j, gatilho: { ...g, tipo: e.target.value as Jornada["gatilho"]["tipo"] } })}>
            <option value="sem-corrida">Sem corrida há X dias</option>
            <option value="cancelou">Cancelou a última corrida (até X dias)</option>
          </select>
        </label>
        <label>Dias (X)<input type="number" min={1} max={365} value={g.dias} onChange={(e) => setJ({ ...j, gatilho: { ...g, dias: Number(e.target.value) } })} /></label>
      </div>
      <h3 className="sub">Filtro extra do público (opcional)</h3>
      <EditorRegras regras={j.publico ?? { tipo: "passageiro" }} onChange={(publico) => setJ({ ...j, publico })} />
      <div className="aviso">Com o gatilho, hoje <strong>{alcance ?? "..."}</strong> pessoas receberiam (quem já recebeu e não pediu de novo fica de fora).</div>
      <h3 className="sub">Mensagem</h3>
      <label>Texto<textarea ref={campo} rows={5} value={j.texto ?? ""} onChange={(e) => setJ({ ...j, texto: e.target.value })} /></label>
      <Variaveis onInserir={inserir} />
      <label>Cupom (do cadastro de cupons)
        <select value={j.cupom ?? ""} onChange={(e) => setJ({ ...j, cupom: e.target.value })}>
          <option value="">Sem cupom</option>
          {cupons.dados?.cupons.map((x) => <option key={x.codigo} value={x.codigo} disabled={!x.valido}>{x.codigo}{x.valido ? "" : " (desligado ou fora do prazo)"}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={!!j.ativa} onChange={(e) => setJ({ ...j, ativa: e.target.checked })} /> Ligada (envia sozinha)</label>
      <div className="acoes"><button className="botao primario" onClick={salvar}><Save size={14} /> Salvar</button></div>
    </div>
  );
}
