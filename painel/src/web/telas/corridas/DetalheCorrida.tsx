// Detalhes da corrida (cinco blocos de informação), Histórico da OS (linha do tempo e tabela do despacho) e Trajeto da OS (mapa com o
// percurso real), todos com os dados reais da corrida. Usados pela lista Consultar corridas e pelas janelas de corrida das outras telas.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, HelpCircle, Loader2 } from "lucide-react";
import { Aviso, Janela, L, Selo, dh, msgErro, op, pino, soDig, useDados, useMapa, zap } from "./comum";

// ------------------------------------------------------------------ formatos

const dd = (n: number) => String(n).padStart(2, "0");
/** "20/11/2026 12:25:24" (as datas do servidor já vêm no horário de Brasília). */
export const dataHoraSeg = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 19)}` : "---");
export const horaSeg = (s?: string | null) => (s ? s.slice(11, 19) : "---");
const km2 = (n?: number | null) => (n == null ? "---" : `${n.toFixed(2).replace(".", ",")} km`);
const km3 = (n?: number | null) => (n == null ? "---" : `${n.toFixed(3)} km`);
const min = (n?: number | null) => (n == null ? "---" : `${n} min`);
const brl = (n?: number | null) => (n == null ? "---" : `R$ ${n.toFixed(2).replace(".", ",")}`);
const foneBr = (s?: string | null) => { const d = soDig(s ?? ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : s || "---"; };

function Linha({ r, children }: { r: string; children: React.ReactNode }) {
  return <span className="oc-det-lin"><label>{r}</label><span>{children === "" || children == null ? "---" : children}</span></span>;
}

// ------------------------------------------------------------------ detalhes da corrida

export interface DadosMachine {
  chamada: any; aceite: any; inicio: any; encerramento: any; controle: any;
}

/** Os cinco blocos: Informações da chamada, do aceite, do início de corrida, de encerramento e de controle. */
export function BlocosDaCorrida({ m }: { m: DadosMachine }) {
  const c = m.chamada, a = m.aceite, i = m.inicio, e = m.encerramento, k = m.controle;
  return (
    <div className="oc-det-celulas">
      <div className="oc-det-cel">
        <h2>Informações da chamada</h2>
        <Linha r="Momento da solicitação">{dataHoraSeg(c.solicitadaEm)}</Linha>
        <Linha r="Bandeira da chamada">{c.bandeira}</Linha>
        <Linha r="Categoria">{c.categoria}</Linha>
        <Linha r="Tarifa">{c.tarifa}</Linha>
        <Linha r="Nome do passageiro">{c.passageiro}</Linha>
        <Linha r="Telefone do passageiro">{c.telefone ? <a href={zap(c.telefone)} target="_blank" rel="noreferrer">{foneBr(c.telefone)}</a> : "---"}</Linha>
        <Linha r="Telefone de cadastro">{c.telefoneCadastro ? <a href={zap(c.telefoneCadastro)} target="_blank" rel="noreferrer">{foneBr(c.telefoneCadastro)}</a> : "---"}</Linha>
        <Linha r="Local de embarque">{c.embarque}</Linha>
        <Linha r="Destino informado">{c.destino}</Linha>
        <Linha r="Forma de pagamento">{c.pagamento}</Linha>
        <Linha r="Motorista especificado">{c.motoristaEspecificado ? "Sim" : "Não"}</Linha>
        <Linha r="Distância do local de embarque até o destino informado (previsão)">{km2(c.previsaoKm)}</Linha>
        <Linha r="Tempo do local de embarque até o destino informado (previsão)">{min(c.previsaoMinutos)}</Linha>
        <Linha r="Valor previsto sem descontos">{brl(c.valorPrevisto)}</Linha>
        <Linha r="Desconto aplicado">{c.descontoPct != null ? `${c.descontoPct.toFixed(2).replace(".", ",")}%` : "0,00%"}</Linha>
        <Linha r="Valor previsto com desconto">{brl(c.valorPrevistoComDesconto)}</Linha>
      </div>
      <div className="oc-det-cel">
        <h2>Informações do aceite</h2>
        <Linha r="Motorista">{a?.motorista}</Linha>
        <Linha r="Telefone do motorista">{a?.telefone ? <a href={zap(a.telefone)} target="_blank" rel="noreferrer">{foneBr(a.telefone)}</a> : "---"}</Linha>
        <Linha r="Momento do aceite">{dataHoraSeg(a?.aceiteEm)}</Linha>
        <Linha r="Bandeira da corrida">{a?.bandeira}</Linha>
        <Linha r="Distância do local de aceite até o local de embarque (previsão)">{km2(a?.previsaoKm)}</Linha>
        <Linha r="Tempo do local de aceite até local de embarque (previsão)">{min(a?.previsaoMinutos)}</Linha>
      </div>
      <div className="oc-det-cel">
        <h2>Informações do início de corrida</h2>
        <Linha r="Momento que o motorista registrou chegada ao local de embarque">{dataHoraSeg(i.chegadaMotoristaEm)}</Linha>
        <Linha r="Momento que o GPS registrou chegada aos arredores do local de embarque">{dataHoraSeg(i.chegadaGpsEm)}</Linha>
        <Linha r="Momento que o motorista registrou início da corrida">{dataHoraSeg(i.inicioEm)}</Linha>
        <Linha r="Distância do local de aceite até o local de embarque (realizado)">{km3(i.realizadoKm)}</Linha>
        <Linha r="Tempo do local de aceite até o embarque (realizado)">{min(i.realizadoMinutos)}</Linha>
      </div>
      <div className="oc-det-cel">
        <h2>Informações de encerramento</h2>
        <Linha r="Momento que o motorista registrou o encerramento">{dataHoraSeg(e.encerramentoEm)}</Linha>
        <Linha r="Local de encerramento">{e.local}</Linha>
        <Linha r="Distância do início da corrida até o local de encerramento">{km3(e.realizadoKm)}</Linha>
        <Linha r="Tempo do início da corrida até o local de encerramento">{min(e.realizadoMinutos)}</Linha>
        <Linha r="Valor sem desconto">{brl(e.valorSemDesconto)}</Linha>
        <Linha r={e.valorFinal != null ? `Desconto de ${e.descontoPct ?? 0}%` : "Desconto"}>{e.valorFinal != null ? `R$ ${e.desconto ? "-" : ""}${(e.desconto ?? 0).toFixed(2).replace(".", ",")}` : "---"}</Linha>
        <Linha r="Valor final da corrida">{brl(e.valorFinal)}</Linha>
        <Linha r="Ganhos do motorista">{brl(e.ganhosMotorista)}</Linha>
        <Linha r="Taxa de serviço">{brl(e.taxaServico)}</Linha>
      </div>
      <div className="oc-det-cel">
        <h2>Informações de controle</h2>
        <Linha r="Corrida via">{k.via}</Linha>
        <Linha r="Sistema operacional">{k.sistema}</Linha>
        <Linha r="Tipo de despacho inicial">{k.tipoDespacho}</Linha>
        <Linha r="Houve eleição de um motorista em caso de múltiplos aceites">{k.eleicao ? "Sim" : "Não"}</Linha>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ conversa

/** "Conversa entre o motorista e o passageiro": quem escreveu, o texto e a hora. */
export function Conversa({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { dados, erro, carregando } = useDados<{ mensagens: any[] }>(() => op(`/corridas/${id}/chat`), [id], 8000);
  return (
    <Janela onFechar={onFechar} titulo={<>Conversa entre o <strong>motorista e o passageiro</strong></>} tamanho="estreita" nivel="alto"
      rodape={<button className="oc-btn pri" onClick={onFechar}>Voltar</button>}>
      <Aviso texto={erro} erro />
      <div className="oc-conversa">
        {carregando && !dados && <p className="oc-vazio"><Loader2 size={16} className="gira" /></p>}
        {dados && !dados.mensagens.length && <p className="oc-vazio">Nenhuma mensagem nesta corrida.</p>}
        {dados?.mensagens.map((m) => (
          <div key={m.id} className="oc-conversa-lin">
            <strong>{m.nome || (m.de === "motorista" ? "Motorista" : "Passageiro")}:</strong>
            <div>
              {m.audio ? <audio controls src={`/api/operacao/corridas/${id}/chat/audio/${m.audio.id}`} style={{ maxWidth: 220 }} /> : m.midia ? (
                m.midia.tipo === "video"
                  ? <video controls preload="metadata" src={`/api/operacao/corridas/${id}/chat/midia/${m.midia.id}`} style={{ maxWidth: 220, maxHeight: 220, display: "block" }} />
                  : <a href={`/api/operacao/corridas/${id}/chat/midia/${m.midia.id}`} target="_blank" rel="noreferrer"><img src={`/api/operacao/corridas/${id}/chat/midia/${m.midia.id}`} alt="Foto do chat" style={{ maxWidth: 220, maxHeight: 220, display: "block", borderRadius: 6 }} /></a>
              ) : m.texto}
              {m.midia?.legenda && <small className="suave"> {m.midia.legenda}</small>}
            </div>
            <em>{m.em ? new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : ""}</em>
          </div>
        ))}
      </div>
    </Janela>
  );
}

// ------------------------------------------------------------------ enviar recibo

/** "Enviar recibo": manda o resumo da corrida ao passageiro pelo WhatsApp (link do aparelho, sem chave de nenhum serviço). */
export function EnviarRecibo({ d, onFechar }: { d: any; onFechar: () => void }) {
  const c = d.corrida, m = d.machine;
  const texto = [
    `Recibo da corrida OS ${c.os}`, `Passageiro: ${c.passageiro.nome}`, `Embarque: ${c.embarque.texto}`, c.destino?.texto ? `Destino: ${c.destino.texto}` : "",
    m.aceite?.motorista ? `Motorista: ${m.aceite.motorista}` : "", `Pagamento: ${c.pagamento}`, `Valor final: ${brl(d.financeiro.final)}`,
  ].filter(Boolean).join("\n");
  const [copiado, setCopiado] = useState(false);
  const tel = soDig(m.chamada.telefone || c.passageiro.telefone);
  return (
    <Janela onFechar={onFechar} titulo="Enviar recibo" sub={`OS ${c.os} · ${foneBr(tel)}`} tamanho="estreita" nivel="centro"
      rodape={<>
        <button className="oc-btn" onClick={onFechar}>Cancelar</button>
        <button className="oc-btn" onClick={async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem área de transferência */ } }}>{copiado ? "Texto copiado" : "Copiar texto"}</button>
        <a className="oc-btn pri" href={`${zap(tel)}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" onClick={onFechar}>Enviar por WhatsApp</a>
      </>}>
      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{texto}</p>
    </Janela>
  );
}

// ------------------------------------------------------------------ histórico da OS (log da solicitação)

interface LinhaLog { id: number; em: string; tipo: string; rotulo: string; descricao: string; usuario: string; canal: string; tabela: Array<Record<string, any>> | null }

const Ajuda = ({ texto }: { texto: string }) => <span className="oc-ajuda" title={texto} aria-label={texto}><HelpCircle size={13} /></span>;

export function PaginaLog({ id, onVoltar, semTitulo }: { id: string; onVoltar: () => void; semTitulo?: boolean }) {
  const { dados, erro, carregando } = useDados<{ os: string; antiga: boolean; linhas: LinhaLog[] }>(() => op(`/corridas/${encodeURIComponent(id)}/log`), [id]);
  const primeiroDia = dados?.linhas[0]?.em.slice(0, 10);
  return (
    <div className="oc">
      {!semTitulo && <div className="oc-topo"><h1>Histórico da OS {dados?.os ?? ""}</h1></div>}
      <Aviso texto={erro} erro />
      {carregando && !dados && <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
      {dados && !dados.linhas.length && <p className="oc-vazio">Esta corrida ainda não tem eventos.</p>}
      {dados?.antiga && <Aviso texto="Esta corrida é de antes do registro de eventos: a linha do tempo foi montada do histórico dela." />}
      <div className="oc-log">
        {dados?.linhas.map((l) => (
          <div key={l.id} className="oc-log-evento">
            <h4>
              {l.em.slice(0, 10) !== primeiroDia && `${l.em.slice(8, 10)}/${l.em.slice(5, 7)} `}{horaSeg(l.em)} - {l.descricao}
              <small className="suave"> <Selo>{l.rotulo}</Selo>{l.usuario && l.usuario !== "sistema" ? ` · por ${l.usuario}` : ""}{l.canal ? ` · ${l.canal}` : ""}</small>
            </h4>
            {l.tabela && (
              <div className="oc-rola"><table className="oc-log-tabela">
                <thead><tr>
                  <th>VTR</th><th>Nome</th><th>Recebeu</th><th>Rejeitou</th><th>Candidatou-se</th><th>Priorizado por destino definido</th>
                  <th>Distância em linha reta <Ajuda texto="A distância em linha reta é usada para escolher os motoristas que estão mais próximos do passageiro no momento do despacho." /></th>
                  <th>Distância com rota <Ajuda texto="A distância com rota é usada para calcular a distância entre o motorista e o embarque do passageiro, e é mostrado para o motorista no momento do aceite." /></th>
                  <th>Tempo para chegar</th><th>Vencedor</th>
                </tr></thead>
                <tbody>{l.tabela.map((t, i) => (
                  <tr key={i}><td>{t.vtr || "---"}</td><td>{t.nome}</td><td>{t.recebeu ? "Sim" : "Não"}</td><td>{t.rejeitou ? "Sim" : "Não"}</td><td>{t.candidatou ? "Sim" : "Não"}</td><td>{t.priorizadoPorDestino ? "Sim" : "Não"}</td>
                    <td>{t.kmReta != null ? `${t.kmReta.toFixed(3).replace(".", ",")} km` : "---"}</td><td>{t.kmRota != null ? `${t.kmRota.toFixed(3).replace(".", ",")} km` : "---"}</td><td>{t.minutos != null ? `${t.minutos} min` : "---"}</td><td>{t.vencedor ? "Sim" : "Não"}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        ))}
      </div>
      <div className="oc-fila" style={{ marginTop: 18 }}><button className="oc-btn" onClick={onVoltar}><ArrowLeft size={15} /> Voltar</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ trajeto da OS

const DEG = (n: number) => n.toFixed(5);

export function PaginaTrajeto({ id, onVoltar, semTitulo }: { id: string; onVoltar: () => void; semTitulo?: boolean }) {
  const { dados: t, erro, carregando } = useDados<any>(() => op(`/corridas/${encodeURIComponent(id)}/trajeto`), [id], undefined);
  const { ref, mapa } = useMapa([-15.78, -47.93], 13);
  const grupo = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapa || !t) return;
    grupo.current?.remove();
    const g = L.layerGroup().addTo(mapa);
    grupo.current = g;
    const todos: Array<[number, number]> = [];
    const marca = (p: { lat?: number | null; lng?: number | null } | null | undefined, cor: string, letra: string, rotulo: string) => {
      if (!p || p.lat == null || p.lng == null) return;
      L.marker([p.lat, p.lng], { icon: pino(cor, letra) }).bindPopup(rotulo).addTo(g);
      todos.push([p.lat, p.lng]);
    };
    const pts: Array<{ lat: number; lng: number; fase: string; em: string }> = t.pontos ?? [];
    const ate = pts.filter((p) => p.fase === "embarque"), viagem = pts.filter((p) => p.fase === "viagem");
    // O trecho de ida ao embarque termina onde a viagem começa (a linha não pode ficar com buraco).
    const ida: Array<[number, number]> = ate.map((p) => [p.lat, p.lng]);
    const volta: Array<[number, number]> = viagem.map((p) => [p.lat, p.lng]);
    if (ida.length && volta.length) ida.push(volta[0]);
    if (ida.length > 1) L.polyline(ida, { color: "#f59e0b", weight: 5 }).addTo(g);
    if (volta.length > 1) L.polyline(volta, { color: "#22c55e", weight: 5 }).addTo(g);
    ida.forEach((p) => todos.push(p)); volta.forEach((p) => todos.push(p));
    if (!pts.length) {
      // Sem GPS gravado: só os pontos combinados da corrida, ligados por uma linha tracejada.
      const plano = [t.embarque, ...(t.paradas ?? []), t.destino].filter((p: any) => p?.lat != null && p?.lng != null);
      if (plano.length > 1) L.polyline(plano.map((p: any) => [p.lat, p.lng] as [number, number]), { color: "#60a5fa", weight: 4, dashArray: "8 8" }).addTo(g);
    }
    if (pts[0]) marca(pts[0], "#4f8cff", "A", `Aceite pelo motorista (${horaSeg(t.etapas.aceite.em)})`);
    marca(t.embarque, "#10b981", "I", `Local de embarque: ${t.embarque.texto}`);
    (t.paradas ?? []).forEach((p: any, i: number) => marca(p, "#f59e0b", String(i + 1), `Parada ${i + 1}: ${p.texto}`));
    marca(pts.length ? pts[pts.length - 1] : t.destino, "#ef4444", "F", pts.length ? `Fim do percurso gravado (${horaSeg(t.etapas.fim.em)})` : `Destino: ${t.destino?.texto ?? ""}`);
    for (const p of t.paradasDetectadas ?? []) {
      L.marker([p.lat, p.lng], { icon: pino("#64748b", "P", "ponto") }).bindPopup(`Parada de ${p.minutos} min (${horaSeg(p.desde)} a ${horaSeg(p.ate)})`).addTo(g);
    }
    if (todos.length) mapa.fitBounds(L.latLngBounds(todos).pad(0.2), { maxZoom: 17 });
  }, [mapa, t]);

  const e = t?.etapas;
  return (
    <div className="oc">
      {!semTitulo && <div className="oc-topo"><h1>Trajeto da OS {t?.os ?? ""}</h1></div>}
      <Aviso texto={erro} erro />
      {carregando && !t && <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
      {t?.semGps && <Aviso texto="Esta corrida não tem percurso gravado: o app do motorista não enviou posições durante a corrida. O mapa mostra só os pontos combinados." />}
      <div className="oc-trajeto-pag">
        <div ref={ref} className="oc-mapa" style={{ height: 660 }} />
        {t && (
          <aside className="oc-etapas">
            <h3>Etapas da corrida</h3>
            <div className="oc-etapa"><i style={{ background: "#4f8cff" }}>A</i><div>
              <b>Aceite pelo motorista</b>
              <p>Horário: {horaSeg(e.aceite.em)}</p><p>Distância: {km3(e.aceite.distanciaKm)}</p><p>Duração: {min(e.aceite.minutos)}</p>
            </div></div>
            <div className="oc-etapa"><i style={{ background: "#10b981" }}>I</i><div>
              <b>Início da corrida</b>
              <p>Horário: {horaSeg(e.inicio.em)}</p><p>Distância: {km3(e.inicio.distanciaKm)}</p><p>Duração: {min(e.inicio.minutos)}</p>
            </div></div>
            <div className="oc-etapa"><i style={{ background: "#ef4444" }}>F</i><div>
              <b>Final da corrida</b>
              <p>Horário: {horaSeg(e.fim.em)}</p>
            </div></div>
            <div className="oc-etapa-extra">
              <p><b>Total percorrido:</b> {km3(t.total.distanciaKm)} em {min(t.total.minutos)}</p>
              <p className="suave">Previsto: {km2(t.total.distanciaPrevistaKm)} e {min(t.total.minutosPrevistos)} · {t.totalPontos} pontos de GPS</p>
              {t.paradasDetectadas.length > 0 && <>
                <p><b>Pontos de parada</b></p>
                {t.paradasDetectadas.map((p: any, i: number) => <p key={i} className="suave">{horaSeg(p.desde)} a {horaSeg(p.ate)} · {p.minutos} min · {DEG(p.lat)}, {DEG(p.lng)}</p>)}
              </>}
              <p className="suave"><span style={{ color: "#f59e0b" }}>━</span> até o embarque · <span style={{ color: "#22c55e" }}>━</span> corrida</p>
            </div>
          </aside>
        )}
      </div>
      <div className="oc-fila" style={{ marginTop: 18 }}><button className="oc-btn" onClick={onVoltar}><ArrowLeft size={15} /> Voltar</button></div>
    </div>
  );
}

/** Mesmas páginas dentro de uma janela (quando a tela não tem o modo de página: Monitoramento, Ocorrências, Alteração de dados da OS). */
export function JanelaTrajeto({ id, os, onFechar }: { id: string; os: string; onFechar: () => void }) {
  return <Janela onFechar={onFechar} titulo={`Trajeto da OS ${os}`} tamanho="larga" nivel="alto"><PaginaTrajeto id={id} onVoltar={onFechar} semTitulo /></Janela>;
}
export function JanelaLog({ id, os, onFechar }: { id: string; os: string; onFechar: () => void }) {
  return <Janela onFechar={onFechar} titulo={`Histórico da OS ${os}`} tamanho="larga" nivel="alto"><PaginaLog id={id} onVoltar={onFechar} semTitulo /></Janela>;
}

export { dh, msgErro };
