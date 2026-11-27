// Janela da corrida (Consultar corridas, Monitoramento, Ocorrências, Alteração de dados da OS): "Detalhes da corrida" com Trajeto, Histórico,
// Criar cópia, Enviar recibo, Exportar recibo e Alterar OS, os cinco blocos de informação e a conversa; mais as ações da central
// (Reenviar, Auditoria, Ver Lances, Rastrear, Cancelar). Em "embutida" ela aparece dentro da própria lista, sob a linha da corrida.
import { useEffect, useRef, useState } from "react";
import { Ban, ChevronDown, FileText, Gavel, Info, Loader2, MapPin, MessageCircle, Navigation, Phone, Radar, RefreshCw, Share2, ArrowLeft } from "lucide-react";
import { Aviso, Dado, GRUPO_CLASSE, Janela, L, dh, dhAno, fone, km, msgErro, op, pino, reais, Selo, useDados, useMapa, zap } from "./comum";
import { JanelaGravacoes } from "./Gravacoes";
import { useAdmin } from "./pagamentos-comum";
import { BlocosDaCorrida, Conversa, EnviarRecibo, JanelaLog, JanelaTrajeto, type DadosMachine } from "./DetalheCorrida";
import { ajustarSeguro } from "../../../comum/mapa-seguro.ts";

export interface Detalhe {
  corrida: any; statusTexto: string; painel: any; passageiro: any; motorista: any; datas: any; repasses: any[]; financeiro: any; machine: DadosMachine;
  podeCancelar: boolean; podeReenviar: boolean; podeRecibo: boolean; temLances: boolean; naoLidas: number;
}

const STATUS_EDITAR: Array<[string, string]> = [["procurando", "Aguardando"], ["a_caminho", "A Caminho"], ["no_local", "Chegou"], ["em_andamento", "Em Viagem"], ["finalizada", "Finalizada"], ["cancelada", "Cancelada"], ["nao_atendida", "Não Atendida"]];
const PAGAMENTOS_EDITAR = ["Dinheiro", "Pix", "Cartão na Maquininha", "Saldo da Carteira", "Cartão no App"];

type Sub = "" | "raiox" | "rastreio" | "editar" | "conversa" | "cancelar" | "legenda" | "lances" | "trajeto" | "log" | "enviar" | "gravacao";

export function JanelaCorrida({ id, onFechar, onMudou, editarDireto, embutida, onTrajeto, onLog, onCopia }: {
  id: string; onFechar: () => void; onMudou?: () => void; editarDireto?: boolean; embutida?: boolean;
  /** Quem mostra Trajeto e Histórico como página (Consultar corridas) passa estes; sem eles, abrem em janela. */
  onTrajeto?: (id: string) => void; onLog?: (id: string) => void; onCopia?: (id: string) => void;
}) {
  const { dados: d, erro, carregando, recarregar } = useDados<Detalhe>(() => op(`/corridas/${encodeURIComponent(id)}`), [id]);
  const admin = useAdmin();
  const [sub, setSub] = useState<Sub>(editarDireto ? "editar" : "");
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudou = () => { recarregar(); onMudou?.(); };

  async function reenviar() {
    if (!d || !confirm(`Reenviar a corrida ${d.corrida.os}? Será criada uma nova solicitação igual, procurando motorista.`)) return;
    setOcupado(true);
    try { const r = await op<{ corrida: { os: string } }>(`/corridas/${d.corrida.id}/reenviar`, {}); setMsg({ t: `Corrida reenviada como OS ${r.corrida.os}.` }); onMudou?.(); }
    catch (e) { setMsg({ t: msgErro(e), erro: true }); } finally { setOcupado(false); }
  }
  async function recibo() {
    if (!d) return;
    try {
      const r = await op<{ html: string }>(`/corridas/${d.corrida.id}/recibo`);
      const w = window.open("", "_blank", "width=720,height=900");
      if (!w) { setMsg({ t: "O navegador bloqueou a janela do recibo. Libere pop-ups para imprimir.", erro: true }); return; }
      w.document.write(r.html); w.document.close(); w.focus();
    } catch (e) { setMsg({ t: msgErro(e), erro: true }); }
  }
  async function cancelar(origem: string) {
    if (!d) return;
    setOcupado(true);
    try { await op(`/corridas/${d.corrida.id}/cancelar`, { origem }); setSub(""); setMsg({ t: "Corrida cancelada." }); mudou(); }
    catch (e) { setMsg({ t: msgErro(e), erro: true }); setSub(""); } finally { setOcupado(false); }
  }
  const semRecibo = () => setMsg({ t: "Corrida cancelada ou não atendida não tem recibo.", erro: true });
  const copiar = (cid: string) => (onCopia ? onCopia(cid) : window.location.assign(`/solicitar?copiar=${encodeURIComponent(cid)}`));

  const c = d?.corrida;
  const cancelada = c?.status === "cancelada";
  const cabecalho = d && (
    <div className="oc-det-cab">
      <div>
        <h1 className="oc-det-titulo">Detalhes da corrida</h1>
        <div className="oc-det-sub">
          <span><label>Nº OS</label>{c.os}</span>
          <span><label>Status</label><Selo tom={GRUPO_CLASSE[d.painel.grupo]}>{d.statusTexto}</Selo></span>
          {d.painel.fatorDinamico && d.painel.fatorDinamico !== 1 ? <Selo tom="alerta">Dinâmica</Selo> : null}
        </div>
      </div>
      <div className="oc-det-botoes">
        <button className="oc-btn ok" onClick={() => (onTrajeto ? onTrajeto(c.id) : setSub("trajeto"))}>Trajeto</button>
        <button className="oc-btn info" onClick={() => (onLog ? onLog(c.id) : setSub("log"))}>Histórico</button>
        {admin && <button className="oc-btn" onClick={() => setSub("gravacao")}>Gravações</button>}
        <button className="oc-btn" onClick={() => copiar(c.id)}>Criar cópia</button>
        <button className="oc-btn" onClick={() => (d.podeRecibo ? setSub("enviar") : semRecibo())}>Enviar recibo</button>
        <button className="oc-btn" onClick={() => (d.podeRecibo ? recibo() : semRecibo())}>Exportar recibo</button>
        <button className="oc-btn" onClick={() => setSub("editar")}>Alterar OS</button>
      </div>
    </div>
  );
  const corpo = (
    <>
      <Aviso texto={erro} erro />
      <Aviso texto={msg?.t} erro={msg?.erro} />
      {carregando && !d && <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
      {d && <>
        {cabecalho}
        <BlocosDaCorrida m={d.machine} />
        <p className="oc-det-conversa"><button className="oc-link" onClick={() => setSub("conversa")}>Conversa entre o <strong>motorista e o passageiro</strong></button>{d.naoLidas > 0 && <Selo tom="ruim">{d.naoLidas} nova{d.naoLidas > 1 ? "s" : ""}</Selo>}</p>
        <Extras d={d} />
        <div className="oc-det-extras">
          <b className="suave">Ações da central</b>
          <button className="oc-btn peq" onClick={() => setSub("rastreio")}><Navigation size={14} /> Rastrear</button>
          {d.podeReenviar && <button className="oc-btn peq" onClick={reenviar} disabled={ocupado}><RefreshCw size={14} /> Reenviar corrida</button>}
          <button className="oc-btn peq" onClick={() => setSub("raiox")}><Radar size={14} /> Auditoria (Raio-X)</button>
          {d.temLances && <button className="oc-btn peq" onClick={() => setSub("lances")}><Gavel size={14} /> Ver lances</button>}
          {d.podeCancelar && <button className="oc-btn peq ruim" onClick={() => setSub("cancelar")}><Ban size={14} /> Cancelar corrida</button>}
        </div>
      </>}
    </>
  );
  return (
    <>
      {embutida
        ? <div className="oc-det-embutida"><button className="oc-det-voltar" onClick={onFechar} aria-label="Fechar detalhes"><ArrowLeft size={20} /></button>{corpo}</div>
        : <Janela onFechar={onFechar} tamanho="larga" titulo="Detalhes da corrida">{corpo}</Janela>}
      {d && sub === "raiox" && <RaioX id={c.id} os={c.os} onFechar={() => setSub("")} />}
      {d && sub === "rastreio" && <Rastreio id={c.id} onFechar={() => setSub("")} onLegenda={() => setSub("legenda")} />}
      {d && sub === "legenda" && <Legenda onFechar={() => setSub("rastreio")} />}
      {d && sub === "conversa" && <Conversa id={c.id} onFechar={() => { setSub(""); mudou(); }} />}
      {d && sub === "enviar" && <EnviarRecibo d={d} onFechar={() => setSub("")} />}
      {d && sub === "trajeto" && <JanelaTrajeto id={c.id} os={c.os} onFechar={() => setSub("")} />}
      {d && sub === "gravacao" && <JanelaGravacoes corridaId={c.id} os={c.os} onFechar={() => setSub("")} />}
      {d && sub === "log" && <JanelaLog id={c.id} os={c.os} onFechar={() => setSub("")} />}
      {d && sub === "editar" && <EditarOS d={d} onFechar={() => setSub("")} onSalvou={() => { setSub(""); setMsg({ t: "Alterações salvas." }); mudou(); }} />}
      {d && sub === "lances" && <Janela onFechar={() => setSub("")} titulo="Lances da corrida" tamanho="estreita" nivel="alto"><p className="oc-vazio">Esta corrida não recebeu lances de motoristas.</p></Janela>}
      {d && sub === "cancelar" && (
        <Janela onFechar={() => setSub("")} titulo="Cancelar Corrida?" sub="Selecione quem solicitou o cancelamento para registro correto:" tamanho="estreita" nivel="centro">
          <div className="oc-fila" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <button className="oc-btn" disabled={ocupado} onClick={() => cancelar("central")}>Pela Central</button>
            <button className="oc-btn" disabled={ocupado} onClick={() => cancelar("passageiro")}>Pelo Passageiro</button>
            <button className="oc-btn" disabled={ocupado} onClick={() => cancelar("motorista")}>Pelo Motorista</button>
            <button className="oc-btn ruim" disabled={ocupado} onClick={() => cancelar("sistema")}>Erro / Outros</button>
            <button className="oc-btn" onClick={() => setSub("")}>Voltar</button>
          </div>
          {cancelada && <p className="suave">Esta corrida já está cancelada.</p>}
        </Janela>
      )}
    </>
  );
}

/** O que a central tem além dos blocos: paradas, motorista designado, repasses, cancelamento e observação. */
function Extras({ d }: { d: Detalhe }) {
  const c = d.corrida, f = d.financeiro, dt = d.datas;
  const cancelada = c.status === "cancelada";
  if (!d.repasses.length && !cancelada && !c.observacao && !c.infoAntes && !c.infoDepois && !c.infoInterna && !c.pagamentosAceitos?.length && !(c.paradas ?? []).length && !d.motorista) return null;
  return (
    <div className="oc-det-celulas" style={{ marginTop: 12 }}>
      {(c.paradas ?? []).length > 0 && <div className="oc-det-cel"><h2>Paradas</h2>{c.paradas.map((x: { texto: string }, i: number) => <span className="oc-det-lin" key={i}><label>Parada {i + 1}</label><span>{x.texto}</span></span>)}</div>}
      {d.motorista && <div className="oc-det-cel"><h2>Motorista designado {d.motorista.online ? <Selo tom="ok">Online</Selo> : <Selo>Offline</Selo>}</h2>
        <span className="oc-det-lin"><label>Veículo</label><span>{[d.motorista.veiculo, d.motorista.placa].filter(Boolean).join(" · ") || "---"}</span></span>
        <span className="oc-det-lin"><label>Contato</label><span><a href={zap(d.motorista.telefone)} target="_blank" rel="noreferrer">{fone(d.motorista.telefone)}</a></span></span></div>}
      {d.repasses.length > 0 && <div className="oc-det-cel"><h2>Histórico de repasses (quem pegou)</h2>
        {d.repasses.map((r, i) => <span className="oc-det-lin" key={i}><label>{r.motorista}</label><span>pegou às {dh(r.aceitouEm)}{r.saiuEm ? ` · saiu às ${dh(r.saiuEm)} (${r.motivo})` : " · está com a corrida"}</span></span>)}</div>}
      {cancelada && <div className="oc-det-cel"><h2 style={{ color: "var(--oc-ruim)" }}>Corrida cancelada · {dh(dt.cancelamento)}</h2>
        <span className="oc-det-lin"><label>Responsável</label><span>{c.canceladaPor || "---"}</span></span>
        <span className="oc-det-lin"><label>Taxa cobrada</label><span>{reais(f.taxaCancelamento)}</span></span>
        <span className="oc-det-lin"><label>Motivo registrado</label><span>{c.motivoCancelamento || "---"}</span></span></div>}
      {(c.infoAntes || c.infoDepois || c.infoInterna || c.pagamentosAceitos?.length) && <div className="oc-det-cel"><h2><Info size={13} /> Dados da solicitação</h2>
        {c.pagamentosAceitos?.length > 0 && <span className="oc-det-lin"><label>Formas de pagamento aceitas</label><span>{c.pagamentosAceitos.join(", ")}</span></span>}
        {c.infoAntes && <span className="oc-det-lin"><label>Informação antes do aceite</label><span>{c.infoAntes}</span></span>}
        {c.infoDepois && <span className="oc-det-lin"><label>Informação após o aceite</label><span>{c.infoDepois}</span></span>}
        {c.infoInterna && <span className="oc-det-lin"><label>Informação interna</label><span>{c.infoInterna}</span></span>}</div>}
      {c.observacao && <div className="oc-det-cel"><h2><Info size={13} /> Observação</h2><p style={{ margin: 0 }}>{c.observacao}</p></div>}
    </div>
  );
}

// ------------------------------------------------------------------ auditoria (raio-x)

function RaioX({ id, os, onFechar }: { id: string; os: string; onFechar: () => void }) {
  const { dados, erro, carregando } = useDados<any>(() => op(`/corridas/${id}/raiox`), [id]);
  const [aba, setAba] = useState<"ondas" | "timeline" | "regiao" | "aparelhos">("ondas");
  const abas: Array<[typeof aba, string]> = [["ondas", "Ondas de Envio"], ["timeline", "Timeline Técnica"], ["regiao", "Mot. da Região"], ["aparelhos", "Logs do Aparelho"]];
  return (
    <Janela onFechar={onFechar} titulo="Auditoria Avançada" sub={`Painel de Diagnóstico · OS ${os}`} tamanho="larga" nivel="alto">
      <Aviso texto={erro} erro />
      <div className="oc-abas">{abas.map(([k, r]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{r}</button>)}</div>
      {carregando && !dados && <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
      {dados && aba === "ondas" && (dados.ondas.length ? (
        <div className="oc-rola"><table><thead><tr><th>Hora</th><th>Etapa</th><th>Motorista</th><th>Veículo</th><th>Distância</th><th>Resultado</th></tr></thead><tbody>
          {dados.ondas.map((o: any) => <tr key={o.id}><td>{dh(o.oferecidaEm)}</td><td><Selo tom={o.etapa === "FAVORITOS" ? "rox" : "info"}>{o.etapa}</Selo></td><td className="forte">{o.nome || "—"}</td><td>{[o.veiculo, o.placa].filter(Boolean).join(" · ") || "—"}</td><td>{km(o.distanciaKm)}</td>
            <td><Selo tom={o.fim === "aceitou" ? "ok" : o.fim === "oferecida" ? "info" : "alerta"}>{o.resultado}</Selo>{o.fimEm && <small> {dh(o.fimEm)}</small>}</td></tr>)}
        </tbody></table></div>
      ) : <p className="oc-vazio">Nenhuma onda de envio registrada para esta corrida.</p>)}
      {dados && aba === "timeline" && (dados.timeline.length ? (
        <div className="oc-rola"><table><thead><tr><th>Hora</th><th>Evento</th></tr></thead><tbody>{dados.timeline.map((t: any, i: number) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{dhAno(t.em)}</td><td>{t.descricao}</td></tr>)}</tbody></table></div>
      ) : <p className="oc-vazio">Sem eventos.</p>)}
      {dados && aba === "regiao" && (dados.regiao.length ? (
        <div className="oc-rola"><table><thead><tr><th>Motorista</th><th>Placa</th><th>Distância</th><th>Situação agora</th></tr></thead><tbody>
          {dados.regiao.map((m: any) => <tr key={m.motoristaId}><td className="forte">{m.nome}</td><td>{m.placa || "—"}</td><td>{km(m.distanciaKm)}</td><td><Selo tom={m.motivo === "Apto" ? "ok" : "alerta"}>{m.motivo}</Selo></td></tr>)}
        </tbody></table></div>
      ) : <p className="oc-vazio">Nenhum motorista online na região agora.</p>)}
      {aba === "aparelhos" && <p className="oc-vazio">Os apps ainda não enviam o registro do aparelho. Quando enviarem, aparecem aqui.</p>}
    </Janela>
  );
}

// ------------------------------------------------------------------ rastreio

function Rastreio({ id, onFechar, onLegenda }: { id: string; onFechar: () => void; onLegenda: () => void }) {
  const { dados: r, erro } = useDados<any>(() => op(`/corridas/${id}/rastreio`), [id], 5000);
  const { ref, mapa } = useMapa(undefined, 13, true, { areas: false });
  const [estimada, setEstimada] = useState(true);
  const [real, setReal] = useState(true);
  const camadas = useRef<L.LayerGroup | null>(null);
  const trilha = useRef<Array<[number, number]>>([]);
  const ajustou = useRef(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!mapa || !r) return;
    camadas.current?.remove();
    const g = L.layerGroup().addTo(mapa);
    camadas.current = g;
    const pts: Array<[number, number]> = [];
    const add = (p: { lat?: number; lng?: number; texto?: string } | null, cor: string, t: string, rotulo: string) => {
      if (!p || p.lat == null || p.lng == null) return;
      L.marker([p.lat, p.lng], { icon: pino(cor, t) }).bindPopup(`<b>${rotulo}</b><br>${p.texto ?? ""}`).addTo(g);
      pts.push([p.lat, p.lng]);
    };
    add(r.embarque, "#10b981", "A", "Embarque");
    (r.paradas ?? []).forEach((p: any, i: number) => add(p, "#f59e0b", String(i + 1), `Parada ${i + 1}`));
    add(r.destino, "#ef4444", "B", "Destino");
    if (estimada && pts.length > 1) L.polyline(pts, { color: "#60a5fa", weight: 4, dashArray: "8 8" }).addTo(g);
    if (r.posicao) {
      const ult = trilha.current.at(-1);
      if (!ult || ult[0] !== r.posicao.lat || ult[1] !== r.posicao.lng) trilha.current.push([r.posicao.lat, r.posicao.lng]);
      if (real && trilha.current.length > 1) L.polyline(trilha.current, { color: "#22c55e", weight: 5 }).addTo(g);
      L.marker([r.posicao.lat, r.posicao.lng], { icon: pino("#4f8cff", "🚗") }).bindPopup(r.motorista?.nome ?? "Motorista").addTo(g);
      pts.push([r.posicao.lat, r.posicao.lng]);
    }
    if (pts.length && !ajustou.current) { if (ajustarSeguro(mapa, L.latLngBounds(pts).pad(0.25), { maxZoom: 16 })) ajustou.current = true; }
  }, [mapa, r, estimada, real]);

  async function compartilhar() {
    if (!r?.link) return;
    try { if (navigator.share) await navigator.share({ title: `Corrida OS ${r.os}`, url: r.link }); else { await navigator.clipboard.writeText(r.link); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } } catch { /* cancelou */ }
  }
  return (
    <Janela onFechar={onFechar} titulo="Rastreamento" sub="Monitoramento em Tempo Real" tamanho="larga" nivel="alto"
      acoes={<button className="oc-btn" onClick={compartilhar} disabled={!r?.link} title={r?.link ? "" : "Corrida sem link de acompanhamento"}><Share2 size={16} /> {copiado ? "Link copiado" : "Compartilhar"}</button>}
      rodape={<>
        <label className="oc-sw"><input type="checkbox" checked={estimada} onChange={(e) => setEstimada(e.target.checked)} /> Rota Estimada</label>
        <label className="oc-sw"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> Trajeto Real</label>
        <button className="oc-btn" onClick={onLegenda}><MapPin size={16} /> Legenda do Mapa</button>
        {r?.motorista && <a className="oc-btn" href={zap(r.motorista.telefone)} target="_blank" rel="noreferrer"><Phone size={16} /> Contatar Motorista</a>}
        <button className="oc-btn" onClick={onFechar}>Fechar</button>
      </>}>
      <Aviso texto={erro} erro />
      <div className="oc-rastreio">
        <div>
          {!r ? <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p> : <>
            <div className="oc-card"><h3>Detalhes da Viagem</h3><Dado r="Passageiro" v={r.passageiro} />
              <div className="oc-trajeto" style={{ marginTop: 10 }}>
                <div><i /><small>Embarque</small><b>{r.embarque.texto}</b></div>
                {r.paradas.map((p: any, i: number) => <div className="par" key={i}><i /><small>Parada {i + 1}</small><b>{p.texto}</b></div>)}
                <div className="dest"><i /><small>Desembarque Final</small><b>{r.destino?.texto ?? "Sem destino"}</b></div>
              </div>
              <Dado r="Horário do Pedido" v={dhAno(r.solicitadaEm)} /><Dado r="Situação" v={<Selo tom={r.aberta ? "info" : ""}>{r.statusTexto}</Selo>} /></div>
            <div className="oc-card"><h3>Motorista</h3>
              {r.motorista ? <><Dado r="Nome" v={r.motorista.nome} /><Dado r="Veículo" v={r.motorista.veiculo} /><div className="suave" style={{ marginTop: 8 }}>Placa do Veículo</div><div className="oc-plac">{r.motorista.placa || "---"}</div></> : <p className="suave">Nenhum motorista designado.</p>}
              {r.aberta && r.motorista && !r.posicao && <p className="suave">Sem posição do motorista agora.</p>}
              {r.aberta && <p className="suave"><RefreshCw size={12} /> Atualizando em tempo real</p>}
            </div>
          </>}
        </div>
        <div ref={ref} className="oc-mapa" />
      </div>
    </Janela>
  );
}

function Legenda({ onFechar }: { onFechar: () => void }) {
  const l: Array<[string, string, string?]> = [["Rota Estimada (traço azul)", "#60a5fa"], ["Trajeto Real (Percorrido)", "#22c55e"], ["Aguardando", "#fbbf24", "pt"], ["Em Andamento", "#60a5fa", "pt"], ["Finalizada", "#34d399", "pt"], ["Cancelada", "#f87171", "pt"]];
  return (
    <Janela onFechar={onFechar} titulo="Legenda do Mapa" sub="Cores e Linhas" tamanho="estreita" nivel="centro">
      <div className="oc-legenda">{l.map(([t, c, pt]) => <div key={t}><i className={pt} style={{ background: c }} /> {t}</div>)}</div>
    </Janela>
  );
}

// ------------------------------------------------------------------ editar OS

function EditarOS({ d, onFechar, onSalvou }: { d: Detalhe; onFechar: () => void; onSalvou: () => void }) {
  const c = d.corrida;
  const mots = useDados<{ motoristas: any[] }>(() => op("/motoristas"), []);
  const [f, setF] = useState({
    status: c.status as string, motoristaId: c.motoristaId ?? "", nome: c.passageiro.nome as string, telefone: c.passageiro.telefone as string,
    embarque: c.embarque.texto as string, destino: (c.destino?.texto ?? "") as string,
    valorInicial: c.estimativa?.valor != null ? String(c.estimativa.valor).replace(".", ",") : "",
    valorFinal: String(c.status === "cancelada" ? c.taxaCancelamento ?? "" : c.valor ?? "").replace(".", ","), pagamento: c.pagamento as string,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro(null);
    try { await op(`/corridas/${c.id}`, f, "PUT"); onSalvou(); } catch (x) { setErro(msgErro(x)); } finally { setSalvando(false); }
  }
  const pagamentos = PAGAMENTOS_EDITAR.includes(f.pagamento) ? PAGAMENTOS_EDITAR : [f.pagamento, ...PAGAMENTOS_EDITAR];
  return (
    <Janela onFechar={onFechar} titulo="Editar OS" sub={`OS ${c.os} · Modo de Edição Manual`} tamanho="media" nivel="alto"
      rodape={<><button className="oc-btn" onClick={onFechar} type="button">Cancelar</button><button className="oc-btn pri" form="form-editar-os" disabled={salvando}>{salvando ? <Loader2 size={16} className="gira" /> : null} Salvar Alterações</button></>}>
      <form id="form-editar-os" onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Aviso texto={erro} erro />
        <h3 className="suave" style={{ margin: 0 }}>Controle</h3>
        <div className="oc-grid2">
          <label className="oc-l">Status Atual<select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUS_EDITAR.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
          <label className="oc-l">Motorista<select value={f.motoristaId} onChange={(e) => set("motoristaId", e.target.value)}>
            <option value="">Nenhum</option>{(mots.dados?.motoristas ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}{m.placa ? ` (${m.placa})` : ""}{m.online ? " · online" : ""}</option>)}</select></label>
        </div>
        <h3 className="suave" style={{ margin: 0 }}>Passageiro</h3>
        <div className="oc-grid2">
          <label className="oc-l">Nome<input value={f.nome} onChange={(e) => set("nome", e.target.value)} maxLength={80} /></label>
          <label className="oc-l">Telefone<input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} inputMode="tel" /></label>
        </div>
        <h3 className="suave" style={{ margin: 0 }}>Rota</h3>
        <label className="oc-l">Origem<textarea value={f.embarque} onChange={(e) => set("embarque", e.target.value)} maxLength={200} /></label>
        <label className="oc-l">Destino<textarea value={f.destino} onChange={(e) => set("destino", e.target.value)} maxLength={200} /></label>
        <h3 className="suave" style={{ margin: 0 }}>Financeiro</h3>
        <div className="oc-grid3">
          <label className="oc-l">Valor Inicial (R$)<input value={f.valorInicial} onChange={(e) => set("valorInicial", e.target.value)} inputMode="decimal" /></label>
          <label className="oc-l">Valor Final / Taxa (R$)<input value={f.valorFinal} onChange={(e) => set("valorFinal", e.target.value)} inputMode="decimal" /></label>
          <label className="oc-l">Forma de Pagamento<select value={f.pagamento} onChange={(e) => set("pagamento", e.target.value)}>{pagamentos.map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
      </form>
    </Janela>
  );
}

// ------------------------------------------------------------------ corrida de outra fonte (só leitura)

export function JanelaExterna({ c, onFechar }: { c: any; onFechar: () => void }) {
  return (
    <Janela onFechar={onFechar} titulo={`OS ${c.os}`} sub={`${c.origemNome} · somente consulta`} tamanho="media">
      <Selo tom={GRUPO_CLASSE[c.grupo]}>{c.statusTexto}</Selo>
      <div style={{ marginTop: 12 }}>
        <Dado r="Embarque" v={c.embarque} /><Dado r="Destino" v={c.destino} /><Dado r="Solicitado" v={dhAno(c.solicitadaEm)} /><Dado r="Início" v={dhAno(c.iniciadaEm)} /><Dado r="Fim" v={dhAno(c.finalizadaEm)} />
        <Dado r="Passageiro" v={c.passageiro} /><Dado r="Telefone" v={fone(c.telefonePassageiro)} /><Dado r="Motorista" v={c.motorista} /><Dado r="Categoria" v={c.categoria} /><Dado r="Pagamento" v={c.pagamento} />
        <Dado r="Valor" v={reais(c.valor ?? c.valorEstimado)} /><Dado r="Cidade" v={c.cidade} />
        {c.grupo === "cancelada" && <><Dado r="Cancelada por" v={c.canceladaPor} /><Dado r="Motivo" v={c.motivoCancelamento} /></>}
      </div>
      <p className="suave"><FileText size={12} /> Corridas de outras fontes não têm edição nem auditoria aqui.</p>
    </Janela>
  );
}
