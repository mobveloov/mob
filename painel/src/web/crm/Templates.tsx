import { useState } from "react";
import { Check, ChevronRight, Edit3, Eye, FileText, Package, Plus, Shield, Smile, Trash2, Wand2, X } from "lucide-react";
import { CATEGORIAS, MODELOS_TEMPLATE, VARIAVEIS_TEMPLATE } from "../../crm/catalogo.ts";
import { EMOJI_CATEGORIES } from "../../crm/emojis.ts";
import { WA_OPTOUT_FOOTER } from "../../crm/optout.ts";
import { extractVariables } from "../../crm/spintext.ts";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { crm, type TemplateCrm } from "./api";
import { useRetorno } from "./comum";

/** CRM › Comunicação › Templates: mensagem com título, SpinText, variáveis {{x}}, teste A/B e rodapé de descadastro. */
export default function Templates({ emojis }: { emojis: boolean }) {
  const { dados, erro, recarregar } = useCarregar(() => crm.templates(), []);
  const [editando, setEditando] = useState<TemplateCrm | "novo" | null>(null);
  const { tentar, caixa } = useRetorno();
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <p className="sub">Templates com título (push/in-app), SpinText e variáveis</p>
        <div className="acoes">
          <button className="botao" onClick={() => tentar(() => crm.modelosProntos(), (r) => r.adicionados ? `${r.adicionados} modelos adicionados.` : r.aviso).then(recarregar)}><Package size={14} /> Modelos prontos</button>
          <button className="botao primario" onClick={() => setEditando("novo")}><Plus size={14} /> Novo Template</button>
        </div>
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !dados.templates.length && <Cartao><p className="vazio"><FileText size={18} /> Nenhum template criado. Crie seu primeiro template de mensagem.</p></Cartao>}
      {dados?.templates.map((t) => {
        const vars = extractVariables(t.content);
        return (
          <Cartao key={t.id}>
            <div className="linha-filtro">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p><strong>{t.name}</strong> <span className={`selo ${t.is_active ? "ok" : ""}`}>{t.is_active ? "Ativo" : "Inativo"}</span> <span className="selo alerta">{CATEGORIAS.find((c) => c.value === t.category)?.label ?? t.category}</span></p>
                {t.title && <p><strong>{t.title}</strong></p>}
                <p className="sub" style={{ whiteSpace: "pre-wrap" }}>{t.content.length > 220 ? `${t.content.slice(0, 220)}…` : t.content}</p>
                {vars.length > 0 && <div className="periodo">{vars.map((v) => <code key={v}>{`{{${v}}}`}</code>)}</div>}
              </div>
              <div className="acoes">
                <button className="icone" title={t.is_active ? "Desativar" : "Ativar"} onClick={() => tentar(() => crm.ligarTemplate(t.id)).then(recarregar)}>{t.is_active ? <Check size={14} /> : <X size={14} />}</button>
                <button className="icone" title="Editar" onClick={() => setEditando(t)}><Edit3 size={14} /></button>
                <button className="icone" title="Excluir" onClick={() => confirm("Excluir este template?") && tentar(() => crm.apagarTemplate(t.id)).then(recarregar)}><Trash2 size={14} /></button>
              </div>
            </div>
          </Cartao>
        );
      })}
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando && editando !== "novo" ? "Editar Template" : "Novo Template"} larga>
        {editando && <Formulario inicial={editando === "novo" ? null : editando} emojis={emojis} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
    </div>
  );
}

function Formulario({ inicial, emojis, onSalvo }: { inicial: TemplateCrm | null; emojis: boolean; onSalvo: () => void }) {
  const [t, setT] = useState({
    name: inicial?.name ?? "", category: inicial?.category ?? "custom", content: inicial?.content ?? "", title: inicial?.title ?? "",
    image_url: inicial?.image_url ?? "", button_text: inicial?.button_text ?? "", button_link: inicial?.button_link ?? "",
    variant_b_content: inicial?.variant_b_content ?? "", ab_split_ratio: String(inicial?.ab_split_ratio ?? 50), wa_optout_footer: !!inicial?.wa_optout_footer,
  });
  const [ab, setAb] = useState(!!inicial?.variant_b_content);
  const [previa, setPrevia] = useState("");
  const [emojiAberto, setEmojiAberto] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const { tentar, caixa } = useRetorno();
  const mudar = (p: Partial<typeof t>) => setT((x) => ({ ...x, ...p }));
  const vars = extractVariables(t.content);

  const salvar = async () => {
    setOcupado(true);
    const corpo = { ...t, variant_b_content: ab ? t.variant_b_content : "", ab_split_ratio: Number.parseInt(t.ab_split_ratio, 10) };
    const r = await tentar(() => crm.salvarTemplate(inicial?.id ?? null, corpo));
    setOcupado(false);
    if (r) onSalvo();
  };

  return (
    <div className="pilha">
      {caixa}
      {!inicial && (
        <label>Começar de um modelo pronto
          <select defaultValue="" onChange={(e) => { const p = MODELOS_TEMPLATE.find((x) => x.key === e.target.value); if (p) mudar({ name: p.name, category: p.category, title: p.title, content: p.content }); }}>
            <option value="">Em branco</option>
            {MODELOS_TEMPLATE.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label>Nome do Template<input value={t.name} onChange={(e) => mudar({ name: e.target.value })} placeholder="Ex: Aviso de Vencimento - Mensal" /></label>
      <label>Categoria
        <select value={t.category} onChange={(e) => mudar({ category: e.target.value })}>{CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
      </label>
      <label>Título (push e in-app) <small className={t.title.length > 40 ? "erro" : "sub"}>{t.title.length}/40</small>
        <input value={t.title} onChange={(e) => mudar({ title: e.target.value })} placeholder="Ex: Sentimos sua falta, {{nome}}" />
      </label>
      <div>
        <div className="linha-filtro">
          <strong>Conteúdo da Mensagem <small className="sub">{t.content.length}/255 no push</small></strong>
          <div className="acoes">
            {emojis && <button className={emojiAberto ? "botao primario" : "botao"} onClick={() => setEmojiAberto((v) => !v)}><Smile size={14} /> Emojis</button>}
            <button className="botao" disabled={!t.content.trim()} onClick={() => tentar(() => crm.spintextIa(t.content)).then((r) => r && mudar({ content: r.spintext }))}><Wand2 size={14} /> Corrigir com IA + SpinText</button>
          </div>
        </div>
        {emojis && emojiAberto && (
          <div className="cartao" style={{ margin: "8px 0" }}>
            <div className="periodo">{EMOJI_CATEGORIES.map((c, i) => <button key={c.id} type="button" title={c.label} className={emojiCat === i ? "chip ativo" : "chip"} onClick={() => setEmojiCat(i)}>{c.icon}</button>)}</div>
            <p className="sub">{EMOJI_CATEGORIES[emojiCat]?.label}</p>
            <div className="periodo" style={{ maxHeight: 170, overflow: "auto" }}>{EMOJI_CATEGORIES[emojiCat]?.emojis.map((e, i) => <button key={i} type="button" className="chip" onClick={() => mudar({ content: t.content + e })}>{e}</button>)}</div>
          </div>
        )}
        <textarea rows={6} value={t.content} onChange={(e) => mudar({ content: e.target.value })} style={{ width: "100%", fontFamily: "monospace" }} placeholder="Ex: {Ola|Oi|Opa} {{nome}} seu pedido {chegou|saiu para entrega}." />
        <p className="sub">Use <code>{"{opcao1|opcao2}"}</code> para SpinText e <code>{"{{variavel}}"}</code> para variáveis dinâmicas.</p>
        <div className="periodo">{VARIAVEIS_TEMPLATE.map((v) => <button key={v.key} type="button" className="chip" title={v.label} onClick={() => mudar({ content: `${t.content}{{${v.key}}}` })}>{`{{${v.key}}}`}</button>)}</div>
      </div>
      <div className="grade">
        <label>Imagem do in-app (URL, opcional)<input value={t.image_url} onChange={(e) => mudar({ image_url: e.target.value })} placeholder="https://..." /></label>
        <label>Texto do botão (até 20)<input value={t.button_text} maxLength={20} onChange={(e) => mudar({ button_text: e.target.value })} placeholder="Ex: Pedir agora" /></label>
        <label>Link do botão<input value={t.button_link} onChange={(e) => mudar({ button_link: e.target.value })} placeholder="https://..." /></label>
      </div>
      {vars.length > 0 && <div><strong>Variáveis Detectadas</strong><div className="periodo">{vars.map((v) => <code key={v}>{`{{${v}}}`}</code>)}</div></div>}
      <div>
        <div className="linha-filtro"><strong>Pré-visualização</strong>
          <button className="botao" disabled={!t.content.trim()} onClick={() => tentar(() => crm.previaTemplate({ content: t.content, title: t.title, wa_optout_footer: t.wa_optout_footer })).then((r) => r && setPrevia(r.previa))}><Eye size={14} /> Gerar Pré-visualização</button>
        </div>
        {previa && <div className="cartao" style={{ whiteSpace: "pre-wrap" }}>{previa}</div>}
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={t.wa_optout_footer} onChange={(e) => mudar({ wa_optout_footer: e.target.checked })} />
        <span><strong>WhatsApp: adicionar opção para não receber mais mensagens</strong><br /><small className="sub">Quando a campanha sai pelo WhatsApp, acrescenta no fim: "{WA_OPTOUT_FOOTER.replace(/\*/g, "")}"</small></span>
      </label>
      <div>
        <button className="botao" onClick={() => setAb((v) => !v)}><ChevronRight size={14} style={{ transform: ab ? "rotate(90deg)" : undefined }} /> Teste A/B (variação de mensagem)</button>
        {ab && (
          <div className="pilha">
            <label>Mensagem B (variação)<textarea rows={4} value={t.variant_b_content} onChange={(e) => mudar({ variant_b_content: e.target.value })} style={{ width: "100%", fontFamily: "monospace" }} placeholder="Segunda versão da mensagem para dividir o lote e medir conversão" /></label>
            <label>Percentual para variação B ({t.ab_split_ratio}%)<input type="range" min="0" max="100" step="10" value={t.ab_split_ratio} onChange={(e) => mudar({ ab_split_ratio: e.target.value })} /></label>
            <p className="sub">{Number.parseInt(t.ab_split_ratio, 10) || 0}% dos disparos receberão a Mensagem B, o restante a Mensagem A.</p>
          </div>
        )}
      </div>
      <div className="aviso"><Shield size={14} /> <strong>Conformidade LGPD.</strong> Contatos com opt-out ativo nunca recebem mensagens. O sistema adiciona automaticamente instruções de descadastro quando o canal é WhatsApp. Mantenha mensagens concisas e relevantes para evitar excesso de disparos por passageiro.</div>
      <div className="acoes">
        <button className="botao primario" disabled={ocupado || !t.name.trim() || !t.content.trim()} onClick={salvar}><Check size={14} /> {inicial ? "Salvar" : "Criar Template"}</button>
        <button className="botao" onClick={onSalvo}>Cancelar</button>
      </div>
    </div>
  );
}
