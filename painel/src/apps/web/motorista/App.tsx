// App do motorista (versão 2): login em 2 passos e cadastro em 5 passos (fica "em análise" até a central aprovar),
// início com mapa e o botão INICIAR/PARAR, chamada com o valor líquido em destaque (aceitar ou contra-oferta),
// corridas disponíveis, pendentes e programadas, corrida com botão de deslizar, maçaneta, ganhos, veículos,
// cadastro, carteira, documentos, preferências, suporte, diagnóstico e configurações.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, ChevronRight, Eye, EyeOff, Hand, Hourglass, LocateFixed, Menu as IconeMenu, Moon, Sun, Phone, Power, ShieldAlert, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { api, ErroApi, flutuante, manterTelaLigada, permissoesNativas, pararSons, rastrearEmSegundoPlano, ligarPush, observarPosicao, posicaoAgora, reais, tempoReal, tocarAlerta, token, vibrar, type Posicao } from "../comum/api";
import { aoChegarSos, aoFimDoSos, aoMudarSos, CartaoMeuSos, EmergenciaPerto, enviarSos, type SosPerto } from "../comum/sos";
import { Carregando, mensagemDeErro, ServidorTeste, useConfigDoPainel, useMarca, Aviso, type MarcaApp, type Mensagem } from "../comum/ui";
import { Cadastro } from "./Cadastro";
import { avisarNovoAviso, useNaoLidos } from "../comum/Avisos";
import { PermissoesPasso } from "./Permissoes";
import { ChatCorrida } from "./Conversa";
import { Chamada } from "./Chamada";
import { DepoisDaCorrida, EmCorrida } from "./Corrida";
import { Entrar } from "./Entrar";
import { Mapa } from "./Mapa";
import { AlterarSenha, Configuracoes, Corridas, Diagnostico, FaleConosco, Macaneta, MenuLateral, MeuCadastro, MeusVeiculos, Suporte } from "./Menu";
import { AvisoDoMotorista, BarraBaixo, Dialogo } from "./Pecas";
import { LogoMarca } from "./Marca";
import { Desafios, Notificacoes, PasseLivre, Preferencias } from "./Telas";
import { Atividades, CarteiraDoMotorista, HistoricoDeGanhos, TaxaDeAceitacao } from "./Atividades";
import { aplicarTema, NOMES_TEMA, temaPadraoDaEmpresa, useAjustes } from "./ajustes";
import { acompanharPersonalizacao, personalizacaoDoCache, usePersonalizacao } from "../comum/personalizacao";
import { usarSoWifi } from "./gravador";
import type { Corrida, Eu, Oferta } from "./tipos";

export default function App() {
  const { marca: marcaBase, erro } = useMarca();
  const pers = usePersonalizacao();
  // O nome escolhido em Configurações > Personalização app motorista vale no app inteiro.
  const marca = marcaBase && pers?.empresa.nome ? { ...marcaBase, nome: pers.empresa.nome } : marcaBase;
  const [logado, setLogado] = useState(!!token());
  useEffect(() => { personalizacaoDoCache(); }, []);
  const [cadastrando, setCadastrando] = useState(false);
  useEffect(() => { aplicarTema(); const f = () => setLogado(false); window.addEventListener("app-sair", f); return () => window.removeEventListener("app-sair", f); }, []);
  if (erro) return <div className="tela centro"><Aviso texto={erro} /><ServidorTeste /></div>;
  if (!marca) return <Carregando />;
  if (!logado) return cadastrando
    ? <Cadastro voltarAoLogin={() => setCadastrando(false)} concluir={() => { setCadastrando(false); setLogado(!!token()); }} />
    : <Entrar marca={marca} aoEntrar={() => setLogado(true)} cadastrar={() => setCadastrando(true)} />;
  return <><Logado marca={marca} sair={() => setLogado(false)} /><EmergenciaPerto ativo /><CartaoMeuSos /></>;
}

function Logado({ marca, sair }: { marca: MarcaApp; sair: () => void }) {
  const [ajustes, mudarAjustes] = useAjustes();
  const pers = usePersonalizacao();
  // Lê a personalização ao entrar, a cada minuto e ao voltar para o app (muda no painel, muda aqui, sem gerar APK).
  useEffect(() => acompanharPersonalizacao(), []);
  useEffect(() => { if (pers) temaPadraoDaEmpresa(pers.tema); }, [pers?.tema]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = (id: keyof NonNullable<typeof pers>["recursos"]) => pers?.recursos[id] !== false; // sem a personalização, tudo aparece
  const [eu, setEu] = useState<Eu | null>(null);
  const [online, setOnline] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [erroOferta, setErroOferta] = useState("");
  const [terminada, setTerminada] = useState<Corrida | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [chat, setChat] = useState(false);
  const [tela, setTela] = useState("");
  const { naoLidos } = useNaoLidos();
  const [menu, setMenu] = useState(false);
  const regras = useConfigDoPainel();
  const [dialogo, setDialogo] = useState<"" | "online" | "offline" | "analise" | "alerta">("");
  const [folhaAberta, setFolhaAberta] = useState(false); // folha de baixo do mapa: recolhida (barra) ou aberta (aviso + Desconectar)
  const [conectado, setConectado] = useState(false);
  const [hoje, setHoje] = useState<number | null>(null);
  const [centro, setCentro] = useState(0);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const atualRef = useRef<string | null>(null);
  const onlineRef = useRef(false);
  const ultimoEnvio = useRef(0);
  const posicaoRef = useRef<Posicao | null>(null);
  posicaoRef.current = posicao;

  const carregar = useCallback(async () => {
    const [e, s] = await Promise.all([api<{ eu: Eu }>("/eu"), api<{ corrida: Corrida | null; oferta: Oferta | null; online: boolean }>("/estado")]);
    setEu(e.eu); setCorrida(s.corrida); setOferta(s.oferta);
    if (onlineRef.current && !s.online) ultimoEnvio.current = 0; // servidor reiniciou: a próxima posição religa
  }, []);
  useEffect(() => { usarSoWifi(ajustes.gravarSoWifi); }, [ajustes.gravarSoWifi]); // gravações esperam o Wi‑Fi (ou saem logo)
  useEffect(() => { void manterTelaLigada(ajustes.manterTela, !ajustes.manterTela); return () => { void manterTelaLigada(false); }; }, [ajustes.manterTela, online, !!corrida]); // tela acesa online ou em corrida
  useEffect(() => { void rastrearEmSegundoPlano(online); return () => { void rastrearEmSegundoPlano(false); }; }, [online]); // online: serviço em primeiro plano manda a posição com a tela apagada
  const carregarGanhos = useCallback(() => { void api<{ hoje: { valor: number } }>("/ganhos").then((g) => setHoje(g.hoje.valor)).catch(() => undefined); }, []);
  useEffect(() => { void carregar().catch(() => undefined); carregarGanhos(); }, [carregar, carregarGanhos]);
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
    if (tipo === "aviso") { avisarNovoAviso(d); vibrar(120); return; }
    if (tipo === "oferta") { if (document.visibilityState === "hidden") void permissoesNativas.ofertaTelaCheia("Nova corrida", "Toque para ver a chamada"); setOferta(d as Oferta); setErroOferta(""); if (!ajustes.insistente) { tocarAlerta(4); } if (ajustes.vibrar) vibrar([400, 200, 400, 200, 400]); }
    else if (tipo === "sos") aoChegarSos(d as SosPerto);
    else if (tipo === "sos_fim") aoFimDoSos(d as { id: string });
    else if (tipo === "sos_estado") aoMudarSos();
    else if (tipo === "oferta_encerrada") { setOferta((o) => (o?.id === d.id ? null : o)); pararSons(); if (d.motivo) setAviso(String(d.motivo)); }
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
  }, (ligado) => { setConectado(ligado); if (ligado) void carregar().catch(() => undefined); }), [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ícone flutuante: online, com a opção ligada e o app minimizado, mostra a bolinha por cima de outros apps; ao voltar, some.
  useEffect(() => {
    if (!online || !ajustes.flutuante || !flutuante.disponivel()) { void flutuante.esconder(); return; }
    const mudou = () => { void (document.hidden ? flutuante.mostrar() : flutuante.esconder()); };
    document.addEventListener("visibilitychange", mudou);
    return () => { document.removeEventListener("visibilitychange", mudou); void flutuante.esconder(); };
  }, [online, ajustes.flutuante]);

  // GPS: online manda a posição (a cada 5 s no máximo); parado, reenvia a última a cada 30 s; se o servidor esqueceu, liga de novo.
  useEffect(() => {
    if (!online) return;
    onlineRef.current = true;
    let ultima: Posicao | null = null;
    const enviar = async (p: Posicao) => {
      ultimoEnvio.current = Date.now();
      try { await api("/posicao", { corpo: p }); }
      catch (e) { if (e instanceof ErroApi && e.status === 409) await api("/online", { corpo: p }).catch(() => undefined); }
    };
    const parar = observarPosicao((p) => { ultima = p; setPosicao(p); if (Date.now() - ultimoEnvio.current >= 5000) void enviar(p); }, (msg) => setErro(msg), true);
    const vivo = setInterval(() => { const p = ultima ?? posicaoRef.current; if (p && Date.now() - ultimoEnvio.current >= 25_000) void enviar(p); }, 30_000);
    return () => { onlineRef.current = false; clearInterval(vivo); parar(); };
  }, [online]);
  useEffect(() => { void posicaoAgora().then((p) => setPosicao((a) => a ?? p)).catch(() => undefined); }, []);
  useEffect(() => { void api("/ping", { corpo: {} }).catch(() => undefined); }, []); // avisa a central que o app está aberto
  // Primeira vez (e sempre que faltar alguma): abre o passo a passo das permissões do Android.
  useEffect(() => { void permissoesNativas.faltando().then((f) => { if (f.length) setTela((t) => t || "permissoes"); }); }, []);
  useEffect(() => { void api<{ online: boolean }>("/eu").then((r) => { if (r.online) setOnline(true); }).catch(() => undefined); }, []);

  const ficarOnline = async () => {
    setDialogo(""); setErro("");
    try {
      const p = posicao ?? await posicaoAgora();
      await api("/online", { corpo: p });
      setPosicao(p); ultimoEnvio.current = Date.now(); setOnline(true);
    } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const pedirAjuda = async () => {
    setDialogo("");
    try { await enviarSos(corrida?.id ?? null, posicao); } catch (e) { setErro(mensagemDeErro(e)); } // o cartão "Alerta enviado" mostra o resultado
  };
  const ficarOffline = async () => { setDialogo(""); setFolhaAberta(false); await api("/offline", { corpo: {} }).catch(() => undefined); setOnline(false); };
  const sairDaConta = async () => { await api("/sair", { corpo: {} }).catch(() => undefined); setOnline(false); window.dispatchEvent(new Event("app-sair")); sair(); };

  const aceitar = async (valor: number | null, contra: boolean) => {
    if (!oferta) return;
    setErroOferta("");
    try {
      if (contra) { await api(`/corridas/${oferta.corrida.id}/contraoferta`, { corpo: { valor } }); setOferta(null); setAviso("Contra-oferta enviada. Se o passageiro aceitar, a corrida vem para você."); return; }
      const r = await api<{ corrida: Corrida }>(`/ofertas/${oferta.id}/aceitar`, { corpo: {} });
      tocarAlerta(1, "aceite");
      setCorrida(r.corrida.aberta ? r.corrida : null); setTerminada(null); setTela(""); setOferta(null);
    } catch (e) { setErroOferta(mensagemDeErro(e)); }
  };
  const recusar = async () => { if (oferta) await api(`/ofertas/${oferta.id}/recusar`, { corpo: {} }).catch(() => undefined); setOferta(null); };

  if (!eu) return <Carregando />;
  if (chat && corrida) return <ChatCorrida corrida={corrida} mensagens={mensagens} fechar={() => setChat(false)} />;

  const chamada = oferta && (
    <Chamada key={oferta.id} dados={oferta.corrida} distanciaKm={oferta.distanciaKm} expira={oferta.expira} segundos={oferta.segundos} erro={erroOferta} aceitar={aceitar} recusar={() => void recusar()} />
  );

  // Corrida em andamento (ou a nota depois dela).
  if (corrida) return (
    <>
      <EmCorrida corrida={corrida} posicao={posicao} marca={marca} mudou={(c) => setCorrida(c?.aberta ? c : null)} finalizou={(c) => { setCorrida(null); setTerminada(c); carregarGanhos(); }}
        abrirChat={() => setChat(true)} naoLidas={mensagens.filter((m) => m.de !== "motorista").length} avisar={setAviso} />
      {chamada}
    </>
  );
  if (terminada) return <DepoisDaCorrida corrida={terminada} fim={() => setTerminada(null)} />;

  // Telas do menu.
  const voltar = () => setTela("");
  const telas: Record<string, ReactNode> = {
    macaneta: <Macaneta voltar={voltar} posicao={posicao} aoAbrir={(c) => { setCorrida(c); setTela(""); }} />,
    atividades: <Atividades voltar={voltar} eu={eu} irHistorico={() => setTela("historico")} irCarteira={() => setTela("carteira")} irAceitacao={() => setTela("aceitacao")} irDesafios={() => setTela("desafios")} />,
    historico: <HistoricoDeGanhos voltar={() => setTela("atividades")} />,
    aceitacao: <TaxaDeAceitacao voltar={() => setTela("atividades")} />,
    veiculos: <MeusVeiculos voltar={voltar} />,
    cadastro: <MeuCadastro voltar={voltar} aoMudar={() => void carregar()} irCarteira={() => setTela("carteira")} aoSairDaConta={() => { setOnline(false); window.dispatchEvent(new Event("app-sair")); sair(); }} />,
    senha: <AlterarSenha voltar={voltar} />,
    config: <Configuracoes voltar={voltar} />,
    diagnostico: <Diagnostico voltar={voltar} eu={eu} conectado={conectado} posicao={posicao} online={online} />,
    suporte: <Suporte voltar={voltar} marca={marca} />,
    fale: <FaleConosco voltar={voltar} marca={marca} />,
    carteira: <CarteiraDoMotorista voltar={() => setTela("atividades")} />,
    preferencias: <Preferencias voltar={voltar} />,
    desafios: <Desafios voltar={voltar} marca={marca} />,
    notificacoes: <Notificacoes voltar={voltar} />,
    passelivre: <PasseLivre voltar={voltar} />,
  };
  if (tela && telas[tela]) return <>{telas[tela]}{chamada}</>;

  // Início: mapa, ganhos de hoje, INICIAR/PARAR e a barra de baixo (igual à referência).
  const analise = eu.aprovado === false;
  const barra = (ativa: "mapa" | "corridas") => (
    <BarraBaixo ativa={ativa} online={online} procurando={conectado} aoMapa={() => setTela("")} aoCorridas={() => setTela("corridas")} aberta={online && folhaAberta} alternar={online ? () => setFolhaAberta((v) => !v) : undefined}>
      {online && folhaAberta && (
        <>
          <AvisoDoMotorista />
          <button type="button" className="botao-desconectar" onClick={() => setDialogo("offline")}>Desconectar</button>
        </>
      )}
    </BarraBaixo>
  );
  const dialogos = (
    <>
      {dialogo === "online" && <Dialogo icone={Power} titulo="Ficar Online" texto="Deseja se conectar e começar a receber solicitações de viagens agora?" cancelar={() => setDialogo("")} rotulo="Iniciar" confirmar={() => void ficarOnline()} />}
      {dialogo === "offline" && <Dialogo icone={Power} perigo titulo="Ficar Offline" texto="Deseja parar de receber solicitações de viagens por enquanto?" cancelar={() => setDialogo("")} rotulo="Desligar" confirmar={() => void ficarOffline()} />}
      {dialogo === "alerta" && (
        <Dialogo icone={ShieldAlert} perigo titulo="Precisa de ajuda?" texto="A central recebe um alerta agora, com a sua posição. Se for grave, ligue 190 ou 192 antes." cancelar={() => setDialogo("")} rotulo="Avisar a central" confirmar={() => void pedirAjuda()}>
          <a className="botao-ligar-emergencia" href="tel:190"><Phone size={18} /> Ligar 190 (Polícia)</a>
        </Dialogo>
      )}
      {dialogo === "analise" && <Dialogo icone={Hourglass} titulo="Cadastro em análise" texto="Você poderá ficar online depois que a central aprovar o seu cadastro. Confira se falta algum documento." cancelar={() => setDialogo("")} rotuloCancelar="Fechar" rotulo="Ver cadastro" confirmar={() => { setDialogo(""); setTela("cadastro"); }} />}
    </>
  );
  if (tela === "corridas") return <>{<Corridas barra={barra("corridas")} aoPegar={(c) => { setCorrida(c); setTela(""); }} />}{dialogos}{chamada}</>;
  return (
    <div className={`inicio-m estilo-${pers?.design.estiloTela ?? "flutuante"}`}>
      <Mapa pontos={posicao ? [{ ...posicao, rotulo: "Você", tipo: "eu" }] : []} centralizar={centro} className="cheia" />
      <div className="inicio-topo">
        <button type="button" className="pilula-menu" aria-label="Menu" onClick={() => setMenu(true)}><LogoMarca marca={marca} tamanho={40} /><IconeMenu size={24} /></button>
        {rec("saldo") && <span className="pilula-ganhos">
          <button type="button" aria-label={ajustes.esconderGanhos ? "Mostrar ganhos" : "Esconder ganhos"} onClick={() => mudarAjustes({ esconderGanhos: !ajustes.esconderGanhos })}>{ajustes.esconderGanhos ? <EyeOff size={20} /> : <Eye size={20} />}</button>
          <button type="button" aria-label="Histórico de ganhos" onClick={() => setTela("atividades")}>{ajustes.esconderGanhos ? "R$ ••••" : hoje == null ? <span className="girando" style={{ width: 16, height: 16, borderWidth: 2 }} /> : reais(hoje)} <ChevronRight size={14} style={{ opacity: .6 }} /></button>
        </span>}
        {rec("notificacoes") && <button type="button" className="mapa-botao" aria-label={naoLidos ? `Notificações, ${naoLidos} não lidas` : "Notificações"} style={{ position: "relative" }} onClick={() => setTela("notificacoes")}><Bell size={22} fill="currentColor" />{naoLidos > 0 && <span aria-hidden style={{ position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#e5484d", color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: "16px", textAlign: "center" }}>{naoLidos > 9 ? "9+" : naoLidos}</span>}</button>}
      </div>

      {(aviso || erro || analise) && (
        <div className="avisos-topo">
          {analise && <button type="button" className="aviso aviso-info" style={{ background: "var(--m-card)" }} onClick={() => setTela("cadastro")}><Hourglass size={14} /> Cadastro em análise{eu.pendencias?.length ? `: falta ${eu.pendencias.length} item(ns). Toque para completar.` : ". A central vai avisar quando aprovar."}</button>}
          {aviso && <button type="button" className="aviso aviso-ok" style={{ background: "var(--m-card)" }} onClick={() => setAviso("")}>{aviso}</button>}
          {erro && <button type="button" className="aviso aviso-erro" style={{ background: "var(--m-card)" }} onClick={() => setErro("")}>{erro}</button>}
        </div>
      )}

      {(regras?.motorista.botaoPanico ?? true) && rec("ajuda") && <button type="button" className="botao-alerta" aria-label="Pedir ajuda" onClick={() => setDialogo("alerta")}><TriangleAlert size={26} /></button>}

      <div className="inicio-flutuantes">
        {online && (regras?.macaneta.ativo ?? true) && rec("macaneta") && <button type="button" className="pilula-macaneta" onClick={() => setTela("macaneta")}><Hand size={18} /> Maçaneta</button>}
        <div className="direita">
          {online && rec("preferencias") && <button type="button" className="mapa-botao" aria-label="Preferências de corrida" onClick={() => setTela("preferencias")}><SlidersHorizontal size={22} /></button>}
          {rec("tema") && <button type="button" className="mapa-botao" aria-label={`Aparência: ${NOMES_TEMA[ajustes.tema]}. Toque para trocar`} onClick={() => mudarAjustes({ tema: ajustes.tema === "sistema" ? "claro" : ajustes.tema === "claro" ? "escuro" : "sistema" })}>{ajustes.tema === "escuro" ? <Moon size={22} /> : <Sun size={22} />}</button>}
          {rec("centralizar") && <button type="button" className="mapa-botao" aria-label="Centralizar no mapa" onClick={() => setCentro((n) => n + 1)}><LocateFixed size={22} /></button>}
        </div>
        {!online && <button type="button" className="botao-onoff" onClick={() => setDialogo(analise ? "analise" : "online")}>INICIAR</button>}
      </div>

      {barra("mapa")}

      {menu && <MenuLateral eu={eu} marca={marca} fechar={() => setMenu(false)} ir={setTela} sair={() => void sairDaConta()} />}
      {dialogos}
      {chamada}
    </div>
  );
}
