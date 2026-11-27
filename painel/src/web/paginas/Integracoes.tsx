import { useState } from "react";
import { CheckCircle2, KeyRound, Plus, Save, Send, Trash2, Upload, XCircle } from "lucide-react";
import { api, type Integracoes as Dados } from "../api";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";

const ROTULO_CASO: Record<string, string> = { relatorio: "Relatório exportado (análise longa)", chat: "Perguntas rápidas", classificacao: "Classificação", voz: "Voz (reservado)" };
const ROTULO_PROVEDOR: Record<string, string> = { anthropic: "Anthropic (Claude)", groq: "Groq", openai: "OpenAI", gemini: "Google Gemini" };
const CHAVES_IA = [["ANTHROPIC_API_KEY", "Anthropic (Claude)"], ["GROQ_API_KEYS", "Groq (pode colar várias, separadas por vírgula)"], ["OPENAI_API_KEY", "OpenAI"], ["GEMINI_API_KEY", "Google Gemini"]];

/**
 * Integrações da empresa: de onde vêm as corridas e as chaves de IA.
 * Segredos nunca voltam do servidor: só aparece se estão preenchidos.
 */
export default function Integracoes() {
  const { dados, erro, recarregar } = useCarregar(() => api.integracoes(), []);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const tentar = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ texto: ok }); recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  if (!dados) return <>{erro && <div className="aviso erro">{erro}</div>}</>;
  const faltam = dados.tipos.filter((t) => !dados.integracoes.some((i) => i.tipo === t.tipo) || t.tipo === "arquivo");
  return (
    <>
      <Titulo titulo="Integrações" sub="De onde vêm as corridas da sua empresa e quais chaves de IA usar. Credenciais ficam só no servidor." />
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <div className="grade">
        {dados.integracoes.map((i) => <CartaoIntegracao key={i.id} i={i} campos={dados.tipos.find((t) => t.tipo === i.tipo)?.campos ?? []} tentar={tentar} />)}
        <Cartao titulo="Adicionar integração">
          <p className="sub">As corridas de todas as integrações ativas aparecem juntas, com a etiqueta de origem.</p>
          <div className="acoes">
            {faltam.filter((t) => t.tipo !== "arquivo").map((t) => (
              <button key={t.tipo} className="botao" onClick={() => tentar(() => api.novaIntegracao(t.tipo), "Integração adicionada.")}><Plus size={14} /> {t.nome}</button>
            ))}
            <label className="botao"><Upload size={14} /> Importar planilha CSV<input type="file" hidden accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && tentar(() => api.importarPlanilha(e.target.files![0]), "Planilha importada.")} /></label>
          </div>
        </Cartao>
      </div>
      <h2 className="secao">Webhooks de saída</h2>
      <WebhooksSaida tentar={tentar} />
      <h2 className="secao">Inteligência artificial</h2>
      <div className="grade">
        <Cartao titulo="Qual IA em cada caso">
          {dados.ia.situacao.map((s) => (
            <div key={s.caso} className="rota-ia">
              <strong>{ROTULO_CASO[s.caso] ?? s.caso}</strong>
              <ol>{s.rotas.map((r, n) => <li key={n} className={r.temChave ? "txt-ok" : "txt-suave"}>{ROTULO_PROVEDOR[r.provedor]} · {r.modelo} {r.temChave ? "(pronto)" : "(sem chave)"}</li>)}</ol>
            </div>
          ))}
          <p className="sub">Ordem = plano B: se a 1ª falhar, usa a próxima. A plataforma pode mudar a ordem com as variáveis IA_ROTA_*.</p>
        </Cartao>
        <ChavesIa preenchidas={dados.ia.preenchidas} tentar={tentar} />
      </div>
    </>
  );
}

function CartaoIntegracao({ i, campos, tentar }: { i: Dados["integracoes"][number]; campos: Dados["tipos"][number]["campos"]; tentar: (f: () => Promise<unknown>, ok: string) => void }) {
  const [nome, setNome] = useState(i.nome);
  const [valores, setValores] = useState<Record<string, string>>(i.valores);
  return (
    <Cartao titulo={i.tipoNome}>
      <p className={i.pendencias.length ? "txt-ruim" : "txt-ok"}>{i.pendencias.length ? <XCircle size={16} /> : <CheckCircle2 size={16} />} {i.pendencias.length ? "Falta configurar" : i.ativa ? "Ativa" : "Pronta (desligada)"}</p>
      {i.pendencias.length > 0 && <ul className="dicas">{i.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="form">
        <label>Nome que aparece na etiqueta de origem<input value={nome} onChange={(e) => setNome(e.target.value)} /><small>É o nome que aparece nas corridas e nos relatórios.</small></label>
        {campos.map((c) => (
          <label key={c.chave}>{c.rotulo}{c.opcional ? " (opcional)" : ""}
            <input type={c.secreto ? "password" : "text"} autoComplete="off" value={valores[c.chave] ?? ""} placeholder={c.secreto && valores[c.chave] ? "" : undefined}
              onFocus={() => c.secreto && valores[c.chave] === "••••••" && setValores({ ...valores, [c.chave]: "" })}
              onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} />
          </label>
        ))}
        {i.planilhas !== undefined && <p className="sub">{i.planilhas} planilha(s) importada(s).</p>}
        <label className="check"><input type="checkbox" checked={i.ativa} onChange={(e) => tentar(() => api.salvarIntegracao(i.id, { ativa: e.target.checked }), e.target.checked ? "Integração ligada." : "Integração desligada.")} /> Ligada</label>
      </div>
      <div className="acoes">
        <button className="botao primario" onClick={() => tentar(() => api.salvarIntegracao(i.id, { nome, credenciais: valores }), "Integração salva.")}><Save size={14} /> Salvar</button>
        <button className="icone" aria-label="Remover integração" onClick={() => confirm(`Remover "${i.nome}"? As credenciais dela serão apagadas.`) && tentar(() => api.apagarIntegracao(i.id), "Integração removida.")}><Trash2 size={14} /></button>
      </div>
    </Cartao>
  );
}

function ChavesIa({ preenchidas, tentar }: { preenchidas: Record<string, boolean>; tentar: (f: () => Promise<unknown>, ok: string) => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(CHAVES_IA.map(([k]) => [k, preenchidas[k] ? "••••••" : ""])));
  return (
    <Cartao titulo="Chaves de IA da empresa">
      <div className="form">
        {CHAVES_IA.map(([k, rotulo]) => (
          <label key={k}>{rotulo}
            <input type="password" autoComplete="off" value={v[k]} onFocus={() => v[k] === "••••••" && setV({ ...v, [k]: "" })} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="sub">Deixe em branco para usar as chaves da plataforma (se ela permitir). Para apagar uma chave, limpe o campo e salve.</p>
      <button className="botao primario" onClick={() => tentar(() => api.salvarChavesIa(v), "Chaves salvas.")}><Save size={14} /> Salvar chaves</button>
    </Cartao>
  );
}

const ROTULO_TIPO_WEBHOOK: Record<string, string> = { Status: "Status da corrida (aceita, a caminho, no local, finalizada, cancelada...)", Ocorrencia: "Ocorrências (taxa de cancelamento, tarifa recalculada, sem aceite, motorista atrasado, nota baixa)" };

/** Webhooks de saída: a empresa cadastra endereços e recebe as mudanças das corridas, assinadas com o segredo de cada endereço. */
function WebhooksSaida({ tentar }: { tentar: (f: () => Promise<unknown>, ok: string) => void }) {
  const { dados, recarregar } = useCarregar(() => api.webhooksSaida(), []);
  const [tipo, setTipo] = useState("Status");
  const [url, setUrl] = useState("");
  const [segredo, setSegredo] = useState<{ id: string; valor: string } | null>(null);
  if (!dados) return null;
  const nome = (id: string) => { const w = dados.webhooks.find((x) => x.id === id); return w ? `${w.tipo} · ${w.url}` : id; };
  return (
    <div className="grade">
      <Cartao titulo="Endereços cadastrados">
        <p className="sub">Cada empresa pode ter até {dados.maximoPorTipo} endereços por tipo. Cada envio leva o cabeçalho Signature-V2 (HMAC-SHA-512 do corpo com o segredo do endereço), um event_id novo a cada tentativa e um source_event_id fixo para você descartar repetidos. Se o endereço não responder 2xx, o painel tenta de novo (10 s, 1 min, 5 min, 30 min, 2 h e 6 h).</p>
        {segredo && <div className="aviso ok">Segredo de {nome(segredo.id)}: <code>{segredo.valor}</code>. Copie agora: ele não aparece de novo.</div>}
        {dados.webhooks.length === 0 && <p className="sub">Nenhum webhook cadastrado.</p>}
        {dados.webhooks.map((w) => (
          <div key={w.id} className="rota-ia">
            <strong>{w.tipo}</strong> <span className="txt-suave">{w.url}</span> <small>(segredo termina em {w.segredoFim})</small>
            <div className="acoes">
              <label className="check"><input type="checkbox" checked={w.ativo} onChange={(e) => tentar(() => api.salvarWebhook(w.id, { ativo: e.target.checked }).then(recarregar), e.target.checked ? "Webhook ligado." : "Webhook desligado.")} /> Ligado</label>
              <button className="botao" onClick={() => tentar(async () => { const r = await api.testarWebhook(w.id); if (!r.ok) throw new Error(r.erro || "O endereço não respondeu."); recarregar(); }, "O endereço respondeu 2xx ao teste.")}><Send size={14} /> Testar</button>
              <button className="botao" onClick={() => tentar(async () => { const r = await api.girarSegredoWebhook(w.id); setSegredo({ id: w.id, valor: r.segredo }); recarregar(); }, "Segredo novo gerado.")}><KeyRound size={14} /> Novo segredo</button>
              <button className="icone" aria-label="Remover webhook" onClick={() => confirm("Remover este webhook? As entregas pendentes dele são descartadas.") && tentar(() => api.apagarWebhook(w.id).then(recarregar), "Webhook removido.")}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </Cartao>
      <Cartao titulo="Adicionar webhook">
        <div className="form">
          <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)}>{dados.tipos.map((t) => <option key={t} value={t}>{t}</option>)}</select><small>{ROTULO_TIPO_WEBHOOK[tipo]}</small></label>
          <label>Endereço (https)<input value={url} placeholder="https://sua-empresa.com.br/webhook" onChange={(e) => setUrl(e.target.value)} /></label>
        </div>
        <button className="botao primario" onClick={() => tentar(async () => { const r = await api.criarWebhook({ tipo, url }); setSegredo({ id: r.webhook.id, valor: r.segredo }); setUrl(""); recarregar(); }, "Webhook cadastrado. Copie o segredo mostrado acima.")}><Plus size={14} /> Cadastrar</button>
      </Cartao>
      <Cartao titulo="Últimas entregas">
        {dados.entregas.length === 0 ? <p className="sub">Nada enviado ainda.</p> : (
          <div className="tabela-rola"><table>
            <thead><tr><th>Quando</th><th>Evento</th><th>Endereço</th><th>Situação</th><th>Tentativas</th></tr></thead>
            <tbody>{dados.entregas.map((x) => (
              <tr key={x.id}><td>{x.criadoEm.slice(0, 16).replace("T", " ")}</td><td>{x.tipo} {x.evento}</td><td>{nome(x.webhookId)}</td><td className={x.estado === "entregue" ? "txt-ok" : x.estado === "falhou" ? "txt-ruim" : "txt-suave"}>{x.estado === "entregue" ? "Entregue" : x.estado === "falhou" ? "Falhou" : "Aguardando"}{x.ultimoErro ? ` (${x.ultimoErro})` : ""}</td><td>{x.tentativas}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Cartao>
    </div>
  );
}
