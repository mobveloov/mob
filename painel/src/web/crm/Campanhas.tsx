import { useRef, useState } from "react";
import { BarChart3, CalendarClock, Copy, Eye, Pause, Play, Plus, Save, Send, Sparkles, Trash2, X } from "lucide-react";
import { Cartao, Gaveta, Kpi, Titulo, useCarregar } from "../componentes/ui";
import { crm, quando, quandoReal, type Campanha, type CampanhaLinha } from "./api";
import { EditorRegras, Selo, useAdmin, useRetorno, Variaveis } from "./comum";
import Envio from "./Envio";

const NOVA: Partial<Campanha> = { nome: "", texto: "Oi {primeiro_nome}! Sentimos sua falta. Use o cupom {cupom} na sua próxima corrida com a {empresa}.", variacoes: [], cupom: "", publico: { tipo: "passageiro", inativoMinDias: 15 }, agendadaPara: null };

/** CRM › Campanhas: mensagem com variáveis e cupom, público por regras, envio em lotes e relatório. */
export default function CrmCampanhas() {
  const { dados, erro, recarregar } = useCarregar(() => crm.campanhas(), [], 10_000);
  const [editando, setEditando] = useState<Partial<Campanha> | null>(null);
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [aba, setAba] = useState<"campanhas" | "envio">("campanhas");
  const { tentar, caixa } = useRetorno();
  const admin = useAdmin();

  const acao = (c: CampanhaLinha, a: "pausar" | "retomar" | "cancelar" | "duplicar", ok: string) => tentar(() => crm.acao(c.id, a), ok).then(recarregar);
  const disparar = async (c: CampanhaLinha) => {
    const n = await crm.contar(c.publico).catch(() => null);
    if (!confirm(`Enviar "${c.nome}" agora para ${n?.destinatarios ?? "?"} pessoas? As mensagens saem em lotes, com pausa entre eles.`)) return;
    await tentar(() => crm.disparar(c.id), (r) => `${r.naFila ?? 0} mensagens na fila de envio.`);
    recarregar();
  };

  return (
    <>
      <Titulo titulo="Campanhas" sub="Mensagens de WhatsApp para um segmento do seu público, com cupom e envio em lotes.">
        <div className="abas">
          <button className={aba === "campanhas" ? "ativo" : ""} onClick={() => setAba("campanhas")}>Campanhas</button>
          <button className={aba === "envio" ? "ativo" : ""} onClick={() => setAba("envio")}>Envio e WhatsApp</button>
        </div>
        {aba === "campanhas" && <button className="botao primario" onClick={() => setEditando({ ...NOVA })}><Plus size={14} /> Nova campanha</button>}
      </Titulo>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {aba === "envio" ? <Envio /> : (
        <Cartao>
          {!dados ? <p className="vazio">Carregando...</p> : !dados.campanhas.length ? <p className="vazio">Nenhuma campanha ainda. Clique em "Nova campanha".</p> : (
            <div className="tabela-rola"><table>
              <thead><tr><th>Campanha</th><th>Situação</th><th>Público</th><th className="num">Destinatários</th><th className="num">Enviadas</th><th className="num">Na fila</th><th className="num">Falhas</th><th>Quando</th><th></th></tr></thead>
              <tbody>{dados.campanhas.map((c) => (
                <tr key={c.id}>
                  <td className="forte">{c.nome}{c.cupom && <><br /><small>Cupom {c.cupom}</small></>}</td>
                  <td><Selo estado={c.estado} /></td>
                  <td><small>{c.publico.tipo === "motorista" ? "Motoristas" : "Passageiros"}{c.publico.cidades?.length ? ` · ${c.publico.cidades.join(", ")}` : ""}{c.publico.inativoMinDias != null ? ` · ${c.publico.inativoMinDias}+ dias sem corrida` : ""}</small></td>
                  <td className="num">{c.destinatarios || "—"}</td><td className="num">{c.enviados}</td><td className="num">{c.pendentes}</td><td className="num">{c.falhas}</td>
                  <td><small>{c.estado === "agendada" ? `Agendada ${quando(c.agendadaPara)}` : c.disparadaEm ? `Disparada ${quando(c.disparadaEm)}` : `Criada ${quandoReal(c.criadaEm)}`}</small></td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(c.estado === "rascunho" || c.estado === "agendada") && <button className="botao" onClick={() => setEditando(c)}>Editar</button>}
                      {admin && c.estado === "rascunho" && <button className="botao primario" onClick={() => disparar(c)}><Send size={14} /> Enviar</button>}
                      {admin && c.estado === "enviando" && <button className="botao" onClick={() => acao(c, "pausar", "Campanha pausada.")}><Pause size={14} /> Pausar</button>}
                      {admin && c.estado === "pausada" && <button className="botao" onClick={() => acao(c, "retomar", "Campanha retomada.")}><Play size={14} /> Retomar</button>}
                      {admin && ["agendada", "enviando", "pausada"].includes(c.estado) && <button className="botao" onClick={() => confirm("Cancelar? As mensagens que ainda estão na fila não saem.") && acao(c, "cancelar", "Campanha cancelada.")}><X size={14} /> Cancelar</button>}
                      {c.disparadaEm && <button className="botao" onClick={() => setRelatorio(c.id)}><BarChart3 size={14} /> Relatório</button>}
                      <button className="icone" title="Duplicar" aria-label="Duplicar" onClick={() => acao(c, "duplicar", "Cópia criada como rascunho.")}><Copy size={14} /></button>
                      {!["enviando", "pausada"].includes(c.estado) && <button className="icone" title="Apagar" aria-label="Apagar" onClick={() => confirm(`Apagar "${c.nome}"?`) && tentar(() => crm.apagarCampanha(c.id), "Campanha apagada.").then(recarregar)}><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Cartao>
      )}
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando?.id ? "Editar campanha" : "Nova campanha"} larga>
        {editando && <Editor inicial={editando} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
      <Gaveta aberta={!!relatorio} onFechar={() => setRelatorio(null)} titulo="Relatório da campanha" larga>
        {relatorio && <RelatorioCampanha id={relatorio} />}
      </Gaveta>
    </>
  );
}

/** "2026-11-08T14:30:00.000Z" (Brasília nos campos UTC) <-> valor do campo datetime-local. */
const paraCampo = (s: string | null | undefined) => (s ? s.slice(0, 16) : "");

function Editor({ inicial, onSalvo }: { inicial: Partial<Campanha>; onSalvo: () => void }) {
  const [c, setC] = useState<Partial<Campanha>>(inicial);
  const [previas, setPrevias] = useState<Array<{ nome: string; texto: string }> | null>(null);
  const [gerando, setGerando] = useState(false);
  const [telefone, setTelefone] = useState("");
  const cupons = useCarregar(() => crm.cupons(), []);
  const listas = useCarregar(() => crm.listas(), []);
  const { tentar, caixa } = useRetorno();
  const admin = useAdmin();
  const campo = useRef<HTMLTextAreaElement>(null);
  const mudar = (p: Partial<Campanha>) => { setC({ ...c, ...p }); setPrevias(null); };
  const inserir = (v: string) => {
    const el = campo.current, t = c.texto ?? "";
    const i = el?.selectionStart ?? t.length, f = el?.selectionEnd ?? t.length;
    mudar({ texto: t.slice(0, i) + v + t.slice(f) });
    setTimeout(() => { el?.focus(); el?.setSelectionRange(i + v.length, i + v.length); }, 0);
  };
  const corpo = () => ({ nome: c.nome, texto: c.texto, variacoes: c.variacoes, cupom: c.cupom, publico: c.publico, agendadaPara: c.agendadaPara || null });
  const salvar = async (agendar = false) => {
    const r = c.id ? await tentar(() => crm.salvarCampanha(c.id!, corpo())) : await tentar(() => crm.novaCampanha(corpo()));
    if (!r) return;
    if (agendar && admin) { const a = await tentar(() => crm.disparar(r.campanha.id, true)); if (!a) { setC(r.campanha); return; } }
    onSalvo();
  };
  const gerar = async () => {
    setGerando(true);
    const r = await tentar(() => crm.variacoes(c.texto ?? "", 3), (x) => x.variacoes.length ? `${x.variacoes.length} variações criadas. Revise antes de salvar.` : "A IA não trouxe variações que mantêm as variáveis. Tente de novo.");
    setGerando(false);
    if (r) mudar({ variacoes: [...(c.variacoes ?? []), ...r.variacoes].slice(0, 5) });
  };
  const cupomEscolhido = cupons.dados?.cupons.find((x) => x.codigo === c.cupom);

  return (
    <div className="form">
      {caixa}
      <label>Nome da campanha<input value={c.nome ?? ""} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Volta com 10% — novembro" /></label>
      <h3 className="sub">Quem recebe</h3>
      <EditorRegras regras={c.publico ?? { tipo: "passageiro" }} onChange={(publico) => mudar({ publico })} listas={listas.dados?.listas} />
      <h3 className="sub">Mensagem</h3>
      <label>Texto<textarea ref={campo} rows={5} value={c.texto ?? ""} onChange={(e) => mudar({ texto: e.target.value })} /><small>Clique para inserir uma variável:</small></label>
      <Variaveis onInserir={inserir} />
      <div>
        <button type="button" className="botao" disabled={gerando || (c.texto ?? "").length < 10} onClick={gerar}><Sparkles size={14} /> {gerando ? "Gerando..." : "Criar variações com IA"}</button>
        <small className="sub"> Cada pessoa recebe uma das versões (menos risco de bloqueio). Sem chave de IA, escreva as variações à mão.</small>
      </div>
      {(c.variacoes ?? []).map((v, i) => (
        <label key={i}>Variação {i + 1}
          <span style={{ display: "flex", gap: 6 }}>
            <textarea rows={3} style={{ flex: 1 }} value={v} onChange={(e) => mudar({ variacoes: (c.variacoes ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
            <button type="button" className="icone" aria-label="Tirar variação" onClick={() => mudar({ variacoes: (c.variacoes ?? []).filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </span>
        </label>
      ))}
      {(c.variacoes ?? []).length < 5 && <button type="button" className="botao" onClick={() => mudar({ variacoes: [...(c.variacoes ?? []), c.texto ?? ""] })}><Plus size={14} /> Variação escrita à mão</button>}
      <label>Cupom (do cadastro de cupons)
        <select value={c.cupom ?? ""} onChange={(e) => mudar({ cupom: e.target.value })}>
          <option value="">Sem cupom</option>
          {cupons.dados?.cupons.map((x) => <option key={x.codigo} value={x.codigo} disabled={!x.valido}>{x.codigo}{x.descricao ? ` — ${x.descricao}` : ""}{x.valido ? "" : " (desligado ou fora do prazo)"}</option>)}
        </select>
        <small>{cupons.dados && !cupons.dados.cupons.length ? "Nenhum cupom cadastrado. Crie em Financeiro › Cupons e descontos." : cupomEscolhido?.fim ? `Vale até ${cupomEscolhido.fim.split("-").reverse().join("/")}.` : "Sem {cupom} no texto, o código vai no fim da mensagem."}</small>
      </label>
      <label>Agendar para (horário de Brasília, opcional)<input type="datetime-local" value={paraCampo(c.agendadaPara)} onChange={(e) => mudar({ agendadaPara: e.target.value ? `${e.target.value}:00.000Z` : null })} /></label>
      <div className="acoes">
        <button type="button" className="botao" onClick={() => tentar(() => crm.previa(corpo())).then((r) => r && setPrevias(r.previas))}><Eye size={14} /> Ver prévia</button>
        <button type="button" className="botao primario" onClick={() => salvar(false)}><Save size={14} /> Salvar rascunho</button>
        {admin && c.agendadaPara && <button type="button" className="botao primario" onClick={() => salvar(true)}><CalendarClock size={14} /> Salvar e agendar</button>}
      </div>
      {previas && (
        <div>{previas.map((p, i) => <div key={i} className="cartao" style={{ whiteSpace: "pre-wrap" }}><small className="sub">Para {p.nome}</small><br />{p.texto}</div>)}</div>
      )}
      {admin && (
        <>
          <h3 className="sub">Testar no seu WhatsApp</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input placeholder="DDD + número" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <button type="button" className="botao" onClick={() => tentar(() => crm.teste({ telefone, texto: c.texto ?? "", cupom: c.cupom }), "Mensagem de teste enviada.")}><Send size={14} /> Enviar teste</button>
          </div>
        </>
      )}
    </div>
  );
}

function RelatorioCampanha({ id }: { id: string }) {
  const { dados, erro } = useCarregar(() => crm.relatorio(id), [id], 10_000);
  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!dados) return <p className="vazio">Carregando...</p>;
  const c = dados.campanha;
  return (
    <div className="detalhe">
      <p><strong>{c.nome}</strong> <Selo estado={c.estado} /></p>
      <div className="kpis">
        <Kpi rotulo="Destinatários" valor={dados.total} />
        <Kpi rotulo="Enviadas" valor={dados.enviados} detalhe={`${dados.taxaEntrega}% do total`} tom="ok" />
        <Kpi rotulo="Na fila" valor={dados.pendentes} tom="info" />
        <Kpi rotulo="Falhas" valor={dados.falhas} tom={dados.falhas ? "ruim" : undefined} />
      </div>
      <div className="dado"><span>Disparada em</span><strong>{quando(c.disparadaEm)}</strong></div>
      <div className="dado"><span>Primeiro envio</span><strong>{quandoReal(dados.primeiroEnvio)}</strong></div>
      <div className="dado"><span>Último envio</span><strong>{quandoReal(dados.ultimoEnvio)}</strong></div>
      {c.cupom && <div className="dado"><span>Cupom</span><strong>{c.cupom}</strong></div>}
      <div className="dado"><span>Canceladas</span><strong>{dados.cancelados}</strong></div>
      {dados.erros.length > 0 && <><h3>Motivos das falhas</h3>{dados.erros.map((e) => <div key={e.erro} className="dado"><span>{e.erro}</span><strong>{e.total}</strong></div>)}</>}
      <h3>Mensagens</h3>
      <div className="tabela-rola"><table>
        <thead><tr><th>Pessoa</th><th>Telefone</th><th>Situação</th><th>Enviada</th><th>Obs.</th></tr></thead>
        <tbody>{dados.itens.map((i) => <tr key={i.id}><td>{i.nome || "—"}</td><td>{i.telefone}</td><td><Selo estado={i.estado} /></td><td>{quandoReal(i.enviadoEm)}</td><td><small>{i.erro}{i.tentativas > 1 ? ` (${i.tentativas} tentativas)` : ""}</small></td></tr>)}</tbody>
      </table></div>
      <p className="sub">"Enviada" quer dizer que o WhatsApp aceitou a mensagem. Leitura e uso do cupom aparecem em Estatísticas quando a corrida usa o código.</p>
    </div>
  );
}
