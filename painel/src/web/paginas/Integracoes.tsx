import { useState } from "react";
import { CheckCircle2, Plus, Save, Trash2, Upload, XCircle } from "lucide-react";
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
