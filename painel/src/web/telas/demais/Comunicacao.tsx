// Comunicação: Conversas (caixa de entrada da central) e Notificações Push (disparo imediato e agendamento).

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, MessageSquare, Radio, Search, Send } from "lucide-react";
import { CriarNotificacao } from "./CriarNotificacao";
import { Abas, Aviso, Cab, Campo, Carregando, Modal, dataHoraBr, pedirConfig, useCarregar, useSalvar } from "./comum";

// ------------------------------------------------------------------ Conversas

const diaCurto = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");
const ABAS_CHAT: Array<[string, string]> = [["motorista", "Motoristas"], ["empresa", "Empresas"], ["passageiro", "Passageiros"]];

/** Chat (Machine): abas Motoristas e Empresas, Criar conversa, Mensagem Geral e as conversas com "Central: ...". Passageiros é nosso. */
export function Conversas() {
  const [somLigado, setSom] = useState(() => { try { return localStorage.getItem("conversas-som") !== "0"; } catch { return true; } });
  const [menu, setMenu] = useState(false);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState("motorista");
  const [sel, setSel] = useState<{ papel: string; chave: string; nome?: string } | null>(null);
  const [transmissao, setTransmissao] = useState(false);
  const [criar, setCriar] = useState(false);
  // "x" da conversa: some da lista até chegar mensagem nova (só neste navegador).
  const [fechadas, setFechadas] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem("conversas-fechadas") ?? "{}"); } catch { return {}; } });
  const fechar = (c: any) => { const n = { ...fechadas, [`${c.papel}|${c.chave}`]: c.ultima }; setFechadas(n); try { localStorage.setItem("conversas-fechadas", JSON.stringify(n)); } catch { /* sem armazenamento */ } };
  const lista = useCarregar(() => pedirConfig("/conversas"), [], 8000);
  const ultimoTotal = useRef<number | null>(null);
  const todas: any[] = lista.dados?.conversas ?? [];
  const naoLidas = todas.reduce((s, c) => s + c.naoLidas, 0);
  useEffect(() => {
    if (ultimoTotal.current !== null && naoLidas > ultimoTotal.current && somLigado) { try { const a = new AudioContext(), o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12); } catch { /* sem áudio */ } }
    ultimoTotal.current = naoLidas;
  }, [naoLidas, somLigado]);
  const q = busca.trim().toLowerCase();
  const filtradas = todas.filter((c) => c.papel === aba && fechadas[`${c.papel}|${c.chave}`] !== c.ultima && (!q || `${c.nome} ${c.chave}`.toLowerCase().includes(q)));
  const lerTodas = async () => { await pedirConfig("/conversas/lidas", "POST", {}); lista.recarregar(); };
  const atual = todas.find((c) => c.papel === sel?.papel && c.chave === sel?.chave);
  return (
    <div className="dm-conversas">
      <aside className={`dm-esquerda ${sel ? "oculta-movel" : ""}`}>
        <div className="dm-esq-topo">
          <div className="dm-pilulas" role="tablist">{ABAS_CHAT.map(([k, n]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? "ativo" : ""} onClick={() => setAba(k)}>{n}</button>)}</div>
          <div className="dm-linha dm-entre"><h2>Conversas</h2>
            <span className="dm-linha">
              <button className="botao primario" onClick={() => setCriar(true)} disabled={aba === "empresa"}>Criar conversa</button>
              <div className="dm-dropdown"><button className="icone" aria-label="Configurações do chat" onClick={() => setMenu(!menu)}>⋮</button>
                {menu && <div className="dm-dropdown-menu direita">
                  <button onClick={() => { const n = !somLigado; setSom(n); try { localStorage.setItem("conversas-som", n ? "1" : "0"); } catch { /* sem armazenamento */ } }}>{somLigado ? <Bell size={14} /> : <BellOff size={14} />} {somLigado ? "Sons Ativados" : "Sons Desativados"}</button>
                  <button onClick={() => { setMenu(false); void lerTodas(); }}>Marcar todas como lidas</button>
                </div>}
              </div>
            </span>
          </div>
          <label className="dm-busca"><Search size={16} /><input placeholder={aba === "empresa" ? "Buscar empresa" : aba === "passageiro" ? "Buscar passageiro" : "Buscar motorista"} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conversa" /></label>
        </div>
        <div className="dm-esq-lista">
          {aba !== "empresa" && <button className="dm-item" onClick={() => setTransmissao(true)}><span className="dm-item-nome"><strong><Radio size={14} /> Mensagem Geral</strong></span></button>}
          {lista.carregando && !lista.dados ? <Carregando /> : !filtradas.length ? <p className="vazio">{aba === "empresa" ? "Nenhuma conversa com empresas." : "Nenhuma conversa."}</p> : filtradas.map((c) => (
            <div key={`${c.papel}${c.chave}`} className="dm-linha" style={{ alignItems: "stretch" }}>
              <button className={`dm-item ${sel?.chave === c.chave && sel?.papel === c.papel ? "ativo" : ""}`} onClick={() => setSel({ papel: c.papel, chave: c.chave })}>
                <span className="dm-item-nome"><strong>{c.nome}</strong><small>{c.ultimaDe === "central" ? "Central: " : ""}{c.ultimaTexto}</small></span>
                <span className="dm-dir"><small>{diaCurto(c.ultima)}</small>{c.naoLidas > 0 && <b className="dm-contador">{c.naoLidas}</b>}</span>
              </button>
              <button className="icone" aria-label={`Fechar conversa com ${c.nome}`} onClick={() => fechar(c)}>×</button>
            </div>
          ))}
        </div>
      </aside>
      <section className="dm-direita">
        {sel ? <Chat key={`${sel.papel}${sel.chave}`} papel={sel.papel} chave={sel.chave} nome={atual?.nome ?? sel.nome ?? sel.chave} onFechar={() => setSel(null)} onMudou={lista.recarregar} /> : (
          <div className="dm-vazio-grande"><div className="dm-circulo"><MessageSquare size={44} /></div><h3>{aba === "empresa" ? "Envie mensagens para as empresas" : aba === "passageiro" ? "Envie mensagens para os passageiros" : "Envie mensagens para os motoristas"}</h3><p>Sua caixa de entrada está pronta.</p><small className="dm-chat-status">--</small></div>
        )}
      </section>
      <Transmissao aberto={transmissao} onFechar={() => setTransmissao(false)} />
      <CriarConversa aberto={criar} papel={aba} onFechar={() => setCriar(false)} onEscolher={(p) => { setCriar(false); setSel(p); }} />
    </div>
  );
}

function CriarConversa({ aberto, papel, onFechar, onEscolher }: { aberto: boolean; papel: string; onFechar: () => void; onEscolher: (p: { papel: string; chave: string; nome: string }) => void }) {
  const [busca, setBusca] = useState("");
  const pessoas = useCarregar(() => (aberto ? pedirConfig(`/notificacoes/pessoas?papel=${papel}&busca=${encodeURIComponent(busca)}`) : Promise.resolve({ pessoas: [] })), [aberto, papel, busca]);
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Criar conversa" sub={papel === "motorista" ? "Escolha o motorista." : "Escolha o passageiro."}>
      <Campo rotulo="Buscar"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, e-mail ou telefone" aria-label="Buscar pessoa" /></Campo>
      <ul className="dm-transacoes">
        {(pessoas.dados?.pessoas ?? []).slice(0, 30).map((p: any) => <li key={p.chave}><button className="dm-item" onClick={() => onEscolher({ papel, chave: p.chave, nome: p.nome })}><span className="dm-item-nome"><strong>{p.nome}</strong><small>{p.telefone}</small></span></button></li>)}
        {pessoas.dados && !pessoas.dados.pessoas.length && <li className="vazio">Ninguém encontrado.</li>}
      </ul>
    </Modal>
  );
}

function Chat({ papel, chave, nome, onFechar, onMudou }: { papel: string; chave: string; nome: string; onFechar: () => void; onMudou: () => void }) {
  const m = useCarregar(() => pedirConfig(`/conversas/${papel}/${encodeURIComponent(chave)}`), [papel, chave], 5000);
  const [texto, setTexto] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  const fim = useRef<HTMLDivElement>(null);
  const lista: any[] = m.dados?.mensagens ?? [];
  useEffect(() => { fim.current?.scrollIntoView?.({ block: "end" }); }, [lista.length]);
  const enviar = async () => {
    if (!texto.trim()) return;
    const r = await salvar(() => pedirConfig(`/conversas/${papel}/${encodeURIComponent(chave)}`, "POST", { texto }), "Enviada.");
    if (r) { setTexto(""); m.recarregar(); onMudou(); }
  };
  return (
    <div className="dm-chat">
      <div className="dm-chat-topo"><button className="botao dm-voltar" onClick={onFechar}>←</button><div><h2>{nome}</h2></div></div>
      <div className="dm-chat-msgs" aria-live="polite">
        {!m.dados ? <Carregando /> : !lista.length ? <p className="vazio">Sua caixa de entrada está pronta.</p> : lista.map((x) => <div key={x.id} className={`dm-bolha ${x.de === "central" ? "minha" : ""}`}><small><b>{x.de === "central" ? "Central" : nome}</b></small><p>{x.texto}</p><small>{x.em.slice(11, 16)} {x.em.slice(8, 10)}/{x.em.slice(5, 7)}/{x.em.slice(0, 4)}</small></div>)}
        <div ref={fim} />
      </div>
      <Aviso erro={msg?.erro} />
      <form className="dm-chat-envio" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem" rows={1} maxLength={1000} aria-label="Mensagem" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
        <button className="botao primario" disabled={salvando || !texto.trim()} aria-label="Enviar"><Send size={16} /></button>
      </form>
    </div>
  );
}

function Transmissao({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [papel, setPapel] = useState("passageiro"), [texto, setTexto] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Transmissão Geral" sub="Manda um aviso para todos os motoristas ou todos os passageiros.">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig("/conversas/transmissao", "POST", { papel, texto, titulo: "Aviso da central" }), "Aviso enviado."); if (r) { setTexto(""); } }}>
        <Campo rotulo="Quem vai receber?"><select value={papel} onChange={(e) => setPapel(e.target.value)}><option value="passageiro">Passageiros</option><option value="motorista">Motoristas</option></select></Campo>
        <Campo rotulo="Mensagem"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={240} required /></Campo>
        <Aviso erro={msg?.erro} ok={msg?.ok} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando || !texto.trim()}>Enviar</button></div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Notificações Push

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const SEG: Array<[string, string]> = [["todos", "Todos"], ["com_corridas", "Com Corridas"], ["sem_corridas", "Sem Corridas"], ["individual", "Individual"]];

const DEST: Array<[string, string]> = [["", "Todos"], ["passageiro", "Clientes App"], ["motorista", "Motoristas"]];
const VAZIO_N = { destinatario: "", dataIni: "", dataFim: "", titulo: "", mensagem: "" };
const diaBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Notificações app (Machine): lista com filtros e "Nova notificação" (disparo imediato ou agendado). */
export function Notificacoes() {
  const [criando, setCriando] = useState(false);
  const [aba, setAba] = useState<"imediato" | "agendamento">("imediato");
  const [rasc, setRasc] = useState(VAZIO_N);
  const [f, setF] = useState(VAZIO_N);
  const [pagina, setPagina] = useState(1);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), pagina: String(pagina) }).toString();
  const lista = useCarregar(() => pedirConfig(`/notificacoes/lista?${qs}`), [qs, criando]);
  const x = lista.dados;
  if (criando) {
    return (
      <>
        <Cab titulo={aba === "imediato" ? "Nova notificação" : "Agendamento Inteligente"} sub={aba === "imediato" ? "Dispare mensagens PUSH para o celular de seus usuários na hora." : "Programe mensagens para rodarem sozinhas no piloto automático."}>
          <button className="botao" onClick={() => setCriando(false)}>Voltar</button>
          <Abas abas={[["imediato", "Disparo Imediato"], ["agendamento", "Agendar Notificações"]]} valor={aba} onChange={setAba} />
        </Cab>
        {aba === "imediato" ? <CriarNotificacao onVoltar={() => setCriando(false)} onEnviada={() => setCriando(false)} /> : <Formulario agendar />}
      </>
    );
  }
  const de = x ? (x.pagina - 1) * 10 + 1 : 0, ate = x ? de + x.itens.length - 1 : 0;
  const paginas: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];
  const set = (k: keyof typeof VAZIO_N, v: string) => setRasc({ ...rasc, [k]: v });
  return (
    <>
      <Cab titulo="Notificações app" sub={'São mensagens rápidas que aparecem na tela do celular, normalmente chamadas de "Notificação Push".'}>
        <button className="botao primario" onClick={() => setCriando(true)}>Nova notificação</button>
      </Cab>
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setF(rasc); }}>
        <h3>Filtros</h3>
        <Campo rotulo="Destinatário"><select value={rasc.destinatario} onChange={(e) => set("destinatario", e.target.value)}>{DEST.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
        <Campo rotulo="Data inicial"><input type="date" value={rasc.dataIni} onChange={(e) => set("dataIni", e.target.value)} /></Campo>
        <Campo rotulo="Data final"><input type="date" value={rasc.dataFim} onChange={(e) => set("dataFim", e.target.value)} /></Campo>
        <Campo rotulo="Título"><input value={rasc.titulo} maxLength={40} onChange={(e) => set("titulo", e.target.value)} /></Campo>
        <Campo rotulo="Mensagem"><textarea value={rasc.mensagem} maxLength={255} rows={1} onChange={(e) => set("mensagem", e.target.value)} /></Campo>
        <button className="botao primario">Filtrar</button>
        <button type="button" className="botao" onClick={() => { setRasc(VAZIO_N); setF(VAZIO_N); setPagina(1); }}>Limpar filtros</button>
      </form>
      <Aviso erro={lista.erro} />
      <div className="dm-cartao tabela-rola">
        {!x ? <Carregando /> : <>
          <p><small>{x.total ? `Exibindo ${de}-${ate} de ${x.total} ${x.total === 1 ? "resultado" : "resultados"}.` : ""}</small></p>
          <table>
            <thead><tr><th>Data criação</th><th>Destinatário</th><th>Título</th><th>Mensagem</th><th>Status do envio</th><th>Data do envio</th><th /></tr></thead>
            <tbody>
              {!x.itens.length ? <tr><td colSpan={7} className="vazio">Nenhum resultado encontrado.</td></tr> : x.itens.map((n: any) => (
                <tr key={n.id}>
                  <td>{diaBr(n.criadoEm)}</td><td>{n.destinatario}</td><td>{n.titulo}</td><td>{n.mensagem}</td><td>{n.status}</td><td>{diaBr(n.enviadoEm)}</td>
                  <td><div className="dm-dropdown"><button className="icone" aria-label={`Ações de ${n.titulo}`} onClick={() => setMenu(menu === n.id ? null : n.id)}>⋮</button>
                    {menu === n.id && <div className="dm-dropdown-menu direita"><button onClick={() => { setMenu(null); setDetalhe(n); }}>Ver detalhes</button></div>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {x.paginas > 1 && (
            <div className="dm-cab-acoes" style={{ marginTop: 10 }} role="navigation" aria-label="Páginas">
              <button className="botao" disabled={x.pagina <= 1} onClick={() => setPagina(x.pagina - 1)}>←</button>
              {paginas.map((p) => <button key={p} className={`botao ${p === x.pagina ? "primario" : ""}`} onClick={() => setPagina(p)}>{p}</button>)}
              <button className="botao" disabled={x.pagina >= x.paginas} onClick={() => setPagina(x.pagina + 1)}>→</button>
            </div>
          )}
        </>}
      </div>
      <Modal aberto={!!detalhe} onFechar={() => setDetalhe(null)} titulo={detalhe?.titulo ?? ""} sub={detalhe ? `${detalhe.destinatario} · ${dataHoraBr(detalhe.em)}` : ""}>
        {detalhe && <><p style={{ whiteSpace: "pre-wrap" }}>{detalhe.mensagem}</p><p><small>Segmento: {detalhe.segmento} · {detalhe.destinatarios} destinatário(s) · Enviada por {detalhe.por}</small></p></>}
      </Modal>
    </>
  );
}

function Formulario({ agendar }: { agendar: boolean }) {
  const dados = useCarregar(() => pedirConfig("/notificacoes"), []);
  const [f, setF] = useState({ papel: "passageiro", segmento: "todos", usuario: "", titulo: "", mensagem: "", usarNome: false, regra: "unico", data: "", hora: "", diaSemana: 1, diaMes: 5 });
  const [busca, setBusca] = useState("");
  const pessoas = useCarregar(() => (f.segmento === "individual" ? pedirConfig(`/notificacoes/pessoas?papel=${f.papel}&busca=${encodeURIComponent(busca)}`) : Promise.resolve({ pessoas: [] })), [f.segmento, f.papel, busca]);
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const primeiroNome = "Maria";
  const prev = (t: string) => (f.usarNome ? (t.includes("{nome}") ? t.replace(/\{nome\}/g, primeiroNome) : t) : t.replace(/\{nome\}/g, ""));
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await salvar(() => pedirConfig(agendar ? "/notificacoes/agendar" : "/notificacoes", "POST", f), agendar ? "Agendamento ativado." : "Notificação disparada.");
    if (r) { setF({ ...f, titulo: "", mensagem: "" }); dados.recarregar(); }
  };
  const x = dados.dados;
  return (
    <div className="dm-notif">
      <form className="dm-cartao dm-form" onSubmit={enviar}>
        <h2>{agendar ? "Criar Nova Automação" : "Disparo Imediato"} <span className="selo ok">{agendar ? "Piloto Automático" : "Ao Vivo"}</span></h2>
        <fieldset><legend>Quem vai receber?</legend><div className="dm-radios">
          {([["motorista", "Motoristas"], ["passageiro", "Passageiros"]] as const).map(([v, n]) => <label key={v}><input type="radio" name="papel" checked={f.papel === v} onChange={() => set("papel", v)} /> {n}</label>)}
        </div></fieldset>
        <fieldset><legend>{agendar ? "Segmentação (Filtro)" : "Segmentação"}</legend><div className="dm-radios">
          {SEG.map(([v, n]) => <label key={v}><input type="radio" name="segmento" checked={f.segmento === v} onChange={() => set("segmento", v)} /> {n}</label>)}
        </div></fieldset>
        {f.segmento === "individual" && (
          <Campo rotulo={agendar ? "Pesquisar Usuário" : "Usuário"} dica="Digite o nome, e-mail ou telefone para buscar.">
            <input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
            <select value={f.usuario} onChange={(e) => set("usuario", e.target.value)} aria-label="Usuário"><option value="">Selecione</option>{pessoas.dados?.pessoas.map((p: any) => <option key={p.chave} value={p.chave}>{p.nome} · {p.telefone}</option>)}</select>
          </Campo>
        )}
        {agendar && (
          <>
            <Campo rotulo="Regra de Disparo"><select value={f.regra} onChange={(e) => set("regra", e.target.value)}><option value="unico">Disparar Apenas Uma Vez</option><option value="diario">Disparar Todos os Dias</option><option value="semanal">Disparar Toda Semana</option><option value="mensal">Disparar Todo Mês</option></select></Campo>
            {f.regra === "unico" && <div className="dm-duplo"><Campo rotulo="Data Base"><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} required /></Campo><Campo rotulo="Horário"><input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} required /></Campo></div>}
            {f.regra !== "unico" && <Campo rotulo="Horário Fixo do Disparo"><input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} required /></Campo>}
            {f.regra === "semanal" && <Campo rotulo="Em qual dia da semana?"><select value={f.diaSemana} onChange={(e) => set("diaSemana", Number(e.target.value))}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Campo>}
            {f.regra === "mensal" && <Campo rotulo="Em qual dia do mês?"><input type="number" min={1} max={31} value={f.diaMes} onChange={(e) => set("diaMes", Number(e.target.value))} placeholder="Ex: dia 5" /></Campo>}
          </>
        )}
        <Campo rotulo={agendar ? "Título da Notificação" : "Título"}><input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={60} placeholder={agendar ? "Ex: Surpresa pra você!" : "Ex: Novidade Chegando!"} required /></Campo>
        <Campo rotulo="Mensagem"><textarea value={f.mensagem} onChange={(e) => set("mensagem", e.target.value)} rows={4} maxLength={240} placeholder={agendar ? "Detalhes da promoção..." : "Escreva algo incrível..."} required /></Campo>
        <label className="dm-check"><input type="checkbox" checked={f.usarNome} onChange={(e) => set("usarNome", e.target.checked)} /> Personalizar com o 1º Nome? <small>Coloque a tag <code>{"{nome}"}</code> no texto ou deixe em branco para incluir no título.</small></label>
        <Aviso erro={msg?.erro} ok={msg?.ok} />
        <button className="botao primario" disabled={salvando}>{agendar ? "Ativar Agendamento" : "Disparar Notificação"}</button>
      </form>
      <div>
        <div className="dm-celular" aria-label="Pré-visualização"><small>9:41</small><div className="dm-push"><h4>{prev(f.titulo) || "Título..."}</h4><span>Agora</span><p>{prev(f.mensagem) || "Sua mensagem aparecerá aqui."}</p></div><small>Pré-visualização</small></div>
        <div className="dm-cartao">
          <h3>{agendar ? "Ativos na Fila" : "Histórico"}</h3>
          {!x ? <Carregando /> : agendar ? (
            !x.agendamentos.length ? <p className="vazio">Nenhum agendamento ativo.</p> : <ul className="dm-transacoes">{x.agendamentos.map((a: any) => (
              <li key={a.id}><span><strong>{a.titulo}</strong><small>{a.regra === "unico" ? `Dia ${a.data.split("-").reverse().join("/")}` : a.regra === "diario" ? "Todos os dias" : a.regra === "semanal" ? DIAS[a.diaSemana] : `Dia ${a.diaMes}`} às {a.hora} · {a.papel === "motorista" ? "Motoristas" : "Passageiros"} · {a.ativo ? "Ativo" : "Pausado"}</small></span>
                <span className="dm-linha"><button className="botao" onClick={async () => { await pedirConfig(`/notificacoes/agendar/${a.id}/pausar`, "POST", { ativo: !a.ativo }); dados.recarregar(); }}>{a.ativo ? "Pausar" : "Ativar"}</button><button className="botao" onClick={async () => { if (confirm("Remover este agendamento?")) { await pedirConfig(`/notificacoes/agendar/${a.id}`, "DELETE"); dados.recarregar(); } }}>Remover</button></span></li>
            ))}</ul>
          ) : !x.historico.length ? <p className="vazio">Nenhum disparo ainda.</p> : <ul className="dm-transacoes">{x.historico.map((h: any) => <li key={h.id}><span><strong>{h.titulo}</strong><small>{h.mensagem}</small></span><span className="dm-dir"><small>{dataHoraBr(h.em)}</small><small>{h.destinatarios} destinatário(s)</small></span></li>)}</ul>}
        </div>
      </div>
    </div>
  );
}
