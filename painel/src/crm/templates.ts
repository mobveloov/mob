// Templates de mensagem do CRM (portado do mobveloov: tabela crm_templates) e descadastros do WhatsApp
// (tabela crm_descadastros). Tudo no banco do painel, por empresa.

import crypto from "node:crypto";
import { banco } from "../servidor/banco.ts";
import { CATEGORIAS, MODELOS_TEMPLATE } from "./catalogo.ts";
import { waOptOutKey } from "./optout.ts";
import { extractVariables, validateSpinText } from "./spintext.ts";

export interface Template {
  id: string;
  name: string;
  category: string;
  title: string | null;
  content: string;
  variables: string[];
  is_active: boolean;
  image_url: string | null;
  button_text: string | null;
  button_link: string | null;
  variant_b_content: string | null;
  ab_split_ratio: number;
  wa_optout_footer: boolean;
  created_at: string;
}

const linha = (r: unknown) => JSON.parse((r as { dados: string }).dados) as Template;

export const templates = (e: string): Template[] =>
  (banco().prepare("SELECT dados FROM crm_templates WHERE empresa = ? ORDER BY seq DESC").all(e) as unknown[]).map(linha);

export function template(e: string, id: string): Template | null {
  const r = banco().prepare("SELECT dados FROM crm_templates WHERE empresa = ? AND id = ?").get(e, id);
  return r ? linha(r) : null;
}

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const ou = (v: unknown, max: number) => txt(v, max) || null;

/** Confere e normaliza o que veio da tela. Mensagens de erro iguais às do mobveloov. */
export function sanearTemplate(corpo: Record<string, unknown>): Omit<Template, "id" | "created_at"> {
  const name = txt(corpo.name, 120);
  const content = txt(corpo.content, 4000);
  if (!name || !content) throw new Error("Nome e conteúdo são obrigatórios");
  const title = ou(corpo.title, 120);
  if (title && title.length > 40) throw new Error("Título com mais de 40 caracteres.");
  const bt = ou(corpo.button_text, 20), bl = ou(corpo.button_link, 500);
  if ((bt && !bl) || (!bt && bl)) throw new Error("O botão do in-app precisa de texto e link juntos.");
  if (bl && !/^https?:\/\//i.test(bl)) throw new Error("O link do botão precisa começar com http:// ou https://.");
  const img = ou(corpo.image_url, 500);
  if (img && !/^https?:\/\//i.test(img)) throw new Error("A imagem precisa ser um endereço http:// ou https://.");
  const v = validateSpinText(content);
  if (!v.valid) throw new Error(v.errors.join(" "));
  const b = ou(corpo.variant_b_content, 4000);
  if (b) { const vb = validateSpinText(b); if (!vb.valid) throw new Error("Mensagem B: " + vb.errors.join(" ")); }
  const categoria = CATEGORIAS.some((c) => c.value === corpo.category) ? String(corpo.category) : "custom";
  const razao = Number.parseInt(String(corpo.ab_split_ratio ?? 50), 10);
  return {
    name, category: categoria, title, content, variables: extractVariables(content), is_active: corpo.is_active !== false,
    image_url: img, button_text: bt && bl ? bt : null, button_link: bt && bl ? bl : null,
    variant_b_content: b, ab_split_ratio: b ? (Number.isNaN(razao) ? 50 : Math.min(100, Math.max(0, razao))) : 0,
    wa_optout_footer: corpo.wa_optout_footer === true,
  };
}

export function salvarTemplate(e: string, id: string | null, dados: Omit<Template, "id" | "created_at">): Template {
  if (id) {
    const atual = template(e, id);
    if (!atual) throw new Error("Template não encontrado.");
    const novo: Template = { ...atual, ...dados };
    banco().prepare("UPDATE crm_templates SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(novo), e, id);
    return novo;
  }
  const novo: Template = { id: crypto.randomUUID().slice(0, 8), created_at: new Date().toISOString(), ...dados };
  banco().prepare("INSERT INTO crm_templates (empresa, id, dados) VALUES (?, ?, ?)").run(e, novo.id, JSON.stringify(novo));
  return novo;
}

export function ligarTemplate(e: string, id: string): Template {
  const t = template(e, id);
  if (!t) throw new Error("Template não encontrado.");
  return salvarTemplate(e, id, { ...t, is_active: !t.is_active });
}

export const apagarTemplate = (e: string, id: string) => banco().prepare("DELETE FROM crm_templates WHERE empresa = ? AND id = ?").run(e, id).changes > 0;

/** "Modelos prontos": acrescenta os que ainda não estão na lista (pelo nome). Devolve quantos entraram. */
export function adicionarModelos(e: string): number {
  const ja = new Set(templates(e).map((t) => t.name));
  let n = 0;
  for (const m of [...MODELOS_TEMPLATE].reverse()) {
    if (ja.has(m.name)) continue;
    salvarTemplate(e, null, { name: m.name, category: m.category, title: m.title, content: m.content, variables: extractVariables(m.content), is_active: true, image_url: null, button_text: null, button_link: null, variant_b_content: null, ab_split_ratio: 0, wa_optout_footer: false });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ descadastros do WhatsApp

export interface Descadastro {
  chave: string; estado: "descadastrado" | "autorizado"; nome: string; telefone: string; origem: string; texto: string;
  em: string; por: string; autorizacao: string; reativado_em: string | null; reativado_por: string;
}

export const descadastros = (e: string): Descadastro[] =>
  banco().prepare("SELECT chave, estado, nome, telefone, origem, texto, em, por, autorizacao, reativado_em, reativado_por FROM crm_descadastros WHERE empresa = ? ORDER BY em DESC").all(e) as unknown as Descadastro[];

/** Chaves (DDD + 8 dígitos) de quem não quer receber WhatsApp do CRM. */
export function chavesDescadastradas(e: string): Set<string> {
  return new Set((banco().prepare("SELECT chave FROM crm_descadastros WHERE empresa = ? AND estado = 'descadastrado'").all(e) as Array<{ chave: string }>).map((r) => r.chave));
}

export const estaDescadastrado = (e: string, telefone: string) => {
  const k = waOptOutKey(telefone);
  return !!k && chavesDescadastradas(e).has(k);
};

export const ORIGENS_DESCADASTRO = ["resposta", "atendente", "conversas"];

export function descadastrar(e: string, p: { telefone: string; nome?: string; origem: string; texto?: string; por?: string }): boolean {
  const chave = waOptOutKey(p.telefone);
  if (!chave) return false;
  banco().prepare(`INSERT INTO crm_descadastros (empresa, chave, estado, nome, telefone, origem, texto, em, por) VALUES (?, ?, 'descadastrado', ?, ?, ?, ?, ?, ?)
    ON CONFLICT (empresa, chave) DO UPDATE SET estado = 'descadastrado', nome = excluded.nome, telefone = excluded.telefone, origem = excluded.origem, texto = excluded.texto, em = excluded.em, por = excluded.por, autorizacao = '', reativado_em = NULL, reativado_por = ''`)
    .run(e, chave, txt(p.nome, 120), p.telefone.replace(/\D/g, ""), p.origem, txt(p.texto, 500), new Date().toISOString(), p.por ?? "");
  return true;
}

/** Volta a receber, só com a descrição de como o passageiro autorizou. */
export function reativar(e: string, telefone: string, autorizacao: string, por = ""): boolean {
  const chave = waOptOutKey(telefone);
  if (!chave) return false;
  return banco().prepare("UPDATE crm_descadastros SET estado = 'autorizado', reativado_em = ?, reativado_por = ?, autorizacao = ? WHERE empresa = ? AND chave = ? AND estado = 'descadastrado'")
    .run(new Date().toISOString(), por, txt(autorizacao, 500), e, chave).changes > 0;
}
