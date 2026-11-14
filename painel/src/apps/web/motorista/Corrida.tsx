// Corrida em andamento: mapa escuro, faixa de navegação no topo, cartão do passageiro (Chat e Ligar), local do
// próximo ponto com o botão de navegar, rota completa, editar rota, pagamento, valor e o botão de deslizar de
// cada etapa: "Cheguei ao local", "Iniciar viagem", "Saí da parada" e "Finalizar". Depois, a nota do passageiro.

import { useEffect, useRef, useState } from "react";
import {
  Ban, Banknote, ChevronRight, CircleAlert, Flag, LocateFixed, MessageCircle, Navigation, PackageSearch, Pencil, Phone, Plus, Search,
  ArrowUp, BadgeCheck, CornerUpLeft, CornerUpRight, Moon, ShieldAlert, Star, Sun, Undo2, Volume2, VolumeX, X,
} from "lucide-react";
import { api, reais, type Posicao } from "../comum/api";
import { Estrelas, mensagemDeErro, type MarcaApp } from "../comum/ui";
import { falar, linkNavegar, useAjustes } from "./ajustes";
import { Mapa, type PontoMapa } from "./Mapa";
import { textoMetros, useNavegacao } from "./Navegacao";
import { Avatar, Deslizar, Dialogo, Erro, Folha, Info, Pagina, Topo, semRota } from "./Pecas";
import { distanciaKm, distanciaTexto, soHora, temPosicao, valorDe, type Corrida, type Ponto } from "./tipos";

/** Pontos da viagem em ordem: embarque, paradas e destino. */
export function pontosDaViagem(c: { embarque: Ponto; paradas?: Ponto[]; destino?: Ponto | null }): PontoMapa[] {
  const l: PontoMapa[] = [];
  if (temPosicao(c.embarque)) l.push({ lat: c.embarque.lat, lng: c.embarque.lng, rotulo: "Embarque", tipo: "embarque" });
  (c.paradas ?? []).forEach((p, i) => { if (temPosicao(p)) l.push({ lat: p.lat, lng: p.lng, rotulo: `Parada ${i + 1}`, tipo: "parada" }); });
  if (temPosicao(c.destino)) l.push({ lat: c.destino.lat, lng: c.destino.lng, rotulo: "Destino", tipo: "destino" });
  return l;
}

// Parada em que o motorista está (guardada no aparelho, para não perder se o app fechar).
const chaveParada = (id: string) => `parada-${id}`;
const lerParada = (id: string) => { try { return Number(localStorage.getItem(chaveParada(id))) || 0; } catch { return 0; } };
const gravarParada = (id: string, n: number | null) => { try { if (n == null) localStorage.removeItem(chaveParada(id)); else localStorage.setItem(chaveParada(id), String(n)); } catch { /* sem armazenamento */ } };

const ehTaximetro = (c: Corrida) => c.modo === "taximetro" || (/ma[cç]aneta/i.test(c.canal ?? "") && !c.destino);

function useRelogio(ativo: boolean) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { if (!ativo) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, [ativo]);
  return agora;
}

export function EmCorrida({ corrida: c, posicao, marca, mudou, finalizou, abrirChat, naoLidas, avisar }: {
  corrida: Corrida; posicao: Posicao | null; marca: MarcaApp; mudou: (c: Corrida | null) => void; finalizou: (c: Corrida) => void;
  abrirChat: () => void; naoLidas: number; avisar: (s: string) => void;
}) {
  const [ajustes, mudar] = useAjustes();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [parada, setParada] = useState(() => lerParada(c.id));
  const [folha, setFolha] = useState<"" | "rota" | "editar" | "perfil" | "finalizar" | "cancelar" | "sos">("");
  // Folha de baixo com 3 alturas: 0 recolhida (só o passageiro e o botão de deslizar), 1 meio, 2 aberta. Lembra a última.
  const [nivel, setNivel] = useState<0 | 1 | 2>(() => { try { const n = Number(localStorage.getItem("folha-corrida-nivel")); return n === 0 || n === 1 || n === 2 ? n : 1; } catch { return 1; } });
  const mudarNivel = (n: number) => { const v = Math.max(0, Math.min(2, n)) as 0 | 1 | 2; setNivel(v); try { localStorage.setItem("folha-corrida-nivel", String(v)); } catch { /* sem armazenamento */ } };
  const arraste = useRef<number | null>(null);
  const [centro, setCentro] = useState(0);
  const [temaMapa, setTemaMapa] = useState<"claro" | "escuro" | undefined>(() => { try { return (localStorage.getItem("tema-mapa-motorista") as "claro" | "escuro" | null) ?? undefined; } catch { return undefined; } });
  const trocarTema = () => {
    const atual = temaMapa ?? (document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro");
    const novo = atual === "escuro" ? "claro" : "escuro";
    setTemaMapa(novo); try { localStorage.setItem("tema-mapa-motorista", novo); } catch { /* sem armazenamento */ }
  };
  const avisado = useRef("");
  const paradas = c.paradas ?? [];
  const taximetro = ehTaximetro(c);
  const agora = useRelogio(taximetro && c.status === "em_andamento");

  const emViagem = c.status === "em_andamento";
  const naParada = emViagem && parada < paradas.length;
  const alvo: Ponto = !emViagem ? c.embarque : naParada ? paradas[parada] : c.destino ?? c.embarque;
  const nomeAlvo = !emViagem ? "LOCAL DE EMBARQUE" : naParada ? `PARADA ${parada + 1}` : c.destino ? "DESTINO" : "EMBARQUE";
  const longe = posicao && temPosicao(alvo) ? distanciaKm(posicao, alvo) : null;
  // GPS do próprio app: instrução da próxima curva, rota pelas ruas, recálculo e voz.
  const nativo = ajustes.navegador === "nativo";
  const nav = useNavegacao(posicao, alvo, nativo, ajustes.voz);
  const Seta = nav.passo?.modificador?.includes("left") ? CornerUpLeft : nav.passo?.modificador?.includes("right") ? CornerUpRight : nav.passo?.modificador === "uturn" ? Undo2 : nav.passo?.tipo === "arrive" ? Flag : ArrowUp;

  // Co-piloto de voz: avisa uma vez ao chegar perto do próximo ponto.
  useEffect(() => {
    const chave = `${c.id}-${c.status}-${parada}`;
    if (longe == null || longe > 0.3 || avisado.current === chave || (emViagem && !c.destino && !naParada)) return;
    avisado.current = chave;
    falar(!emViagem ? "Você está chegando ao local de embarque." : naParada ? `Você está chegando à parada ${parada + 1}.` : "Você está chegando ao destino.");
  }, [longe, c.id, c.status, parada, emViagem, naParada, c.destino]);

  const status = async (s: string, extra: Record<string, unknown> = {}) => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/status`, { corpo: { status: s, ...extra } });
      if (s === "finalizada") { gravarParada(c.id, null); finalizou(r.corrida); } else mudou(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const passouParada = () => { const n = parada + 1; setParada(n); gravarParada(c.id, n); };
  const [motivos, setMotivos] = useState<string[]>([]);
  const [motivo, setMotivo] = useState("");
  useEffect(() => { if (folha === "cancelar" && !motivos.length) void api<{ motivos: string[] }>("/motivos-cancelamento").then((r) => setMotivos(r.motivos)).catch(() => setMotivos(["Passageiro não apareceu", "Problema no veículo", "Outro motivo"])); }, [folha]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelar = async () => {
    const desistir = c.status === "a_caminho";
    try {
      await api(`/corridas/${c.id}/cancelar`, { corpo: { motivo: motivo || "Cancelada pelo motorista" } });
      gravarParada(c.id, null); mudou(null); avisar(desistir ? "Você desistiu da corrida." : "Corrida cancelada.");
    } catch (e) { setErro(mensagemDeErro(e)); }
    setFolha("");
  };
  const sos = async () => {
    try { await api(`/corridas/${c.id}/sos`, { corpo: posicao ?? {} }); avisar("A central foi avisada. Se for grave, ligue 190."); } catch (e) { setErro(mensagemDeErro(e)); }
    setFolha("");
  };

  const viagem = pontosDaViagem(c);
  const pontos: PontoMapa[] = [...viagem, ...(posicao ? [{ ...posicao, rotulo: "Você", tipo: "eu" as const }] : [])];
  const valor = valorDe(c) != null ? Math.max(0, (valorDe(c) ?? 0) - (c.desconto ?? 0)) : null;
  const minutos = c.iniciadaEm ? Math.max(0, Math.floor((agora - Date.parse(c.iniciadaEm)) / 60000)) : 0;
  const tel = c.passageiro.telefone?.replace(/\D/g, "");

  const etapa = c.status === "a_caminho" ? { texto: "Cheguei ao local", f: () => void status("no_local") }
    : c.status === "no_local" ? { texto: "Iniciar viagem", f: () => void status("em_andamento") }
      : naParada ? { texto: `Saí da parada ${parada + 1}`, f: passouParada }
        : { texto: "Finalizar", f: () => setFolha("finalizar") };

  return (
    <div className="em-corrida">
      <Mapa pontos={pontos} caminho={viagem} ate={[posicao, alvo]} rotaNav={nativo ? nav.caminho : null} tema={temaMapa} centralizar={centro} className="cheia" />

      {nativo ? (
        <div className={`navegacao nav-app ${nav.fora ? "fora" : ""}`}>
          <span className="navegacao-seta">{nav.carregando && !nav.disponivel ? <span className="girando" style={{ width: 22, height: 22, borderWidth: 2 }} /> : <Seta size={26} />}</span>
          <div className="navegacao-texto">
            {nav.passo ? <>
              <span className="nav-dist">{nav.metros != null ? textoMetros(nav.metros) : "—"}</span>
              <span className="nav-instrucao">{nav.fora ? "Recalculando a rota…" : nav.passo.texto}</span>
              <small className="navegacao-resto">{nav.restamKm != null ? `${nav.restamKm.toFixed(1).replace(".", ",")} km · ${nav.restamMin} min até ${nomeAlvo.toLowerCase()}` : alvo.texto}</small>
            </> : <>
              <strong>{longe != null ? distanciaTexto(longe) : "—"}</strong>
              <small>{nav.carregando ? "Calculando a rota…" : `Siga até ${nomeAlvo.toLowerCase()}: ${alvo.texto}`}</small>
            </>}
          </div>
          <button type="button" className={`redondo ${ajustes.voz ? "" : "perigo"}`} aria-label={ajustes.voz ? "Silenciar a voz" : "Ligar a voz"} onClick={() => mudar({ voz: !ajustes.voz })}>
            {ajustes.voz ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      ) : (
      <div className="navegacao">
        <a className="navegacao-seta" href={linkNavegar(alvo)} target="_blank" rel="noreferrer" aria-label="Abrir navegação"><Navigation size={24} /></a>
        <a className="navegacao-texto" href={linkNavegar(alvo)} target="_blank" rel="noreferrer">
          <strong>{longe != null ? distanciaTexto(longe) : "—"}</strong>
          <small>Siga até {nomeAlvo.toLowerCase()}: {alvo.texto}</small>
        </a>
        <button type="button" className={`redondo ${ajustes.voz ? "" : "perigo"}`} aria-label={ajustes.voz ? "Silenciar o co-piloto" : "Ligar o co-piloto"} onClick={() => mudar({ voz: !ajustes.voz })}>
          {ajustes.voz ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
      )}

      <button type="button" className="mapa-botao mapa-tema-corrida" aria-label="Trocar o tema do mapa" onClick={trocarTema}>{(temaMapa ?? (document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro")) === "escuro" ? <Sun size={20} /> : <Moon size={20} />}</button>
      <button type="button" className="mapa-botao centralizar-corrida" aria-label="Centralizar o mapa" onClick={() => setCentro((n) => n + 1)}><LocateFixed size={20} /></button>

      <div className={`folha-corrida n${nivel}`}>
        <button type="button" className="puxador-botao" aria-label="Mudar a altura dos detalhes"
          onPointerDown={(e) => { arraste.current = e.clientY; }}
          onPointerUp={(e) => { const d = arraste.current == null ? 0 : e.clientY - arraste.current; arraste.current = null; if (d < -30) mudarNivel(nivel + 1); else if (d > 30) mudarNivel(nivel - 1); else mudarNivel(nivel === 2 ? 0 : nivel + 1); }}
          onPointerCancel={() => { arraste.current = null; }}><span className="puxador" /></button>
        <div className="passageiro">
          <Avatar foto={c.passageiro.foto} nome={c.passageiro.nome} tamanho={58} selo={c.passageiro.nota != null ? <span className="avatar-nota"><Star size={10} fill="currentColor" /> {c.passageiro.nota.toFixed(1)}</span> : undefined} />
          <div className="passageiro-nome">
            <strong>{c.passageiro.nome}</strong>
            {c.passageiro.corridas != null && <small>{c.passageiro.corridas} corridas</small>}
            <button type="button" className="chip marca" onClick={() => setFolha("perfil")}>VER PERFIL <ChevronRight size={12} /></button>
          </div>
          <button type="button" className="redondo" aria-label="Chat com o passageiro" onClick={abrirChat}><MessageCircle size={20} />{naoLidas > 0 && <span className="bolha">{naoLidas}</span>}</button>
          {tel ? <a className="redondo" aria-label="Ligar para o passageiro" href={`tel:${tel}`}><Phone size={19} /></a> : null}
        </div>

        <div className="bloco">
          <div className="local">
            <span className="local-icone"><Flag size={18} /></span>
            <div><small>{nomeAlvo}</small><strong>{alvo.texto}</strong></div>
            {nativo ? <button type="button" className="quadrado marca" aria-label="Seguir no mapa" onClick={() => { setCentro((n) => n + 1); mudarNivel(0); }}><Navigation size={20} /></button> : <a className="quadrado marca" href={linkNavegar(alvo)} target="_blank" rel="noreferrer" aria-label="Navegar"><Navigation size={20} /></a>}
          </div>
          <div className="links-rota">
            <button type="button" className="link-m pequeno" onClick={() => setFolha("rota")}>VER ROTA COMPLETA <ChevronRight size={14} /></button>
            <button type="button" className="link-m pequeno aviso" onClick={() => setFolha("editar")}><Pencil size={13} /> EDITAR ROTA</button>
            <button type="button" className="link-m pequeno perigo" onClick={() => setFolha("cancelar")}><Ban size={13} /> {c.status === "a_caminho" ? "DESISTIR" : "CANCELAR"}</button>
          </div>
        </div>

        <div className="bloco">
          <div className="pilula-pagamento"><Banknote size={18} /> Pagamento: <strong>{c.pagamento}</strong></div>
          <div className="grade">
            {taximetro && emViagem ? (
              <>
                <div><small>TEMPO</small><strong>{minutos} min</strong></div>
                <div><small>DISTÂNCIA</small><strong>{c.distanciaPercorridaKm != null ? distanciaTexto(c.distanciaPercorridaKm) : "—"}</strong></div>
              </>
            ) : (
              <>
                <div><small>VALOR TOTAL</small><strong>{taximetro ? "Taxímetro" : reais(valor)}</strong></div>
                <div><small>CATEGORIA</small><strong>{c.categoria}</strong></div>
              </>
            )}
            <div><small>IDENTIFICAÇÃO</small><strong>OS #{c.os}</strong></div>
            <div><small>SOLICITADO EM</small><strong>{soHora(c.solicitadaEm)}</strong></div>
          </div>
          {c.observacao && <p className="dica">Obs.: {c.observacao}</p>}
        </div>

        <Erro texto={erro} />
        <div className="links-rota">
          <button type="button" className="link-m perigo" onClick={() => setFolha("cancelar")}><Ban size={15} /> {c.status === "a_caminho" ? "Desistir da corrida" : "Cancelar corrida"}</button>
          <button type="button" className="link-m perigo" onClick={() => setFolha("sos")}><ShieldAlert size={15} /> SOS</button>
        </div>
        {marca.suporte.telefone && <p className="dica centro">Central: <a href={`tel:${marca.suporte.telefone.replace(/\D/g, "")}`}>{marca.suporte.telefone}</a></p>}
      </div>

      <div className="deslizar-fixo"><Deslizar texto={etapa.texto} aoConcluir={etapa.f} ocupado={ocupado} cor={etapa.texto === "Finalizar" ? "verde" : undefined} /></div>
      {emViagem && parada > 0 && <button type="button" className="voltar-parada" onClick={() => { const n = parada - 1; setParada(n); gravarParada(c.id, n); }}>Voltar uma parada</button>}

      {folha === "rota" && (
        <Folha titulo="Rota completa" fechar={() => setFolha("")}>
          <div className="trajeto">
            <div className="trajeto-ponto"><span className="bolinha embarque" /><div><small>Embarque</small><strong>{c.embarque.texto}</strong></div><a className="quadrado" href={linkNavegar(c.embarque)} target="_blank" rel="noreferrer" aria-label="Navegar até o embarque"><Navigation size={16} /></a></div>
            {paradas.map((p, i) => <div key={i} className={`trajeto-ponto ${emViagem && i < parada ? "feita" : ""}`}><span className="bolinha parada" /><div><small>Parada {i + 1}</small><strong>{p.texto}</strong></div><a className="quadrado" href={linkNavegar(p)} target="_blank" rel="noreferrer" aria-label={`Navegar até a parada ${i + 1}`}><Navigation size={16} /></a></div>)}
            {c.destino && <div className="trajeto-ponto"><span className="bolinha destino" /><div><small>Destino</small><strong>{c.destino.texto}</strong></div><a className="quadrado" href={linkNavegar(c.destino)} target="_blank" rel="noreferrer" aria-label="Navegar até o destino"><Navigation size={16} /></a></div>}
          </div>
          {c.estimativa.distanciaKm != null && <p className="dica centro">{distanciaTexto(c.estimativa.distanciaKm)}{c.estimativa.minutos != null ? ` · cerca de ${c.estimativa.minutos} min` : ""}</p>}
        </Folha>
      )}
      {folha === "editar" && <EditarRota corrida={c} fechar={() => setFolha("")} mudou={mudou} />}
      {folha === "perfil" && (
        <Folha titulo="Passageiro" fechar={() => setFolha("")}>
          <div className="perfil-centro">
            <Avatar foto={c.passageiro.foto} nome={c.passageiro.nome} tamanho={88} />
            <strong>{c.passageiro.nome}</strong>
            <div className="chips centro">
              {c.passageiro.nota != null && <span className="chip ok"><Star size={13} fill="currentColor" /> {c.passageiro.nota.toFixed(1)}</span>}
              {c.passageiro.corridas != null && <span className="chip">{c.passageiro.corridas} corridas</span>}
            </div>
          </div>
        </Folha>
      )}
      {folha === "finalizar" && <Finalizar corrida={c} taximetro={taximetro} valorSugerido={valor} ocupado={ocupado} erro={erro} fechar={() => setFolha("")} confirmar={(v) => void status("finalizada", v == null ? {} : { valor: v })} />}
      {folha === "cancelar" && (
        <Folha titulo={c.status === "a_caminho" ? "Desistir da corrida" : "Cancelar a corrida"} fechar={() => { setFolha(""); setMotivo(""); }}>
          <p className="dica">{c.status === "a_caminho" ? "A corrida volta a procurar outro motorista e você não recebe esta mesma de novo logo em seguida." : "O passageiro será avisado e a central registra o motivo."} Cancelamentos seguidos podem gerar punição, conforme as regras da central.</p>
          <div className="motivos-lista" role="radiogroup" aria-label="Motivo">
            {motivos.map((m) => <button key={m} type="button" role="radio" aria-checked={motivo === m} className={`opcao-folha ${motivo === m ? "ativa" : ""}`} onClick={() => setMotivo(m)}>{m}{motivo === m && <BadgeCheck size={20} />}</button>)}
          </div>
          <button type="button" className="botao-m perigo" disabled={!motivo || ocupado} onClick={() => void cancelar()}>{c.status === "a_caminho" ? "DESISTIR DA CORRIDA" : "CANCELAR CORRIDA"}</button>
          <button type="button" className="link-m" onClick={() => { setFolha(""); setMotivo(""); }}>Voltar</button>
        </Folha>
      )}
      {folha === "sos" && <Dialogo icone={ShieldAlert} perigo titulo="Pedir ajuda?" texto="A central recebe um alerta agora, com a sua posição. Se for grave, ligue 190." cancelar={() => setFolha("")} confirmar={() => void sos()} rotulo="Avisar a central" />}
    </div>
  );
}

function Finalizar({ corrida: c, taximetro, valorSugerido, ocupado, erro, fechar, confirmar }: {
  corrida: Corrida; taximetro: boolean; valorSugerido: number | null; ocupado: boolean; erro: string; fechar: () => void; confirmar: (v: number | null) => void;
}) {
  const [valor, setValor] = useState(valorSugerido != null ? valorSugerido.toFixed(2).replace(".", ",") : "");
  const [recebido, setRecebido] = useState("");
  const v = Number(valor.replace(",", "."));
  const troco = Number(recebido.replace(",", ".")) - v;
  return (
    <Folha titulo="Finalizar corrida" fechar={fechar}>
      <form className="formulario" onSubmit={(e) => { e.preventDefault(); confirmar(taximetro ? null : v); }}>
        {taximetro ? <p className="dica centro">O valor sai do taxímetro: distância e tempo da viagem, pela tarifa da categoria.</p> : (
          <label className="campo"><span className="campo-rotulo">Valor da corrida (R$)</span><span className="campo-caixa"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></span></label>
        )}
        {c.desconto ? <p className="dica">Já com desconto de cupom de {reais(c.desconto)}.</p> : null}
        <div className="pilula-pagamento"><Banknote size={18} /> Pagamento: <strong>{c.pagamento}</strong></div>
        {c.pagamento === "Dinheiro" && !taximetro && (
          <>
            <label className="campo"><span className="campo-rotulo">Valor recebido (R$), para calcular o troco</span><span className="campo-caixa"><input inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} /></span></label>
            {recebido && Number.isFinite(troco) && <p className="numero-grande centro">{troco >= 0 ? `Troco: ${reais(troco)}` : `Faltam ${reais(-troco)}`}</p>}
          </>
        )}
        <Erro texto={erro} />
        <button className="botao-m verde" disabled={ocupado || (!taximetro && (!valor || !(v >= 0)))}>CONFIRMAR E FINALIZAR</button>
      </form>
    </Folha>
  );
}

/** Busca de endereço (base de endereços da empresa). */
function BuscaEndereco({ escolher, rotulo }: { escolher: (p: Ponto) => void; rotulo: string }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Ponto[]>([]);
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) { setLista([]); return; }
    const t = setTimeout(() => {
      void api<{ enderecos: Ponto[]; aviso: string | null }>(`/enderecos?q=${encodeURIComponent(q)}`)
        .then((r) => { setLista(r.enderecos); setAviso(r.aviso ?? (r.enderecos.length ? "" : "Nada encontrado.")); })
        .catch((e) => setAviso(mensagemDeErro(e)));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="busca">
      <span className="campo-caixa"><Search size={18} className="campo-icone" /><input placeholder={rotulo} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></span>
      {aviso && <p className="dica">{aviso}</p>}
      {lista.map((p, i) => <button key={i} type="button" className="sugestao" onClick={() => { escolher({ texto: p.texto, lat: p.lat, lng: p.lng }); setQ(""); }}>{p.texto}</button>)}
    </div>
  );
}

function EditarRota({ corrida: c, fechar, mudou }: { corrida: Corrida; fechar: () => void; mudou: (c: Corrida) => void }) {
  const [paradas, setParadas] = useState<Ponto[]>(c.paradas ?? []);
  const [destino, setDestino] = useState<Ponto | null>(c.destino);
  const [buscando, setBuscando] = useState<"" | "parada" | "destino">("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setErro(""); setOcupado(true);
    try { const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/rota`, { corpo: { paradas, destino } }); if (r.corrida) mudou(r.corrida); fechar(); }
    catch (e) { setErro(semRota(e) ? "Editar a rota ainda não está disponível. Combine com o passageiro e use o navegador." : mensagemDeErro(e)); }
    finally { setOcupado(false); }
  };
  return (
    <Folha titulo="Editar Rota" fechar={fechar}>
      <div className="formulario">
        <div className="ponto-edicao"><span className="bolinha embarque" /><span>{c.embarque.texto}</span></div>
        {paradas.map((p, i) => (
          <div key={i} className="ponto-edicao"><span className="bolinha parada" /><span>{p.texto}</span><button type="button" className="redondo pequeno" aria-label={`Tirar a parada ${i + 1}`} onClick={() => setParadas(paradas.filter((_, j) => j !== i))}><X size={16} /></button></div>
        ))}
        {paradas.length < 3 && buscando !== "parada" && <button type="button" className="link-m direita" onClick={() => setBuscando("parada")}><Plus size={15} /> Adicionar parada</button>}
        {buscando === "parada" && <BuscaEndereco rotulo="Endereço da parada" escolher={(p) => { setParadas([...paradas, p]); setBuscando(""); }} />}
        {destino && buscando !== "destino"
          ? <div className="ponto-edicao"><Flag size={16} className="cor-perigo" /><span>{destino.texto}</span><button type="button" className="redondo pequeno" aria-label="Trocar o destino" onClick={() => setBuscando("destino")}><X size={16} /></button></div>
          : buscando !== "destino" && <button type="button" className="link-m direita" onClick={() => setBuscando("destino")}><Plus size={15} /> Informar destino</button>}
        {buscando === "destino" && <BuscaEndereco rotulo="Endereço do destino" escolher={(p) => { setDestino(p); setBuscando(""); }} />}
        <Erro texto={erro} />
        <button type="button" className="botao-m" disabled={ocupado} onClick={() => void salvar()}>CALCULAR ROTA</button>
      </div>
    </Folha>
  );
}

// ------------------------------------------------------------------ depois da corrida

export function DepoisDaCorrida({ corrida: c, fim }: { corrida: Corrida; fim: () => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviada, setEnviada] = useState(!!c.avaliacaoPassageiro);
  const [objeto, setObjeto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [bloquear, setBloquear] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const fazer = async (f: () => Promise<void>) => { setErro(""); try { await f(); } catch (e) { setErro(mensagemDeErro(e)); } };
  return (
    <Pagina>
      <Topo titulo="Corrida finalizada" />
      <div className="conteudo">
        <div className="cartao-m centro">
          <small className="dica">Valor da corrida</small>
          <p className="numero-grande cor-ok">{reais(c.valor)}</p>
          <p className="dica">{c.pagamento} · OS #{c.os} · {c.passageiro.nome}</p>
        </div>
        {enviada ? <Info texto="Nota enviada. Obrigado!" tipo="ok" /> : (
          <div className="cartao-m centro">
            <h3>Como foi o passageiro?</h3>
            <Estrelas valor={nota} aoEscolher={setNota} />
            <textarea className="area" rows={2} maxLength={500} placeholder="Comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <button type="button" className="botao-m" disabled={!nota} onClick={() => void fazer(async () => { await api(`/corridas/${c.id}/avaliar-passageiro`, { corpo: { nota, comentario } }); setEnviada(true); })}>ENVIAR NOTA</button>
          </div>
        )}
        {objeto ? (
          <div className="cartao-m">
            <h3>Achei um objeto no carro</h3>
            <p className="dica">A central avisa o passageiro. Guarde o objeto até combinarem a entrega.</p>
            <input className="entrada" maxLength={200} placeholder="Ex.: guarda-chuva azul" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            <button type="button" className="botao-m" disabled={descricao.trim().length < 3} onClick={() => void fazer(async () => { await api(`/corridas/${c.id}/objeto`, { corpo: { descricao } }); setObjeto(false); setOk("A central foi avisada do objeto."); })}>AVISAR A CENTRAL</button>
          </div>
        ) : <button type="button" className="botao-contorno" onClick={() => setObjeto(true)}><PackageSearch size={18} /> Achei um objeto no carro</button>}
        <button type="button" className="botao-contorno" onClick={() => setBloquear(true)}><CircleAlert size={18} /> Não quero mais este passageiro</button>
        <Info texto={ok} tipo="ok" /><Erro texto={erro} />
        <button type="button" className="botao-m" onClick={fim}>{enviada ? "CONTINUAR" : "PULAR"}</button>
      </div>
      {bloquear && <Dialogo icone={Ban} perigo titulo="Bloquear passageiro?" texto="Você não vai mais receber corridas deste passageiro." cancelar={() => setBloquear(false)} rotulo="Bloquear"
        confirmar={() => void fazer(async () => { await api(`/corridas/${c.id}/bloquear`, { corpo: { ligar: true } }); setOk("Pronto: você não recebe mais corridas deste passageiro."); setBloquear(false); })} />}
    </Pagina>
  );
}
