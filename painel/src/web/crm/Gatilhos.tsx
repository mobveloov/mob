import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Copy, Edit3, Package, Pause, Play, Plus, Search, Send, Trash2, X, Zap } from "lucide-react";
import { CANAIS_ENVIO, infoGatilho, MODELOS_GATILHO, TIPOS_GATILHO } from "../../crm/catalogo.ts";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { quandoReal } from "./api";
import { automacao, type GatilhoLinha, type LinhaFila } from "./api-automacao";
import { BarraPausa, classeEnvio, ROTULO_ENVIO } from "./automacao-comum";
import { useGestor, useRetorno } from "./comum";

const ROTULO_LOG: Record<string, string> = { sent: "Enviado", failed: "Falhou", skipped: "Pulado", pending: "Agendado", processing: "Processando", canceled: "Cancelado" };
const canal = (v: string) => CANAIS_ENVIO.find((c) => c.value === v)?.label ?? (v || "-");

/** Pílulas com o que o gatilho faz (atraso, dias, horário, intervalo...). */
function pilulas(g: GatilhoLinha): string[] {
  const c = g.trigger_config as Record<string, unknown>;
  const out: string[] = [];
  const atraso = typeof c.delay_seconds === "number" ? c.delay_seconds : typeof c.delay_minutes === "number" ? c.delay_minutes * 60 : infoGatilho(g.trigger_type)?.defaultDelaySeconds ?? 0;
  if (atraso) out.push(`⏱ ${atraso >= 60 ? `${Math.round(atraso / 60)} min` : `${atraso}s`} de atraso`);
  if (c.days_inactive != null || c.days != null) out.push(`${c.days_inactive ?? c.days} dias sem corrida`);
  if (c.hours != null) out.push(`${c.hours}h após cadastro`);
  if (c.hour) out.push(`a partir das ${c.hour}`);
  if (c.cooldown_hours) out.push(`intervalo ${c.cooldown_hours}h`);
  if (c.once_per_contact) out.push("🔒 1x por passageiro");
  if (c.city) out.push(`📍 ${c.city}`);
  if (c.respect_window) out.push("janela de horário");
  return out;
}

/** CRM › Automação › Gatilhos: mensagem automática para um evento (cadastro, status da corrida, tempo sem corrida, aniversário). */
export default function Gatilhos() {
  const { dados, erro, recarregar } = useCarregar(() => automacao.gatilhos(), [], 20_000);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  const [editando, setEditando] = useState<GatilhoLinha | "novo" | null>(null);
  const [instalando, setInstalando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [logs, setLogs] = useState<LinhaFila[]>([]);
  const [testando, setTestando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("all");
  const [evento, setEvento] = useState("all");
  const [cidade, setCidade] = useState("all");
  const [canalF, setCanalF] = useState("all");
  const [estado, setEstado] = useState<"all" | "active" | "inactive">("all");

  const gatilhos = dados?.gatilhos ?? [];
  const grupos = [...new Set(TIPOS_GATILHO.map((t) => t.group))];
  const q = busca.trim().toLowerCase();
  const cidadeDe = (g: GatilhoLinha) => (typeof g.trigger_config.city === "string" ? g.trigger_config.city.trim() : "");
  const cidades = [...new Set(gatilhos.map(cidadeDe).filter(Boolean))].sort();
  const eventosEmUso = TIPOS_GATILHO.filter((t) => gatilhos.some((g) => g.trigger_type === t.value) && (grupo === "all" || t.group === grupo));
  const temFiltro = !!q || grupo !== "all" || evento !== "all" || canalF !== "all" || estado !== "all" || cidade !== "all";
  const limpar = () => { setBusca(""); setGrupo("all"); setEvento("all"); setCanalF("all"); setEstado("all"); setCidade("all"); };
  const mostrados = gatilhos.filter((g) =>
    (grupo === "all" || infoGatilho(g.trigger_type)?.group === grupo)
    && (evento === "all" || g.trigger_type === evento)
    && (cidade === "all" || (cidade === "__todas" ? !cidadeDe(g) : cidadeDe(g) === cidade))
    && (canalF === "all" || g.send_channel === canalF)
    && (estado === "all" || (estado === "active") === g.is_active)
    && (!q || `${g.name} ${g.template?.title ?? ""} ${g.template?.content ?? ""}`.toLowerCase().includes(q)));

  const abrirLog = async (id: string) => {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    setLogs((await tentar(() => automacao.logsGatilho(id)))?.logs ?? []);
  };
  const testar = async (g: GatilhoLinha) => {
    if (!g.template) return alert("Este gatilho está sem template.");
    const fone = prompt("Telefone para receber o teste (com DDD):");
    if (!fone) return;
    if (fone.replace(/\D/g, "").length < 10) return alert("Telefone inválido. Use DDD + número.");
    setTestando(g.id);
    const r = await tentar(() => automacao.testarGatilho(g.id, fone));
    setTestando(null);
    if (r) alert(r.sent ? "Teste enviado! Confira o aparelho." : `Teste não enviado: ${r.error ?? "motivo não informado"}`);
  };
  const select = { padding: "8px 10px" } as const;

  return (
    <div className="pilha">
      <BarraPausa />
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="linha-filtro">
        <span style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 13 }} />
          <input style={{ paddingLeft: 30, width: "100%" }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou mensagem..." />
        </span>
        {gestor && (
          <div className="acoes">
            <button className="botao" onClick={() => setInstalando(true)}><Package size={14} /> Instalar modelos</button>
            <button className="botao primario" disabled={!dados?.templates.length} onClick={() => setEditando("novo")}><Plus size={14} /> Novo Gatilho</button>
          </div>
        )}
      </div>
      <div className="periodo">
        <select style={select} value={grupo} onChange={(e) => { setGrupo(e.target.value); setEvento("all"); }}>
          <option value="all">Todos os tipos ({gatilhos.length})</option>
          {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select style={select} value={evento} onChange={(e) => setEvento(e.target.value)}>
          <option value="all">Todos os eventos</option>
          {eventosEmUso.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {cidades.length > 0 && (
          <select style={select} value={cidade} onChange={(e) => setCidade(e.target.value)}>
            <option value="all">Todas as cidades</option>
            <option value="__todas">Sem cidade (vale para todas)</option>
            {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select style={select} value={canalF} onChange={(e) => setCanalF(e.target.value)}>
          <option value="all">Todos os canais</option>
          {CANAIS_ENVIO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select style={select} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <small className="sub">Mostrando {mostrados.length} de {gatilhos.length} gatilho(s)</small>
        {temFiltro && <button className="botao" onClick={limpar}><X size={14} /> Limpar filtros</button>}
      </div>
      {dados && dados.templates.length === 0 && (
        <div className="aviso"><AlertCircle size={14} /> Crie um template ativo (ou use o pacote pronto) antes de criar gatilhos.</div>
      )}
      {dados && !mostrados.length && <Cartao><p className="vazio"><Zap size={16} /> {gatilhos.length === 0 ? "Nenhum gatilho configurado." : "Nenhum gatilho com esses filtros."}</p></Cartao>}
      {mostrados.map((g) => {
        const info = infoGatilho(g.trigger_type);
        const c = dados?.counts[g.id] ?? {};
        return (
          <Cartao key={g.id}>
            <div className="linha-filtro" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: "0 0 6px" }}>
                  <strong>{g.name}</strong>{" "}
                  <span className={`selo ${g.is_active ? "ok" : ""}`}>{g.is_active ? "Ativo" : "Inativo"}</span>{" "}
                  <span className="selo info">⚡ {info?.label ?? g.trigger_type}</span>{" "}
                  <span className="selo">{canal(g.send_channel)}</span>
                </p>
                {g.template && <p style={{ margin: "0 0 6px" }}><small className="sub"><strong>{g.template.title || g.template.name}</strong> — {g.template.content.slice(0, 120)}</small></p>}
                <div className="periodo">{pilulas(g).map((p) => <span key={p} className="chip">{p}</span>)}</div>
                <p style={{ margin: "8px 0 0" }}>
                  <small className="sub">
                    <Send size={11} /> {g.fire_count} disparos no total · {dados?.today[g.id] ?? 0} hoje
                    {" · "}7 dias: ✅ {c.sent ?? 0} · ⏳ {(c.pending ?? 0) + (c.processing ?? 0)} · 🚫 {c.canceled ?? 0} · ⏭ {c.skipped ?? 0}{c.failed ? ` · ❌ ${c.failed}` : ""}
                    {g.last_fired_at ? ` · último: ${quandoReal(g.last_fired_at)}` : ""}
                  </small>
                </p>
              </div>
              <div className="acoes">
                {gestor && <button className="icone" title={g.is_active ? "Desativar" : "Ativar"} aria-label={g.is_active ? "Desativar" : "Ativar"} onClick={() => tentar(() => automacao.ligarGatilho(g.id)).then(recarregar)}>{g.is_active ? <Pause size={14} /> : <Play size={14} />}</button>}
                {gestor && <button className="icone" title="Enviar teste para um telefone" aria-label="Enviar teste" disabled={testando === g.id} onClick={() => testar(g)}><Send size={14} /></button>}
                {gestor && <button className="icone" title="Editar" aria-label="Editar" onClick={() => setEditando(g)}><Edit3 size={14} /></button>}
                {gestor && <button className="icone" title="Duplicar" aria-label="Duplicar" onClick={() => tentar(() => automacao.duplicarGatilho(g.id), "Gatilho duplicado (desativado).").then(recarregar)}><Copy size={14} /></button>}
                <button className="icone" title="Log de disparos" aria-label="Log de disparos" onClick={() => abrirLog(g.id)}>{aberto === g.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                {gestor && <button className="icone" title="Excluir" aria-label="Excluir" onClick={() => confirm("Excluir este gatilho?") && tentar(() => automacao.apagarGatilho(g.id), "Gatilho excluído.").then(recarregar)}><Trash2 size={14} /></button>}
              </div>
            </div>
            {aberto === g.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
                {!logs.length ? <p className="vazio">Nenhum disparo ainda</p> : logs.map((l) => (
                  <div key={l.id} className="dado" style={{ alignItems: "flex-start" }}>
                    <span><span className={`selo ${classeEnvio(l.estado)}`}>{ROTULO_LOG[l.estado] ?? ROTULO_ENVIO[l.estado] ?? l.estado}</span></span>
                    <span style={{ textAlign: "right", color: "inherit" }}>
                      <strong>{l.nome || l.telefone}</strong><br />
                      <small className="sub">{l.telefone} · {quandoReal(l.criado_em)}{l.estado === "pending" && l.sai_em ? ` · sai ${new Date(l.sai_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</small>
                      {l.estado !== "pending" && l.mensagem && <><br /><small className="sub">{l.mensagem.slice(0, 200)}</small></>}
                      {l.erro && <><br /><small style={{ color: "var(--alerta)" }}>{l.erro}</small></>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Cartao>
        );
      })}
      <Gaveta aberta={instalando} onFechar={() => setInstalando(false)} titulo="Instalar modelos de gatilhos" larga>
        {instalando && <Instalador instalados={new Set(dados?.instalados ?? [])} onFeito={() => { setInstalando(false); recarregar(); }} />}
      </Gaveta>
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando && editando !== "novo" ? "Editar gatilho" : "Novo gatilho"} larga>
        {editando && dados && <Formulario gatilho={editando === "novo" ? null : editando} templates={dados.templates} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
    </div>
  );
}

/** Escolha quais gatilhos prontos instalar. Entram desativados. */
function Instalador({ instalados, onFeito }: { instalados: Set<string>; onFeito: () => void }) {
  const livres = MODELOS_GATILHO.map((_, i) => i).filter((i) => !instalados.has(MODELOS_GATILHO[i].template.name));
  const [marcados, setMarcados] = useState<Set<number>>(new Set(livres));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alternar = (i: number) => setMarcados((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const instalar = async () => {
    setSalvando(true); setErro(null);
    try {
      const r = await automacao.instalarModelos([...marcados]);
      if (r.falhas.length) setErro(`${r.instalados} instalado(s). Não foi possível instalar: ${r.falhas.join(", ")}.`);
      else onFeito();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    setSalvando(false);
  };
  return (
    <div className="form">
      <p className="sub">Entram <strong>desativados</strong>, com a mensagem pronta. Revise, edite e ligue quando quiser.</p>
      <div className="linha-filtro">
        <span>{marcados.size} de {livres.length} disponíveis selecionados</span>
        <div className="acoes">
          <button className="botao" onClick={() => setMarcados(new Set(livres))}>Marcar todos</button>
          <button className="botao" onClick={() => setMarcados(new Set())}>Desmarcar todos</button>
        </div>
      </div>
      {MODELOS_GATILHO.map((p, i) => {
        const ja = instalados.has(p.template.name);
        return (
          <label key={p.template.key} className="check" style={{ opacity: ja ? 0.5 : 1, alignItems: "flex-start" }}>
            <input type="checkbox" checked={marcados.has(i)} disabled={ja} onChange={() => alternar(i)} />
            <span>
              <strong>{p.template.name}</strong> {ja && <span className="selo">Já instalado</span>} <span className="selo">{infoGatilho(p.trigger_type)?.label ?? p.trigger_type}</span> <span className="selo">{canal(p.send_channel)}</span><br />
              <small className="sub"><strong>{p.template.title}</strong> — {p.template.content}</small>
            </span>
          </label>
        );
      })}
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="acoes">
        <button className="botao primario" disabled={salvando || marcados.size === 0} onClick={instalar}><Package size={14} /> Instalar {marcados.size} gatilho(s)</button>
      </div>
    </div>
  );
}

const VARIAVEIS_MSG = ["nome", "empresa", "os", "valor", "motorista", "cidade", "dias_sem_corrida"];

function Formulario({ gatilho, templates, onSalvo }: { gatilho: GatilhoLinha | null; templates: Array<{ id: string; name: string; title: string | null; content: string }>; onSalvo: () => void }) {
  const cfg = (gatilho?.trigger_config ?? {}) as Record<string, unknown>;
  const ouNum = (v: unknown, d: string) => (v != null && v !== "" ? String(v) : d);
  const [nome, setNome] = useState(gatilho?.name ?? "");
  const [templateId, setTemplateId] = useState(gatilho?.template_id ?? templates[0]?.id ?? "");
  const [tipo, setTipo] = useState<string>(gatilho?.trigger_type ?? "simulated_no_request");
  const [dias, setDias] = useState(ouNum(cfg.days_inactive ?? cfg.days, "30"));
  const [horas, setHoras] = useState(ouNum(cfg.hours, "24"));
  const [hora, setHora] = useState(typeof cfg.hour === "string" ? cfg.hour : "09:00");
  const atrasoInicial = typeof cfg.delay_seconds === "number" ? cfg.delay_seconds : typeof cfg.delay_minutes === "number" ? cfg.delay_minutes * 60 : null;
  const [atraso, setAtraso] = useState(atrasoInicial != null ? String(atrasoInicial) : "");
  const [intervalo, setIntervalo] = useState(ouNum(cfg.cooldown_hours, "0"));
  const [uma, setUma] = useState(!!cfg.once_per_contact);
  const [cidade, setCidade] = useState(typeof cfg.city === "string" ? cfg.city : "");
  const [janela, setJanela] = useState(!!cfg.respect_window);
  const [canalEnvio, setCanalEnvio] = useState<"whatsapp" | "app">(gatilho?.send_channel ?? "whatsapp");
  const info = infoGatilho(tipo);
  const [teto, setTeto] = useState(cfg.respect_daily_cap !== undefined ? !!cfg.respect_daily_cap : !info?.transactional);
  const tpl = templates.find((t) => t.id === templateId);
  const [titulo, setTitulo] = useState(tpl?.title ?? "");
  const [texto, setTexto] = useState(tpl?.content ?? "");
  const [outros, setOutros] = useState(0);
  const [copia, setCopia] = useState(false);
  const { tentar, caixa } = useRetorno();
  const ehTempo = info?.source === "tempo";
  const editada = !!tpl && (titulo.trim() !== (tpl.title ?? "") || texto.trim() !== tpl.content);

  const trocarTemplate = (id: string) => { setTemplateId(id); const t = templates.find((x) => x.id === id); setTitulo(t?.title ?? ""); setTexto(t?.content ?? ""); };
  useEffect(() => {
    if (!templateId) return;
    let vivo = true;
    automacao.usos(templateId, gatilho?.id).then((r) => { if (vivo) { setOutros(r.usos); setCopia(r.usos > 0); } }).catch(() => {});
    return () => { vivo = false; };
  }, [templateId, gatilho?.id]);

  const salvar = async () => {
    if (!nome.trim() || !templateId) return alert("Nome e template são obrigatórios");
    if (editada && !texto.trim()) return alert("Escreva a mensagem.");
    if (editada && titulo.length > 40) return alert("Título com mais de 40 caracteres.");
    const config: Record<string, unknown> = {};
    if (tipo === "inactive_passenger") config.days_inactive = parseInt(dias) || 30;
    if (tipo === "inactivity_recurring") config.days = parseInt(dias) || 7;
    if (tipo === "incomplete_signup") config.hours = parseInt(horas) || 24;
    if (tipo === "birthday") config.hour = hora || "09:00";
    if (!ehTempo && atraso.trim() !== "") config.delay_seconds = Math.max(0, parseInt(atraso) || 0);
    const cd = parseInt(intervalo) || 0;
    if (cd > 0) config.cooldown_hours = cd;
    if (uma) config.once_per_contact = true;
    if (cidade.trim()) config.city = cidade.trim();
    if (janela) config.respect_window = true;
    config.respect_daily_cap = teto;
    const corpo = { name: nome.trim(), template_id: templateId, trigger_type: tipo, trigger_config: config, send_channel: canalEnvio, ...(editada ? { mensagem: { titulo: titulo.trim(), texto: texto.trim(), copia } } : {}) };
    const r = await tentar(() => (gatilho ? automacao.salvarGatilho(gatilho.id, corpo) : automacao.novoGatilho(corpo)));
    if (r) onSalvo();
  };
  const grupos = [...new Set(TIPOS_GATILHO.map((t) => t.group))];
  const trocas = [
    [uma, setUma, "Uma vez por passageiro", "Nunca repete para quem já recebeu este gatilho."],
    [janela, setJanela, "Respeitar janela de horário", "Só envia dentro do horário da Governança. Gatilhos por tempo sempre respeitam."],
    [teto, setTeto, "Contar no limite diário", "Desligue para avisos operacionais (status da corrida)."],
  ] as Array<[boolean, (v: boolean) => void, string, string]>;

  return (
    <div className="form">
      {caixa}
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Simulou e não pediu — lembrete" /></label>
      <label>Quando disparar (evento)
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setTeto(!infoGatilho(e.target.value)?.transactional); }}>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {TIPOS_GATILHO.filter((t) => t.group === g && (t.group !== "Legado" || t.value === tipo)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </optgroup>
          ))}
        </select>
        {info && <small className="sub">{info.description}</small>}
      </label>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        <label>Template
          <select value={templateId} onChange={(e) => trocarTemplate(e.target.value)}>
            {templateId && !templates.some((t) => t.id === templateId) && <option value={templateId}>(modelo desativado — escolha outro)</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>Canal
          <select value={canalEnvio} onChange={(e) => setCanalEnvio(e.target.value as "whatsapp" | "app")}>{CANAIS_ENVIO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </label>
      </div>
      {tpl && (
        <div className="cartao" style={{ marginBottom: 0 }}>
          <div className="linha-filtro"><strong>Mensagem enviada por este gatilho</strong><small className="sub" style={{ color: titulo.length > 40 ? "var(--ruim)" : undefined }}>{titulo.length}/40</small></div>
          <label>Título (opcional, até 40)<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional, até 40)" /></label>
          <label>Mensagem<textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem" style={{ fontFamily: "monospace" }} /></label>
          <small className="sub">Variáveis: {VARIAVEIS_MSG.map((v) => `{{${v}}}`).join(" ")} · SpinText: {"{Oi|Olá}"}</small>
          {editada && outros > 0 && (
            <label className="check" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={copia} onChange={(e) => setCopia(e.target.checked)} />
              <span>Este template também é usado por {outros} outro(s) gatilho(s). Salvar como <strong>cópia só para este gatilho</strong> (recomendado). Desmarcado, a mudança vale para todos.</span>
            </label>
          )}
        </div>
      )}
      {(tipo === "inactive_passenger" || tipo === "inactivity_recurring") && <label>Dias sem corrida<input type="number" min={1} value={dias} onChange={(e) => setDias(e.target.value)} /></label>}
      {tipo === "incomplete_signup" && <label>Horas depois do cadastro<input type="number" min={1} value={horas} onChange={(e) => setHoras(e.target.value)} /></label>}
      {tipo === "birthday" && <label>A partir de que horas (Brasília)<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>}
      {!ehTempo && (
        <label>Atraso do envio (segundos)
          <input type="number" min={0} value={atraso} onChange={(e) => setAtraso(e.target.value)} placeholder={info?.defaultDelaySeconds ? `Padrão: ${info.defaultDelaySeconds}s` : "0 = na hora"} />
          <small className="sub">Com atraso, a mensagem entra na fila e é cancelada sozinha se a situação mudar (ex.: ele pediu a corrida ou outro motorista aceitou).</small>
        </label>
      )}
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        <label>Intervalo por passageiro (horas)<input type="number" min={0} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} /></label>
        <label>Só nesta cidade<input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Todas" /></label>
      </div>
      {trocas.map(([val, set, tit, desc]) => (
        <div key={tit} className="linha-filtro cartao" style={{ padding: "10px 14px", marginBottom: 0 }}>
          <span><strong>{tit}</strong><br /><small className="sub">{desc}</small></span>
          <input type="checkbox" role="switch" aria-label={tit} checked={val} onChange={(e) => set(e.target.checked)} />
        </div>
      ))}
      <div className="acoes"><button className="botao primario" disabled={!nome.trim() || !templateId} onClick={salvar}>{gatilho ? "Salvar" : "Criar Gatilho"}</button></div>
    </div>
  );
}
