// App do passageiro (versão 2): login e criar conta (com cidade e foto), início com mapa e atalhos, "para onde vamos"
// (paradas, favoritos, escolher no mapa), opções da corrida (categoria com preço que dá para ajustar, opcionais,
// pagamento, cupom, agendar), procurando motorista com contra-ofertas, acompanhar a viagem, chat com texto e áudio,
// avaliar com etiquetas, histórico, agendadas e conta.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api, hora, ligarPush, posicaoAgora, reais, tempoReal, token, vibrar, type Posicao } from "../comum/api";
import { Clock, House, User, Wallet } from "lucide-react";
import { Aviso, Carregando, Cartao, Chat, ServidorTeste, useMarca, type MarcaApp, type Mensagem } from "../comum/ui";
import { esperandoHorario, lerLugares, quandoAgendada, type Corrida, type Endereco, type Eu, type Lugares, type Ponto, type Rota } from "./apoio";
import { Agendadas, CarteiraTela, Conta } from "./Conta";
import { Avatar, MenuBaixo } from "./pecas";
import { Acompanhar, Procurando } from "./Corrida";
import { Entrar } from "./Entrar";
import { Inicio } from "./Inicio";
import { Opcoes } from "./Opcoes";
import { ParaOnde, type ModoParaOnde } from "./ParaOnde";
import { Avaliar, OpcoesDaCorrida } from "./PosCorrida";
import "./passageiro.css";
import "./passageiro-m.css";

type Aba = "inicio" | "agendadas" | "historico" | "carteira" | "conta";
type Fluxo = { tela: "" } | { tela: "paraonde"; modo: ModoParaOnde } | { tela: "opcoes"; rota: Rota };

export default function App() {
  const { marca, erro } = useMarca();
  const [logado, setLogado] = useState(!!token());
  useEffect(() => { const f = () => setLogado(false); window.addEventListener("app-sair", f); return () => window.removeEventListener("app-sair", f); }, []);
  if (erro) return <div className="tela centro"><Aviso texto={erro} /><ServidorTeste /></div>;
  if (!marca) return <Carregando />;
  if (!logado) return <Entrar marca={marca} aoEntrar={() => setLogado(true)} />;
  return <Logado marca={marca} sair={() => setLogado(false)} />;
}

const avisoDaTaxa = (c: Corrida) => (c.status === "cancelada" && c.taxaCancelamento ? `Corrida cancelada. Foi cobrada uma taxa de cancelamento de ${reais(c.taxaCancelamento)}.` : "");

/** Endereço de onde a pessoa está agora (para a partida quando ela vai direto para casa ou trabalho). */
async function partidaAgora(aqui: Posicao | null): Promise<Ponto> {
  const p = aqui ?? await posicaoAgora();
  try {
    const r = await api<{ endereco: Endereco | null }>(`/enderecos/ponto?lat=${p.lat}&lng=${p.lng}`);
    return { texto: r.endereco?.texto ?? "Minha localização", lat: p.lat, lng: p.lng };
  } catch { return { texto: "Minha localização", lat: p.lat, lng: p.lng }; }
}

function Logado({ marca, sair }: { marca: MarcaApp; sair: () => void }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [posMotorista, setPosMotorista] = useState<Posicao | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [chat, setChat] = useState(false);
  const [aba, setAba] = useState<Aba>("inicio");
  const [fluxo, setFluxo] = useState<Fluxo>({ tela: "" });
  const [aqui, setAqui] = useState<Posicao | null>(null);
  const [lugares, setLugares] = useState<Lugares | null>(null);
  const [avaliar, setAvaliar] = useState<Corrida | null>(null);
  const [conectado, setConectado] = useState(false);
  const [aviso, setAviso] = useState("");
  const atualRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const [e, s] = await Promise.all([api<{ eu: Eu }>("/eu"), api<{ corrida: Corrida | null; posicaoMotorista: Posicao | null }>("/estado")]);
    setEu(e.eu); setCorrida(s.corrida); setPosMotorista(s.posicaoMotorista);
  }, []);
  const carregarLugares = useCallback(() => { void lerLugares().then(setLugares).catch(() => undefined); }, []);
  useEffect(() => { void carregar().catch(() => undefined); carregarLugares(); void posicaoAgora().then(setAqui).catch(() => undefined); }, [carregar, carregarLugares]);
  // Sem posição ainda (permissão liberada depois): pede de novo ao começar a pedir uma corrida.
  useEffect(() => { if (!aqui && fluxo.tela !== "") void posicaoAgora().then(setAqui).catch(() => undefined); }, [fluxo.tela, aqui]);
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") void carregar().catch(() => undefined); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [carregar]);
  useEffect(() => { void ligarPush(marca.push, () => void carregar()); }, [marca.push, carregar]);

  useEffect(() => {
    atualRef.current = corrida?.aberta ? corrida.id : null;
    if (!corrida?.motorista || !corrida.aberta) { setMensagens([]); return; }
    void api<{ mensagens: Mensagem[] }>(`/corridas/${corrida.id}/chat`).then((r) => setMensagens(r.mensagens)).catch(() => undefined);
  }, [corrida?.id, corrida?.aberta, !!corrida?.motorista]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (chat && corrida) return <Chat corridaId={corrida.id} papel="passageiro" mensagens={mensagens} titulo={corrida.motorista?.nome} avatar={corrida.motorista ? <Avatar foto={corrida.motorista.foto} nome={corrida.motorista.nome} tamanho={40} /> : undefined} telefone={corrida.motorista?.telefone} aberto={!!corrida.motorista && corrida.aberta} fechar={() => { setChat(false); void api(`/corridas/${corrida.id}/chat/lida`, { corpo: {} }).catch(() => undefined); }} />;
  if (avaliar) return <Avaliar corrida={avaliar} fechar={() => setAvaliar(null)} />;

  // Corrida em andamento: procurando motorista ou acompanhando a viagem (tela cheia, sem abas).
  if (corrida && !esperandoHorario(corrida)) {
    const mudou = (c: Corrida) => { setCorrida(c.aberta ? c : null); if (avisoDaTaxa(c)) setAviso(avisoDaTaxa(c)); };
    return corrida.status === "procurando"
      ? <Procurando corrida={corrida} mudou={mudou} recarregar={() => void carregar()} />
      : <Acompanhar corrida={corrida} pos={posMotorista} marca={marca} naoLidas={mensagens.filter((m) => m.de !== "passageiro").length} abrirChat={() => setChat(true)} mudou={mudou} />;
  }

  // Pedir: para onde vamos e opções da corrida (tela cheia).
  if (fluxo.tela === "paraonde") return <ParaOnde aqui={aqui} lugares={lugares} modo={fluxo.modo} voltar={() => setFluxo({ tela: "" })} seguir={(rota) => setFluxo({ tela: "opcoes", rota })} mudouLugares={setLugares} />;
  if (fluxo.tela === "opcoes") return <Opcoes rota={fluxo.rota} voltar={() => setFluxo({ tela: "paraonde", modo: "destino" })}
    pediu={(c) => { setAviso(""); setFluxo({ tela: "" }); setCorrida(c); }}
    agendou={(c) => { setFluxo({ tela: "" }); setAba("agendadas"); setAviso(`Corrida agendada para ${quandoAgendada(c.agendadaPara)}. Vamos chamar o motorista perto da hora.`); }} />;

  const atalho = async (a: "casa" | "trabalho" | "recentes") => {
    if (a === "recentes") { setFluxo({ tela: "paraonde", modo: "recentes" }); return; }
    const lugar = lugares?.[a];
    if (!lugar) { setFluxo({ tela: "paraonde", modo: a }); return; }
    try { setFluxo({ tela: "opcoes", rota: { partida: await partidaAgora(aqui), paradas: [], destino: lugar } }); } catch { setFluxo({ tela: "paraonde", modo: a }); }
  };
  const mudarAba = (a: Aba) => { setAba(a); setAviso(""); };

  return (
    <div className="app">
      
      {aviso && <div style={{ padding: "1rem 1rem 0", position: aba === "inicio" ? "fixed" : "static", zIndex: 40, top: aba === "inicio" ? "9rem" : undefined, left: 0, right: 0 }}><Aviso texto={aviso} tipo="info" /></div>}
      {aba === "inicio" ? <Inicio eu={eu} aqui={aqui} lugares={lugares} irPara={() => setFluxo({ tela: "paraonde", modo: "destino" })} atalho={(a) => void atalho(a)} indique={() => { setAba("conta"); }} />
        : aba === "agendadas" ? <Agendadas pedir={() => mudarAba("inicio")} />
          : aba === "historico" ? <Historico irAgendadas={() => mudarAba("agendadas")} />
            : aba === "carteira" ? <CarteiraTela />
              : <Conta eu={eu} marca={marca} irPara={mudarAba} mudouEu={() => void carregar()} sair={async () => { await api("/sair", { corpo: {} }).catch(() => undefined); window.dispatchEvent(new Event("app-sair")); sair(); }} />}
      <MenuBaixo atual={aba === "agendadas" ? "historico" : aba} mudar={mudarAba}
        itens={[["inicio", "Início", <House size={26} />], ["historico", "Histórico", <Clock size={26} />], ["carteira", "Carteira", <Wallet size={26} />], ["conta", "Conta", <User size={26} />]]} />
    </div>
  );
}

// ------------------------------------------------------------------ histórico

function Historico({ irAgendadas }: { irAgendadas: () => void }) {
  const [lista, setLista] = useState<Corrida[] | null>(null);
  const [aberta, setAberta] = useState<Corrida | null>(null);
  const [darNota, setDarNota] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "finalizadas" | "canceladas" | "andamento">("todas");
  const [dataFiltro, setDataFiltro] = useState("");
  const carregar = useCallback(() => api<{ corridas: Corrida[] }>(`/corridas?filtro=${filtro}`).then((r) => setLista(r.corridas)).catch(() => setLista([])), [filtro]);
  useEffect(() => { void carregar(); }, [carregar]);
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
  const filtros: Array<[typeof filtro, string]> = [["todas", "Todas"], ["finalizadas", "Finalizadas"], ["canceladas", "Canceladas"], ["andamento", "Em andamento"]];
  return (
    <div className="tela">
      <h1 className="titulo-tela">Suas Viagens</h1>
      <div className="pilulas">{filtros.map(([id, nome]) => <button key={id} className={filtro === id ? "ativa" : ""} onClick={() => { setLista(null); setFiltro(id); }}>{nome}</button>)}<button onClick={irAgendadas}>Agendadas</button><label className={`pilula-data ${dataFiltro ? "ativa" : ""}`}>Filtrar Data<input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} /></label>{dataFiltro && <button onClick={() => setDataFiltro("")}>Limpar data</button>}</div>
      {!lista.length && <div className="vazio"><span className="vazio-icone"><Clock size={34} /></span><strong>Nenhuma viagem por aqui</strong><p>Quando você realizar corridas, elas aparecerão organizadas aqui.</p></div>}
      <ul className="lista">{lista.filter((c) => !dataFiltro || (c.agendadaPara ?? c.solicitadaEm).slice(0, 10) === dataFiltro).map((c) => (
        <li key={c.id} className="clicavel" role="button" tabIndex={0} onClick={() => setAberta(c)} onKeyDown={(e) => { if (e.key === "Enter") setAberta(c); }}>
          <span><strong>{c.agendadaPara ? quandoAgendada(c.agendadaPara) : hora(c.solicitadaEm)}</strong><br /><small className="dica">OS {c.os} · {c.destino?.texto ?? c.embarque.texto}</small></span>
          <span className="direita">{esperandoHorario(c) ? "Agendada" : c.statusTexto}<br /><strong>{c.valor != null ? reais(c.valor) : c.taxaCancelamento ? `taxa ${reais(c.taxaCancelamento)}` : ""}</strong>{c.avaliacao ? ` · ${c.avaliacao}★` : ""}</span>
        </li>
      ))}</ul>
    </div>
  );
}
