// Janela da corrida (Histórico, Monitoramento, Ocorrências): Trajeto, Informações, Passageiro, Motorista Designado,
// Histórico de Repasses, Resumo Financeiro e as ações (Reenviar, Auditoria, Recibo, Ver Lances, Cancelar, Rastrear, Editar OS, Chat, Compartilhar).
import { useEffect, useRef, useState } from "react";
import { Ban, Edit3, FileText, Gavel, Info, Loader2, MapPin, MessageCircle, Navigation, Phone, Printer, Radar, RefreshCw, Share2, ChevronDown, ArrowLeft } from "lucide-react";
import { Aviso, Dado, GRUPO_CLASSE, Janela, L, dh, dhAno, fone, km, msgErro, op, pino, reais, Selo, useDados, useMapa, zap } from "./comum";

export interface Detalhe {
  corrida: any; statusTexto: string; painel: any; passageiro: any; motorista: any; datas: any; repasses: any[]; financeiro: any;
  podeCancelar: boolean; podeReenviar: boolean; podeRecibo: boolean; temLances: boolean; naoLidas: number;
}

const STATUS_EDITAR: Array<[string, string]> = [["procurando", "Aguardando"], ["a_caminho", "A Caminho"], ["no_local", "Chegou"], ["em_andamento", "Em Viagem"], ["finalizada", "Finalizada"], ["cancelada", "Cancelada"], ["nao_atendida", "Não Atendida"]];
const PAGAMENTOS_EDITAR = ["Dinheiro", "Pix", "Cartão na Maquininha", "Saldo da Carteira", "Cartão no App"];

export function JanelaCorrida({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou?: () => void }) {
  const { dados: d, erro, carregando, recarregar } = useDados<Detalhe>(() => op(`/corridas/${encodeURIComponent(id)}`), [id]);
  const [menu, setMenu] = useState(false);
  const [sub, setSub] = useState<"" | "raiox" | "rastreio" | "editar" | "chat" | "cancelar" | "legenda" | "lances">("");
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudou = () => { recarregar(); onMudou?.(); };

  async function reenviar() {
    setMenu(false);
    if (!d || !confirm(`Reenviar a corrida ${d.corrida.os}? Será criada uma nova solicitação igual, procurando motorista.`)) return;
    setOcupado(true);
    try { const r = await op<{ corrida: { os: string } }>(`/corridas/${d.corrida.id}/reenviar`, {}); setMsg({ t: `Corrida reenviada como OS ${r.corrida.os}.` }); onMudou?.(); }
    catch (e) { setMsg({ t: msgErro(e), erro: true }); } finally { setOcupado(false); }
  }
  async function recibo() {
    setMenu(false);
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

  const c = d?.corrida;
  const cancelada = c?.status === "cancelada";
  return (
    <>
      <Janela onFechar={onFechar} tamanho="larga"
        titulo={<span className="oc-fila"><button className="oc-x" onClick={onFechar} aria-label="Voltar"><ArrowLeft size={18} /></button>{c ? `OS ${c.os}` : "---"} {d && <Selo tom={GRUPO_CLASSE[d.painel.grupo]}>{d.statusTexto}</Selo>}</span>}
        sub={c ? `Ordem de Serviço · ${c.categoria}${d?.painel.fatorDinamico && d.painel.fatorDinamico !== 1 ? " · Dinâmica" : ""}` : undefined}
        acoes={d && <>
          <button className="oc-btn" onClick={() => setSub("chat")}><MessageCircle size={16} /> Mensagem{d.naoLidas > 0 && <Selo tom="ruim">{d.naoLidas}</Selo>}</button>
          <div className="oc-menu">
            <button className="oc-btn" onClick={() => setMenu(!menu)} aria-expanded={menu}>Ações <ChevronDown size={14} /></button>
            {menu && <div>
              {d.podeReenviar && <button onClick={reenviar} disabled={ocupado}><RefreshCw size={15} /> Reenviar Corrida</button>}
              <button onClick={() => { setMenu(false); setSub("raiox"); }}><Radar size={15} /> Auditoria (Raio-X)</button>
              {d.podeRecibo && <button onClick={recibo}><Printer size={15} /> Imprimir Recibo</button>}
              {d.temLances && <button onClick={() => { setMenu(false); setSub("lances"); }}><Gavel size={15} /> Ver Lances</button>}
              {d.podeCancelar && <button className="ruim" onClick={() => { setMenu(false); setSub("cancelar"); }}><Ban size={15} /> Cancelar Corrida</button>}
            </div>}
          </div>
        </>}
        rodape={d && <>
          <button className="oc-btn" onClick={() => setSub("rastreio")}><Navigation size={16} /> Rastrear</button>
          <button className="oc-btn" onClick={() => setSub("editar")}><Edit3 size={16} /> Editar</button>
          {d.podeCancelar && <button className="oc-btn ruim" onClick={() => setSub("cancelar")}><Ban size={16} /> Cancelar</button>}
        </>}>
        <Aviso texto={erro} erro />
        <Aviso texto={msg?.t} erro={msg?.erro} />
        {carregando && !d && <p className="oc-vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
        {d && <Corpo d={d} />}
      </Janela>
      {d && sub === "raiox" && <RaioX id={c.id} os={c.os} onFechar={() => setSub("")} />}
      {d && sub === "rastreio" && <Rastreio id={c.id} onFechar={() => setSub("")} onLegenda={() => setSub("legenda")} />}
      {d && sub === "legenda" && <Legenda onFechar={() => setSub("rastreio")} />}
      {d && sub === "chat" && <Chat id={c.id} os={c.os} onFechar={() => { setSub(""); mudou(); }} />}
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

function Corpo({ d }: { d: Detalhe }) {
  const c = d.corrida, f = d.financeiro, m = d.motorista, p = d.passageiro, dt = d.datas;
  const cancelada = c.status === "cancelada";
  return (
    <div className="oc-grid2" style={{ alignItems: "start" }}>
      <div>
        <div className="oc-card">
          <h3>Trajeto da Viagem</h3>
          <div className="oc-trajeto">
            <div><i /><small>Ponto de Embarque</small><b>{c.embarque.texto}</b></div>
            {(c.paradas ?? []).map((x: { texto: string }, i: number) => <div className="par" key={i}><i /><small>Parada {i + 1}</small><b>{x.texto}</b></div>)}
            <div className="dest"><i /><small>Destino Final</small><b>{c.destino?.texto ?? "Sem destino"}</b></div>
          </div>
        </div>
        <div className="oc-card">
          <h3><Info size={13} /> Informações</h3>
          <Dado r="Origem da Corrida" v={d.painel.canal} />
          <Dado r="Categoria" v={c.categoria} />
          <Dado r="Pagamento" v={c.pagamento} />
          <Dado r="Solicitado" v={dhAno(c.solicitadaEm)} />
          {c.agendadaPara && <Dado r="Agendada para" v={dhAno(c.agendadaPara)} />}
          <Dado r="Distância estimada" v={km(c.estimativa?.distanciaKm)} />
          {c.cupom && <Dado r="Cupom" v={c.cupom} />}
        </div>
        <div className="oc-card">
          <h3>Passageiro</h3>
          <Dado r="Nome" v={p.nome} />
          <Dado r="Telefone" v={fone(p.telefone)} />
          {p.cpf && <Dado r="CPF" v={p.cpf} />}
          <div className="oc-fila" style={{ marginTop: 10 }}>
            <a className="oc-btn peq" href={`tel:${p.telefone}`}><Phone size={14} /> Ligar</a>
            <a className="oc-btn peq" href={zap(p.telefone)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
          </div>
          {c.observacao && <div className="oc-aviso" style={{ marginTop: 12, marginBottom: 0 }}>Observação: {c.observacao}</div>}
        </div>
      </div>
      <div>
        {m && (
          <div className="oc-motorista">
            <h3 style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", color: "var(--oc-suave)" }}>Motorista Designado {m.online ? <Selo tom="ok">Online</Selo> : <Selo>Offline</Selo>}</h3>
            <b style={{ fontSize: 16 }}>{m.nome}</b>
            <p className="suave" style={{ margin: "2px 0 10px" }}>{[m.veiculo, m.placa].filter(Boolean).join(" · ") || "Veículo não informado"}</p>
            <a className="oc-btn peq" href={zap(m.telefone)} target="_blank" rel="noreferrer"><Phone size={14} /> Contatar</a>
            <div style={{ marginTop: 10 }}>
              <Dado r="Aceite" v={dh(dt.aceite)} /><Dado r="Chegada" v={dh(dt.chegada)} /><Dado r="Início" v={dh(dt.inicio)} /><Dado r="Fim" v={dh(dt.fim)} />
            </div>
          </div>
        )}
        {d.repasses.length > 0 && (
          <div className="oc-repasses">
            <b>Histórico de Repasses (Quem Pegou)</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
              {d.repasses.map((r, i) => <li key={i}><b>{r.motorista}</b> pegou às {dh(r.aceitouEm)}{r.saiuEm ? ` · saiu às ${dh(r.saiuEm)} (${r.motivo})` : " · está com a corrida"}</li>)}
            </ul>
          </div>
        )}
        {cancelada && (
          <div className="oc-cancelada">
            <b style={{ color: "var(--oc-ruim)" }}>Corrida Cancelada · {dh(dt.cancelamento)}</b>
            <Dado r="Responsável" v={c.canceladaPor} /><Dado r="Taxa Cobrada" v={reais(f.taxaCancelamento)} /><Dado r="Motivo Registrado" v={c.motivoCancelamento} />
          </div>
        )}
        <div className="oc-card">
          <h3>Resumo Financeiro</h3>
          <Dado r="Valor Inicial" v={reais(f.valorInicial)} />
          <Dado r="Descontos / Cupons" v={reais(f.desconto)} />
          {f.cartao != null && <Dado r="Cobrado no Cartão" v={reais(f.cartao)} />}
          <div className="oc-dado" style={{ fontSize: 16, borderBottom: 0 }}><span>{cancelada ? "Taxa final" : "Valor Final"}</span><b>{reais(f.final)}</b></div>
        </div>
      </div>
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
  const { ref, mapa } = useMapa([-15.78, -47.93], 13);
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
    if (pts.length && !ajustou.current) { mapa.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 16 }); ajustou.current = true; }
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

// ------------------------------------------------------------------ chat da corrida

function Chat({ id, os, onFechar }: { id: string; os: string; onFechar: () => void }) {
  const { dados, erro, carregando } = useDados<{ mensagens: any[] }>(() => op(`/corridas/${id}/chat`), [id], 8000);
  return (
    <Janela onFechar={onFechar} titulo="Chat da Corrida" sub={`Histórico de Mensagens · OS ${os}`} tamanho="estreita" nivel="alto">
      <Aviso texto={erro} erro />
      <div className="oc-chat">
        {carregando && !dados && <p className="oc-vazio"><Loader2 size={16} className="gira" /></p>}
        {dados && !dados.mensagens.length && <p style={{ color: "#667", textAlign: "center" }}>Nenhuma mensagem nesta corrida.</p>}
        {dados?.mensagens.map((m) => (
          <div key={m.id} className={`oc-bolha ${m.de === "motorista" ? "mot" : ""}`}>
            <small>{m.nome || (m.de === "motorista" ? "Motorista" : "Passageiro")} · {dh(m.em)}</small>
            {m.audio ? <audio controls src={`/api/operacao/corridas/${id}/chat/audio/${m.audio.id}`} style={{ maxWidth: 220 }} /> : m.texto}
          </div>
        ))}
        <p style={{ color: "#667", textAlign: "center", fontSize: 11, marginTop: "auto" }}>Visualização de Auditoria</p>
      </div>
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
