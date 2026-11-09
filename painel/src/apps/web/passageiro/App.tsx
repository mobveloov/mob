// App do passageiro: entrar pelo telefone, pedir corrida (endereço pelo texto ou tocando no mapa, até 3 paradas,
// agora ou agendada, categoria com preço, pagamento, cupom), acompanhar o motorista no mapa em tempo real, chat com
// texto e áudio, ligar, compartilhar o link da viagem, cancelar, SOS, avaliar com comentário, favoritar ou bloquear
// o motorista, objeto esquecido, reclamação, histórico, agendadas e conta (carteira, indicação, avisos, ajuda).

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api, hora, ligarPush, posicaoAgora, reais, tempoReal, token, vibrar, type Posicao } from "../comum/api";
import { Abas, Aviso, Carregando, ServidorTeste, Cartao, Chat, Entrar, mensagemDeErro, useMarca, type MarcaApp, type Mensagem } from "../comum/ui";
import { agoraBrasilia, compartilharTexto, esperandoHorario, estimarComParadas, linkPublico, quandoAgendada, type Categoria, type Corrida, type Endereco, type Eu, type Ponto } from "./apoio";
import { Mapa, type PontoMapa } from "./Mapa";
import { Avaliar, OpcoesDaCorrida, useFavorito } from "./PosCorrida";
import { Agendadas, Conta } from "./Conta";
import "./passageiro.css";

type Aba = "inicio" | "agendadas" | "historico" | "conta";

export default function App() {
  const { marca, erro } = useMarca();
  const [logado, setLogado] = useState(!!token());
  useEffect(() => { const f = () => setLogado(false); window.addEventListener("app-sair", f); return () => window.removeEventListener("app-sair", f); }, []);
  if (erro) return <div className="tela centro"><Aviso texto={erro} /><ServidorTeste /></div>;
  if (!marca) return <Carregando />;
  if (!logado) return <Entrar marca={marca} papel="passageiro" aoEntrar={() => setLogado(true)} />;
  return <Logado marca={marca} sair={() => setLogado(false)} />;
}

const avisoDaTaxa = (c: Corrida) => (c.status === "cancelada" && c.taxaCancelamento ? `Corrida cancelada. Foi cobrada uma taxa de cancelamento de ${reais(c.taxaCancelamento)}.` : "");

function Logado({ marca, sair }: { marca: MarcaApp; sair: () => void }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [posMotorista, setPosMotorista] = useState<Posicao | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [chat, setChat] = useState(false);
  const [aba, setAba] = useState<Aba>("inicio");
  const [conectado, setConectado] = useState(false);
  const [avaliar, setAvaliar] = useState<Corrida | null>(null);
  const [aviso, setAviso] = useState("");
  const atualRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const [e, s] = await Promise.all([api<{ eu: Eu }>("/eu"), api<{ corrida: Corrida | null; posicaoMotorista: Posicao | null }>("/estado")]);
    setEu(e.eu); setCorrida(s.corrida); setPosMotorista(s.posicaoMotorista);
  }, []);
  useEffect(() => { void carregar().catch(() => undefined); }, [carregar]);
  // Voltou para a tela (app em segundo plano pode perder o tempo real): busca o estado de novo.
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") void carregar().catch(() => undefined); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [carregar]);
  useEffect(() => { void ligarPush(marca.push, () => void carregar()); }, [marca.push, carregar]);

  // Mensagens da corrida atual.
  useEffect(() => {
    atualRef.current = corrida?.aberta ? corrida.id : null;
    if (!corrida?.motorista || !corrida.aberta) { setMensagens([]); return; }
    void api<{ mensagens: Mensagem[] }>(`/corridas/${corrida.id}/chat`).then((r) => setMensagens(r.mensagens)).catch(() => undefined);
  }, [corrida?.id, corrida?.aberta, !!corrida?.motorista]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tempo real.
  useEffect(() => tempoReal((tipo, d) => {
    if (tipo === "corrida") {
      const c = d as Corrida;
      if (esperandoHorario(c)) return; // agendada: aparece na aba Agendadas até chegar a hora
      setCorrida((antes) => {
        if (antes && antes.id === c.id && antes.status !== c.status) vibrar([200, 100, 200]);
        return c.aberta ? c : antes?.id === c.id ? null : antes;
      });
      if (c.status === "finalizada" && c.avaliacao == null) setAvaliar(c);
      if (avisoDaTaxa(c)) setAviso(avisoDaTaxa(c));
      if (!c.aberta) setChat(false);
    } else if (tipo === "posicao") setPosMotorista({ lat: d.lat, lng: d.lng });
    else if (tipo === "chat" && d.corridaId === atualRef.current) {
      setMensagens((l) => (l.some((m) => m.id === d.mensagem.id) ? l : [...l, d.mensagem]));
      if (d.mensagem.de !== "passageiro") vibrar(150);
    }
  }, (ligado) => { setConectado(ligado); if (ligado) void carregar().catch(() => undefined); }), [carregar]);

  if (!eu) return <Carregando />;
  if (!eu.nome) return <PedirNome aoSalvar={setEu} />;
  if (chat && corrida) return <Chat corridaId={corrida.id} papel="passageiro" mensagens={mensagens} aberto={!!corrida.motorista && corrida.aberta} fechar={() => setChat(false)} />;

  const mudarAba = (a: Aba) => { setAba(a); setAviso(""); };
  return (
    <div className="app">
      <header className="topo"><strong>{marca.nome}</strong><span className="situacao">{conectado ? `Olá, ${eu.nome.split(" ")[0]}` : "Reconectando…"}</span></header>
      {aviso && <div style={{ padding: "1rem 1rem 0" }}><Aviso texto={aviso} tipo="info" /></div>}
      {avaliar ? <Avaliar corrida={avaliar} fechar={() => setAvaliar(null)} />
        : aba === "inicio" ? (corrida
          ? <Acompanhar corrida={corrida} pos={posMotorista} abrirChat={() => setChat(true)} naoLidas={mensagens.filter((m) => m.de !== "passageiro").length} marca={marca}
            mudou={(c) => { setCorrida(c.aberta ? c : null); if (avisoDaTaxa(c)) setAviso(avisoDaTaxa(c)); }} />
          : <Pedir aoPedir={(c) => { setAviso(""); setCorrida(c); }} aoAgendar={(c) => { setAba("agendadas"); setAviso(`Corrida agendada para ${quandoAgendada(c.agendadaPara)}. Vamos chamar o motorista perto da hora.`); }} />)
        : aba === "agendadas" ? <Agendadas pedir={() => mudarAba("inicio")} />
        : aba === "historico" ? <Historico />
        : <Conta eu={eu} marca={marca} sair={async () => { await api("/sair", { corpo: {} }).catch(() => undefined); window.dispatchEvent(new Event("app-sair")); sair(); }} />}
      <Abas abas={[["inicio", corrida ? "Corrida" : "Pedir"], ["agendadas", "Agendadas"], ["historico", "Histórico"], ["conta", "Conta"]]} atual={aba} mudar={mudarAba} />
    </div>
  );
}

function PedirNome({ aoSalvar }: { aoSalvar: (e: Eu) => void }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  return (
    <form className="tela entrar" onSubmit={async (e) => { e.preventDefault(); try { aoSalvar((await api<{ eu: Eu }>("/eu", { corpo: { nome } })).eu); } catch (x) { setErro(mensagemDeErro(x)); } }}>
      <h1>Como podemos te chamar?</h1>
      <label>Seu nome<input autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <button className="botao" disabled={nome.trim().length < 2}>Continuar</button>
      <Aviso texto={erro} />
    </form>
  );
}

// ------------------------------------------------------------------ pedir

function CampoEndereco({ rotulo, valor, mudar, gps, placeholder = "Rua, número e bairro" }: { rotulo: string; valor: Ponto; mudar: (p: Ponto) => void; gps?: boolean; placeholder?: string }) {
  const [sugestoes, setSugestoes] = useState<Endereco[]>([]);
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);
  const tempo = useRef<ReturnType<typeof setTimeout>>();
  const digitar = (texto: string) => {
    mudar({ texto });
    clearTimeout(tempo.current);
    if (texto.trim().length < 4) { setSugestoes([]); return; }
    tempo.current = setTimeout(async () => {
      try { const r = await api<{ enderecos: Endereco[]; aviso: string | null }>(`/enderecos?q=${encodeURIComponent(texto)}`); setSugestoes(r.enderecos); setAviso(r.aviso ?? ""); } catch { setSugestoes([]); }
    }, 350);
  };
  const usarGps = async () => {
    setBuscando(true); setAviso("");
    try {
      const p = await posicaoAgora();
      const r = await api<{ endereco: Endereco | null }>(`/enderecos/ponto?lat=${p.lat}&lng=${p.lng}`);
      mudar({ texto: r.endereco?.texto ?? "Minha localização", lat: p.lat, lng: p.lng });
      setSugestoes([]);
    } catch (e) { setAviso(mensagemDeErro(e)); } finally { setBuscando(false); }
  };
  return (
    <>
      <label>{rotulo}
        <div className="linha" style={{ flex: "none" }}>
          <input value={valor.texto} placeholder={placeholder} onChange={(e) => digitar(e.target.value)} style={{ flex: 1 }} />
          {gps && <button type="button" className="botao secundario" style={{ flex: "none" }} onClick={() => void usarGps()} disabled={buscando} aria-label="Usar minha localização">📍</button>}
        </div>
      </label>
      {!!sugestoes.length && (
        <ul className="sugestoes">{sugestoes.map((s, i) => <li key={i}><button type="button" onClick={() => { mudar({ texto: s.texto, lat: s.lat, lng: s.lng }); setSugestoes([]); }}>{s.texto}</button></li>)}</ul>
      )}
      {aviso && <p className="dica">{aviso}</p>}
    </>
  );
}

const temCoord = <T extends Ponto>(p: T | null | undefined): p is T & { lat: number; lng: number } => p?.lat != null && p?.lng != null;
const MAX_PARADAS = 3;
let proximaParada = 1;

function Pedir({ aoPedir, aoAgendar }: { aoPedir: (c: Corrida) => void; aoAgendar: (c: Corrida) => void }) {
  const [embarque, setEmbarque] = useState<Ponto>({ texto: "" });
  const [destino, setDestino] = useState<Ponto>({ texto: "" });
  const [paradas, setParadas] = useState<Array<{ id: number; p: Ponto }>>([]);
  const [opcoes, setOpcoes] = useState<{ categorias: Categoria[]; pagamentos: string[] } | null>(null);
  const [precos, setPrecos] = useState<Record<string, number | null>>({});
  const [categoria, setCategoria] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [cupom, setCupom] = useState("");
  const [observacao, setObservacao] = useState("");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [dia, setDia] = useState("");
  const [horario, setHorario] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aqui, setAqui] = useState<Posicao | null>(null);
  const [alvoMapa, setAlvoMapa] = useState<string>("embarque");
  const [buscandoPonto, setBuscandoPonto] = useState(false);
  const pedidoId = useRef(`p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    void api<{ categorias: Categoria[]; pagamentos: string[] }>("/opcoes").then((o) => { setOpcoes(o); setCategoria(o.categorias[0]?.nome ?? ""); setPagamento(o.pagamentos[0] ?? ""); }).catch((e) => setErro(mensagemDeErro(e)));
    void posicaoAgora().then(setAqui).catch(() => undefined); // só para centralizar o mapa
  }, []);

  const paradasValidas = paradas.map((x) => x.p).filter((p) => p.texto.trim());
  const rota = [embarque, ...paradasValidas, destino];
  const chaveRota = rota.map((p) => (temCoord(p) ? `${p.lat},${p.lng}` : "-")).join("|");
  // Preço de cada categoria (passando pelas paradas) quando todos os pontos têm coordenadas.
  useEffect(() => {
    if (!opcoes || !temCoord(embarque) || !temCoord(destino) || !rota.every(temCoord)) { setPrecos({}); return; }
    let vivo = true;
    const t = setTimeout(() => {
      void Promise.all(opcoes.categorias.map((c) => estimarComParadas(c.nome, rota, c.aPartirDe).then((v) => [c.nome, v] as const).catch(() => [c.nome, null] as const)))
        .then((l) => { if (vivo) setPrecos(Object.fromEntries(l)); });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [opcoes, chaveRota]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudarParada = (id: number, p: Ponto) => setParadas((l) => l.map((x) => (x.id === id ? { ...x, p } : x)));
  const marcarNoMapa = async (pos: Posicao) => {
    setBuscandoPonto(true);
    let texto = "Ponto no mapa";
    try { const r = await api<{ endereco: Endereco | null }>(`/enderecos/ponto?lat=${pos.lat}&lng=${pos.lng}`); texto = r.endereco?.texto ?? texto; } catch { /* fica o texto genérico */ }
    setBuscandoPonto(false);
    const p = { texto, lat: pos.lat, lng: pos.lng };
    if (alvoMapa === "embarque") { setEmbarque(p); if (!temCoord(destino)) setAlvoMapa("destino"); }
    else if (alvoMapa === "destino") setDestino(p);
    else mudarParada(Number(alvoMapa.slice(7)), p);
  };

  const agendadaPara = quando === "agendar" && dia && horario ? `${dia}T${horario}` : "";
  const pedir = async () => {
    setErro("");
    if (quando === "agendar") {
      if (!agendadaPara) { setErro("Escolha o dia e a hora."); return; }
      if (agendadaPara < agoraBrasilia(15)) { setErro("Agende com pelo menos 15 minutos de antecedência."); return; }
      if (agendadaPara > agoraBrasilia(30 * 24 * 60)) { setErro("Dá para agendar até 30 dias para frente."); return; }
    }
    setEnviando(true);
    try {
      const r = await api<{ corrida: Corrida }>("/corridas", {
        corpo: {
          embarque, destino: destino.texto.trim() ? destino : undefined, paradas: paradasValidas.length ? paradasValidas : undefined,
          categoria, pagamento, cupom, observacao, pedidoId: pedidoId.current, agendadaPara: agendadaPara || undefined,
        },
      });
      pedidoId.current = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (r.corrida.agendadaPara && esperandoHorario(r.corrida)) aoAgendar(r.corrida); else aoPedir(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); pedidoId.current = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; } finally { setEnviando(false); }
  };
  if (!opcoes) return erro ? <div className="tela"><Aviso texto={erro} /></div> : <Carregando />;
  const temRota = rota.every(temCoord) && temCoord(destino);

  const pontosMapa: PontoMapa[] = [
    ...(temCoord(embarque) ? [{ lat: embarque.lat, lng: embarque.lng, tipo: "embarque" as const, rotulo: "Embarque" }] : []),
    ...paradas.map((x, i) => ({ ...x.p, i })).filter(temCoord).map((p) => ({ lat: p.lat, lng: p.lng, tipo: "parada" as const, rotulo: `Parada ${p.i + 1}` })),
    ...(temCoord(destino) ? [{ lat: destino.lat, lng: destino.lng, tipo: "destino" as const, rotulo: "Destino" }] : []),
  ];
  const alvos: Array<[string, string]> = [["embarque", "Embarque"], ...paradas.map((x, i) => [`parada-${x.id}`, `Parada ${i + 1}`] as [string, string]), ["destino", "Destino"]];
  const minDia = agoraBrasilia(15).slice(0, 10), maxDia = agoraBrasilia(30 * 24 * 60).slice(0, 10);

  return (
    <form className="tela" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
      <h1>Para onde vamos?</h1>
      <CampoEndereco rotulo="Embarque" valor={embarque} mudar={setEmbarque} gps />
      {paradas.map((x, i) => (
        <div key={x.id} className="parada">
          <div><CampoEndereco rotulo={`Parada ${i + 1}`} valor={x.p} mudar={(p) => mudarParada(x.id, p)} /></div>
          <button type="button" className="botao secundario remover" aria-label={`Remover parada ${i + 1}`} onClick={() => { setParadas((l) => l.filter((y) => y.id !== x.id)); if (alvoMapa === `parada-${x.id}`) setAlvoMapa("destino"); }}>✕</button>
        </div>
      ))}
      <CampoEndereco rotulo="Destino" valor={destino} mudar={setDestino} />
      {paradas.length < MAX_PARADAS && (
        <button type="button" className="botao-link" style={{ alignSelf: "flex-start" }} onClick={() => setParadas((l) => [...l, { id: proximaParada++, p: { texto: "" } }])}>+ Parada</button>
      )}
      <div className="tocar-mapa">
        <span>Toque no mapa para marcar:</span>
        {alvos.map(([id, nome]) => <button type="button" key={id} className={alvoMapa === id ? "ativa" : ""} onClick={() => setAlvoMapa(id)}>{nome}</button>)}
        {buscandoPonto && <span>buscando endereço…</span>}
      </div>
      <Mapa pontos={pontosMapa} centroInicial={aqui} aoTocar={(p) => void marcarNoMapa(p)} />
      <div className="categorias">
        {opcoes.categorias.map((c) => (
          <button type="button" key={c.nome} className={`categoria ${categoria === c.nome ? "ativa" : ""}`} onClick={() => setCategoria(c.nome)}>
            <span><strong>{c.nome}</strong>{c.descricao && <small>{c.descricao}</small>}</span>
            <strong>{temRota ? (c.nome in precos ? reais(precos[c.nome]) : "…") : c.aPartirDe != null ? `a partir de ${reais(c.aPartirDe)}` : ""}</strong>
          </button>
        ))}
      </div>
      {temRota && paradasValidas.length > 0 && <p className="dica">Preço aproximado, passando pelas paradas. O valor final sai no fim da corrida.</p>}
      <label>Pagamento
        <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>{opcoes.pagamentos.map((p) => <option key={p}>{p}</option>)}</select>
      </label>
      <div className="linha">
        <label>Cupom<input value={cupom} maxLength={30} onChange={(e) => setCupom(e.target.value.toUpperCase())} /></label>
        <label>Observação<input value={observacao} maxLength={300} placeholder="Ex.: portão azul" onChange={(e) => setObservacao(e.target.value)} /></label>
      </div>
      <div className="escolha" role="radiogroup" aria-label="Quando">
        <button type="button" role="radio" aria-checked={quando === "agora"} className={quando === "agora" ? "ativa" : ""} onClick={() => setQuando("agora")}>Pedir agora</button>
        <button type="button" role="radio" aria-checked={quando === "agendar"} className={quando === "agendar" ? "ativa" : ""} onClick={() => setQuando("agendar")}>Agendar</button>
      </div>
      {quando === "agendar" && (
        <>
          <div className="linha">
            <label>Dia<input type="date" value={dia} min={minDia} max={maxDia} onChange={(e) => setDia(e.target.value)} /></label>
            <label>Hora<input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} /></label>
          </div>
          <p className="dica">Horário de Brasília. De 15 minutos a 30 dias para frente.</p>
        </>
      )}
      <Aviso texto={erro} />
      <button className="botao grande" disabled={enviando || !embarque.texto.trim() || !categoria || !pagamento || (quando === "agendar" && !agendadaPara)}>
        {enviando ? (quando === "agendar" ? "Agendando…" : "Pedindo…") : quando === "agendar" ? `Agendar${agendadaPara ? ` para ${quandoAgendada(agendadaPara)}` : ""}` : "Pedir corrida"}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ acompanhar

function pontosDaCorrida(c: Corrida): PontoMapa[] {
  return [
    ...(temCoord(c.embarque) ? [{ lat: c.embarque.lat, lng: c.embarque.lng, tipo: "embarque" as const, rotulo: "Embarque" }] : []),
    ...(c.paradas ?? []).map((p, i) => ({ ...p, i })).filter(temCoord).map((p) => ({ lat: p.lat, lng: p.lng, tipo: "parada" as const, rotulo: `Parada ${p.i + 1}` })),
    ...(temCoord(c.destino) ? [{ lat: c.destino.lat, lng: c.destino.lng, tipo: "destino" as const, rotulo: "Destino" }] : []),
  ];
}

function Acompanhar({ corrida: c, pos, abrirChat, naoLidas, mudou, marca }: { corrida: Corrida; pos: Posicao | null; abrirChat: () => void; naoLidas: number; mudou: (c: Corrida) => void; marca: MarcaApp }) {
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const { estado: fav, mudar: mudarFav } = useFavorito(c);
  const antesDeComecar = ["procurando", "a_caminho", "no_local"].includes(c.status);
  const cancelar = async () => {
    if (!confirm("Cancelar a corrida?")) return;
    try { const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/cancelar`, { corpo: { motivo: "Cancelada pelo passageiro" } }); mudou(r.corrida); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const sos = async () => {
    if (!confirm("Avisar a central agora que você precisa de ajuda?")) return;
    const p = await posicaoAgora().catch(() => null);
    try { await api(`/corridas/${c.id}/sos`, { corpo: p ?? {} }); setAviso("A central foi avisada. Se for grave, ligue 190."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const compartilhar = async () => {
    setAviso("");
    const motorista = c.motorista ? ` com ${c.motorista.nome}, ${c.motorista.veiculo} placa ${c.motorista.placa}` : "";
    const r = c.compartilhar
      ? await compartilharTexto(`Acompanhe minha viagem ${marca.nome}${motorista}:`, linkPublico(c.compartilhar))
      : await compartilharTexto(`Estou em uma corrida ${marca.nome} (OS ${c.os})${motorista}. Embarque: ${c.embarque.texto}${c.destino ? `. Destino: ${c.destino.texto}` : ""}.`);
    if (r === "copiado") setAviso(c.compartilhar ? "Link copiado. Cole para quem vai acompanhar." : "Texto copiado. Cole para quem quiser.");
  };
  const favoritar = async () => {
    if (!fav) return;
    setErro("");
    try { await mudarFav("favorito", !fav.favorito); setAviso(fav.favorito ? "Motorista tirado dos favoritos." : "Motorista nos seus favoritos."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const pontos = pontosDaCorrida(c);
  const carro = pos && c.status !== "procurando" ? pos : null;

  return (
    <div className="tela">
      <Cartao className={c.status === "procurando" ? "pulso" : ""}>
        <div className="status">{c.statusTexto}</div>
        {c.status === "procurando" && <p className="dica">Estamos chamando o motorista mais perto. Isso leva poucos segundos.</p>}
        <dl className="dados">
          <dt>OS</dt><dd>{c.os}</dd>
          <dt>Embarque</dt><dd>{c.embarque.texto}</dd>
          {(c.paradas ?? []).map((p, i) => <Fragment key={i}><dt>Parada {i + 1}</dt><dd>{p.texto}</dd></Fragment>)}
          {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
          <dt>Pagamento</dt><dd>{c.pagamento}</dd>
          <dt>Valor</dt><dd>{reais(c.estimativa.valor != null ? c.estimativa.valor - (c.desconto ?? 0) : null)}{c.desconto ? ` (desconto ${reais(c.desconto)})` : ""}</dd>
        </dl>
      </Cartao>
      {(pontos.length > 0 || carro) && <Mapa pontos={pontos} carro={carro} />}
      {c.motorista && (
        <Cartao>
          <div className="interruptor">
            <h2 style={{ margin: 0 }}>{c.motorista.nome}</h2>
            {fav && <button className="botao-link" onClick={() => void favoritar()} aria-label={fav.favorito ? "Tirar dos favoritos" : "Favoritar motorista"}>{fav.favorito ? "★ Favorito" : "☆ Favoritar"}</button>}
          </div>
          <p className="dica">{c.motorista.veiculo} · <strong>{c.motorista.placa}</strong></p>
          <div className="acoes">
            <button className="botao" onClick={abrirChat}>Mensagens{naoLidas ? ` (${naoLidas})` : ""}</button>
            {c.motorista.telefone && <a className="botao secundario" style={{ textAlign: "center", textDecoration: "none" }} href={`tel:${c.motorista.telefone}`}>Ligar</a>}
          </div>
        </Cartao>
      )}
      <Aviso texto={aviso} tipo="ok" />
      <Aviso texto={erro} />
      <div className="acoes">
        <button className="botao secundario" onClick={() => void compartilhar()}>Compartilhar viagem</button>
        {antesDeComecar && <button className="botao secundario" onClick={() => void cancelar()}>Cancelar corrida</button>}
        {c.status !== "procurando" && <button className="botao sos" onClick={() => void sos()}>SOS</button>}
      </div>
      {marca.suporte.telefone && <p className="dica centro">Central: <a href={`tel:${marca.suporte.telefone.replace(/\D/g, "")}`}>{marca.suporte.telefone}</a></p>}
    </div>
  );
}

// ------------------------------------------------------------------ histórico

function Historico() {
  const [lista, setLista] = useState<Corrida[] | null>(null);
  const [aberta, setAberta] = useState<Corrida | null>(null);
  const [darNota, setDarNota] = useState(false);
  const carregar = () => api<{ corridas: Corrida[] }>("/corridas").then((r) => setLista(r.corridas)).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, []);
  if (!lista) return <Carregando />;

  if (aberta && darNota) return <Avaliar corrida={aberta} fechar={() => { setDarNota(false); setAberta(null); void carregar(); }} />;
  if (aberta) {
    const c = aberta;
    return (
      <div className="tela">
        <button className="botao-link" style={{ alignSelf: "flex-start" }} onClick={() => setAberta(null)}>‹ Voltar</button>
        <Cartao>
          <div className="status">{esperandoHorario(c) ? "Agendada" : c.statusTexto}</div>
          <dl className="dados">
            <dt>OS</dt><dd>{c.os}</dd>
            <dt>Data</dt><dd>{hora(c.solicitadaEm)}</dd>
            {c.agendadaPara && <><dt>Agendada</dt><dd>{quandoAgendada(c.agendadaPara)}</dd></>}
            <dt>Embarque</dt><dd>{c.embarque.texto}</dd>
            {(c.paradas ?? []).map((p, i) => <Fragment key={i}><dt>Parada {i + 1}</dt><dd>{p.texto}</dd></Fragment>)}
            {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
            <dt>Categoria</dt><dd>{c.categoria}</dd>
            <dt>Pagamento</dt><dd>{c.pagamento}</dd>
            {c.valor != null && <><dt>Valor</dt><dd>{reais(c.valor)}{c.desconto ? ` (desconto ${reais(c.desconto)})` : ""}</dd></>}
            {c.taxaCancelamento ? <><dt>Taxa</dt><dd>{reais(c.taxaCancelamento)} de cancelamento</dd></> : null}
            {c.motorista && <><dt>Motorista</dt><dd>{c.motorista.nome}{c.motorista.veiculo ? ` · ${c.motorista.veiculo}` : ""}{c.motorista.placa ? ` · ${c.motorista.placa}` : ""}</dd></>}
            {c.avaliacao ? <><dt>Sua nota</dt><dd>{c.avaliacao}★{c.comentario ? ` · “${c.comentario}”` : ""}</dd></> : null}
          </dl>
          {c.status === "finalizada" && c.avaliacao == null && <button className="botao" onClick={() => setDarNota(true)}>Dar nota</button>}
        </Cartao>
        {c.status === "finalizada" ? <OpcoesDaCorrida corrida={c} /> : c.taxaCancelamento ? <OpcoesDaCorrida corrida={c} soReclamar /> : null}
      </div>
    );
  }
  return (
    <div className="tela">
      <h1>Suas corridas</h1>
      {!lista.length && <p className="dica">Nenhuma corrida ainda.</p>}
      <ul className="lista">{lista.map((c) => (
        <li key={c.id} className="clicavel" role="button" tabIndex={0} onClick={() => setAberta(c)} onKeyDown={(e) => { if (e.key === "Enter") setAberta(c); }}>
          <span><strong>{c.agendadaPara ? quandoAgendada(c.agendadaPara) : hora(c.solicitadaEm)}</strong><br /><small className="dica">{c.destino?.texto ?? c.embarque.texto}</small></span>
          <span className="direita">{esperandoHorario(c) ? "Agendada" : c.statusTexto}<br /><strong>{c.valor != null ? reais(c.valor) : c.taxaCancelamento ? `taxa ${reais(c.taxaCancelamento)}` : ""}</strong>{c.avaliacao ? ` · ${c.avaliacao}★` : ""} ›</span>
        </li>
      ))}</ul>
    </div>
  );
}
