import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, dataHora, dinheiro } from "../api";
import { useCarregar } from "./ui";

const PROXIMO: Record<string, Array<[string, string]>> = {
  a_caminho: [["no_local", "Chegou no local"], ["em_andamento", "Iniciar corrida"]],
  no_local: [["em_andamento", "Iniciar corrida"]],
  em_andamento: [["finalizada", "Finalizar"]],
  procurando: [["nao_atendida", "Marcar como não atendida"]],
};

/** Ações da corrida própria (criada no painel, bot ou totem): motorista, status, finalizar, cancelar e histórico. */
export function AcoesCorridaPropria({ id, onMudou }: { id: string; onMudou: () => void }) {
  const idInterno = id.replace(/^propria:/, "");
  const { dados, recarregar } = useCarregar(() => api.corridaPropria(idInterno), [idInterno]);
  const motoristas = useCarregar(() => api.registros("motoristas"), []);
  const [motorista, setMotorista] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!dados) return <p className="vazio"><Loader2 size={14} className="gira" /> Carregando ações...</p>;
  const c = dados.corrida;
  const aberta = ["procurando", "a_caminho", "no_local", "em_andamento"].includes(c.status);
  const fazer = async (f: () => Promise<unknown>) => {
    setOcupado(true); setErro(null);
    try { await f(); recarregar(); onMudou(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setOcupado(false); }
  };
  const ativos = (motoristas.dados?.registros ?? []).filter((m) => m.status === "Ativo");
  return (
    <div className="acoes-corrida">
      <h3>Ações</h3>
      {c.estimativa.valor != null && <p className="sub">Preço estimado: {dinheiro(c.estimativa.valor)}{c.estimativa.distanciaKm != null ? ` · ${c.estimativa.distanciaKm} km` : ""}</p>}
      {aberta && c.status !== "em_andamento" && (
        <div className="linha-acao">
          <select value={motorista} onChange={(e) => setMotorista(e.target.value)} aria-label="Motorista">
            <option value="">{ativos.length ? "Escolha o motorista" : "Nenhum motorista ativo no cadastro"}</option>
            {ativos.map((m) => <option key={m.id} value={m.id}>{String(m.nome)}{m.placa ? ` · ${m.placa}` : ""}</option>)}
          </select>
          <button className="botao primario" disabled={!motorista || ocupado} onClick={() => fazer(() => api.atribuirMotorista(c.id, motorista))}>{c.motoristaId ? "Trocar" : "Atribuir"}</button>
        </div>
      )}
      {(PROXIMO[c.status] ?? []).map(([s, rotulo]) => s === "finalizada" ? (
        <div key={s} className="linha-acao">
          <input inputMode="decimal" placeholder={c.estimativa.valor != null ? `Valor (estimado ${dinheiro(c.estimativa.valor)})` : "Valor da corrida"} value={valor} onChange={(e) => setValor(e.target.value)} />
          <button className="botao primario" disabled={ocupado} onClick={() => fazer(() => api.mudarStatusCorrida(c.id, s, valor ? Number(valor.replace(/\./g, "").replace(",", ".")) : undefined))}>{rotulo}</button>
        </div>
      ) : <button key={s} className="botao" disabled={ocupado} onClick={() => fazer(() => api.mudarStatusCorrida(c.id, s))}>{rotulo}</button>)}
      {aberta && (
        <div className="linha-acao">
          <input placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <button className="botao" disabled={ocupado || !motivo.trim()} onClick={() => confirm("Cancelar esta corrida?") && fazer(() => api.cancelarCorridaPropria(c.id, "Central", motivo))}>Cancelar corrida</button>
        </div>
      )}
      {erro && <div className="aviso erro">{erro}</div>}
      <h3>Histórico</h3>
      <ul className="lista">{c.historico.slice().reverse().map((h, i) => (
        <li key={i}><strong>{dados.statusTexto[h.status] ?? h.status}</strong> · {dataHora(h.em)}<br /><small>{h.por}{h.nota ? ` · ${h.nota}` : ""}</small></li>
      ))}</ul>
    </div>
  );
}
