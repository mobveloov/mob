// Telas a mais do app do motorista: nota para o passageiro, objeto esquecido, problema na corrida, detalhe do
// histórico, carteira e saque, documentos, preferências de corrida, desafios e indicação, notificações e ajuda.

import { Fragment, useCallback, useEffect, useState } from "react";
import { api, reais, telefoneBonito } from "../comum/api";
import { Aviso, Carregando, Cartao, Estrelas, mensagemDeErro, type MarcaApp } from "../comum/ui";
import { diaHora, type Corrida } from "./tipos";

/** Busca na abertura da tela; recarregar() busca de novo. */
function useBuscar<T>(caminho: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState("");
  const recarregar = useCallback(() => api<T>(caminho).then((d) => { setDados(d); setErro(""); }).catch((e) => setErro(mensagemDeErro(e))), [caminho]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

export function Voltar({ voltar, texto = "‹ Voltar" }: { voltar: () => void; texto?: string }) {
  return <button type="button" className="botao-link voltar" onClick={voltar}>{texto}</button>;
}

const dataCurta = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : diaHora(s));

// ====================================================================== depois da corrida

/** Nota de 1 a 5 para o passageiro (uma vez só). */
function FormNota({ corridaId, feita }: { corridaId: string; feita: (a: { nota: number; comentario: string }) => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ avaliacaoPassageiro: { nota: number; comentario: string } }>(`/corridas/${corridaId}/avaliar-passageiro`, { corpo: { nota, comentario } });
      feita(r.avaliacaoPassageiro);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form className="cartao" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <h2>Como foi o passageiro?</h2>
      <Estrelas valor={nota} aoEscolher={setNota} />
      <label>Comentário (opcional)<textarea rows={2} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></label>
      <Aviso texto={erro} />
      <button className="botao" disabled={!nota || ocupado}>Enviar nota</button>
    </form>
  );
}

function FormObjeto({ corridaId, fim }: { corridaId: string; fim: (ok: boolean) => void }) {
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setErro(""); setOcupado(true);
    try { await api(`/corridas/${corridaId}/objeto`, { corpo: { descricao } }); fim(true); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form className="cartao" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <h2>Achei um objeto no carro</h2>
      <p className="dica">A central avisa o passageiro. Guarde o objeto até combinarem a entrega.</p>
      <label>O que é?<input maxLength={200} placeholder="Ex.: guarda-chuva azul" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      <Aviso texto={erro} />
      <div className="linha">
        <button type="button" className="botao secundario" onClick={() => fim(false)}>Voltar</button>
        <button className="botao" disabled={descricao.trim().length < 3 || ocupado}>Avisar a central</button>
      </div>
    </form>
  );
}

const ASSUNTOS = ["Cobrança", "Comportamento", "Atraso", "Rota", "Veículo", "Outro"];
function FormProblema({ corridaId, fim }: { corridaId: string; fim: (ok: boolean) => void }) {
  const [assunto, setAssunto] = useState("Cobrança");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setErro(""); setOcupado(true);
    try { await api(`/corridas/${corridaId}/ocorrencia`, { corpo: { assunto, descricao } }); fim(true); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form className="cartao" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <h2>Reportar um problema</h2>
      <label>Assunto<select value={assunto} onChange={(e) => setAssunto(e.target.value)}>{ASSUNTOS.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>O que aconteceu?<textarea rows={4} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      <Aviso texto={erro} />
      <div className="linha">
        <button type="button" className="botao secundario" onClick={() => fim(false)}>Voltar</button>
        <button className="botao" disabled={descricao.trim().length < 5 || ocupado}>Enviar</button>
      </div>
    </form>
  );
}

function BotaoBloquear({ corridaId }: { corridaId: string }) {
  const [bloqueado, setBloqueado] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const alternar = async () => {
    const ligar = !bloqueado;
    if (ligar && !confirm("Você não vai mais receber corridas deste passageiro. Confirmar?")) return;
    setErro("");
    try { const r = await api<{ bloqueado: boolean }>(`/corridas/${corridaId}/bloquear`, { corpo: { ligar } }); setBloqueado(r.bloqueado); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  return (
    <>
      <button type="button" className="botao secundario" onClick={() => void alternar()}>{bloqueado ? "Voltar a receber este passageiro" : "Não quero mais este passageiro"}</button>
      {bloqueado && <p className="dica">Pronto: você não recebe mais corridas deste passageiro.</p>}
      <Aviso texto={erro} />
    </>
  );
}

/** Tela logo depois de finalizar: nota para o passageiro, bloquear e objeto esquecido. */
export function DepoisDaCorrida({ corrida: c, fim }: { corrida: Corrida; fim: () => void }) {
  const [nota, setNota] = useState(c.avaliacaoPassageiro ?? null);
  const [objeto, setObjeto] = useState(false);
  const [aviso, setAviso] = useState("");
  return (
    <div className="tela">
      <Cartao>
        <div className="status">Corrida finalizada</div>
        <p className="numero-grande" style={{ margin: 0 }}>{reais(c.valor)}</p>
        <p className="dica">{c.pagamento} · OS {c.os} · {c.passageiro.nome}</p>
      </Cartao>
      {nota ? <Aviso texto={`Nota enviada: ${nota.nota} de 5.`} tipo="ok" /> : <FormNota corridaId={c.id} feita={setNota} />}
      <Aviso texto={aviso} tipo="ok" />
      {objeto ? <FormObjeto corridaId={c.id} fim={(ok) => { setObjeto(false); if (ok) setAviso("A central foi avisada do objeto."); }} />
        : <button type="button" className="botao secundario" onClick={() => setObjeto(true)}>Achei um objeto no carro</button>}
      <BotaoBloquear corridaId={c.id} />
      <button type="button" className="botao" onClick={fim}>{nota ? "Continuar" : "Pular"}</button>
    </div>
  );
}

// ====================================================================== histórico

export function DetalheCorrida({ corrida: inicial, voltar }: { corrida: Corrida; voltar: () => void }) {
  const [c, setC] = useState(inicial);
  const [form, setForm] = useState<"" | "objeto" | "problema">("");
  const [aviso, setAviso] = useState("");
  const finalizada = c.status === "finalizada";
  const paradas = c.paradas ?? [];
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <Cartao>
        <div className="status">{c.statusTexto}</div>
        <dl className="dados">
          <dt>OS</dt><dd>{c.os}</dd>
          <dt>Data</dt><dd>{diaHora(c.finalizadaEm ?? c.solicitadaEm)}</dd>
          {c.agendadaPara && <><dt>Agendada</dt><dd>{diaHora(c.agendadaPara)}</dd></>}
          <dt>Passageiro</dt><dd>{c.passageiro.nome}</dd>
          <dt>Embarque</dt><dd>{c.embarque.texto}</dd>
          {paradas.map((p, i) => <Fragment key={i}><dt>Parada {i + 1}</dt><dd>{p.texto}</dd></Fragment>)}
          {c.destino && <><dt>Destino</dt><dd>{c.destino.texto}</dd></>}
          <dt>Categoria</dt><dd>{c.categoria}</dd>
          <dt>Pagamento</dt><dd>{c.pagamento}</dd>
          <dt>Valor</dt><dd>{c.valor != null ? reais(c.valor) : "—"}</dd>
          {c.taxaCancelamento ? <><dt>Taxa</dt><dd>{reais(c.taxaCancelamento)} (cancelamento)</dd></> : null}
          {c.avaliacaoPassageiro && <><dt>Sua nota</dt><dd>{"★".repeat(c.avaliacaoPassageiro.nota)}{c.avaliacaoPassageiro.comentario ? ` · ${c.avaliacaoPassageiro.comentario}` : ""}</dd></>}
        </dl>
      </Cartao>
      {finalizada && !c.avaliacaoPassageiro && <FormNota corridaId={c.id} feita={(a) => setC({ ...c, avaliacaoPassageiro: a })} />}
      <Aviso texto={aviso} tipo="ok" />
      {form === "objeto" ? <FormObjeto corridaId={c.id} fim={(ok) => { setForm(""); if (ok) setAviso("A central foi avisada do objeto."); }} />
        : form === "problema" ? <FormProblema corridaId={c.id} fim={(ok) => { setForm(""); if (ok) setAviso("Recebemos o seu relato. A central vai analisar."); }} />
          : (
            <div className="acoes">
              {finalizada && <button type="button" className="botao secundario" onClick={() => { setAviso(""); setForm("objeto"); }}>Objeto encontrado</button>}
              <button type="button" className="botao secundario" onClick={() => { setAviso(""); setForm("problema"); }}>Reportar problema</button>
            </div>
          )}
      {(finalizada || c.status === "cancelada") && <BotaoBloquear corridaId={c.id} />}
    </div>
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
  if (!d) return <div className="tela"><Voltar voltar={voltar} />{erro ? <Aviso texto={erro} /> : <Carregando />}</div>;
  const pendente = d.saques?.some((s) => s.situacao === "Pendente");
  const v = Number(valor.replace(",", "."));
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Carteira</h1>
      <Cartao>
        <p className="dica">Saldo disponível</p>
        <p className="numero-grande" style={{ margin: 0 }}>{reais(d.saldo)}</p>
      </Cartao>
      <form className="cartao" onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
        <h2>Pedir saque</h2>
        {pendente ? <p className="dica">Você já tem um saque esperando a central. Assim que ele for resolvido, pode pedir outro.</p> : (
          <>
            <label>Valor (mínimo R$ 10,00)<input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
            <label>Chave Pix<input value={pix} maxLength={120} onChange={(e) => setPix(e.target.value)} placeholder="CPF, celular, e-mail ou chave aleatória" /></label>
            <button className="botao" disabled={ocupado || !(v >= 10) || v > d.saldo || pix.trim().length < 5}>Pedir saque</button>
            {v > d.saldo && <p className="dica">O valor é maior que o saldo.</p>}
          </>
        )}
        <Aviso texto={erroSaque} />
        <Aviso texto={ok} tipo="ok" />
      </form>
      {!!d.saques?.length && (
        <>
          <h2>Saques</h2>
          <ul className="lista">
            {d.saques.map((s, i) => (
              <li key={s.id ?? i}>
                <span>{reais(s.valor)}<br /><small className="dica">{diaHora(s.em)} · Pix {s.chavePix}</small>{s.motivo && <><br /><small className="dica">Motivo: {s.motivo}</small></>}</span>
                <span className={`selo ${s.situacao === "Pago" ? "ok" : s.situacao === "Recusado" ? "ruim" : ""}`}>{s.situacao}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>Extrato</h2>
      {!d.extrato.length && <p className="dica">Nenhum lançamento ainda.</p>}
      <ul className="lista">
        {d.extrato.map((l, i) => (
          <li key={l.id ?? i}>
            <span>{l.descricao}<br /><small className="dica">{diaHora(l.em)}</small></span>
            <span className={l.valor >= 0 ? "valor-mais" : "valor-menos"}>{l.valor >= 0 ? "+" : "−"}{reais(Math.abs(l.valor))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Saldo pequeno com atalho para a carteira (tela de ganhos). */
export function SaldoCarteira({ abrir }: { abrir: () => void }) {
  const { dados } = useBuscar<DadosCarteira>("/carteira");
  return (
    <Cartao className="interruptor">
      <div><p className="dica">Saldo da carteira</p><p className="numero-grande" style={{ margin: 0 }}>{dados ? reais(dados.saldo) : "…"}</p></div>
      <button type="button" className="botao secundario" onClick={abrir}>Ver carteira</button>
    </Cartao>
  );
}

// ====================================================================== documentos

interface DadosDocumentos { tipos: Record<string, string>; documentos: Record<string, { situacao: "Enviado" | "Aprovado" | "Recusado"; motivo: string; em: string }> }
const ACEITOS = ["image/jpeg", "image/png", "application/pdf"];
const TEXTO_SITUACAO: Record<string, string> = { Enviado: "Em análise", Aprovado: "Aprovado", Recusado: "Recusado" };

function EnviarDocumento({ tipo, jaTem, enviado }: { tipo: string; jaTem: boolean; enviado: () => void }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const escolher = async (arq: File | undefined) => {
    if (!arq) return;
    setErro("");
    if (!ACEITOS.includes(arq.type)) { setErro("Envie uma foto (JPG ou PNG) ou um PDF."); return; }
    if (arq.size > 5 * 1024 * 1024) { setErro("O arquivo passa de 5 MB. Tire a foto com menos qualidade."); return; }
    setOcupado(true);
    try { await api(`/documentos/${tipo}`, { bruto: arq }); enviado(); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <>
      <label className="botao secundario" style={{ textAlign: "center", color: "var(--texto)", fontSize: "1rem", opacity: ocupado ? 0.5 : 1 }}>
        {ocupado ? "Enviando…" : jaTem ? "Reenviar foto ou PDF" : "Enviar foto ou PDF"}
        <input type="file" accept="image/*,application/pdf" capture="environment" hidden disabled={ocupado} onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <Aviso texto={erro} />
    </>
  );
}

export function Documentos({ voltar }: { voltar: () => void }) {
  const { dados: d, erro, recarregar } = useBuscar<DadosDocumentos>("/documentos");
  if (!d) return <div className="tela"><Voltar voltar={voltar} />{erro ? <Aviso texto={erro} /> : <Carregando />}</div>;
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Documentos</h1>
      <p className="dica">Mande uma foto nítida ou um PDF de cada documento. A central confere e aprova.</p>
      {Object.entries(d.tipos).map(([tipo, rotulo]) => {
        const doc = d.documentos[tipo];
        return (
          <Cartao key={tipo}>
            <div className="interruptor"><h2 style={{ margin: 0 }}>{rotulo}</h2><span className={`selo ${!doc ? "neutro" : doc.situacao === "Aprovado" ? "ok" : doc.situacao === "Recusado" ? "ruim" : ""}`}>{doc ? TEXTO_SITUACAO[doc.situacao] : "Falta enviar"}</span></div>
            {doc && <p className="dica">Enviado em {diaHora(doc.em)}</p>}
            {doc?.situacao === "Recusado" && doc.motivo && <Aviso texto={`Motivo da recusa: ${doc.motivo}`} />}
            {doc?.situacao !== "Aprovado" && <EnviarDocumento tipo={tipo} jaTem={!!doc} enviado={() => void recarregar()} />}
          </Cartao>
        );
      })}
    </div>
  );
}

// ====================================================================== preferências de corrida

export function Preferencias({ voltar }: { voltar: () => void }) {
  const { dados: d, erro } = useBuscar<{ podem: string[]; escolhidas: string[] }>("/preferencias");
  const [marcadas, setMarcadas] = useState<string[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  useEffect(() => { if (d) setMarcadas(d.escolhidas.length ? d.escolhidas.filter((x) => d.podem.includes(x)) : d.podem); }, [d]);
  if (!d || !marcadas) return <div className="tela"><Voltar voltar={voltar} />{erro ? <Aviso texto={erro} /> : <Carregando />}</div>;
  const salvar = async () => {
    setAviso(""); setErroSalvar("");
    const todas = marcadas.length === d.podem.length;
    try { await api("/preferencias", { corpo: { categorias: todas ? [] : marcadas } }); setAviso("Preferências salvas."); } catch (e) { setErroSalvar(mensagemDeErro(e)); }
  };
  const trocar = (c: string) => { setAviso(""); setMarcadas((l) => (l!.includes(c) ? l!.filter((x) => x !== c) : [...l!, c])); };
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Preferências de corrida</h1>
      <p className="dica">Escolha quais tipos de corrida você quer receber.</p>
      {!d.podem.length ? <p className="dica">Nenhuma categoria liberada para você. Fale com a central.</p> : (
        <>
          <div className="escolhas">
            {d.podem.map((c) => <label key={c}><input type="checkbox" checked={marcadas.includes(c)} onChange={() => trocar(c)} />{c}</label>)}
          </div>
          {!marcadas.length && <p className="dica">Marque pelo menos uma.</p>}
          <Aviso texto={erroSalvar} />
          <Aviso texto={aviso} tipo="ok" />
          <button type="button" className="botao" disabled={!marcadas.length} onClick={() => void salvar()}>Salvar</button>
        </>
      )}
    </div>
  );
}

// ====================================================================== desafios e indicações

interface Desafio { id?: string; nome: string; tipo: string; meta: number; feito: number; premio: number | null; fim: string | null; regras: string; ganho: boolean }

export function Desafios({ voltar, marca }: { voltar: () => void; marca: MarcaApp }) {
  const { dados: d, erro } = useBuscar<{ codigo: string; desafios: Desafio[] }>("/desafios");
  const [aviso, setAviso] = useState("");
  if (!d) return <div className="tela"><Voltar voltar={voltar} />{erro ? <Aviso texto={erro} /> : <Carregando />}</div>;
  const compartilhar = async () => {
    const texto = `Use meu código ${d.codigo} no app ${marca.nome}.`;
    try {
      if (navigator.share) { await navigator.share({ title: marca.nome, text: texto }); return; }
      await navigator.clipboard.writeText(texto); setAviso("Código copiado. Cole onde quiser.");
    } catch { /* cancelou */ }
  };
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Desafios e indicações</h1>
      <Cartao>
        <p className="dica">Seu código de indicação</p>
        <div className="codigo">{d.codigo}</div>
        <button type="button" className="botao" onClick={() => void compartilhar()}>Compartilhar código</button>
        <Aviso texto={aviso} tipo="ok" />
      </Cartao>
      {!d.desafios.length && <p className="dica">Nenhum desafio agora. Volte mais tarde.</p>}
      {d.desafios.map((x, i) => {
        const pct = x.meta > 0 ? Math.min(100, Math.round((x.feito / x.meta) * 100)) : 0;
        return (
          <Cartao key={x.id ?? i}>
            <div className="interruptor"><h2 style={{ margin: 0 }}>{x.nome}</h2>{x.ganho && <span className="selo ok">Prêmio ganho</span>}</div>
            <p className="dica">{x.tipo}{x.fim ? ` · até ${dataCurta(x.fim)}` : ""}</p>
            <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={x.meta} aria-valuenow={Math.min(x.feito, x.meta)}><span style={{ width: `${pct}%` }} /></div>
            <p style={{ margin: 0 }}><strong>{Math.min(x.feito, x.meta)} de {x.meta}</strong>{x.premio ? ` · prêmio ${reais(x.premio)}` : ""}</p>
            {x.regras && <p className="dica">{x.regras}</p>}
          </Cartao>
        );
      })}
    </div>
  );
}

// ====================================================================== notificações e ajuda

export function Notificacoes({ voltar }: { voltar: () => void }) {
  const { dados: d, erro } = useBuscar<{ notificacoes: Array<{ id?: string; titulo: string; texto: string; em: string }> }>("/notificacoes");
  if (!d) return <div className="tela"><Voltar voltar={voltar} />{erro ? <Aviso texto={erro} /> : <Carregando />}</div>;
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Notificações</h1>
      {!d.notificacoes.length && <p className="dica">Nenhuma notificação.</p>}
      {d.notificacoes.map((n, i) => (
        <Cartao key={n.id ?? i}>
          <h2 style={{ margin: 0 }}>{n.titulo}</h2>
          {n.em && <p className="dica">{dataCurta(n.em)}</p>}
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.texto}</p>
        </Cartao>
      ))}
    </div>
  );
}

export const temAjuda = (m: MarcaApp) => !!(m.suporte.telefone || m.suporte.email);

export function Ajuda({ voltar, marca }: { voltar: () => void; marca: MarcaApp }) {
  const tel = marca.suporte.telefone.replace(/\D/g, "");
  return (
    <div className="tela">
      <Voltar voltar={voltar} />
      <h1>Ajuda</h1>
      <Cartao>
        <h2>Fale com a central</h2>
        <p className="dica">Dúvidas sobre corridas, pagamentos, documentos ou cadastro.</p>
        {tel && <a className="botao" style={{ textAlign: "center", textDecoration: "none" }} href={`tel:${tel}`}>Ligar: {telefoneBonito(tel)}</a>}
        {tel.length >= 10 && <a className="botao secundario" style={{ textAlign: "center", textDecoration: "none" }} href={`https://wa.me/55${tel.replace(/^55/, "")}`} target="_blank" rel="noreferrer">Mandar mensagem no WhatsApp</a>}
        {marca.suporte.email && <a className="botao secundario" style={{ textAlign: "center", textDecoration: "none" }} href={`mailto:${marca.suporte.email}`}>E-mail: {marca.suporte.email}</a>}
      </Cartao>
      <Cartao>
        <h2>Em uma emergência</h2>
        <p className="dica">Durante a corrida, use o botão SOS. Se for grave, ligue 190.</p>
      </Cartao>
    </div>
  );
}
