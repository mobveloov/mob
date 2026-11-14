// "Para onde vamos?": partida (minha posição, com ☆ para favoritar e ⇅ para inverter), destino com "+" para
// paradas (até 3), "Meus favoritos", "Escolher no mapa", "Não informar destino", recentes e as sugestões da busca.

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Ban, Briefcase, ChevronDown, ChevronRight, History, House, MapPin, Pin, Plus, Star, X } from "lucide-react";
import { api, type Posicao } from "../comum/api";
import { mensagemDeErro } from "../comum/ui";
import { linhasDoEndereco, salvarLugar, temCoord, type Endereco, type Lugares, type Ponto, type Rota } from "./apoio";
import { Mapa } from "./Mapa";
import { Aviso, Topo } from "./pecas";

export type ModoParaOnde = "destino" | "casa" | "trabalho" | "recentes";
const MAX_PARADAS = 3;
type Ativo = "partida" | "destino" | number;

async function enderecoDoPonto(p: Posicao, padrao: string): Promise<Ponto> {
  try {
    const r = await api<{ endereco: Endereco | null }>(`/enderecos/ponto?lat=${p.lat}&lng=${p.lng}`);
    return { texto: r.endereco?.texto ?? padrao, lat: p.lat, lng: p.lng };
  } catch { return { texto: padrao, lat: p.lat, lng: p.lng }; }
}

export function ParaOnde({ aqui, lugares, modo, voltar, seguir, mudouLugares }: {
  aqui: Posicao | null; lugares: Lugares | null; modo: ModoParaOnde; voltar: () => void; seguir: (r: Rota) => void; mudouLugares: (l: Lugares) => void;
}) {
  const [partida, setPartida] = useState<Ponto>({ texto: "" });
  const [destino, setDestino] = useState<Ponto>({ texto: "" });
  const [paradas, setParadas] = useState<Ponto[]>([]);
  const [ativo, setAtivo] = useState<Ativo>("destino");
  const [sugestoes, setSugestoes] = useState<Endereco[]>([]);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");
  const [abrirFavoritos, setAbrirFavoritos] = useState(false);
  const [noMapa, setNoMapa] = useState(false);
  const tempo = useRef<ReturnType<typeof setTimeout>>();
  const entrada = useRef<HTMLInputElement>(null);
  const definindo = modo === "casa" || modo === "trabalho" ? modo : null;

  // Partida: a minha posição de agora.
  useEffect(() => {
    if (aqui && !partida.texto) void enderecoDoPonto(aqui, "Minha localização").then((p) => setPartida((a) => (a.texto ? a : p)));
  }, [aqui?.lat, aqui?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { entrada.current?.focus(); }, [ativo]);

  const valorAtivo = ativo === "partida" ? partida : ativo === "destino" ? destino : paradas[ativo] ?? { texto: "" };
  const mudarAtivo = (p: Ponto) => {
    if (ativo === "partida") setPartida(p); else if (ativo === "destino") setDestino(p);
    else setParadas((l) => l.map((x, i) => (i === ativo ? p : x)));
  };

  const digitar = (texto: string) => {
    mudarAtivo({ texto });
    clearTimeout(tempo.current);
    if (texto.trim().length < 3) { setSugestoes([]); setAviso(""); return; }
    tempo.current = setTimeout(async () => {
      try { const r = await api<{ enderecos: Endereco[]; aviso: string | null }>(`/enderecos?q=${encodeURIComponent(texto)}${(partida.lat ?? aqui?.lat) != null ? `&lat=${partida.lat ?? aqui?.lat}&lng=${partida.lng ?? aqui?.lng}` : ""}`); setSugestoes(r.enderecos); setAviso(r.aviso ?? (r.enderecos.length ? "" : "Nenhum endereço encontrado. Tente “Escolher no mapa”.")); }
      catch { setSugestoes([]); }
    }, 350);
  };

  /** Escolheu um endereço para o campo ativo. Com tudo preenchido, segue para as opções. */
  const escolher = async (p: Ponto) => {
    setSugestoes([]); setAviso(""); setErro("");
    if (definindo) {
      try { mudouLugares(await salvarLugar(definindo, p)); } catch (e) { setErro(mensagemDeErro(e)); return; }
    }
    const novaPartida = ativo === "partida" ? p : partida;
    const novoDestino = ativo === "destino" ? p : destino;
    const novasParadas = typeof ativo === "number" ? paradas.map((x, i) => (i === ativo ? p : x)) : paradas;
    setPartida(novaPartida); setDestino(novoDestino); setParadas(novasParadas);
    const vazia = novasParadas.findIndex((x) => !temCoord(x));
    if (!temCoord(novaPartida)) { setAtivo("partida"); return; }
    if (vazia >= 0) { setAtivo(vazia); return; }
    if (!temCoord(novoDestino)) { setAtivo("destino"); return; }
    seguir({ partida: novaPartida, paradas: novasParadas, destino: novoDestino });
  };

  const inverter = () => {
    if (!temCoord(destino)) return;
    setPartida(destino); setDestino(partida); setParadas((l) => [...l].reverse());
  };
  const favoritarPartida = async () => {
    if (!temCoord(partida)) return;
    setErro("");
    try { mudouLugares(await salvarLugar("favorito", partida, linhasDoEndereco(partida)[0])); setAviso("Partida salva nos favoritos."); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const semDestino = () => {
    if (!temCoord(partida)) { setErro("Escolha o local de partida."); setAtivo("partida"); return; }
    seguir({ partida, paradas: paradas.filter(temCoord), destino: null });
  };

  if (noMapa) {
    return <EscolherNoMapa inicio={temCoord(valorAtivo) ? valorAtivo : aqui} voltar={() => setNoMapa(false)}
      escolher={(p) => { setNoMapa(false); void escolher(p); }} />;
  }

  const favoritos: Array<{ id: string; nome: string; ponto: Ponto; icone: JSX.Element }> = [
    ...(lugares?.casa ? [{ id: "casa", nome: "Casa", ponto: lugares.casa, icone: <House size={18} /> }] : []),
    ...(lugares?.trabalho ? [{ id: "trabalho", nome: "Trabalho", ponto: lugares.trabalho, icone: <Briefcase size={18} /> }] : []),
    ...(lugares?.favoritos ?? []).map((f) => ({ ...f, icone: <Star size={18} /> })),
  ];
  const digitando = valorAtivo.texto.trim().length >= 3 && !temCoord(valorAtivo);
  const titulo = definindo === "casa" ? "Endereço de casa" : definindo === "trabalho" ? "Endereço do trabalho" : "Para onde vamos?";

  const campo = (qual: Ativo, rotulo: string, p: Ponto, placeholder: string, extra?: JSX.Element) => (
    <div className={`linha-endereco ${ativo === qual ? "ativa" : ""}`}>
      <span className={`marcador ${qual === "partida" ? "bola" : qual === "destino" ? "quadrado" : "parada"}`}>{typeof qual === "number" ? qual + 1 : ""}</span>
      <div className="linha-endereco-campo" onClick={() => setAtivo(qual)}>
        <small>{rotulo}</small>
        {ativo === qual
          ? <input ref={entrada} value={p.texto} placeholder={placeholder} onChange={(e) => digitar(e.target.value)} aria-label={rotulo} />
          : <span className={p.texto ? "" : "suave"}>{p.texto ? linhasDoEndereco(p)[0] : placeholder}</span>}
      </div>
      {extra}
    </div>
  );

  return (
    <div className="tela-cheia">
      <Topo titulo={titulo} sub={definindo ? "Digite o endereço" : "Digite o endereço de destino"} voltar={voltar} centro />
      <div className="conteudo sem-topo">
        <div className="cartao-enderecos">
          {!definindo && campo("partida", "PARTIDA", partida, aqui ? "Buscando sua posição…" : "De onde você sai?", (
            <span className="acoes-linha">
              <button className="icone-botao escuro pequeno" aria-label="Salvar partida nos favoritos" onClick={() => void favoritarPartida()}><Star size={18} /></button>
              <button className="icone-botao escuro pequeno" aria-label="Inverter partida e destino" onClick={inverter}><ArrowUpDown size={18} /></button>
            </span>
          ))}
          {!definindo && paradas.map((p, i) => campo(i, `PARADA ${i + 1}`, p, "Endereço da parada", (
            <button className="icone-botao escuro pequeno" aria-label={`Tirar a parada ${i + 1}`} onClick={() => { setParadas((l) => l.filter((_, j) => j !== i)); setAtivo("destino"); }}><X size={18} /></button>
          )))}
          {campo("destino", definindo ? "ENDEREÇO" : "DESTINO", destino, "Para onde você vai?", !definindo && paradas.length < MAX_PARADAS ? (
            <button className="redondo mais cheio" aria-label="Adicionar parada" onClick={() => { setParadas((l) => [...l, { texto: "" }]); setAtivo(paradas.length); }}><Plus size={18} strokeWidth={3} /></button>
          ) : undefined)}
        </div>
        <Aviso texto={erro} />
        {aviso && <p className="dica">{aviso}</p>}

        {sugestoes.length > 0 ? (
          <ul className="sugestoes">
            {sugestoes.map((s, i) => {
              const [l1, l2] = linhasDoEndereco(s);
              return <li key={i}><button onClick={() => void escolher({ texto: s.texto, lat: s.lat, lng: s.lng })}><span className="icone-redondo claro"><MapPin size={18} /></span><span><strong>{l1}</strong><small>{l2}</small></span></button></li>;
            })}
          </ul>
        ) : !digitando && (
          <>
            <div className="menu-lista plano">
              {!definindo && (
                <button onClick={() => setAbrirFavoritos(!abrirFavoritos)}><span className="texto-forte">Meus favoritos</span>{abrirFavoritos ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
              )}
              {abrirFavoritos && (favoritos.length ? favoritos.map((f) => (
                <button key={f.id} className="sub" onClick={() => void escolher(f.ponto)}><span className="icone-redondo claro">{f.icone}</span><span><strong>{f.nome}</strong><small>{linhasDoEndereco(f.ponto)[0]}</small></span></button>
              )) : <p className="dica sub">Nenhum favorito ainda. Toque na ☆ da partida para salvar.</p>)}
              <button onClick={() => setNoMapa(true)}><span className="icone-redondo cinza"><Pin size={18} /></span><span className="texto-forte">Escolher no mapa</span><ChevronRight size={18} /></button>
              {!definindo && ativo === "destino" && <button onClick={semDestino}><span className="icone-redondo cinza"><Ban size={18} /></span><span className="texto-forte">Não informar destino</span><ChevronRight size={18} /></button>}
            </div>
            {!!lugares?.recentes.length && (
              <>
                <h3 className="secao">Recentes</h3>
                <ul className="sugestoes">
                  {lugares.recentes.slice(0, modo === "recentes" ? 8 : 4).map((p, i) => {
                    const [l1, l2] = linhasDoEndereco(p);
                    return <li key={i}><button onClick={() => void escolher(p)}><span className="icone-redondo claro"><History size={18} /></span><span><strong>{l1}</strong><small>{l2}</small></span></button></li>;
                  })}
                </ul>
              </>
            )}
            {modo === "recentes" && !lugares?.recentes.length && <p className="dica centro">Seus últimos destinos aparecem aqui.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Escolher um ponto arrastando o mapa: o pino fica no meio. */
function EscolherNoMapa({ inicio, voltar, escolher }: { inicio: Posicao | null; voltar: () => void; escolher: (p: Ponto) => void }) {
  const [centro, setCentro] = useState<Posicao | null>(inicio);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const tempo = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!centro) return;
    setPonto(null);
    clearTimeout(tempo.current);
    tempo.current = setTimeout(() => void enderecoDoPonto(centro, "Ponto no mapa").then(setPonto), 400);
    return () => clearTimeout(tempo.current);
  }, [centro?.lat, centro?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const [l1, l2] = ponto ? linhasDoEndereco(ponto) : ["Buscando o endereço…", ""];
  return (
    <div className="tela-mapa">
      <Mapa eu={inicio} perto={inicio} aoMover={setCentro} />
      <div className="pino-centro" aria-hidden="true"><MapPin size={42} fill="currentColor" strokeWidth={1.5} /></div>
      <Topo titulo="Escolher no mapa" sub="Arraste o mapa até o ponto" voltar={voltar} centro />
      <div className="folha aberta">
        <div className="endereco-escolhido"><span className="icone-redondo claro"><MapPin size={18} /></span><span><strong>{l1}</strong><small>{l2}</small></span></div>
        <button className="botao largo" disabled={!ponto} onClick={() => ponto && escolher(ponto)}>CONFIRMAR LOCAL</button>
      </div>
    </div>
  );
}
