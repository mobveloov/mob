// Corrida aberta: "Procurando" (cronômetro, oferta com − e +, contra-ofertas dos motoristas) e "Acompanhar
// viagem" (carro no mapa, cartão do motorista com placa Mercosul, folha com a rota, pagamento, compartilhar,
// editar rota e cancelar com motivo).

import { Fragment, useEffect, useRef, useState } from "react";
import { Bike, CarFront, Clock, Flag, LocateFixed, MapPin, MessageSquareText, Moon, Pencil, Phone, Plus, Search, Share2, ShieldAlert, Sun, Tag, User, Wallet, X, XCircle } from "lucide-react";
import { api, posicaoAgora, reais, vibrar, type Posicao } from "../comum/api";
import { mensagemDeErro, type MarcaApp } from "../comum/ui";
import {
  apiOu, compartilharTexto, distanciaKm, ehMoto, faixaDaOferta, linhasDoEndereco, linkPublico, PASSO_OFERTA, rotaFaltando, ruaCurta, temCoord, valorDaCorrida,
  type ContraOferta, type Corrida, type Endereco, type Ponto,
} from "./apoio";
import { Mapa } from "./Mapa";
import { pontosDaRota } from "./Opcoes";
import { Avatar, Aviso, Dialogo, FolhaBaixo, FolhaModal, Nota, Placa, PrecoAjustavel } from "./pecas";

const MOTIVOS_PADRAO = ["Motorista demorou muito", "Valor da corrida", "Pedi por engano", "Outro"];

/** Cronômetro desde que a busca começou (guardado por corrida, para não zerar ao reabrir o app). */
function useCronometro(id: string) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const chave = `busca-${id}`;
    let inicio = Number(sessionStorage.getItem(chave));
    if (!inicio) { inicio = Date.now(); try { sessionStorage.setItem(chave, String(inicio)); } catch { /* sem armazenamento */ } }
    const t = setInterval(() => setS(Math.floor((Date.now() - inicio) / 1000)), 1000);
    setS(Math.floor((Date.now() - inicio) / 1000));
    return () => clearInterval(t);
  }, [id]);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ procurando

export function Procurando({ corrida: c, mudou, recarregar }: { corrida: Corrida; mudou: (c: Corrida) => void; recarregar: () => void }) {
  const tempo = useCronometro(c.id);
  const sugerido = c.estimativa.valor;
  const [oferta, setOferta] = useState<number | null>(c.valorOferecido ?? sugerido);
  const [contra, setContra] = useState<ContraOferta[]>([]);
  const [recusadas, setRecusadas] = useState<string[]>([]);
  const [cancelar, setCancelar] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const envio = useRef<ReturnType<typeof setTimeout>>();

  // Contra-ofertas dos motoristas (sem a rota nova, para de perguntar).
  useEffect(() => {
    let vivo = true, t: ReturnType<typeof setTimeout>;
    const buscar = async () => {
      try {
        const r = await api<{ contraofertas: ContraOferta[] }>(`/corridas/${c.id}/contraofertas`);
        if (!vivo) return;
        setContra((antes) => { if (r.contraofertas.some((o) => !antes.some((a) => a.id === o.id))) vibrar([150, 80, 150]); return r.contraofertas; });
      } catch (e) { if (rotaFaltando(e)) return; }
      if (vivo) t = setTimeout(buscar, 3000);
    };
    void buscar();
    return () => { vivo = false; clearTimeout(t); };
  }, [c.id]);

  const mudarOferta = (v: number) => {
    setOferta(v); setErro("");
    clearTimeout(envio.current);
    envio.current = setTimeout(async () => {
      try { await api(`/corridas/${c.id}/oferta`, { corpo: { valor: v } }); }
      catch (e) { setErro(rotaFaltando(e) ? "Ainda não dá para mudar a oferta durante a busca." : mensagemDeErro(e)); setOferta(c.valorOferecido ?? sugerido); }
    }, 600);
  };
  const aceitar = async (o: ContraOferta) => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ corrida?: Corrida }>(`/corridas/${c.id}/contraofertas/${o.id}/aceitar`, { corpo: {} });
      if (r.corrida) mudou(r.corrida); else recarregar();
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };

  const visiveis = contra.filter((o) => !recusadas.includes(o.id));
  const primeira = visiveis[0];
  const faixa = sugerido != null ? faixaDaOferta(sugerido, null) : null;

  return (
    <div className="tela-mapa">
      <Mapa pontos={pontosDaRota(c)} folga={360} />
      <div className="topo-flutuante">
        <button className="pilula-branca vermelho" onClick={() => setCancelar(true)}>Cancelar</button>
      </div>
      <FolhaBaixo fixa className="folha-procurando">
        <div className="barra-progresso" aria-hidden="true"><span /></div>
        <div className="procurando-cabeca">
          <span className="icone-redondo claro pulsando"><Search size={22} /></span>
          <div><strong>Procurando</strong><small>Aguardando motoristas…</small></div>
          <span className="cronometro">{tempo}</span>
        </div>
        {oferta != null && faixa && (
          <div className="cartao-oferta">
            <small>SUA OFERTA ATUAL</small>
            <PrecoAjustavel grande valor={oferta} min={faixa.min} max={faixa.max} passo={PASSO_OFERTA} mudar={mudarOferta} />
            <p className="dica">Aumente a oferta para achar motorista mais rápido.</p>
          </div>
        )}
        {visiveis.length > 0 && <p className="dica centro">{visiveis.length === 1 ? "1 motorista mandou uma oferta" : `${visiveis.length} motoristas mandaram ofertas`}</p>}
        <div className="resumo-rota">
          <div><User size={16} /><span><small>Embarque</small><strong>{ruaCurta(c.embarque)}</strong></span></div>
          {c.destino && <div><Flag size={16} /><span><small>Destino</small><strong>{ruaCurta(c.destino)}</strong></span></div>}
        </div>
        <div className="chips"><span>{c.categoria.toUpperCase()}</span><span>{c.pagamento}</span></div>
        <Aviso texto={erro} />
      </FolhaBaixo>

      {primeira && (
        <div className="modal-fundo baixo transparente">
          <div className="topo-flutuante"><button className="pilula-branca vermelho" onClick={() => setRecusadas((l) => [...l, primeira.id])}>Recusar</button></div>
          <CartaoContraOferta c={c} o={primeira} aceitar={() => void aceitar(primeira)} ocupado={ocupado} total={visiveis.length} />
        </div>
      )}
      {cancelar && <Cancelar corrida={c} fechar={() => setCancelar(false)} mudou={mudou} />}
    </div>
  );
}

function CartaoContraOferta({ c, o, aceitar, ocupado, total }: { c: Corrida; o: ContraOferta; aceitar: () => void; ocupado: boolean; total: number }) {
  const [resta, setResta] = useState<number | null>(null);
  useEffect(() => {
    if (!o.expira) return;
    const fim = Date.parse(o.expira);
    const t = setInterval(() => setResta(Math.max(0, Math.round((fim - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [o.expira]);
  const [e1, e2] = linhasDoEndereco(c.embarque);
  const [d1, d2] = c.destino ? linhasDoEndereco(c.destino) : ["", ""];
  return (
    <div className="cartao-contra">
      <div className="contra-motorista">
        <Avatar foto={o.motorista.foto} nome={o.motorista.nome} tamanho={44} />
        <span><strong>{o.motorista.nome}</strong><small>{[o.motorista.veiculo, o.motorista.placa].filter(Boolean).join(" · ")}{o.motorista.viagens != null ? ` · ${o.motorista.viagens} viagens` : ""}</small></span>
        {total > 1 && <span className="contra-total">1 de {total}</span>}
      </div>
      <div className="contra-valor">{reais(o.valor)}</div>
      <div className="centro"><Nota nota={o.motorista.nota} />{resta != null && <small className="suave"> · {resta}s</small>}</div>
      <div className="linha-tempo">
        <div><User size={16} /><span><small>Embarque{o.distanciaKm != null ? ` - ${o.distanciaKm.toFixed(1).replace(".", ",")} km de você` : ""}</small><strong>{e1}{e2 ? ` - ${e2}` : ""}</strong></span></div>
        {c.destino && <div><Flag size={16} /><span><small>Destino{c.estimativa.distanciaKm != null ? ` - ${c.estimativa.distanciaKm.toFixed(1).replace(".", ",")} km` : ""}</small><strong>{d1}{d2 ? ` - ${d2}` : ""}</strong></span></div>}
      </div>
      <div className="chips"><span>{c.categoria.toUpperCase()}</span><span>{c.pagamento}</span></div>
      <button className="botao largo aceitar" disabled={ocupado} onClick={aceitar}>ACEITAR {reais(o.valor)}</button>
    </div>
  );
}

// ------------------------------------------------------------------ cancelar

export function Cancelar({ corrida: c, fechar, mudou }: { corrida: Corrida; fechar: () => void; mudou: (c: Corrida) => void }) {
  const [motivos, setMotivos] = useState<string[] | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { void apiOu<{ motivos: string[] }>("/motivos-cancelamento", { motivos: MOTIVOS_PADRAO }).then((r) => setMotivos(r.motivos.length ? r.motivos : MOTIVOS_PADRAO)).catch(() => setMotivos(MOTIVOS_PADRAO)); }, []);
  const confirmar = async () => {
    setErro(""); setOcupado(true);
    try { mudou((await api<{ corrida: Corrida }>(`/corridas/${c.id}/cancelar`, { corpo: { motivo } })).corrida); fechar(); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <FolhaModal fechar={fechar}>
      <h2 className="folha-titulo centro">Motivo do cancelamento</h2>
      <div className="motivos">
        {(motivos ?? []).map((m) => <button key={m} className={motivo === m ? "marcado" : ""} onClick={() => setMotivo(m)}>{m}<span className={`radio ${motivo === m ? "marcado" : ""}`} /></button>)}
      </div>
      <Aviso texto={erro} />
      <button className="botao largo" disabled={!motivo || ocupado} onClick={() => void confirmar()}>{ocupado ? "CANCELANDO…" : "CONFIRMAR"}</button>
    </FolhaModal>
  );
}

// ------------------------------------------------------------------ acompanhar viagem

const ETAPA: Record<string, string> = { a_caminho: "Motorista a caminho", no_local: "Motorista no local", em_andamento: "Em viagem" };

export function Acompanhar({ corrida: c, pos, marca, naoLidas, abrirChat, mudou }: {
  corrida: Corrida; pos: Posicao | null; marca: MarcaApp; naoLidas: number; abrirChat: () => void; mudou: (c: Corrida) => void;
}) {
  const [escuro, setEscuro] = useState(() => matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [centralizar, setCentralizar] = useState(0);
  const [folga, setFolga] = useState(300);
  const [janela, setJanela] = useState<"" | "cancelar" | "rota" | "sos">("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const m = c.motorista;

  // Distância e tempo do motorista: do servidor, ou calculados pela posição dele (≈ 25 km/h na cidade).
  const alvo = c.status === "em_andamento" ? c.destino : c.embarque;
  const km = c.distanciaMotoristaKm ?? (pos && temCoord(alvo) ? distanciaKm(pos, alvo) : null);
  const minutos = c.minutosMotorista ?? (km != null ? Math.max(1, Math.round((km / 25) * 60)) : null);
  const chegando = c.status === "a_caminho" && (c.chegando ?? (km != null && km < 0.5));
  const avisou = useRef(false);
  useEffect(() => { if (chegando && !avisou.current) { avisou.current = true; vibrar([300, 150, 300]); } }, [chegando]);

  const compartilhar = async () => {
    setAviso("");
    const quem = m ? ` com ${m.nome}, ${m.veiculo} placa ${m.placa}` : "";
    const r = c.compartilhar
      ? await compartilharTexto(`Acompanhe minha viagem ${marca.nome}${quem}:`, linkPublico(c.compartilhar))
      : await compartilharTexto(`Estou em uma corrida ${marca.nome} (OS ${c.os})${quem}. Embarque: ${c.embarque.texto}${c.destino ? `. Destino: ${c.destino.texto}` : ""}.`);
    if (r === "copiado") setAviso("Link copiado. Cole para quem vai acompanhar.");
  };
  const sos = async () => {
    setJanela("");
    const p = await posicaoAgora().catch(() => null);
    try { await api(`/corridas/${c.id}/sos`, { corpo: p ?? {} }); setAviso("A central foi avisada. Se for grave, ligue 190."); } catch (e) { setErro(mensagemDeErro(e)); }
  };

  const podeCancelar = ["a_caminho", "no_local"].includes(c.status);
  const [e1, e2] = linhasDoEndereco(c.embarque);
  const valor = valorDaCorrida(c);

  return (
    <div className="tela-mapa">
      <Mapa pontos={pontosDaRota(c)} carro={pos} escuro={escuro} centralizar={centralizar} folga={folga} linha={false} />
      <header className="topo-marca arredondado">
        <button className="icone-botao" aria-label={escuro ? "Mapa claro" : "Mapa escuro"} onClick={() => setEscuro(!escuro)}>{escuro ? <Sun size={24} /> : <Moon size={24} />}</button>
        <div className="topo-titulo"><strong>Acompanhar viagem</strong></div>
        <button className="icone-botao" aria-label="Centralizar o mapa" onClick={() => setCentralizar((n) => n + 1)}><LocateFixed size={24} /></button>
      </header>

      <div className="acompanhar-baixo">
        <div className="etiqueta-etapa">
          <strong>{ETAPA[c.status] ?? c.statusTexto}</strong>
          {(minutos != null || km != null) && c.status !== "no_local" && (
            <span><Clock size={14} /> {minutos ?? "—"} min <MapPin size={14} /> {km != null ? km.toFixed(1).replace(".", ",") : "—"} km</span>
          )}
        </div>
        <FolhaBaixo aberta={false} aoMudarAltura={setFolga} resumo={m && (
          <div className="cartao-motorista">
            <div className="motorista-foto">
              <Avatar foto={m.foto} nome={m.nome} tamanho={84} />
              <Nota nota={m.nota} />
              <small>{m.viagens != null ? `${m.viagens} viagens` : ""}</small>
              <span className="motorista-veiculo-icone">{ehMoto(c.categoria) ? <Bike size={22} /> : <CarFront size={22} />}</span>
            </div>
            <div className="motorista-dados">
              <strong className="motorista-nome">{m.nome}</strong>
              <div className="motorista-botoes">
                {m.telefone ? <a className="botao-quadrado" href={`tel:${m.telefone}`}><Phone size={22} /><small>Ligar</small></a>
                  : <span className="botao-quadrado desligado"><Phone size={22} /><small>Ligar</small></span>}
                <button className="botao-quadrado cor" onClick={abrirChat}><MessageSquareText size={22} /><small>Chat</small>{naoLidas > 0 && <i className="bolinha">{naoLidas}</i>}</button>
              </div>
            </div>
            <div className="motorista-carro">
              <small>VEÍCULO</small><strong>{m.veiculo || "—"}</strong>{m.cor && <small className="cor-carro">{m.cor.toUpperCase()}</small>}
            </div>
            <div className="motorista-placa"><small>PLACA</small><Placa placa={m.placa} /></div>
          </div>
        )}>
          {chegando && <div className="faixa-chegando">Seu motorista está chegando!</div>}
          <div className="folha-detalhe">
            <h2>Acompanhar viagem</h2>
            <p className="suave">{ETAPA[c.status] ?? c.statusTexto} · OS {c.os}</p>
            <div className="cartao-rota">
              <div className="ponto-rota"><span className="bola-rota" /><span><small className="cor-texto">Embarque</small><strong>{e1}</strong><small>{e2}</small></span></div>
              {(c.paradas ?? []).map((p, i) => { const [p1, p2] = linhasDoEndereco(p); return <Fragment key={i}><div className="ponto-rota"><span className="bola-rota parada">{i + 1}</span><span><small>Parada {i + 1}</small><strong>{p1}</strong><small>{p2}</small></span></div></Fragment>; })}
              {c.destino && (() => { const [d1, d2] = linhasDoEndereco(c.destino); return <div className="ponto-rota"><span className="bola-rota fim" /><span><small>Destino</small><strong>{d1}</strong><small>{d2}</small></span></div>; })()}
              {c.status !== "finalizada" && <button className="botao-claro" onClick={() => setJanela("rota")}><Pencil size={16} /> Editar rota</button>}
            </div>
            <div className="duas-colunas">
              <div className="mini-cartao"><Wallet size={22} /><span><small>Pagamento</small><strong>{c.pagamento}</strong></span></div>
              <div className="mini-cartao"><Tag size={22} /><span><small>Valor total</small><strong>{reais(valor)}</strong></span></div>
            </div>
            <Aviso texto={aviso} tipo="ok" />
            <Aviso texto={erro} />
            <button className="botao largo" onClick={() => void compartilhar()}><Share2 size={18} /> COMPARTILHAR VIAGEM</button>
            {podeCancelar && <button className="botao contorno largo texto-vermelho" onClick={() => setJanela("cancelar")}>Cancelar corrida</button>}
            {c.status === "em_andamento" && <button className="botao contorno largo texto-vermelho" onClick={() => setJanela("sos")}><ShieldAlert size={18} /> SOS - pedir ajuda</button>}
          </div>
        </FolhaBaixo>
      </div>

      {janela === "cancelar" && <Cancelar corrida={c} fechar={() => setJanela("")} mudou={mudou} />}
      {janela === "rota" && <EditarRota corrida={c} fechar={() => setJanela("")} mudou={mudou} />}
      {janela === "sos" && <Dialogo perigo icone={<ShieldAlert size={28} />} titulo="Pedir ajuda?" texto="A central recebe sua posição agora. Se for grave, ligue 190." acao="Avisar" aoConfirmar={() => void sos()} fechar={() => setJanela("")} />}
    </div>
  );
}

// ------------------------------------------------------------------ editar rota

function EditarRota({ corrida: c, fechar, mudou }: { corrida: Corrida; fechar: () => void; mudou: (c: Corrida) => void }) {
  const [paradas, setParadas] = useState<Ponto[]>(c.paradas ?? []);
  const [destino, setDestino] = useState<Ponto>(c.destino ?? { texto: "" });
  const [ativo, setAtivo] = useState<number | "destino" | null>(null);
  const [sugestoes, setSugestoes] = useState<Endereco[]>([]);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const tempo = useRef<ReturnType<typeof setTimeout>>();
  const digitar = (qual: number | "destino", texto: string) => {
    setAtivo(qual);
    if (qual === "destino") setDestino({ texto }); else setParadas((l) => l.map((p, i) => (i === qual ? { texto } : p)));
    clearTimeout(tempo.current);
    if (texto.trim().length < 3) { setSugestoes([]); return; }
    tempo.current = setTimeout(() => void api<{ enderecos: Endereco[] }>(`/enderecos?q=${encodeURIComponent(texto)}`).then((r) => setSugestoes(r.enderecos)).catch(() => setSugestoes([])), 350);
  };
  const escolher = (s: Endereco) => {
    const p = { texto: s.texto, lat: s.lat, lng: s.lng };
    if (ativo === "destino") setDestino(p); else if (ativo != null) setParadas((l) => l.map((x, i) => (i === ativo ? p : x)));
    setSugestoes([]); setAtivo(null);
  };
  const salvar = async () => {
    setErro("");
    if (paradas.some((p) => !temCoord(p)) || (destino.texto && !temCoord(destino))) { setErro("Escolha cada endereço na lista de sugestões."); return; }
    setOcupado(true);
    try {
      const r = await api<{ corrida: Corrida }>(`/corridas/${c.id}/rota`, { corpo: { paradas, destino: temCoord(destino) ? destino : undefined } });
      mudou(r.corrida); fechar();
    } catch (e) { setErro(rotaFaltando(e) ? "Ainda não dá para editar a rota pelo app. Combine com o motorista pelo chat." : mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const linha = (qual: number | "destino", p: Ponto, icone: JSX.Element, remover?: () => void) => (
    <div className="linha-editar">
      {icone}
      <input value={p.texto} placeholder={qual === "destino" ? "Destino" : "Endereço da parada"} onChange={(e) => digitar(qual, e.target.value)} onFocus={() => setAtivo(qual)} aria-label={qual === "destino" ? "Destino" : `Parada ${Number(qual) + 1}`} />
      {remover && <button className="icone-botao escuro pequeno" aria-label="Tirar" onClick={remover}><X size={18} /></button>}
    </div>
  );
  return (
    <FolhaModal titulo="Editar rota" fechar={fechar}>
      <div className="linha-editar travada"><MapPin size={18} className="cor-texto" /><span>{ruaCurta(c.embarque)}</span></div>
      {paradas.map((p, i) => <Fragment key={i}>{linha(i, p, <span className="bola-rota parada">{i + 1}</span>, () => setParadas((l) => l.filter((_, j) => j !== i)))}</Fragment>)}
      {paradas.length < 3 && <button className="link direita" onClick={() => { setParadas((l) => [...l, { texto: "" }]); setAtivo(paradas.length); }}><Plus size={16} /> Adicionar parada</button>}
      {linha("destino", destino, <Flag size={18} className="cor-texto" />)}
      {sugestoes.length > 0 && <ul className="sugestoes">{sugestoes.map((s, i) => { const [l1, l2] = linhasDoEndereco(s); return <li key={i}><button onClick={() => escolher(s)}><span className="icone-redondo claro"><MapPin size={18} /></span><span><strong>{l1}</strong><small>{l2}</small></span></button></li>; })}</ul>}
      <Aviso texto={erro} />
      <button className="botao largo" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? "CALCULANDO…" : "CALCULAR ROTA"}</button>
      <button className="link centro" onClick={fechar}><XCircle size={16} /> Voltar sem mudar</button>
    </FolhaModal>
  );
}
