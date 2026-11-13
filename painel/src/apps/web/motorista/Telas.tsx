// Telas a mais do app do motorista: preferências de corrida, carteira e saque, indique e ganhe (desafios) e notificações.

import { useEffect, useState } from "react";
import { BellOff, Check, Gift, Share2, SlidersHorizontal, Wallet } from "lucide-react";
import { api, reais } from "../comum/api";
import { mensagemDeErro, type MarcaApp } from "../comum/ui";
import { Erro, Info, Pagina, Topo, useBuscar, Vazio } from "./Pecas";
import { diaHora } from "./tipos";

const dataCurta = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : diaHora(s));
const Carregando = () => <div className="vazio"><div className="girando" /></div>;

// ====================================================================== preferências de corrida

interface DadosPreferencias {
  podem: string[]; escolhidas: string[]; pagamentos: string[]; filtros: string[];
  pagamentosDisponiveis: string[]; filtrosDisponiveis: Array<{ id: string; nome: string }>;
}

function Opcao({ marcada, texto, aoTrocar }: { marcada: boolean; texto: string; aoTrocar: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={marcada} className={`opcao-pref ${marcada ? "marcada" : ""}`} onClick={aoTrocar}>
      <span className="caixa">{marcada && <Check size={16} strokeWidth={3.5} />}</span>{texto}
    </button>
  );
}

export function Preferencias({ voltar }: { voltar: () => void }) {
  const { dados: d, erro } = useBuscar<DadosPreferencias>("/preferencias");
  const [pagamentos, setPagamentos] = useState<string[] | null>(null);
  const [filtros, setFiltros] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  useEffect(() => {
    if (!d) return;
    const pag = d.pagamentosDisponiveis ?? [];
    setPagamentos(d.pagamentos?.length ? d.pagamentos.filter((x) => pag.includes(x)) : pag);
    setFiltros(d.filtros ?? []);
    setCategorias(d.escolhidas.length ? d.escolhidas.filter((x) => d.podem.includes(x)) : d.podem);
  }, [d]);
  if (!d || !pagamentos) return <Pagina><Topo estilo="escuro" titulo="Preferências" voltar={voltar} />{erro ? <div className="conteudo"><Erro texto={erro} /></div> : <Carregando />}</Pagina>;
  const alternar = (lista: string[], x: string) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);
  const salvar = async () => {
    setAviso(""); setErroSalvar("");
    try {
      await api("/preferencias", { corpo: {
        categorias: categorias.length === d.podem.length ? [] : categorias,
        pagamentos: pagamentos.length === d.pagamentosDisponiveis.length ? [] : pagamentos,
        filtros,
      } });
      setAviso("Preferências salvas.");
    } catch (e) { setErroSalvar(mensagemDeErro(e)); }
  };
  const semPagamento = !pagamentos.length, semCategoria = d.podem.length > 0 && !categorias.length;
  return (
    <Pagina>
      <Topo estilo="escuro" titulo="Preferências" voltar={voltar} />
      <div className="conteudo" style={{ gap: ".7rem" }}>
        <div className="cabeca-pref"><Wallet size={22} /><div><strong>Formas de pagamento</strong><small>Escolha como deseja receber</small></div></div>
        {d.pagamentosDisponiveis.map((p) => <Opcao key={p} marcada={pagamentos.includes(p)} texto={p} aoTrocar={() => { setAviso(""); setPagamentos(alternar(pagamentos, p)); }} />)}
        {semPagamento && <p className="dica">Marque pelo menos uma forma de pagamento.</p>}

        {d.podem.length > 0 && <>
          <div className="cabeca-pref" style={{ marginTop: "1.2rem" }}><SlidersHorizontal size={22} /><div><strong>Categorias</strong><small>Escolha quais tipos de corrida receber</small></div></div>
          {d.podem.map((c) => <Opcao key={c} marcada={categorias.includes(c)} texto={c} aoTrocar={() => { setAviso(""); setCategorias(alternar(categorias, c)); }} />)}
          {semCategoria && <p className="dica">Marque pelo menos uma categoria.</p>}
        </>}

        <div className="cabeca-pref" style={{ marginTop: "1.2rem" }}><SlidersHorizontal size={22} /><div><strong>Filtros e exigências</strong><small>Defina o tipo de corrida</small></div></div>
        {d.filtrosDisponiveis.map((f) => <Opcao key={f.id} marcada={filtros.includes(f.id)} texto={f.nome} aoTrocar={() => { setAviso(""); setFiltros(alternar(filtros, f.id)); }} />)}
        <Erro texto={erroSalvar} /><Info texto={aviso} tipo="ok" />
      </div>
      <div className="rodape-fixo"><button type="button" className="botao-m" disabled={semPagamento || semCategoria} onClick={() => void salvar()}>SALVAR PREFERÊNCIAS</button></div>
    </Pagina>
  );
}

// ====================================================================== carteira

interface DadosCarteira {
  saldo: number; recarga: string;
  extrato: Array<{ id?: string; valor: number; descricao: string; em: string }>;
  saques?: Array<{ id?: string; valor: number; chavePix: string; situacao: "Pendente" | "Pago" | "Recusado"; motivo: string; em: string }>;
}

export function Carteira({ voltar }: { voltar: () => void }) {
  const { dados: d, erro, recarregar } = useBuscar<DadosCarteira>("/carteira");
  const [valor, setValor] = useState("");
  const [pix, setPix] = useState(() => { try { return localStorage.getItem("chave-pix") ?? ""; } catch { return ""; } });
  const [erroSaque, setErroSaque] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const pedir = async () => {
    setErroSaque(""); setOk(""); setOcupado(true);
    try {
      await api("/saques", { corpo: { valor: Number(valor.replace(",", ".")), chavePix: pix.trim() } });
      try { localStorage.setItem("chave-pix", pix.trim()); } catch { /* sem armazenamento */ }
      setValor(""); setOk("Saque pedido. A central faz o Pix e a situação aparece aqui."); await recarregar();
    } catch (e) { setErroSaque(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  if (!d) return <Pagina><Topo titulo="Carteira" voltar={voltar} />{erro ? <div className="conteudo"><Erro texto={erro} /></div> : <Carregando />}</Pagina>;
  const pendente = d.saques?.some((s) => s.situacao === "Pendente");
  const v = Number(valor.replace(",", "."));
  return (
    <Pagina>
      <Topo titulo="Carteira" voltar={voltar} />
      <div className="conteudo">
        <div className="cartao-ganhos"><div className="linha-topo"><span>Saldo disponível</span></div><p className="valor">{reais(d.saldo)}</p></div>
        <form className="cartao-m" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
          <h3>Pedir saque</h3>
          {pendente ? <p className="dica">Você já tem um saque esperando a central. Assim que ele for resolvido, pode pedir outro.</p> : (
            <>
              <label className="campo"><span className="campo-rotulo">Valor (mínimo R$ 10,00)</span><span className="campo-caixa"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></span></label>
              <label className="campo"><span className="campo-rotulo">Chave Pix</span><span className="campo-caixa"><input value={pix} maxLength={120} onChange={(e) => setPix(e.target.value)} placeholder="CPF, celular, e-mail ou chave aleatória" /></span></label>
              <button className="botao-m" disabled={ocupado || !(v >= 10) || v > d.saldo || pix.trim().length < 5}>PEDIR SAQUE</button>
              {v > d.saldo && <p className="dica">O valor é maior que o saldo.</p>}
            </>
          )}
          <Erro texto={erroSaque} /><Info texto={ok} tipo="ok" />
        </form>
        {!!d.saques?.length && (
          <>
            <div className="rotulo-lista">SAQUES</div>
            {d.saques.map((s, i) => (
              <div key={s.id ?? i} className="cartao-viagem">
                <div className="l1"><span className="hora">{diaHora(s.em)} · Pix {s.chavePix}</span><span className="valor" style={{ color: "var(--m-tx)" }}>{reais(s.valor)}</span></div>
                <div><span className={`selo-situacao ${s.situacao === "Pago" ? "" : s.situacao === "Recusado" ? "ruim" : "espera"}`}>{s.situacao}</span>{s.motivo && <p className="dica" style={{ margin: ".4rem 0 0" }}>Motivo: {s.motivo}</p>}</div>
              </div>
            ))}
          </>
        )}
        <div className="rotulo-lista">HISTÓRICO DE MOVIMENTAÇÕES</div>
        {!d.extrato.length && <Vazio icone={Wallet} titulo="Sem movimentações" texto="Seu histórico de transações está limpo." />}
        {d.extrato.map((l, i) => (
          <div key={l.id ?? i} className="cartao-viagem" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <span>{l.descricao}<br /><small className="dica">{diaHora(l.em)}</small></span>
            <strong className={l.valor >= 0 ? "cor-ok" : "cor-perigo"}>{l.valor >= 0 ? "+" : "−"}{reais(Math.abs(l.valor))}</strong>
          </div>
        ))}
      </div>
    </Pagina>
  );
}

// ====================================================================== indique e ganhe

interface Desafio { id?: string; nome: string; tipo: string; meta: number; feito: number; premio: number | null; fim: string | null; regras: string; ganho: boolean }

export function Desafios({ voltar, marca }: { voltar: () => void; marca: MarcaApp }) {
  const { dados: d, erro } = useBuscar<{ codigo: string; desafios: Desafio[] }>("/desafios");
  const [aviso, setAviso] = useState("");
  if (!d) return <Pagina><Topo titulo="Indique e ganhe" voltar={voltar} />{erro ? <div className="conteudo"><Erro texto={erro} /></div> : <Carregando />}</Pagina>;
  const compartilhar = async () => {
    const texto = `Use meu código ${d.codigo} no app ${marca.nome}.`;
    try {
      if (navigator.share) { await navigator.share({ title: marca.nome, text: texto }); return; }
      await navigator.clipboard.writeText(texto); setAviso("Código copiado. Cole onde quiser.");
    } catch { /* cancelou */ }
  };
  return (
    <Pagina>
      <Topo titulo="Indique e ganhe" voltar={voltar} />
      <div className="conteudo">
        <div className="cartao-m centro">
          <span className="item-icone" style={{ width: 56, height: 56 }}><Gift size={26} /></span>
          <p className="dica" style={{ margin: 0 }}>Seu código de indicação</p>
          <div className="codigo" style={{ fontSize: "1.8rem", fontWeight: 800, letterSpacing: ".2em" }}>{d.codigo}</div>
          <button type="button" className="botao-m" onClick={() => void compartilhar()}><Share2 size={18} /> Compartilhar código</button>
          <Info texto={aviso} tipo="ok" />
        </div>
        {!d.desafios.length && <p className="dica" style={{ textAlign: "center" }}>Nenhum desafio agora. Volte mais tarde.</p>}
        {d.desafios.map((x, i) => {
          const pct = x.meta > 0 ? Math.min(100, Math.round((x.feito / x.meta) * 100)) : 0;
          return (
            <div key={x.id ?? i} className="cartao-m">
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "center" }}><strong>{x.nome}</strong>{x.ganho && <span className="chip ok">Prêmio ganho</span>}</div>
              <p className="dica" style={{ margin: 0 }}>{x.tipo}{x.fim ? ` · até ${dataCurta(x.fim)}` : ""}</p>
              <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={x.meta} aria-valuenow={Math.min(x.feito, x.meta)}><span style={{ width: `${pct}%` }} /></div>
              <p style={{ margin: 0 }}><strong>{Math.min(x.feito, x.meta)} de {x.meta}</strong>{x.premio ? ` · prêmio ${reais(x.premio)}` : ""}</p>
              {x.regras && <p className="dica" style={{ margin: 0 }}>{x.regras}</p>}
            </div>
          );
        })}
      </div>
    </Pagina>
  );
}

// ====================================================================== notificações

export function Notificacoes({ voltar }: { voltar: () => void }) {
  const { dados: d, erro } = useBuscar<{ notificacoes: Array<{ id?: string; titulo: string; texto: string; em: string }> }>("/notificacoes");
  return (
    <Pagina>
      <Topo estilo="escuro" titulo="Notificações" voltar={voltar} />
      {!d ? (erro ? <div className="conteudo"><Erro texto={erro} /></div> : <Carregando />) : !d.notificacoes.length ? (
        <div className="vazio-centro" style={{ background: "var(--m-bg)" }}>
          <span className="vazio-icone"><BellOff size={44} /></span>
          <strong style={{ color: "var(--m-tx)", fontSize: "1.2rem" }}>Sem notificações</strong>
          <span style={{ maxWidth: "24ch" }}>Você ainda não possui avisos ou mensagens importantes.</span>
        </div>
      ) : (
        <div className="conteudo">
          {d.notificacoes.map((n, i) => (
            <div key={n.id ?? i} className="cartao-m">
              <strong>{n.titulo}</strong>
              {n.em && <small className="dica">{dataCurta(n.em)}</small>}
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.texto}</p>
            </div>
          ))}
        </div>
      )}
    </Pagina>
  );
}
