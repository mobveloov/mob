// App do passageiro: entrar pelo telefone, pedir corrida (endereço, categoria com preço, pagamento, cupom),
// acompanhar o motorista em tempo real, chat com texto e áudio, ligar, compartilhar, cancelar, SOS, avaliar e histórico.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, hora, ligarPush, posicaoAgora, reais, telefoneBonito, tempoReal, token, vibrar, type Posicao } from "../comum/api";
import { Abas, Aviso, Carregando, Cartao, Chat, Entrar, Estrelas, MapaSimples, mensagemDeErro, useMarca, type MarcaApp, type Mensagem } from "../comum/ui";

interface Ponto { texto: string; lat?: number; lng?: number }
interface Corrida {
  id: string; os: string; status: string; statusTexto: string; aberta: boolean; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string;
  estimativa: { valor: number | null; distanciaKm: number | null; minutos: number | null }; valor: number | null; desconto: number | null; avaliacao: number | null;
  solicitadaEm: string; motorista: { nome: string; veiculo: string; placa: string; telefone: string } | null;
}
interface Eu { nome: string; telefone: string }
interface Endereco { texto: string; lat: number; lng: number }
interface Categoria { nome: string; descricao: string; aPartirDe: number | null }

export default function App() {
  const { marca, erro } = useMarca();
  const [logado, setLogado] = useState(!!token());
  useEffect(() => { const f = () => setLogado(false); window.addEventListener("app-sair", f); return () => window.removeEventListener("app-sair", f); }, []);
  if (erro) return <div className="tela centro"><Aviso texto={erro} /></div>;
  if (!marca) return <Carregando />;
  if (!logado) return <Entrar marca={marca} papel="passageiro" aoEntrar={() => setLogado(true)} />;
  return <Logado marca={marca} sair={() => setLogado(false)} />;
}

function Logado({ marca, sair }: { marca: MarcaApp; sair: () => void }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [posMotorista, setPosMotorista] = useState<Posicao | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [chat, setChat] = useState(false);
  const [aba, setAba] = useState<"inicio" | "historico" | "conta">("inicio");
  const [conectado, setConectado] = useState(false);
  const [avaliar, setAvaliar] = useState<Corrida | null>(null);
  const atualRef = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const [e, s] = await Promise.all([api<{ eu: Eu }>("/eu"), api<{ corrida: Corrida | null; posicaoMotorista: Posicao | null }>("/estado")]);
    setEu(e.eu); setCorrida(s.corrida); setPosMotorista(s.posicaoMotorista);
  }, []);
  useEffect(() => { void carregar().catch(() => undefined); }, [carregar]);
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
      setCorrida((antes) => {
        if (antes && antes.id === c.id && antes.status !== c.status) vibrar([200, 100, 200]);
        return c.aberta ? c : antes?.id === c.id ? null : antes;
      });
      if (c.status === "finalizada" && c.avaliacao == null) setAvaliar(c);
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

  return (
    <div className="app">
      <header className="topo"><strong>{marca.nome}</strong><span className="situacao">{conectado ? `Olá, ${eu.nome.split(" ")[0]}` : "Reconectando…"}</span></header>
      {avaliar ? <Avaliar corrida={avaliar} fechar={() => setAvaliar(null)} />
        : aba === "inicio" ? (corrida ? <Acompanhar corrida={corrida} pos={posMotorista} abrirChat={() => setChat(true)} naoLidas={mensagens.filter((m) => m.de !== "passageiro").length} mudou={setCorrida} marca={marca} /> : <Pedir aoPedir={setCorrida} />)
        : aba === "historico" ? <Historico />
        : <Conta eu={eu} marca={marca} sair={async () => { await api("/sair", { corpo: {} }).catch(() => undefined); window.dispatchEvent(new Event("app-sair")); sair(); }} />}
      <Abas abas={[["inicio", corrida ? "Corrida" : "Pedir"], ["historico", "Histórico"], ["conta", "Conta"]]} atual={aba} mudar={setAba} />
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

function CampoEndereco({ rotulo, valor, mudar, gps }: { rotulo: string; valor: Ponto; mudar: (p: Ponto) => void; gps?: boolean }) {
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
          <input value={valor.texto} placeholder="Rua, número e bairro" onChange={(e) => digitar(e.target.value)} style={{ flex: 1 }} />
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

function Pedir({ aoPedir }: { aoPedir: (c: Corrida) => void }) {
  const [embarque, setEmbarque] = useState<Ponto>({ texto: "" });
  const [destino, setDestino] = useState<Ponto>({ texto: "" });
  const [opcoes, setOpcoes] = useState<{ categorias: Categoria[]; pagamentos: string[] } | null>(null);
  const [precos, setPrecos] = useState<Record<string, number | null>>({});
  const [categoria, setCategoria] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [cupom, setCupom] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pedidoId = useRef(`p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    void api<{ categorias: Categoria[]; pagamentos: string[] }>("/opcoes").then((o) => { setOpcoes(o); setCategoria(o.categorias[0]?.nome ?? ""); setPagamento(o.pagamentos[0] ?? ""); }).catch((e) => setErro(mensagemDeErro(e)));
  }, []);
  // Preço de cada categoria quando embarque e destino têm coordenadas.
  useEffect(() => {
    if (!opcoes || embarque.lat == null || destino.lat == null) { setPrecos({}); return; }
    const q = `latEmbarque=${embarque.lat}&lngEmbarque=${embarque.lng}&latDestino=${destino.lat}&lngDestino=${destino.lng}`;
    void Promise.all(opcoes.categorias.map((c) => api<{ valor: number | null }>(`/estimativa?categoria=${encodeURIComponent(c.nome)}&${q}`).then((r) => [c.nome, r.valor] as const).catch(() => [c.nome, null] as const)))
      .then((l) => setPrecos(Object.fromEntries(l)));
  }, [opcoes, embarque.lat, embarque.lng, destino.lat, destino.lng]);

  const pedir = async () => {
    setErro(""); setEnviando(true);
    try {
      const r = await api<{ corrida: Corrida }>("/corridas", { corpo: { embarque, destino: destino.texto.trim() ? destino : undefined, categoria, pagamento, cupom, observacao, pedidoId: pedidoId.current } });
      aoPedir(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); pedidoId.current = `p-${Date.now()}`; } finally { setEnviando(false); }
  };
  if (!opcoes) return erro ? <div className="tela"><Aviso texto={erro} /></div> : <Carregando />;
  const temRota = embarque.lat != null && destino.lat != null;

  return (
    <form className="tela" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
      <h1>Para onde vamos?</h1>
      <CampoEndereco rotulo="Embarque" valor={embarque} mudar={setEmbarque} gps />
      <CampoEndereco rotulo="Destino" valor={destino} mudar={setDestino} />
      {temRota && <MapaSimples pontos={[{ lat: embarque.lat!, lng: embarque.lng!, rotulo: "Embarque", tipo: "embarque" }, { lat: destino.lat!, lng: destino.lng!, rotulo: "Destino", tipo: "destino" }]} />}
      <div className="categorias">
        {opcoes.categorias.map((c) => (
          <button type="button" key={c.nome} className={`categoria ${categoria === c.nome ? "ativa" : ""}`} onClick={() => setCategoria(c.nome)}>
            <span><strong>{c.nome}</strong>{c.descricao && <small>{c.descricao}</small>}</span>
            <strong>{temRota ? reais(precos[c.nome]) : c.aPartirDe != null ? `a partir de ${reais(c.aPartirDe)}` : ""}</strong>
          </button>
        ))}
      </div>
      <label>Pagamento
        <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>{opcoes.pagamentos.map((p) => <option key={p}>{p}</option>)}</select>
      </label>
      <div className="linha">
        <label>Cupom<input value={cupom} maxLength={30} onChange={(e) => setCupom(e.target.value.toUpperCase())} /></label>
        <label>Observação<input value={observacao} maxLength={300} placeholder="Ex.: portão azul" onChange={(e) => setObservacao(e.target.value)} /></label>
      </div>
      <Aviso texto={erro} />
      <button className="botao grande" disabled={enviando || !embarque.texto.trim() || !categoria || !pagamento}>{enviando ? "Pedindo…" : "Pedir corrida"}</button>
    </form>
  );
}

// ------------------------------------------------------------------ acompanhar

function Acompanhar({ corrida: c, pos, abrirChat, naoLidas, mudou, marca }: { corrida: Corrida; pos: Posicao | null; abrirChat: () => void; naoLidas: number; mudou: (c: Corrida | null) => void; marca: MarcaApp }) {
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const antesDeComecar = ["procurando", "a_caminho", "no_local"].includes(c.status);
  const cancelar = async () => {
    if (!confirm("Cancelar a corrida?")) return;
    try { const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/cancelar`, { corpo: { motivo: "Cancelada pelo passageiro" } }); mudou(r.corrida.aberta ? r.corrida : null); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const sos = async () => {
    if (!confirm("Avisar a central agora que você precisa de ajuda?")) return;
    const p = await posicaoAgora().catch(() => null);
    try { await api(`/corridas/${c.id}/sos`, { corpo: p ?? {} }); setAviso("A central foi avisada. Se for grave, ligue 190."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const compartilhar = async () => {
    const texto = `Estou em uma corrida ${marca.nome} (OS ${c.os})${c.motorista ? ` com ${c.motorista.nome}, ${c.motorista.veiculo} placa ${c.motorista.placa}` : ""}. Embarque: ${c.embarque.texto}${c.destino ? `. Destino: ${c.destino.texto}` : ""}.`;
    try { if (navigator.share) await navigator.share({ text: texto }); else { await navigator.clipboard.writeText(texto); setAviso("Texto copiado. Cole para quem quiser."); } } catch { /* cancelou */ }
  };
  const pontos = [
    ...(c.embarque.lat != null ? [{ lat: c.embarque.lat, lng: c.embarque.lng!, rotulo: "Embarque", tipo: "embarque" as const }] : []),
    ...(c.destino?.lat != null ? [{ lat: c.destino.lat, lng: c.destino.lng!, rotulo: "Destino", tipo: "destino" as const }] : []),
    ...(pos && c.status !== "procurando" ? [{ ...pos, rotulo: "Motorista", tipo: "carro" as const }] : []),
  ];

  return (
    <div className="tela">
      <Cartao className={c.status === "procurando" ? "pulso" : ""}>
        <div className="status">{c.statusTexto}</div>
        {c.status === "procurando" && <p className="dica">Estamos chamando o motorista mais perto. Isso leva poucos segundos.</p>}
        <dl className="dados">
          <dt>OS</dt><dd>{c.os}</dd>
          <dt>Embarque</dt><dd>{c.embarque.texto}</dd>
          {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
          <dt>Pagamento</dt><dd>{c.pagamento}</dd>
          <dt>Valor</dt><dd>{reais(c.estimativa.valor != null ? c.estimativa.valor - (c.desconto ?? 0) : null)}{c.desconto ? ` (desconto ${reais(c.desconto)})` : ""}</dd>
        </dl>
      </Cartao>
      {pontos.length > 0 && <MapaSimples pontos={pontos} />}
      {c.motorista && (
        <Cartao>
          <h2>{c.motorista.nome}</h2>
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

function Avaliar({ corrida, fechar }: { corrida: Corrida; fechar: () => void }) {
  const [nota, setNota] = useState(0);
  const [erro, setErro] = useState("");
  return (
    <div className="tela centro">
      <h1>Corrida finalizada</h1>
      <p className="numero-grande">{reais(corrida.valor)}</p>
      <p>Como foi a viagem com {corrida.motorista?.nome ?? "o motorista"}?</p>
      <Estrelas valor={nota} aoEscolher={setNota} />
      <Aviso texto={erro} />
      <div className="linha" style={{ width: "100%" }}>
        <button className="botao secundario" onClick={fechar}>Agora não</button>
        <button className="botao" disabled={!nota} onClick={async () => { try { await api(`/corridas/${corrida.id}/avaliar`, { corpo: { nota } }); fechar(); } catch (e) { setErro(mensagemDeErro(e)); } }}>Enviar nota</button>
      </div>
    </div>
  );
}

function Historico() {
  const [lista, setLista] = useState<Corrida[] | null>(null);
  useEffect(() => { void api<{ corridas: Corrida[] }>("/corridas").then((r) => setLista(r.corridas)).catch(() => setLista([])); }, []);
  if (!lista) return <Carregando />;
  return (
    <div className="tela">
      <h1>Suas corridas</h1>
      {!lista.length && <p className="dica">Nenhuma corrida ainda.</p>}
      <ul className="lista">{lista.map((c) => (
        <li key={c.id}><span><strong>{hora(c.solicitadaEm)}</strong><br /><small className="dica">{c.destino?.texto ?? c.embarque.texto}</small></span><span style={{ textAlign: "right" }}>{c.statusTexto}<br /><strong>{c.valor != null ? reais(c.valor) : ""}</strong>{c.avaliacao ? ` · ${c.avaliacao}★` : ""}</span></li>
      ))}</ul>
    </div>
  );
}

function Conta({ eu, marca, sair }: { eu: Eu; marca: MarcaApp; sair: () => void }) {
  return (
    <div className="tela">
      <h1>Conta</h1>
      <Cartao><dl className="dados"><dt>Nome</dt><dd>{eu.nome}</dd><dt>Celular</dt><dd>{telefoneBonito(eu.telefone)}</dd></dl></Cartao>
      <Cartao>
        <h2>Ajuda</h2>
        {marca.suporte.telefone && <p>Central: <a href={`tel:${marca.suporte.telefone.replace(/\D/g, "")}`}>{marca.suporte.telefone}</a></p>}
        {marca.suporte.email && <p>E-mail: <a href={`mailto:${marca.suporte.email}`}>{marca.suporte.email}</a></p>}
      </Cartao>
      <button className="botao secundario" onClick={sair}>Sair</button>
    </div>
  );
}
