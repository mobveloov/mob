// Telas de dinheiro do app do motorista, no desenho da referência: Atividades (resumo do dia, semana e mês), Histórico de ganhos
// (lista por dia, cada corrida com valor da corrida, comissão da central e líquido), Informações da corrida, Carteira e Taxa de aceitação.

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, Eye, EyeOff, Flag, Gift, Plus, SlidersHorizontal, Star, UserRound, Wallet, X, Car } from "lucide-react";
import { reais } from "../comum/api";
import { Avatar, Erro, Folha, Pagina, Topo, useBuscar, Vazio } from "./Pecas";
import { useAjustes } from "./ajustes";
import { diaHora, soHora, type Eu } from "./tipos";
import { Carteira as CarteiraAntiga } from "./Telas";

export interface Ganho {
  id: string; os: string; em: string; valor: number | null; valorBruto: number; taxaCentral: number; valorLiquido: number; desconto: number; percentualTaxa: number; ganhoPorKm: number | null;
  categoria: string; pagamento: string; canal: string; km: number | null; minutos: number | null; passageiro: string; embarque: string; destino: string; solicitadaEm: string; iniciadaEm?: string | null;
}
interface Soma { corridas: number; bruto: number; taxa: number; liquido: number }
interface Periodo {
  periodo: string; de: string; ate: string; total: number; viagens: number; totalBruto: number; totalTaxa: number; totalLiquido: number; ganhoPorKm: number | null;
  minutosOnline: number; minutosEmViagem: number; hoje: Soma; semanaAtual: Soma;
  porDia: Array<{ dia: string; valor: number }>; porDiaLiquido: Array<{ dia: string } & Soma>;
  porPagamento: Array<{ pagamento: string; valor: number; corridas: number }>; lista: Ganho[];
}
type Voltar = { voltar: () => void };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const tempo = (min: number) => (min < 60 ? `${min}min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`);
const km2 = (n: number | null) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")} km`);
const dataLonga = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()} às ${soHora(iso)}`; };
const diaTitulo = (dia: string) => { const [, m, d] = dia.split("-").map(Number); return `Dia ${d} de ${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)}`; };
const nomeSemana = (dia: string) => { const w = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7; return w; };

// ====================================================================== Atividades

export function Atividades({ voltar, eu, irHistorico, irCarteira, irAceitacao, irDesafios }: Voltar & { eu: Eu; irHistorico: () => void; irCarteira: () => void; irAceitacao: () => void; irDesafios: () => void }) {
  const [aba, setAba] = useState<"hoje" | "semanal" | "mensal">("hoje");
  const [ajustes, mudar] = useAjustes();
  const resumo = useBuscar<{ hoje: Soma & { km: number; valor: number }; semana: Soma & { km: number; valor: number }; mes: Soma & { km: number; valor: number } }>("/ganhos");
  const cart = useBuscar<{ saldo: number }>("/carteira");
  const acc = useBuscar<{ porcentagem: number }>("/aceitacao");
  const per = useBuscar<Periodo>("/ganhos?periodo=semana");
  const g = resumo.dados?.[aba === "hoje" ? "hoje" : aba === "semanal" ? "semana" : "mes"];
  const esconder = ajustes.esconderGanhos;
  const dinheiro = (v: number | undefined) => (esconder ? "R$ ••••" : v == null ? "—" : reais(v));
  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Atividades" voltar={voltar} direita={<button type="button" className="topo-acao" aria-label={esconder ? "Mostrar ganhos" : "Esconder ganhos"} onClick={() => mudar({ esconderGanhos: !esconder })}>{esconder ? <EyeOff size={22} /> : <Eye size={22} />}</button>} />
      <div className="conteudo">
        <div className="atividade-perfil">
          <Avatar foto={eu.foto} nome={eu.nome} tamanho={76} selo={eu.nota != null ? <span className="selo-nota"><Star size={13} fill="currentColor" /> {eu.nota.toFixed(1).replace(".", ",")}</span> : undefined} />
          <div><strong>{eu.nome}</strong>{eu.categorias ? <small>{eu.categorias}</small> : null}</div>
        </div>
        <section className="cartao-m atividade-resumo">
          <div className="abas-linha" role="tablist">{(["hoje", "semanal", "mensal"] as const).map((a) => <button key={a} type="button" role="tab" aria-selected={aba === a} className={aba === a ? "ativa" : ""} onClick={() => setAba(a)}>{a === "hoje" ? "Hoje" : a === "semanal" ? "Semanal" : "Mensal"}</button>)}</div>
          <small className="dica">Ganhos</small>
          <p className="valor-grande">{dinheiro(g?.liquido)}</p>
          {g && g.taxa > 0 && !esconder && <small className="dica">Corridas {reais(g.bruto)} · comissão da central −{reais(g.taxa)}</small>}
          <div className="linha-icone"><Car size={20} /> {g?.corridas ?? 0} {g?.corridas === 1 ? "corrida" : "corridas"}</div>
          <div className="linha-icone"><Clock size={20} /> {per.dados ? tempo(per.dados.minutosOnline) : "—"} online na semana</div>
        </section>
        <button type="button" className="linha-menu" onClick={irHistorico}><span>Histórico de ganhos</span><ChevronRight size={20} /></button>
        <button type="button" className="linha-menu" onClick={irCarteira}><span className="com-icone"><Wallet size={20} className="cor-marca" /> Carteira</span><span className="direita">{dinheiro(cart.dados?.saldo)} <ChevronRight size={20} /></span></button>
        <button type="button" className="linha-menu" onClick={irAceitacao}><span>Taxa de aceitação</span><span className="direita">{acc.dados ? `${acc.dados.porcentagem}%` : "—"} <ChevronRight size={20} /></span></button>
        <button type="button" className="cartao-m convite" onClick={irDesafios}>
          <div><strong>Ganhe recompensas por cada indicado que você convidar para o app</strong><span className="com-icone"><UserRound size={20} /> Indique Passageiros</span></div>
          <Gift size={56} className="cor-marca" />
        </button>
      </div>
    </Pagina>
  );
}

// ====================================================================== Histórico de ganhos

export function HistoricoDeGanhos({ voltar }: Voltar) {
  const [periodo, setPeriodo] = useState<"mes" | "semana">("semana");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [dia, setDia] = useState("");
  const [filtro, setFiltro] = useState(false);
  const [aberta, setAberta] = useState<Ganho | null>(null);
  const { dados, erro } = useBuscar<Periodo>(`/ganhos?periodo=${periodo}&mes=${mes}`);
  if (aberta) return <InformacoesDaCorrida ganho={aberta} voltar={() => setAberta(null)} />;
  const lista = (dados?.lista ?? []).filter((c) => !dia || c.em.slice(0, 10) === dia);
  const porDia = new Map<string, Ganho[]>();
  for (const c of lista) porDia.set(c.em.slice(0, 10), [...(porDia.get(c.em.slice(0, 10)) ?? []), c]);
  const soma = lista.reduce((s, c) => s + c.valorLiquido, 0), somaBruto = lista.reduce((s, c) => s + c.valorBruto, 0), somaTaxa = lista.reduce((s, c) => s + c.taxaCentral, 0);
  const kmTotal = lista.reduce((s, c) => s + (c.km ?? 0), 0);
  const porPag = new Map<string, { n: number; v: number }>();
  for (const c of lista) { const x = porPag.get(c.pagamento) ?? { n: 0, v: 0 }; porPag.set(c.pagamento, { n: x.n + 1, v: x.v + c.valorLiquido }); }
  const barras = periodo === "semana" && dados ? SEMANA.map((_, i) => dados.porDiaLiquido.filter((d) => nomeSemana(d.dia) === i).reduce((s, d) => s + d.liquido, 0)) : null;
  const maior = Math.max(1, ...(barras ?? [1]));
  const titulo = dia ? "Seus ganhos neste dia" : periodo === "semana" ? "Seus ganhos na semana" : "Seus ganhos no mês";
  const opcoesMes = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Histórico de ganhos" voltar={voltar} direita={<button type="button" className="topo-acao" aria-label="Filtrar" onClick={() => setFiltro(true)}><SlidersHorizontal size={22} /></button>} />
      <div className="conteudo">
        <div className="chips-filtro">
          {dia && <button type="button" className="chip-filtro" onClick={() => setDia("")}>{dia.slice(8)}/{dia.slice(5, 7)} <X size={16} /></button>}
          {!dia && periodo === "mes" && <label className="chip-filtro">{MESES[Number(mes.slice(5)) - 1]} {mes.slice(0, 4)} <ChevronDown size={16} /><select aria-label="Mês" value={mes} onChange={(e) => setMes(e.target.value)}>{opcoesMes.map((m) => <option key={m} value={m}>{MESES[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}</select></label>}
        </div>
        <Erro texto={erro} />
        {dados && <>
          <section className="cartao-m ganhos-resumo">
            <p className="titulo-centro">{titulo}</p>
            <p className="valor-grande">{reais(soma)}</p>
            {somaTaxa > 0 && <small className="dica centro">Corridas {reais(somaBruto)} · comissão da central −{reais(somaTaxa)}</small>}
            {barras && <div className="barras-semana">{barras.map((v, i) => <div key={i}><span style={{ height: v > 0 ? `${Math.max(4, (v / maior) * 100)}%` : 0 }} /><small>{SEMANA[i]}</small></div>)}</div>}
            <div className="grade-numeros">
              <div><small>Ganho por km</small><strong>{kmTotal > 0 ? reais(soma / kmTotal) : "—"}</strong></div>
              <div><small>Corridas</small><strong>{lista.length}</strong></div>
              <div><small>Tempo online</small><strong>{tempo(dados.minutosOnline)}</strong></div>
              <div><small>Horas trabalhadas</small><strong>{tempo(dados.minutosEmViagem)}</strong></div>
            </div>
          </section>
          {porPag.size > 0 && (
            <section className="cartao-m">
              <h3 className="titulo-secao">Corridas por forma de pagamento</h3>
              {[...porPag].map(([p, x]) => <div key={p} className="linha-valor"><span>{x.n} {x.n === 1 ? "corrida" : "corridas"} em {p}</span><strong>{reais(x.v)}</strong></div>)}
            </section>
          )}
          {!lista.length && <Vazio icone={Car} titulo="Nenhuma corrida por aqui" texto="As corridas finalizadas no período aparecem aqui." />}
          {[...porDia].map(([d, l]) => (
            <section key={d} className="cartao-m lista-dia">
              <h3 className="titulo-secao">{diaTitulo(d)} <small className="dica">· {reais(l.reduce((s, c) => s + c.valorLiquido, 0))}</small></h3>
              {l.map((c) => (
                <button key={c.id} type="button" className="ganho-item" onClick={() => setAberta(c)}>
                  <div className="g-topo"><strong>{soHora(c.em)}</strong><span className="verde">{reais(c.valorLiquido)}</span></div>
                  <small className="cat">{c.categoria.toUpperCase()} · {km2(c.km)} · OS {c.os}</small>
                  {c.taxaCentral > 0 && <small className="comissao">Corrida {reais(c.valorBruto)} · comissão da central −{reais(c.taxaCentral)}</small>}
                  <div className="rota-linha"><UserRound size={16} /> <span>{c.embarque}</span></div>
                  {c.destino && <div className="rota-linha"><Flag size={16} /> <span>{c.destino}</span></div>}
                </button>
              ))}
            </section>
          ))}
        </>}
      </div>
      {filtro && (
        <Folha titulo="Filtrar" fechar={() => setFiltro(false)}>
          {(["semana", "mes"] as const).map((p) => <button key={p} type="button" className={`opcao-folha ${periodo === p && !dia ? "ativa" : ""}`} onClick={() => { setPeriodo(p); setDia(""); setFiltro(false); }}>{p === "semana" ? "Semanal" : "Mensal"}</button>)}
          <label className="opcao-folha">Escolher um dia<input type="date" value={dia} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDia(e.target.value); if (e.target.value) setMes(e.target.value.slice(0, 7)); setPeriodo("mes"); setFiltro(false); }} /></label>
        </Folha>
      )}
    </Pagina>
  );
}

// ====================================================================== Informações da corrida

export function InformacoesDaCorrida({ ganho: c, voltar }: Voltar & { ganho: Ganho }) {
  const dinheiro = /dinheiro/i.test(c.pagamento);
  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Informações da corrida" voltar={voltar} />
      <div className="conteudo">
        <section className="cartao-m ganhos-resumo">
          <small className="dica centro">Você ganhou</small>
          <p className="valor-grande">{reais(c.valorLiquido)}</p>
          {c.ganhoPorKm != null && <p className="centro">{reais(c.ganhoPorKm)}/km</p>}
          <div className="linha-valor"><span>Duração</span><strong>{c.minutos != null ? `${c.minutos} min` : "—"}</strong></div>
          <div className="linha-valor"><span>Distância total</span><strong>{km2(c.km)}</strong></div>
        </section>
        <section className="cartao-m">
          <h3 className="titulo-secao">{c.passageiro}</h3>
          <small className="dica">{dataLonga(c.solicitadaEm)}</small>
          <div className="trajeto-info">
            <div><UserRound size={18} /><span><small className="dica">Embarque</small>{c.embarque}</span></div>
            {c.destino && <div><Flag size={18} /><span><small className="dica">Destino</small>{c.destino}</span></div>}
          </div>
        </section>
        <section className="cartao-m">
          <h3 className="titulo-secao">Detalhes da corrida</h3>
          <div className="grade-detalhes">
            <div><small>OS</small><strong>{c.os}</strong></div>
            <div><small>Situação</small><strong>Finalizada</strong></div>
            <div><small>Solicitado via</small><strong>{c.canal === "app" ? "Aplicativo" : c.canal === "macaneta" ? "Maçaneta" : c.canal === "totem" ? "Totem" : c.canal === "bot" ? "WhatsApp" : "Central"}</strong></div>
            <div><small>Categoria</small><strong>{c.categoria}</strong></div>
          </div>
        </section>
        <section className="cartao-m">
          <h3 className="titulo-secao">Seus ganhos</h3>
          <div className="linha-valor"><span>Valor da corrida</span><strong>{reais(c.valorBruto)}</strong></div>
          {c.desconto > 0 && <div className="linha-valor"><span>Desconto do passageiro (cupom)</span><strong>−{reais(c.desconto)}</strong></div>}
          {c.taxaCentral > 0 && <div className="linha-valor"><span>Comissão da central{c.percentualTaxa ? ` (${c.percentualTaxa.toString().replace(".", ",")}%)` : ""}</span><strong>−{reais(c.taxaCentral)}</strong></div>}
          <hr />
          <div className="linha-valor total"><span>Total (líquido)</span><strong>{reais(c.valorLiquido)}</strong></div>
        </section>
        <section className="cartao-m">
          <h3 className="titulo-secao">Recebimento</h3>
          <div className="linha-valor"><span>{c.pagamento}</span><strong>{reais(c.valorBruto - c.desconto)}</strong></div>
          <small className="dica">{dinheiro ? "Você recebeu esse valor do passageiro em dinheiro. A comissão da central fica a pagar." : "A forma de pagamento é acertada com a central."}</small>
        </section>
      </div>
    </Pagina>
  );
}

// ====================================================================== Carteira

interface DadosCarteira { saldo: number; extrato: Array<{ id?: string; valor: number; descricao: string; em: string; corridaId?: string | null }> }

export function CarteiraDoMotorista({ voltar }: Voltar) {
  const { dados, erro } = useBuscar<DadosCarteira>("/carteira");
  const [sacando, setSacando] = useState(false);
  if (sacando) return <CarteiraAntiga voltar={() => setSacando(false)} />;
  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Carteira" voltar={voltar} />
      <div className="conteudo">
        <Erro texto={erro} />
        <section className="cartao-m">
          <small className="dica">Saldo</small>
          <p className="valor-grande esquerda">{dados ? reais(dados.saldo) : "—"}</p>
          <div className="acoes-carteira">
            <button type="button" onClick={() => setSacando(true)}><span className="quadro"><Plus size={22} /></span>Adicionar</button>
            <button type="button" onClick={() => setSacando(true)}><span className="quadro"><ArrowUp size={22} /></span>Retirar</button>
          </div>
        </section>
        <section className="cartao-m">
          <h3 className="titulo-secao">Histórico da carteira</h3>
          {dados && !dados.extrato.length && <Vazio icone={Wallet} titulo="Sem movimentações" texto="Seu histórico de transações está limpo." />}
          {dados?.extrato.map((l, i) => {
            const os = /OS (\S+)/.exec(l.descricao)?.[1];
            return (
              <div key={l.id ?? i} className="extrato-item">
                <span className="seta">{l.valor >= 0 ? <ArrowDown size={20} /> : <ArrowUp size={20} />}</span>
                <div><small className="dica">{diaHora(l.em)}</small><strong>R$ {l.valor < 0 ? "-" : ""}{Math.abs(l.valor).toFixed(2).replace(".", ",")}</strong><span>{os ? l.descricao.replace(/\s*OS \S+.*/, "") : l.descricao}</span>{os && <small className="dica">OS {os}</small>}</div>
              </div>
            );
          })}
        </section>
      </div>
    </Pagina>
  );
}

// ====================================================================== Taxa de aceitação

export function TaxaDeAceitacao({ voltar }: Voltar) {
  const { dados, erro } = useBuscar<{ ofertas: number; aceitas: number; rejeitadas: number; ignoradas: number; porcentagem: number; atualizadoEm: string | null }>("/aceitacao");
  const [aberto, setAberto] = useState<number | null>(null);
  const perguntas: Array<[string, string]> = [
    ["O que é a taxa de aceitação?", "É a porcentagem de chamadas que você aceitou, entre as últimas 100 que a central mandou para você."],
    ["Como a taxa é calculada?", "Aceitas ÷ ofertas. Chamada recusada ou que passou sem resposta conta como não aceita. Quem fica offline no meio da chamada não é contado."],
    ["O que é uma oferta?", "É cada chamada de corrida que aparece na sua tela com o tempo para aceitar."],
  ];
  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Taxa de aceitação" voltar={voltar} />
      <div className="conteudo">
        <Erro texto={erro} />
        {dados && <>
          <section className="cartao-m ganhos-resumo"><p className="valor-grande">{dados.porcentagem}%</p><p className="centro">Taxa de aceitação</p><small className="dica centro">Baseado nas últimas 100 ofertas</small></section>
          <section className="cartao-m">
            <h3 className="titulo-secao">Detalhamento</h3>
            <div className="linha-valor"><span>Ofertas</span><strong>{dados.ofertas}</strong></div>
            <div className="linha-valor"><span>Aceitas</span><strong>{dados.aceitas}</strong></div>
            <div className="linha-valor"><span>Rejeitadas</span><strong>{dados.rejeitadas}</strong></div>
            <div className="linha-valor"><span>Ignoradas</span><strong>{dados.ignoradas}</strong></div>
            <hr />
            <div className="linha-valor"><span>Porcentagem</span><strong>{dados.porcentagem}%</strong></div>
            {dados.atualizadoEm && <small className="dica">Última atualização: {diaHora(dados.atualizadoEm)}</small>}
          </section>
        </>}
        <section className="cartao-m">
          <h3 className="titulo-secao">Mais informações</h3>
          {perguntas.map(([p, r], i) => (
            <div key={p} className="pergunta">
              <button type="button" onClick={() => setAberto(aberto === i ? null : i)}><span>{p}</span><ChevronDown size={18} style={{ transform: aberto === i ? "rotate(180deg)" : undefined }} /></button>
              {aberto === i && <p className="dica">{r}</p>}
            </div>
          ))}
        </section>
      </div>
    </Pagina>
  );
}
