import { useEffect, useState } from "react";
import { Ban, Clock, Info, RefreshCw, Search, Send } from "lucide-react";
import { infoGatilho } from "../../crm/catalogo.ts";
import { Cartao, useCarregar } from "../componentes/ui";
import { automacao } from "./api-automacao";
import { ate, BarraPausa, classeEnvio, Contagem, hora, Paginador, ROTULO_ENVIO, useAtrasado } from "./automacao-comum";
import { useGestor, useRetorno } from "./comum";

type Visao = "pending" | "processed" | "canceled" | "all";

/** Dados do envio guardados na hora do evento (número da corrida e valor). */
function variaveis(carga: string): { os?: string; valor?: string } | null {
  try { return (JSON.parse(carga) as { vars?: Record<string, string> }).vars ?? null; } catch { return null; }
}

/** CRM › Automação › Fila de Dispatches: gatilhos com atraso esperam aqui até a hora de sair. */
export default function Fila() {
  const [visao, setVisao] = useState<Visao>("pending");
  const [gatilho, setGatilho] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const q = useAtrasado(busca, 400);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  useEffect(() => { setPagina(0); }, [visao, gatilho, q]);
  // A fila anda sozinha (o trabalhador roda a cada 15 s): atualiza a cada 30 s enquanto a aba está aberta.
  const { dados, erro, recarregar } = useCarregar(() => automacao.fila({ visao, gatilho, busca: q, pagina }), [visao, gatilho, q, pagina], 30_000);
  const nomes = new Map((dados?.gatilhos ?? []).map((g) => [g.id, g]));
  const s = dados?.stats;
  const abas: Array<[Visao, string, number, "info" | "ok" | undefined]> = [
    ["pending", "Pendentes", s?.pending ?? 0, "info"], ["processed", "Processados", s?.processed ?? 0, "ok"], ["canceled", "Cancelados", s?.canceled ?? 0, undefined], ["all", "Todos", s?.all ?? 0, undefined],
  ];
  const agir = async (id: string, acao: "cancelar" | "agora", nome: string) => {
    if (acao === "cancelar" && !confirm(`Cancelar o envio para ${nome}?`)) return;
    await tentar(() => automacao.agirNaFila(id, acao));
    recarregar();
  };

  return (
    <div className="pilha">
      <BarraPausa />
      <Cartao>
        <p style={{ margin: 0 }}><Info size={14} /> Gatilhos com atraso esperam aqui até a hora de sair (ex.: <strong>simulou e não pediu</strong> espera 10 min). Se o passageiro pedir ou fizer corrida antes, o envio é <strong>cancelado sozinho</strong>. A fila roda a cada minuto.</p>
      </Cartao>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="kpis">
        {abas.map(([k, l, n, tom]) => <Contagem key={k} rotulo={l} valor={n} tom={tom} ativo={visao === k} onClick={() => setVisao(k)} />)}
      </div>
      {visao === "pending" && (s?.due_1h ?? 0) > 0 && <small className="sub">{s!.due_1h.toLocaleString("pt-BR")} saem na próxima hora.</small>}
      {visao === "processed" && <small className="sub">Enviados: {(s?.sent ?? 0).toLocaleString("pt-BR")} · Falhas: {(s?.failed ?? 0).toLocaleString("pt-BR")}</small>}
      <div className="linha-filtro">
        <span style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 13 }} />
          <input style={{ paddingLeft: 30, width: "100%" }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar passageiro ou telefone..." />
        </span>
        <div className="acoes">
          <select value={gatilho} onChange={(e) => setGatilho(e.target.value)}>
            <option value="">Todos os gatilhos</option>
            {(dados?.gatilhos ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="icone" aria-label="Atualizar" onClick={recarregar}><RefreshCw size={14} /></button>
        </div>
      </div>
      {dados && !dados.linhas.length && <Cartao><p className="vazio"><Clock size={16} /> {visao === "pending" ? "Nenhum envio esperando na fila." : "Nada por aqui."}</p></Cartao>}
      {dados?.linhas.map((l) => {
        const g = nomes.get(l.gatilho_id);
        const v = variaveis(l.carga);
        const esperando = l.estado === "pending" || l.estado === "processing";
        return (
          <Cartao key={l.id}>
            <div className="linha-filtro" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: "0 0 4px" }}>
                  <span className={`selo ${classeEnvio(l.estado)}`}>{ROTULO_ENVIO[l.estado] ?? l.estado}</span>{" "}
                  <strong>{g?.name ?? "Gatilho removido"}</strong>
                  {g && <small className="sub"> · {infoGatilho(g.type)?.label ?? g.type}</small>}
                </p>
                <p style={{ margin: "0 0 4px" }}>
                  {l.nome || "Sem nome"} · {l.telefone}
                  {v?.os ? <small className="sub"> · OS {v.os}</small> : null}
                  {v?.valor ? <small className="sub"> · {v.valor}</small> : null}
                </p>
                <small className="sub">
                  Entrou {hora(l.criado_em)} · {esperando ? <>sai {hora(l.sai_em)} <strong>({ate(l.sai_em)})</strong></> : <>programado para {hora(l.sai_em)}</>}
                </small>
                {!esperando && !v && l.mensagem && <p style={{ margin: "4px 0 0" }}><small className="sub">{l.mensagem.slice(0, 200)}</small></p>}
                {l.erro && <p style={{ margin: "4px 0 0" }}><small style={{ color: l.estado === "failed" ? "var(--ruim)" : "var(--alerta)" }}>Motivo: {l.erro}</small></p>}
              </div>
              {gestor && l.estado === "pending" && (
                <div className="acoes">
                  <button className="botao" onClick={() => agir(l.id, "agora", l.nome || l.telefone)}><Send size={14} /> Enviar agora</button>
                  <button className="botao perigo" onClick={() => agir(l.id, "cancelar", l.nome || l.telefone)}><Ban size={14} /> Cancelar</button>
                </div>
              )}
            </div>
          </Cartao>
        );
      })}
      {dados && <Paginador pagina={pagina} total={dados.total} onPagina={setPagina} />}
    </div>
  );
}
