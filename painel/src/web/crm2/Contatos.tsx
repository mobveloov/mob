import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Download, Loader2, RefreshCw, Search, Trash2, Upload, Users, X } from "lucide-react";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { useGestor, useAdmin, useRetorno } from "../crm/comum";
import { ESTAGIO_CLASSE, ESTAGIO_ROTULO, EVENTO_ROTULO, RFM_SEGMENTOS } from "../../crm2/catalogo";
import { crm2, dataCurta, dataHora, dinheiroBr, erroTexto, type ContatoCrm } from "./api";
import { decimal } from "../../comum/formato-br.ts";

const ESTAGIOS = ["novo", "ativo", "fiel", "em_risco", "inativo", "perdido"];
const TAMANHO_PAGINA = 25;
const num = (n: number) => n.toLocaleString("pt-BR");

function useAtrasado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

/** CRM › Público › Contatos: base 360° de passageiros (métricas, etapa, tags, linha do tempo) e lista de motoristas. */
export default function Contatos() {
  const [tipo, setTipo] = useState<"passageiros" | "motoristas">("passageiros");
  const [busca, setBusca] = useState("");
  const buscaAtrasada = useAtrasado(busca, 350);
  const [stage, setStage] = useState("all");
  const [tag, setTag] = useState("all");
  const [situacao, setSituacao] = useState("all");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<ContatoCrm | null>(null);
  const [importando, setImportando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const { tentar, caixa, setMsg } = useRetorno();
  const gestor = useGestor();
  const pass = useCarregar(() => (tipo === "passageiros" ? crm2.contatos({ busca: buscaAtrasada, stage: stage === "all" ? undefined : stage, tag: tag === "all" ? undefined : tag, pagina }) : Promise.resolve(null)), [tipo, buscaAtrasada, stage, tag, pagina]);
  const mot = useCarregar(() => (tipo === "motoristas" ? crm2.motoristas({ busca: buscaAtrasada, situacao: situacao === "all" ? undefined : situacao, pagina }) : Promise.resolve(null)), [tipo, buscaAtrasada, situacao, pagina]);
  const primeira = useRef(true);
  // Só a primeira carga mostra "carregando": depois a tela não some mais.
  const dados = tipo === "passageiros" ? pass.dados : mot.dados;
  const erro = tipo === "passageiros" ? pass.erro : mot.erro;
  const carregando = tipo === "passageiros" ? pass.carregando : mot.carregando;
  useEffect(() => { if (dados) primeira.current = false; }, [dados]);
  const total = dados?.total ?? 0;
  const ultimaPagina = Math.max(0, Math.ceil(total / TAMANHO_PAGINA) - 1);
  useEffect(() => { if (!carregando && pagina > ultimaPagina) setPagina(ultimaPagina); }, [carregando, pagina, ultimaPagina]);
  const recarregar = () => { pass.recarregar(); mot.recarregar(); };
  const stats = pass.dados?.stats;

  const atualizar = async () => {
    setAtualizando(true);
    await tentar(() => crm2.sincronizar(), (r) => `${r.contatos} passageiro(s) analisado(s): ${r.novos} novo(s), ${r.atualizados} atualizado(s).`);
    setAtualizando(false);
    recarregar();
  };
  const mudarTipo = (t: "passageiros" | "motoristas") => { if (t === tipo) return; setTipo(t); setPagina(0); setBusca(""); setMsg(null); };

  if (aberto) return <Ficha contato={aberto} onVoltar={() => { setAberto(null); recarregar(); }} />;
  if (!dados && !erro) return <p className="vazio">Carregando...</p>;

  const faltam = stats ? Math.max(0, stats.passageiros_sem_contato) : 0;
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <div className="periodo">
          {(["passageiros", "motoristas"] as const).map((k) => (
            <button key={k} className={tipo === k ? "chip ativo" : "chip"} onClick={() => mudarTipo(k)}>
              {k === "passageiros" ? "Passageiros" : "Motoristas"}
              {stats && <small> {num(k === "passageiros" ? stats.contatos : stats.motoristas)}</small>}
            </button>
          ))}
        </div>
        <div className="acoes">
          {gestor && <button className="botao" onClick={atualizar} disabled={atualizando}><RefreshCw size={14} className={atualizando ? "girar" : ""} /> Atualizar Métricas</button>}
          {tipo === "passageiros" && gestor && <button className="botao" onClick={() => setImportando(true)}><Upload size={14} /> Importar CSV</button>}
        </div>
      </div>
      <p className="sub">{tipo === "passageiros" ? "Base 360° de passageiros com métricas de comportamento" : "Motoristas do cadastro. Para mensagens, use o público \"Motoristas\" nas campanhas."}</p>
      {caixa}
      {erro && <div className="aviso erro"><AlertCircle size={14} /> {erro}</div>}

      {tipo === "passageiros" && stats && faltam > 0 && (
        <div className="aviso">
          {num(stats.passageiros_cadastro)} passageiros no cadastro, {num(stats.contatos)} na base de contatos. {num(faltam)} ainda não foram trazidos.
          {stats.passageiros_telefone_curto > 0 && <> {num(stats.passageiros_telefone_curto)} têm telefone inválido e não recebem mensagem.</>}
          {gestor && <> <button className="botao" onClick={atualizar} disabled={atualizando}>{atualizando ? <Loader2 size={14} className="girar" /> : <Download size={14} />} Trazer para a base</button></>}
        </div>
      )}

      {tipo === "passageiros" && pass.dados && (
        <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
          {ESTAGIOS.map((e) => (
            <button key={e} className={`kpi ${stage === e ? "info" : ""}`} onClick={() => { setStage(stage === e ? "all" : e); setPagina(0); }} aria-pressed={stage === e}>
              <strong>{num(pass.dados!.estagios[e] ?? 0)}</strong><span>{ESTAGIO_ROTULO[e]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="linha-filtro">
        <span style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 13 }} />
          <input style={{ paddingLeft: 30, width: "100%" }} value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Buscar por nome ou telefone..." />
        </span>
        {tipo === "passageiros" && !!pass.dados?.tags.length && (
          <select value={tag} onChange={(e) => { setTag(e.target.value); setPagina(0); }}>
            <option value="all">Todas as tags</option>
            {pass.dados.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {tipo === "motoristas" && (
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(0); }}>
            <option value="all">Todos os status</option>
            {(mot.dados?.situacoes ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="selo">{carregando && <Loader2 size={12} className="girar" />} {num(total)} {tipo === "passageiros" ? "contatos" : "motoristas"}</span>
      </div>

      {!total ? (
        <Cartao><p className="vazio"><Users size={16} /> {tipo === "passageiros" ? "Nenhum contato encontrado. Importe um CSV ou clique em Atualizar Métricas para trazer os passageiros do cadastro e das corridas." : "Nenhum motorista encontrado. Cadastre motoristas em Cadastro › Motoristas."}</p></Cartao>
      ) : (
        <Cartao>
          <div style={{ opacity: carregando ? 0.6 : 1 }}>
            {tipo === "passageiros" ? pass.dados?.contatos.map((c) => <LinhaContato key={c.chave} c={c} aoAbrir={() => setAberto(c)} aoMudar={recarregar} />)
              : mot.dados?.motoristas.map((m) => (
                <div key={m.chave} className="linha-contato">
                  <div className="topo-linha"><strong>{m.nome || "Sem nome"}</strong>{m.situacao && <span className={`selo ${m.situacao === "Ativo" ? "ok" : "alerta"}`}>{m.situacao}</span>}</div>
                  <div className="sub">{m.telefone}{m.cidade && <> · {m.cidade}</>}{m.ultimaCorrida && <> · última corrida: {new Date(m.ultimaCorrida).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</>}</div>
                </div>
              ))}
          </div>
          {total > TAMANHO_PAGINA && (
            <div className="linha-filtro">
              <button className="botao" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>Anterior</button>
              <span className="sub">Página {Math.min(pagina, ultimaPagina) + 1} de {ultimaPagina + 1}</span>
              <button className="botao" onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))} disabled={pagina >= ultimaPagina}>Próxima</button>
            </div>
          )}
        </Cartao>
      )}
      <Gaveta aberta={importando} onFechar={() => setImportando(false)} titulo="Importar Contatos (CSV)">
        {importando && <ImportarCsv onFeito={() => { recarregar(); }} onFechar={() => setImportando(false)} />}
      </Gaveta>
    </div>
  );
}

function LinhaContato({ c, aoAbrir, aoMudar }: { c: ContatoCrm; aoAbrir: () => void; aoMudar: () => void }) {
  const admin = useAdmin();
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  const rfm = c.rfm_segmento ? RFM_SEGMENTOS[c.rfm_segmento] : null;
  const saiu = c.opt_in_status === "out";
  return (
    <div className="linha-contato" onClick={aoAbrir} style={{ cursor: "pointer" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="topo-linha">
          <strong>{c.nome || "Sem nome"}</strong>
          <span className={`selo ${ESTAGIO_CLASSE[c.stage]}`}>{ESTAGIO_ROTULO[c.stage]}</span>
          {saiu && <span className="selo ruim">Opt-out</span>}
          {rfm && <span className="selo" style={{ background: rfm.color, color: "#111" }}>{rfm.label}</span>}
          {c.tags.slice(0, 2).map((t) => <span key={t} className="selo">{t}</span>)}
        </div>
        <div className="sub">
          {c.telefone}{c.cidade && <> · {c.cidade}</>} · {c.total_corridas} corridas
          {c.ticket_medio > 0 && <> · {dinheiroBr(c.ticket_medio)}</>}
          {c.cancelamentos > 0 && <> · {c.cancelamentos} cancel.</>}
          {c.ultima_corrida && <> · última: {dataCurta(c.ultima_corrida)}</>}
        </div>
        {caixa}
      </div>
      {gestor && (
        <div className="acoes" onClick={(e) => e.stopPropagation()}>
          <button className="botao" title={saiu ? "Reativar" : "Marcar opt-out"} onClick={() => tentar(() => crm2.optout(c.chave, !saiu)).then(aoMudar)}>{saiu ? "Reativar" : "Opt-out"}</button>
          {admin && <button className="icone" title="Excluir" aria-label={`Excluir ${c.nome}`} onClick={() => confirm("Excluir este contato e todos os seus eventos?") && tentar(() => crm2.excluirContato(c.chave)).then(aoMudar)}><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
  );
}

function Ficha({ contato, onVoltar }: { contato: ContatoCrm; onVoltar: () => void }) {
  const { dados, erro } = useCarregar(() => crm2.contato(contato.chave), [contato.chave]);
  const c = dados?.contato ?? contato;
  const [novaTag, setNovaTag] = useState("");
  const [tags, setTags] = useState<string[]>(contato.tags);
  const { tentar, caixa } = useRetorno();
  const gestor = useGestor();
  const admin = useAdmin();
  useEffect(() => { if (dados) setTags(dados.contato.tags); }, [dados]);
  const salvarTags = async (n: string[]) => { const r = await tentar(() => crm2.tags(c.chave, n)); if (r) setTags(r.tags); return !!r; };
  const rfm = c.rfm_segmento ? RFM_SEGMENTOS[c.rfm_segmento] : null;
  const msgs = dados?.mensagens7dias;

  const exportar = async () => {
    const r = await tentar(() => crm2.exportarContato(c.chave));
    if (!r) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `contato-${c.telefone}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const mudarOptOut = async () => { if (await tentar(() => crm2.optout(c.chave, true))) onVoltar(); };
  const excluir = async () => { if (confirm("Excluir todos os dados deste contato? Esta ação é irreversível.") && (await tentar(() => crm2.excluirContato(c.chave)))) onVoltar(); };
  const Caixa = ({ rotulo, valor, tom }: { rotulo: string; valor: string | number; tom?: string }) => <div className={`kpi ${tom ?? ""}`}><span>{rotulo}</span><strong>{valor}</strong></div>;

  return (
    <div className="pilha">
      <button className="botao" onClick={onVoltar}><ArrowLeft size={14} /> Voltar para contatos</button>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      <Cartao>
        <div className="linha-filtro">
          <div>
            <h2 style={{ margin: 0 }}>{c.nome || "Sem nome"} <span className={`selo ${ESTAGIO_CLASSE[c.stage]}`}>{ESTAGIO_ROTULO[c.stage]}</span></h2>
            <p className="sub">{c.telefone}</p>
            <p className="sub">Origem: {c.origem} · Cadastrado em {dataCurta(c.criado_em)}{c.cidade ? ` · ${c.cidade}` : ""}</p>
            {rfm && <p className="sub">RFM: {rfm.label}{c.rfm_r ? ` (R${c.rfm_r} F${c.rfm_f} M${c.rfm_m})` : ""}</p>}
          </div>
          {gestor && c.opt_in_status !== "out" && <button className="botao" title="Opt-out geral: bloqueia o WhatsApp do CRM" onClick={mudarOptOut}>Opt-out geral</button>}
        </div>
        <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginTop: 12 }}>
          <Caixa rotulo="Total Corridas" valor={c.total_corridas} />
          <Caixa rotulo="Total Gasto" valor={dinheiroBr(c.total_gasto)} />
          <Caixa rotulo="Ticket Médio" valor={dinheiroBr(c.ticket_medio)} />
          <Caixa rotulo="Cancelamentos" valor={c.cancelamentos} />
          <Caixa rotulo="Simulações s/ conversão" valor={c.simulacoes_sem_conversao} />
          <Caixa rotulo="Nota Média" valor={c.nota_media > 0 ? decimal(c.nota_media, 1) : "-"} />
          <Caixa rotulo="Categoria Favorita" valor={c.categoria_favorita || "-"} />
          <Caixa rotulo="NPS" valor={c.nps ?? "-"} />
          <Caixa rotulo="Msgs (7 dias)" valor={msgs ?? "..."} tom={msgs != null && msgs > 3 ? "alerta" : ""} />
        </div>
        <h3 className="sub" style={{ marginTop: 14 }}>Canais</h3>
        <div className="linha-filtro">
          <span>WhatsApp</span>
          <span className={`selo ${c.opt_in_status === "out" ? "ruim" : "ok"}`}>{c.opt_in_status === "out" ? "Bloqueado (opt-out)" : c.opt_in_status === "in" ? "Recebe (opt-in confirmado)" : "Recebe"}</span>
        </div>
        <h3 className="sub" style={{ marginTop: 14 }}>Tags</h3>
        <div className="periodo">
          {tags.map((t) => (
            <span key={t} className="chip">{t}{gestor && <button className="icone" aria-label={`Tirar a tag ${t}`} onClick={() => salvarTags(tags.filter((x) => x !== t))}><X size={12} /></button>}</span>
          ))}
          {gestor && <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Adicionar tag..." style={{ width: 150 }}
            onKeyDown={async (e) => { if (e.key !== "Enter") return; const t = novaTag.trim(); if (!t) return; if (tags.includes(t) || (await salvarTags([...tags, t]))) setNovaTag(""); }} />}
        </div>
      </Cartao>
      <Cartao titulo="Linha do Tempo">
        {!dados ? <p className="vazio">Carregando...</p> : !dados.eventos.length ? <p className="vazio">Nenhum evento registrado ainda.</p> : (
          <ul className="lista" style={{ maxHeight: 400, overflowY: "auto" }}>
            {dados.eventos.map((ev) => (
              <li key={ev.id}><Clock size={14} /> <strong>{EVENTO_ROTULO[ev.tipo] ?? ev.tipo}</strong><br /><small className="sub">{dataHora(ev.quando)}</small></li>
            ))}
          </ul>
        )}
      </Cartao>
      <Cartao titulo="LGPD — Privacidade de Dados">
        <div className="acoes">
          <button className="botao" onClick={exportar}><Download size={14} /> Exportar Dados</button>
          {admin && <button className="botao" onClick={excluir}><Trash2 size={14} /> Excluir Dados</button>}
        </div>
      </Cartao>
    </div>
  );
}

function ImportarCsv({ onFeito, onFechar }: { onFeito: () => void; onFechar: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [r, setR] = useState<{ importados: number; mantidos: number; erros: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const importar = async () => {
    setEnviando(true); setR(null); setErro("");
    try { const x = await crm2.importar(texto); setR(x); if (x.importados > 0) onFeito(); } catch (e) { setErro(erroTexto(e)); }
    setEnviando(false);
  };
  return (
    <div className="pilha">
      <p className="sub">Cole o conteúdo CSV. A primeira linha deve ter os cabeçalhos: phone (ou telefone) e name (ou nome). Telefone com DDD (o 55 é colocado sozinho).</p>
      <textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"phone,name\n11999999999,João Silva"} style={{ width: "100%", fontFamily: "monospace" }} />
      {erro && <div className="aviso erro">{erro}</div>}
      {r && (
        <div className="pilha">
          <div className="aviso ok"><CheckCircle2 size={14} /> {r.importados} contato(s) importado(s)</div>
          {!!r.mantidos && <p className="sub">{r.mantidos} contato(s) já existiam com nome e ficaram como estavam.</p>}
          {r.erros.length > 0 && <div className="aviso erro" style={{ maxHeight: 130, overflowY: "auto" }}>{r.erros.map((e, i) => <p key={i}>{e}</p>)}</div>}
        </div>
      )}
      <div className="acoes">
        <button className="botao primario" onClick={importar} disabled={enviando || !texto.trim()}>{enviando ? <Loader2 size={14} className="girar" /> : <Upload size={14} />} Importar</button>
        <button className="botao" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  );
}
