// Opções da corrida: abas Agora e Agendar, mapa com a rota, folha "Opções para você" com Opcionais, cartões de
// categoria com o preço (− e + para mudar o valor oferecido), forma de pagamento, cupom, valor e SOLICITAR/AGENDAR.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bike, CalendarCheck, CarFront, Check, ChevronDown, ChevronLeft, ChevronRight, Keyboard, SlidersHorizontal, Ticket, User, Wallet } from "lucide-react";
import { api, reais } from "../comum/api";
import { mensagemDeErro } from "../comum/ui";
import {
  agoraBrasilia, apiOu, diaBonito, ehMoto, esperandoHorario, estimarComParadas, faixaDaOferta, MESES_LONGOS, PASSO_OFERTA,
  quandoAgendada, ruaCurta, temCoord, type Categoria, type Corrida, type Rota,
} from "./apoio";
import { Mapa, type PontoMapa } from "./Mapa";
import type { Posicao } from "../comum/api";
import { Aviso, FolhaModal, PrecoAjustavel } from "./pecas";

interface Opcional { id: string; nome: string }
const OPCIONAIS_PADRAO: Opcional[] = [
  { id: "porta-malas", nome: "Porta-malas grande" }, { id: "encomenda", nome: "Encomenda" },
  { id: "adaptado", nome: "Carro adaptado" }, { id: "disposicao", nome: "Motorista à disposição" },
];
const novoPedido = () => `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function pontosDaRota(r: { embarque: { texto: string; lat?: number; lng?: number }; paradas?: Array<{ texto: string; lat?: number; lng?: number }>; destino: { texto: string; lat?: number; lng?: number } | null }): PontoMapa[] {
  return [
    ...(temCoord(r.embarque) ? [{ lat: r.embarque.lat, lng: r.embarque.lng, tipo: "embarque" as const, rotulo: "Seu Local de Partida", detalhe: ruaCurta(r.embarque) }] : []),
    ...(r.paradas ?? []).filter(temCoord).map((p, i) => ({ lat: p.lat!, lng: p.lng!, tipo: "parada" as const, rotulo: `Parada ${i + 1}`, detalhe: ruaCurta(p) })),
    ...(temCoord(r.destino) ? [{ lat: r.destino.lat, lng: r.destino.lng, tipo: "destino" as const, rotulo: "Destino", detalhe: ruaCurta(r.destino) }] : []),
  ];
}

export function Opcoes({ rota, voltar, pediu, agendou }: { rota: Rota; voltar: () => void; pediu: (c: Corrida) => void; agendou: (c: Corrida) => void }) {
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [opcoes, setOpcoes] = useState<{ categorias: Categoria[]; pagamentos: string[] } | null>(null);
  const [estimativas, setEstimativas] = useState<Record<string, { valor: number | null; distanciaKm: number | null; minutos: number | null }>>({});
  const [ofertas, setOfertas] = useState<Record<string, number>>({});
  const [categoria, setCategoria] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [cupom, setCupom] = useState("");
  const [listaOpcionais, setListaOpcionais] = useState<Opcional[]>(OPCIONAIS_PADRAO);
  const [opcionais, setOpcionais] = useState<string[]>([]);
  const [dia, setDia] = useState("");
  const [horario, setHorario] = useState("");
  const [janela, setJanela] = useState<"" | "opcionais" | "pagamento" | "cupom" | "dia" | "hora">("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [folga, setFolga] = useState(0);
  const pedidoId = useRef(novoPedido());

  useEffect(() => {
    void api<{ categorias: Categoria[]; pagamentos: string[] }>("/opcoes").then((o) => {
      setOpcoes(o); setCategoria(o.categorias[0]?.nome ?? ""); setPagamento(o.pagamentos[0] ?? "");
    }).catch((e) => setErro(mensagemDeErro(e)));
    void apiOu<{ opcionais: Opcional[] }>("/opcionais", { opcionais: OPCIONAIS_PADRAO }).then((r) => setListaOpcionais(r.opcionais.length ? r.opcionais : OPCIONAIS_PADRAO)).catch(() => undefined);
  }, []);

  const pontos = [rota.partida, ...rota.paradas, ...(rota.destino ? [rota.destino] : [])];
  useEffect(() => {
    if (!opcoes || !rota.destino) return;
    let vivo = true;
    void Promise.all(opcoes.categorias.map((c) => estimarComParadas(c.nome, pontos, c.aPartirDe).then((v) => [c.nome, v] as const).catch(() => [c.nome, { valor: null, distanciaKm: null, minutos: null }] as const)))
      .then((l) => {
        if (!vivo) return;
        setEstimativas(Object.fromEntries(l));
        setOfertas(Object.fromEntries(l.filter(([, v]) => v.valor != null).map(([n, v]) => [n, v.valor!])));
      });
    return () => { vivo = false; };
  }, [opcoes]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Estimativa da categoria: com destino, a calculada; sem destino, o "a partir de". */
  const base = (c: Categoria) => (rota.destino ? estimativas[c.nome]?.valor ?? null : c.aPartirDe);
  const valorDe = (c: Categoria) => ofertas[c.nome] ?? base(c);
  const atual = opcoes?.categorias.find((c) => c.nome === categoria);
  const valor = atual ? valorDe(atual) : null;
  const agendadaPara = quando === "agendar" && dia && horario ? `${dia}T${horario}` : "";

  const pedir = async () => {
    setErro("");
    if (quando === "agendar") {
      if (!agendadaPara) { setJanela("dia"); return; }
      if (agendadaPara < agoraBrasilia(15)) { setErro("Agende com pelo menos 15 minutos de antecedência."); return; }
    }
    setEnviando(true);
    try {
      const r = await api<{ corrida: Corrida }>("/corridas", {
        corpo: {
          embarque: rota.partida, destino: rota.destino ?? undefined, paradas: rota.paradas.length ? rota.paradas : undefined,
          categoria, pagamento, cupom, pedidoId: pedidoId.current, agendadaPara: agendadaPara || undefined,
          valorOferecido: valor != null && atual && base(atual) != null && Math.abs(valor - base(atual)!) > 0.001 ? valor : undefined,
          opcionais: opcionais.length ? opcionais : undefined,
        },
      });
      pedidoId.current = novoPedido();
      if (r.corrida.agendadaPara && esperandoHorario(r.corrida)) agendou(r.corrida); else pediu(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); pedidoId.current = novoPedido(); } finally { setEnviando(false); }
  };

  return (
    <div className="tela-mapa">
      <Mapa pontos={pontosDaRota({ embarque: rota.partida, paradas: rota.paradas, destino: rota.destino })} perto={temCoord(rota.partida) ? rota.partida as Posicao : null} folga={folga} />
      <div className="topo-flutuante">
        <button className="redondo-branco" onClick={voltar} aria-label="Voltar"><ArrowLeft size={22} /></button>
        <div className="segmento" role="tablist">
          <button role="tab" aria-selected={quando === "agora"} className={quando === "agora" ? "ativo" : ""} onClick={() => setQuando("agora")}>Agora</button>
          <button role="tab" aria-selected={quando === "agendar"} className={quando === "agendar" ? "ativo" : ""} onClick={() => { setQuando("agendar"); if (!agendadaPara) setJanela("dia"); }}>Agendar</button>
        </div>
      </div>

      <div className="folha aberta folha-opcoes" ref={(el) => { if (el && el.offsetHeight !== folga) setFolga(el.offsetHeight); }}>
        <span className="puxador" />
        <div className="opcoes-cabeca">
          <h2>Opções para você</h2>
          <button className="pilula-cinza" onClick={() => setJanela("opcionais")}><SlidersHorizontal size={16} /> Opcionais{opcionais.length ? ` (${opcionais.length})` : ""}</button>
        </div>
        {quando === "agendar" && (
          <button className="linha-agendamento" onClick={() => setJanela("dia")}>
            <CalendarCheck size={20} />
            <strong>{agendadaPara ? quandoAgendada(agendadaPara) : "Selecionar horário do agendamento"}</strong>
            <ChevronRight size={20} />
          </button>
        )}
        <div className="categorias">
          {!opcoes && !erro && <p className="dica centro">Carregando as opções…</p>}
          {opcoes?.categorias.map((c) => {
            const b = base(c), v = valorDe(c);
            const faixa = b != null ? faixaDaOferta(b, c.aPartirDe) : null;
            const calculando = !!rota.destino && !(c.nome in estimativas);
            return (
              <div key={c.nome} role="radio" aria-checked={categoria === c.nome} tabIndex={0} className={`categoria ${categoria === c.nome ? "ativa" : ""}`}
                onClick={() => setCategoria(c.nome)} onKeyDown={(e) => { if (e.key === "Enter") setCategoria(c.nome); }}>
                <span className="categoria-icone">{ehMoto(c.nome) ? <Bike size={30} /> : <CarFront size={30} />}</span>
                <span className="categoria-texto">
                  <strong>{c.nome} <small className="lugares"><User size={13} /> {ehMoto(c.nome) ? 1 : 4}</small></strong>
                  <small>{c.descricao || (ehMoto(c.nome) ? "Viagem de moto" : "Viagem de carro")}</small>
                </span>
                {calculando ? <span className="suave">…</span>
                  : v != null && faixa ? <PrecoAjustavel valor={v} min={faixa.min} max={faixa.max} passo={PASSO_OFERTA} mudar={(n) => { setCategoria(c.nome); setOfertas((o) => ({ ...o, [c.nome]: n })); }} />
                  : <strong className="preco-fixo">{rota.destino ? "a combinar" : c.aPartirDe != null ? `a partir de ${reais(c.aPartirDe)}` : "a combinar"}</strong>}
              </div>
            );
          })}
        </div>
        {valor != null && atual && base(atual) != null && Math.abs(valor - base(atual)!) > 0.001 && (
          <p className="dica">Você está oferecendo {reais(valor)}. O valor sugerido é {reais(base(atual))}.</p>
        )}
        <Aviso texto={erro} />
        <div className="rodape-pedido">
          <div className="rodape-linha">
            <button className="seletor-pagamento" onClick={() => setJanela("pagamento")}><Wallet size={22} /> {pagamento || "Pagamento"} <ChevronDown size={16} /></button>
            <button className="link-desconto" onClick={() => setJanela("cupom")}>{cupom ? <><Ticket size={15} /> {cupom}</> : "Clique para descontos >"}</button>
          </div>
          <div className="rodape-linha">
            <strong className="valor-grande">{valor != null ? reais(valor) : "—"}</strong>
            <button className="botao pedir" disabled={enviando || !categoria || !pagamento} onClick={() => void pedir()}>
              {enviando ? "AGUARDE…" : quando === "agendar" ? "AGENDAR" : <>SOLICITAR<small>{categoria}</small></>}
            </button>
          </div>
        </div>
      </div>

      {janela === "opcionais" && (
        <FolhaModal titulo="Opcionais" fechar={() => setJanela("")}>
          <p className="dica">Só vão receber a corrida os motoristas que oferecem o que você marcar.</p>
          <div className="menu-lista">
            {listaOpcionais.map((o) => {
              const marcado = opcionais.includes(o.id);
              return <button key={o.id} role="checkbox" aria-checked={marcado} onClick={() => setOpcionais((l) => (marcado ? l.filter((x) => x !== o.id) : [...l, o.id]))}>
                <span className="texto-forte">{o.nome}</span><span className={`caixinha ${marcado ? "marcada" : ""}`}>{marcado && <Check size={14} strokeWidth={3} />}</span>
              </button>;
            })}
          </div>
          <button className="botao largo" onClick={() => setJanela("")}>APLICAR</button>
        </FolhaModal>
      )}
      {janela === "pagamento" && opcoes && (
        <FolhaModal titulo="Forma de pagamento" fechar={() => setJanela("")}>
          <div className="menu-lista">
            {opcoes.pagamentos.map((p) => (
              <button key={p} onClick={() => { setPagamento(p); setJanela(""); }}><span className="texto-forte">{p}</span><span className={`radio ${pagamento === p ? "marcado" : ""}`} /></button>
            ))}
          </div>
        </FolhaModal>
      )}
      {janela === "cupom" && <Cupom atual={cupom} fechar={() => setJanela("")} aplicar={(c) => { setCupom(c); setJanela(""); }} />}
      {janela === "dia" && <Calendario valor={dia} fechar={() => setJanela("")} escolher={(d) => { setDia(d); setJanela("hora"); }} />}
      {janela === "hora" && <Relogio dia={dia} valor={horario} fechar={() => setJanela("")} escolher={(h) => { setHorario(h); setJanela(""); }} />}
    </div>
  );
}

function Cupom({ atual, fechar, aplicar }: { atual: string; fechar: () => void; aplicar: (c: string) => void }) {
  const [codigo, setCodigo] = useState(atual);
  return (
    <FolhaModal titulo="Cupom de desconto" fechar={fechar}>
      <span className="campo-caixa"><span className="campo-icone"><Ticket size={20} /></span><input aria-label="Código do cupom" placeholder="Digite o código" maxLength={30} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().trim())} /></span>
      <p className="dica">O desconto entra no valor final da corrida.</p>
      <div className="linha-botoes">
        {atual && <button className="botao contorno" onClick={() => aplicar("")}>Tirar cupom</button>}
        <button className="botao" disabled={codigo.length < 3} onClick={() => aplicar(codigo)}>APLICAR</button>
      </div>
    </FolhaModal>
  );
}

// ------------------------------------------------------------------ data e hora do agendamento (horário de Brasília)

function Calendario({ valor, fechar, escolher }: { valor: string; fechar: () => void; escolher: (dia: string) => void }) {
  const hoje = agoraBrasilia().slice(0, 10), ultimo = agoraBrasilia(30 * 24 * 60).slice(0, 10);
  const [marcado, setMarcado] = useState(valor || agoraBrasilia(15).slice(0, 10));
  const [mes, setMes] = useState(marcado.slice(0, 7));
  const dias = useMemo(() => {
    const [a, m] = mes.split("-").map(Number);
    const primeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay(), total = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return [...Array(primeiro).fill(""), ...Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  }, [mes]);
  const andar = (n: number) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); setMes(d.toISOString().slice(0, 7)); };
  const [a, m] = mes.split("-").map(Number);
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="seletor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Selecione a data">
        <small>Selecione a data</small>
        <div className="seletor-grande">{diaBonito(marcado)}</div>
        <div className="calendario-mes">
          <strong>{MESES_LONGOS[m - 1]} de {a}</strong>
          <span>
            <button className="icone-botao escuro pequeno" aria-label="Mês anterior" disabled={mes <= hoje.slice(0, 7)} onClick={() => andar(-1)}><ChevronLeft size={20} /></button>
            <button className="icone-botao escuro pequeno" aria-label="Próximo mês" disabled={mes >= ultimo.slice(0, 7)} onClick={() => andar(1)}><ChevronRight size={20} /></button>
          </span>
        </div>
        <div className="calendario">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i} className="dia-semana">{d}</span>)}
          {dias.map((d, i) => d ? (
            <button key={d} disabled={d < hoje || d > ultimo} className={`${d === marcado ? "marcado" : ""} ${d === hoje ? "hoje" : ""}`} onClick={() => setMarcado(d)}>{Number(d.slice(8))}</button>
          ) : <span key={`v${i}`} />)}
        </div>
        <div className="seletor-botoes"><button className="link" onClick={fechar}>Cancelar</button><button className="link" onClick={() => escolher(marcado)}>OK</button></div>
      </div>
    </div>
  );
}

function Relogio({ dia, valor, fechar, escolher }: { dia: string; valor: string; fechar: () => void; escolher: (hora: string) => void }) {
  const minimo = agoraBrasilia(15);
  const sugerida = valor || (dia === minimo.slice(0, 10) ? minimo.slice(11, 16) : "08:00");
  const [h, setH] = useState(sugerida.slice(0, 2));
  const [m, setM] = useState(sugerida.slice(3, 5));
  const [parte, setParte] = useState<"h" | "m">("h");
  const [digitar, setDigitar] = useState(false);
  const cedo = `${dia}T${h}:${m}` < minimo;
  const opcoes = parte === "h" ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")) : Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="seletor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Selecione o horário">
        <small>Selecione o horário</small>
        {digitar ? (
          <input className="hora-digitada" type="time" aria-label="Horário" value={`${h}:${m}`} onChange={(e) => { const [a, b] = e.target.value.split(":"); if (a && b) { setH(a); setM(b); } }} />
        ) : (
          <>
            <div className="relogio-visor">
              <button className={parte === "h" ? "ativo" : ""} onClick={() => setParte("h")} aria-label="Hora">{h}</button>
              <span>:</span>
              <button className={parte === "m" ? "ativo" : ""} onClick={() => setParte("m")} aria-label="Minutos">{m}</button>
            </div>
            <div className={`relogio-grade ${parte === "h" ? "horas" : ""}`}>
              {opcoes.map((o) => <button key={o} className={(parte === "h" ? h : m) === o ? "marcado" : ""} onClick={() => { if (parte === "h") { setH(o); setParte("m"); } else setM(o); }}>{o}</button>)}
            </div>
          </>
        )}
        {cedo && <p className="dica perigo">Escolha a partir de {minimo.slice(11, 16)} (15 minutos de antecedência).</p>}
        <div className="seletor-botoes">
          <button className="icone-botao escuro pequeno" aria-label="Digitar o horário" onClick={() => setDigitar(!digitar)}><Keyboard size={20} /></button>
          <span className="espaco" />
          <button className="link" onClick={fechar}>Cancelar</button>
          <button className="link" disabled={cedo} onClick={() => escolher(`${h}:${m}`)}>OK</button>
        </div>
      </div>
    </div>
  );
}
