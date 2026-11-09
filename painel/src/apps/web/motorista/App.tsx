// App do motorista: entrar pelo telefone, ficar online com GPS (em segundo plano no APK), receber a chamada da
// corrida (com paradas e agendamento) e aceitar ou recusar, mapa com a viagem, navegar até o embarque, cada parada
// e o destino, chegar, iniciar e finalizar (com troco), nota para o passageiro, objeto esquecido, chat com texto e
// áudio, ligar, desistir ou cancelar, SOS, ganhos, carteira e saque, histórico, documentos, preferências,
// desafios, notificações e ajuda.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi, hora, ligarPush, observarPosicao, posicaoAgora, reais, telefoneBonito, tempoReal, tocarAlerta, token, vibrar, type Posicao } from "../comum/api";
import { Abas, Aviso, Carregando, ServidorTeste, Cartao, Chat, Entrar, mensagemDeErro, useMarca, type MarcaApp, type Mensagem } from "../comum/ui";
import { Mapa, type PontoMapa } from "./Mapa";
import { Ajuda, Carteira, DepoisDaCorrida, DetalheCorrida, Desafios, Documentos, Notificacoes, Preferencias, SaldoCarteira, temAjuda } from "./Telas";
import { diaHora, linkNavegar, type Corrida, type Eu, type Oferta, type Ponto } from "./tipos";

type Aba = "inicio" | "ganhos" | "historico" | "conta";
type TelaConta = "" | "carteira" | "documentos" | "preferencias" | "desafios" | "notificacoes" | "ajuda";

export default function App() {
  const { marca, erro } = useMarca();
  const [logado, setLogado] = useState(!!token());
  useEffect(() => { const f = () => setLogado(false); window.addEventListener("app-sair", f); return () => window.removeEventListener("app-sair", f); }, []);
  if (erro) return <div className="tela centro"><Aviso texto={erro} /><ServidorTeste /></div>;
  if (!marca) return <Carregando />;
  if (!logado) return <Entrar marca={marca} papel="motorista" aoEntrar={() => setLogado(true)} />;
  return <Logado marca={marca} sair={() => setLogado(false)} />;
}

function Logado({ marca, sair }: { marca: MarcaApp; sair: () => void }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [online, setOnline] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [terminada, setTerminada] = useState<Corrida | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [chat, setChat] = useState(false);
  const [aba, setAba] = useState<Aba>("inicio");
  const [telaConta, setTelaConta] = useState<TelaConta>("");
  const [conectado, setConectado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const atualRef = useRef<string | null>(null);
  const onlineRef = useRef(false);
  const ultimoEnvio = useRef(0);

  const carregar = useCallback(async () => {
    const [e, s] = await Promise.all([api<{ eu: Eu }>("/eu"), api<{ corrida: Corrida | null; oferta: Oferta | null; online: boolean }>("/estado")]);
    setEu(e.eu); setCorrida(s.corrida); setOferta(s.oferta);
    if (onlineRef.current && !s.online) ultimoEnvio.current = 0; // servidor reiniciou: a próxima posição religa
  }, []);
  useEffect(() => { void carregar().catch(() => undefined); }, [carregar]);
  // Voltou para a tela (app em segundo plano pode perder o tempo real): busca o estado de novo.
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") void carregar().catch(() => undefined); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [carregar]);
  useEffect(() => { void ligarPush(marca.push, () => void carregar()); }, [marca.push, carregar]);

  useEffect(() => {
    atualRef.current = corrida?.aberta ? corrida.id : null;
    if (!corrida?.aberta) { setMensagens([]); return; }
    void api<{ mensagens: Mensagem[] }>(`/corridas/${corrida.id}/chat`).then((r) => setMensagens(r.mensagens)).catch(() => undefined);
  }, [corrida?.id, corrida?.aberta]);

  // Tempo real.
  useEffect(() => tempoReal((tipo, d) => {
    if (tipo === "oferta") { setOferta(d as Oferta); tocarAlerta(4); vibrar([400, 200, 400, 200, 400]); }
    else if (tipo === "oferta_encerrada") setOferta((o) => (o?.id === d.id ? null : o));
    else if (tipo === "corrida") {
      const c = d as Corrida;
      setCorrida((antes) => {
        if (c.aberta) return c;
        if (antes?.id === c.id) {
          if (c.status === "cancelada") { setAviso("A corrida foi cancelada."); tocarAlerta(2); }
          else if (c.status !== "finalizada") setAviso(c.statusTexto);
          setChat(false);
          return null;
        }
        return antes;
      });
    } else if (tipo === "chat" && d.corridaId === atualRef.current) {
      setMensagens((l) => (l.some((m) => m.id === d.mensagem.id) ? l : [...l, d.mensagem]));
      if (d.mensagem.de !== "motorista") { vibrar(200); tocarAlerta(1); }
    }
  }, (ligado) => { setConectado(ligado); if (ligado) void carregar().catch(() => undefined); }), [carregar]);

  // GPS: online manda a posição (no máximo a cada 5 s). Se o servidor esqueceu (reiniciou), fica online de novo.
  // Parado, o GPS não manda posição nova: a cada 30 s a última é reenviada, senão o despacho acha que ele sumiu.
  useEffect(() => {
    if (!online) return;
    onlineRef.current = true;
    let ultima: Posicao | null = null;
    const enviar = async (p: Posicao) => {
      ultimoEnvio.current = Date.now();
      try { await api("/posicao", { corpo: p }); }
      catch (e) { if (e instanceof ErroApi && e.status === 409) await api("/online", { corpo: p }).catch(() => undefined); }
    };
    const parar = observarPosicao((p) => {
      ultima = p;
      setPosicao(p);
      if (Date.now() - ultimoEnvio.current >= 5000) void enviar(p);
    }, (msg) => setErro(msg), true);
    const vivo = setInterval(() => { const p = ultima ?? posicaoRef.current; if (p && Date.now() - ultimoEnvio.current >= 25_000) void enviar(p); }, 30_000);
    return () => { onlineRef.current = false; clearInterval(vivo); parar(); };
  }, [online]);
  const posicaoRef = useRef<Posicao | null>(null);
  posicaoRef.current = posicao;
  // Offline: pega a posição uma vez, só para mostrar no mapa da tela inicial.
  useEffect(() => { void posicaoAgora().then((p) => setPosicao((a) => a ?? p)).catch(() => undefined); }, []);

  const alternarOnline = async () => {
    setErro("");
    if (online) { await api("/offline", { corpo: {} }).catch(() => undefined); setOnline(false); return; }
    try {
      const p = posicao ?? await posicaoAgora();
      await api("/online", { corpo: p });
      setPosicao(p); ultimoEnvio.current = Date.now(); setOnline(true);
    } catch (e) { setErro(mensagemDeErro(e)); }
  };
  useEffect(() => { void api<{ online: boolean }>("/eu").then((r) => { if (r.online) setOnline(true); }).catch(() => undefined); }, []);

  const mudarAba = (a: Aba) => { setAba(a); if (a === "conta") setTelaConta(""); };

  if (!eu) return <Carregando />;
  if (chat && corrida) return <Chat corridaId={corrida.id} papel="motorista" mensagens={mensagens} aberto={corrida.aberta} fechar={() => setChat(false)} />;

  return (
    <div className="app">
      <header className={`topo ${online ? "online" : ""}`}>
        <strong>{marca.nome}</strong>
        <span className="situacao">{!conectado ? "Reconectando…" : online ? (corrida ? "Em corrida" : "Online") : "Offline"}</span>
      </header>
      {oferta && <Chamada oferta={oferta} posicao={posicao} aceitar={async () => {
        try { const r = await api<{ corrida: Corrida }>(`/ofertas/${oferta.id}/aceitar`, { corpo: {} }); setCorrida(r.corrida.aberta ? r.corrida : null); setTerminada(null); setAba("inicio"); } catch (e) { setAviso(mensagemDeErro(e)); }
        setOferta(null);
      }} recusar={async () => { await api(`/ofertas/${oferta.id}/recusar`, { corpo: {} }).catch(() => undefined); setOferta(null); }} />}
      {aba === "inicio" ? (
        corrida ? <EmCorrida corrida={corrida} posicao={posicao} mudou={(c) => setCorrida(c?.aberta ? c : null)} finalizou={(c) => { setCorrida(null); setTerminada(c); }}
          abrirChat={() => setChat(true)} naoLidas={mensagens.filter((m) => m.de !== "motorista").length} marca={marca} avisar={setAviso} />
          : terminada ? <DepoisDaCorrida corrida={terminada} fim={() => setTerminada(null)} />
            : (
              <div className="tela">
                <Cartao className="interruptor">
                  <div><h2 style={{ margin: 0 }}>{online ? "Você está online" : "Você está offline"}</h2><p className="dica">{online ? "Aguardando chamadas perto de você." : "Fique online para receber chamadas."}</p></div>
                  <button className={`botao ${online ? "secundario" : ""}`} onClick={() => void alternarOnline()}>{online ? "Ficar offline" : "Ficar online"}</button>
                </Cartao>
                {posicao ? <Mapa pontos={[{ ...posicao, rotulo: "Você", tipo: "eu" }]} altura={300} /> : <p className="dica centro">Ligue a localização para ver o mapa.</p>}
                <Aviso texto={aviso} tipo="info" />
                <Aviso texto={erro} />
                <Avisos eu={eu} />
              </div>
            )
      ) : aba === "ganhos" ? <Ganhos abrirCarteira={() => { setAba("conta"); setTelaConta("carteira"); }} />
        : aba === "historico" ? <Historico />
          : <Conta eu={eu} marca={marca} tela={telaConta} mudarTela={setTelaConta} sair={async () => { await api("/sair", { corpo: {} }).catch(() => undefined); setOnline(false); window.dispatchEvent(new Event("app-sair")); sair(); }} />}
      <Abas abas={[["inicio", corrida ? "Corrida" : "Início"], ["ganhos", "Ganhos"], ["historico", "Histórico"], ["conta", "Conta"]]} atual={aba} mudar={mudarAba} />
    </div>
  );
}

/** Pontos da viagem em ordem: embarque, paradas e destino. */
function pontosDaViagem(c: { embarque: Ponto; paradas?: Ponto[]; destino: Ponto | null }): PontoMapa[] {
  const l: PontoMapa[] = [];
  const pos = (p: Ponto) => (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
  const e = pos(c.embarque); if (e) l.push({ ...e, rotulo: "Embarque", tipo: "embarque" });
  (c.paradas ?? []).forEach((p, i) => { const x = pos(p); if (x) l.push({ ...x, rotulo: `Parada ${i + 1}`, tipo: "parada" }); });
  const d = c.destino && pos(c.destino); if (d) l.push({ ...d, rotulo: "Destino", tipo: "destino" });
  return l;
}

function SeloAgendada({ quando }: { quando?: string | null }) {
  return quando ? <span className="selo">Agendada para {diaHora(quando)}</span> : null;
}

function Chamada({ oferta: o, posicao, aceitar, recusar }: { oferta: Oferta; posicao: Posicao | null; aceitar: () => void; recusar: () => void }) {
  const [resta, setResta] = useState(Math.max(0, Math.round((o.expira - Date.now()) / 1000)));
  useEffect(() => { const t = setInterval(() => setResta(Math.max(0, Math.round((o.expira - Date.now()) / 1000))), 500); return () => clearInterval(t); }, [o.expira]);
  const c = o.corrida;
  const viagem = pontosDaViagem(c);
  return (
    <div className="oferta" role="dialog" aria-label="Nova chamada">
      <Cartao>
        <h2>Nova corrida · {c.categoria}</h2>
        <SeloAgendada quando={c.agendadaPara} />
        <div className="contador">{resta}s</div>
        {viagem.length > 0 && <Mapa pontos={[...viagem, ...(posicao ? [{ ...posicao, rotulo: "Você", tipo: "eu" as const }] : [])]} caminho={viagem} ate={[posicao, viagem[0]]} altura={170} />}
        <dl className="dados">
          <dt>Embarque</dt><dd>{c.embarque.texto}{o.distanciaKm != null ? ` (${o.distanciaKm} km de você)` : ""}</dd>
          {(c.paradas ?? []).map((p, i) => <Fragment key={i}><dt>Parada {i + 1}</dt><dd>{p.texto}</dd></Fragment>)}
          {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
          <dt>Valor</dt><dd><strong>{reais(c.estimativa.valor)}</strong>{c.estimativa.distanciaKm != null ? ` · ${c.estimativa.distanciaKm} km` : ""}</dd>
          <dt>Pagamento</dt><dd>{c.pagamento}</dd>
          <dt>Passageiro</dt><dd>{c.passageiro}</dd>
          {c.observacao && <><dt>Obs.</dt><dd>{c.observacao}</dd></>}
        </dl>
        <div className="linha">
          <button className="botao secundario" onClick={recusar}>Recusar</button>
          <button className="botao grande" onClick={aceitar} disabled={!resta}>Aceitar</button>
        </div>
      </Cartao>
    </div>
  );
}

// Parada em que o motorista está (guardada no aparelho, para não perder se o app fechar).
const chaveParada = (id: string) => `parada-${id}`;
const lerParada = (id: string) => { try { return Number(localStorage.getItem(chaveParada(id))) || 0; } catch { return 0; } };
const gravarParada = (id: string, n: number) => { try { localStorage.setItem(chaveParada(id), String(n)); } catch { /* sem armazenamento */ } };

function EmCorrida({ corrida: c, posicao, mudou, finalizou, abrirChat, naoLidas, marca, avisar }: { corrida: Corrida; posicao: Posicao | null; mudou: (c: Corrida | null) => void; finalizou: (c: Corrida) => void; abrirChat: () => void; naoLidas: number; marca: MarcaApp; avisar: (s: string) => void }) {
  const [erro, setErro] = useState("");
  const [finalizar, setFinalizar] = useState(false);
  const [valor, setValor] = useState(c.estimativa.valor != null ? String(Math.max(0, c.estimativa.valor - (c.desconto ?? 0)).toFixed(2)) : "");
  const [recebido, setRecebido] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [parada, setParada] = useState(() => lerParada(c.id));
  const paradas = c.paradas ?? [];
  const status = async (s: string, extra: Record<string, unknown> = {}) => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/status`, { corpo: { status: s, ...extra } });
      if (s === "finalizada") { try { localStorage.removeItem(chaveParada(c.id)); } catch { /* sem armazenamento */ } finalizou(r.corrida); } else mudou(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const cancelar = async () => {
    const desistir = c.status === "a_caminho";
    if (!confirm(desistir ? "Desistir da corrida? Ela volta para outro motorista." : "Cancelar a corrida?")) return;
    try { await api(`/corridas/${c.id}/cancelar`, { corpo: { motivo: "Cancelada pelo motorista" } }); mudou(null); avisar(desistir ? "Você desistiu da corrida." : "Corrida cancelada."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const sos = async () => {
    if (!confirm("Avisar a central agora que você precisa de ajuda?")) return;
    try { await api(`/corridas/${c.id}/sos`, { corpo: posicao ?? {} }); avisar("A central foi avisada. Se for grave, ligue 190."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const passouParada = () => { const n = parada + 1; setParada(n); gravarParada(c.id, n); };

  // Próximo ponto: embarque até iniciar; depois cada parada, na ordem, e o destino.
  const emViagem = c.status === "em_andamento";
  const naParada = emViagem && parada < paradas.length;
  const alvo = !emViagem ? c.embarque : naParada ? paradas[parada] : c.destino ?? c.embarque;
  const nomeAlvo = !emViagem ? "o embarque" : naParada ? `a parada ${parada + 1}` : c.destino ? "o destino" : "o embarque";
  const valorFinal = Number(valor.replace(",", "."));
  const troco = Number(recebido.replace(",", ".")) - valorFinal;
  const viagem = pontosDaViagem(c);
  const pontos: PontoMapa[] = [...viagem, ...(posicao ? [{ ...posicao, rotulo: "Você", tipo: "carro" as const }] : [])];

  if (finalizar) return (
    <form className="tela" onSubmit={(e) => { e.preventDefault(); void status("finalizada", { valor: valorFinal }); }}>
      <h1>Finalizar corrida</h1>
      <label>Valor da corrida (R$)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
      {c.desconto ? <p className="dica">Já com desconto de cupom de {reais(c.desconto)}.</p> : null}
      <p>Pagamento: <strong>{c.pagamento}</strong></p>
      {c.pagamento === "Dinheiro" && (
        <Cartao>
          <h2>Calcular troco</h2>
          <label>Valor recebido (R$)<input inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} /></label>
          {recebido && Number.isFinite(troco) && <p className="numero-grande">{troco >= 0 ? `Troco: ${reais(troco)}` : `Faltam ${reais(-troco)}`}</p>}
        </Cartao>
      )}
      <Aviso texto={erro} />
      <div className="linha">
        <button type="button" className="botao secundario" onClick={() => setFinalizar(false)}>Voltar</button>
        <button className="botao" disabled={ocupado || !(valorFinal >= 0) || !valor}>Confirmar</button>
      </div>
    </form>
  );

  return (
    <div className="tela">
      {pontos.length > 0 && <Mapa pontos={pontos} caminho={viagem} ate={[posicao, alvo]} altura={260} />}
      <Cartao>
        <div className="status">{c.statusTexto}</div>
        <SeloAgendada quando={c.agendadaPara} />
        <dl className="dados">
          <dt>OS</dt><dd>{c.os}</dd>
          <dt>Passageiro</dt><dd>{c.passageiro.nome}</dd>
          <dt>Embarque</dt><dd>{c.embarque.texto}</dd>
          {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
          <dt>Pagamento</dt><dd>{c.pagamento}</dd>
          <dt>Valor</dt><dd>{reais(c.estimativa.valor != null ? c.estimativa.valor - (c.desconto ?? 0) : null)}</dd>
          {c.observacao && <><dt>Obs.</dt><dd>{c.observacao}</dd></>}
        </dl>
        {paradas.length > 0 && (
          <>
            <strong>Paradas</strong>
            <ul className="paradas">
              {paradas.map((p, i) => (
                <li key={i} className={emViagem && i < parada ? "feita" : ""}>
                  <span>{i + 1}. {p.texto}</span>
                  <a href={linkNavegar(p)}>Navegar</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>
      <div className="acoes">
        <a className="botao secundario" style={{ textAlign: "center", textDecoration: "none" }} href={linkNavegar(alvo)}>Navegar até {nomeAlvo}</a>
        <button className="botao secundario" onClick={abrirChat}>Mensagens{naoLidas ? ` (${naoLidas})` : ""}</button>
        {c.passageiro.telefone && <a className="botao secundario" style={{ textAlign: "center", textDecoration: "none" }} href={`tel:${c.passageiro.telefone}`}>Ligar</a>}
      </div>
      <Aviso texto={erro} />
      {c.status === "a_caminho" && <button className="botao grande" disabled={ocupado} onClick={() => void status("no_local")}>Cheguei no embarque</button>}
      {c.status === "no_local" && <button className="botao grande" disabled={ocupado} onClick={() => void status("em_andamento")}>Iniciar viagem</button>}
      {naParada && <button className="botao grande" onClick={passouParada}>Saí da parada {parada + 1}</button>}
      {emViagem && !naParada && <button className="botao grande" disabled={ocupado} onClick={() => setFinalizar(true)}>Finalizar viagem</button>}
      {emViagem && parada > 0 && <button className="botao-link" onClick={() => { const n = parada - 1; setParada(n); gravarParada(c.id, n); }}>Voltar uma parada</button>}
      <div className="acoes">
        <button className="botao secundario" onClick={() => void cancelar()}>{c.status === "a_caminho" ? "Desistir" : "Cancelar"}</button>
        <button className="botao sos" onClick={() => void sos()}>SOS</button>
      </div>
      {marca.suporte.telefone && <p className="dica centro">Central: <a href={`tel:${marca.suporte.telefone.replace(/\D/g, "")}`}>{marca.suporte.telefone}</a></p>}
    </div>
  );
}

function Avisos({ eu }: { eu: Eu }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = [["CNH", eu.validadeCnh], ["Licenciamento", eu.validadeLicenciamento]].filter(([, v]) => v && String(v) < hoje);
  return vencidos.length ? <Aviso texto={`Documento vencido: ${vencidos.map(([n]) => n).join(" e ")}. Envie o novo em Conta > Documentos.`} /> : null;
}

interface Soma { corridas: number; valor: number; km: number }
function Ganhos({ abrirCarteira }: { abrirCarteira: () => void }) {
  const [g, setG] = useState<{ hoje: Soma; semana: Soma; mes: Soma; ultimas: Array<{ id: string; os: string; valor: number | null; pagamento: string; finalizadaEm: string | null; destino: string }> } | null>(null);
  useEffect(() => { void api<NonNullable<typeof g>>("/ganhos").then(setG).catch(() => undefined); }, []);
  if (!g) return <Carregando />;
  const bloco = (t: string, s: Soma) => <Cartao><p className="dica">{t}</p><p className="numero-grande" style={{ margin: 0 }}>{reais(s.valor)}</p><p className="dica">{s.corridas} corrida{s.corridas === 1 ? "" : "s"} · {s.km} km</p></Cartao>;
  return (
    <div className="tela">
      <h1>Ganhos</h1>
      {bloco("Hoje", g.hoje)}
      <div className="linha">{bloco("7 dias", g.semana)}{bloco("30 dias", g.mes)}</div>
      <SaldoCarteira abrir={abrirCarteira} />
      <h2>Últimas corridas</h2>
      <ul className="lista">{g.ultimas.map((c) => <li key={c.id}><span>{hora(c.finalizadaEm)}<br /><small className="dica">{c.destino || `OS ${c.os}`}</small></span><span style={{ textAlign: "right" }}><strong>{reais(c.valor)}</strong><br /><small className="dica">{c.pagamento}</small></span></li>)}</ul>
    </div>
  );
}

function Historico() {
  const [lista, setLista] = useState<Corrida[] | null>(null);
  const [aberta, setAberta] = useState<Corrida | null>(null);
  const buscar = useCallback(() => api<{ corridas: Corrida[] }>("/corridas").then((r) => setLista(r.corridas)).catch(() => setLista([])), []);
  useEffect(() => { void buscar(); }, [buscar]);
  if (aberta) return <DetalheCorrida corrida={aberta} voltar={() => { setAberta(null); void buscar(); }} />;
  if (!lista) return <Carregando />;
  return (
    <div className="tela">
      <h1>Histórico</h1>
      {!lista.length && <p className="dica">Nenhuma corrida ainda.</p>}
      <ul className="lista">
        {lista.map((c) => (
          <li key={c.id} className="clicavel" role="button" tabIndex={0} onClick={() => setAberta(c)} onKeyDown={(e) => { if (e.key === "Enter") setAberta(c); }}>
            <span><strong>{hora(c.solicitadaEm)}</strong><br /><small className="dica">{c.embarque.texto}</small></span>
            <span style={{ textAlign: "right" }}>{c.statusTexto}<br /><strong>{c.valor != null ? reais(c.valor) : ""}</strong>{c.status === "finalizada" && !c.avaliacaoPassageiro && <><br /><small className="dica">Dar nota ›</small></>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Conta({ eu, marca, tela, mudarTela, sair }: { eu: Eu; marca: MarcaApp; tela: TelaConta; mudarTela: (t: TelaConta) => void; sair: () => void }) {
  const voltar = () => mudarTela("");
  if (tela === "carteira") return <Carteira voltar={voltar} />;
  if (tela === "documentos") return <Documentos voltar={voltar} />;
  if (tela === "preferencias") return <Preferencias voltar={voltar} />;
  if (tela === "desafios") return <Desafios voltar={voltar} marca={marca} />;
  if (tela === "notificacoes") return <Notificacoes voltar={voltar} />;
  if (tela === "ajuda" && temAjuda(marca)) return <Ajuda voltar={voltar} marca={marca} />;
  const itens: Array<[TelaConta, string, string]> = [
    ["carteira", "Carteira", "Saldo, extrato e saque"],
    ["documentos", "Documentos", "CNH, veículo e outros"],
    ["preferencias", "Preferências de corrida", "Tipos de corrida"],
    ["desafios", "Desafios e indicações", "Metas e seu código"],
    ["notificacoes", "Notificações", "Avisos da central"],
    ...(temAjuda(marca) ? [["ajuda", "Ajuda", "Fale com a central"] as [TelaConta, string, string]] : []),
  ];
  return (
    <div className="tela">
      <h1>Conta</h1>
      <Cartao>
        <dl className="dados">
          <dt>Nome</dt><dd>{eu.nome}</dd><dt>Celular</dt><dd>{telefoneBonito(eu.telefone)}</dd>
          <dt>Veículo</dt><dd>{eu.veiculo || "—"}</dd><dt>Placa</dt><dd>{eu.placa || "—"}</dd>
          <dt>Categorias</dt><dd>{eu.categorias || "Todas"}</dd>
          <dt>CNH até</dt><dd>{eu.validadeCnh ? String(eu.validadeCnh).split("-").reverse().join("/") : "—"}</dd>
          <dt>Licenciamento</dt><dd>{eu.validadeLicenciamento ? String(eu.validadeLicenciamento).split("-").reverse().join("/") : "—"}</dd>
        </dl>
        <p className="dica">Para mudar seus dados, fale com a central.</p>
      </Cartao>
      <ul className="menu">
        {itens.map(([id, nome, dica]) => <li key={id}><button type="button" onClick={() => mudarTela(id)}><span>{nome}<br /><small>{dica}</small></span><span aria-hidden>›</span></button></li>)}
      </ul>
      <button className="botao secundario" onClick={sair}>Sair</button>
    </div>
  );
}
