// Ajuda › Central de Ajuda: tutoriais (vídeo), dúvidas frequentes e contato com a matriz. Cada empresa cadastra os seus.

import { gravarConfig, lerConfig, lista, novoId, texto, umDe } from "./armazem.ts";

export interface Tutorial { id: string; titulo: string; descricao: string; origem: "youtube" | "loom" | "link"; codigo: string }
export interface Duvida { id: string; pergunta: string; resposta: string }
export interface Ajuda { tutoriais: Tutorial[]; duvidas: Duvida[]; contato: { nome: string; whatsapp: string; email: string } }

export const AJUDA_PADRAO: Ajuda = {
  tutoriais: [],
  duvidas: [
    { id: "d1", pergunta: "Como ativar o cadastro de um motorista?", resposta: "Abra Cadastro > Motoristas, escolha o motorista e mude a situação para Ativo depois de conferir os documentos." },
    { id: "d2", pergunta: "Como criar uma categoria e definir a comissão da central?", resposta: "Em Config > Categorias, clique em Criar categoria, preencha as tarifas e, na aba Comissão, escolha Percentual ou Valor fixo." },
    { id: "d3", pergunta: "Como cobrar mais caro em horário de pico?", resposta: "Crie uma regra em Config > Tarifas Dinâmicas e ligue-a na aba Dinâmica da categoria." },
    { id: "d4", pergunta: "Como pagar um saque de motorista?", resposta: "Em Financeiro > Saques, confira a chave Pix, faça o pagamento e clique em Pagar." },
  ],
  contato: { nome: "", whatsapp: "", email: "" },
};

/** Extrai o código do vídeo de um link do YouTube ou Loom (só letras, números, _ e -). */
export function codigoDoVideo(origem: string, entrada: string): string {
  const s = entrada.trim();
  if (origem === "youtube") { const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/) ?? s.match(/^([\w-]{6,20})$/); return m?.[1] ?? ""; }
  if (origem === "loom") { const m = s.match(/(?:share|embed)\/([a-f0-9]{16,40})/i) ?? s.match(/^([a-f0-9]{16,40})$/i); return m?.[1] ?? ""; }
  return /^https?:\/\//i.test(s) ? s.slice(0, 400) : "";
}

export function sanearAjuda(e: unknown, atual: Ajuda = AJUDA_PADRAO): Ajuda {
  const o = (e ?? {}) as Record<string, unknown>;
  const c = { ...atual.contato, ...((o.contato as object) ?? {}) } as Record<string, unknown>;
  const tutoriais = (Array.isArray(o.tutoriais) ? o.tutoriais : atual.tutoriais).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>;
    const origem = umDe(x.origem, ["youtube", "loom", "link"] as const, "youtube");
    return { id: texto(x.id, 20) || novoId(), titulo: texto(x.titulo, 120), descricao: texto(x.descricao, 600), origem, codigo: codigoDoVideo(origem, String(x.codigo ?? "")) };
  }).filter((t) => t.titulo && t.codigo).slice(0, 100);
  const duvidas = (Array.isArray(o.duvidas) ? o.duvidas : atual.duvidas).map((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return { id: texto(x.id, 20) || novoId(), pergunta: texto(x.pergunta, 160), resposta: texto(x.resposta, 1500) };
  }).filter((d) => d.pergunta && d.resposta).slice(0, 200);
  return {
    tutoriais, duvidas,
    contato: { nome: texto(c.nome, 80), whatsapp: texto(c.whatsapp, 20).replace(/[^\d+]/g, ""), email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto(c.email, 120)) ? texto(c.email, 120) : "" },
  };
}
export const ajuda = (empresaId: string): Ajuda => {
  const bruto = lerConfig<Partial<Ajuda>>(empresaId, "ajuda", {});
  return sanearAjuda({ ...bruto, duvidas: bruto.duvidas ?? AJUDA_PADRAO.duvidas }, AJUDA_PADRAO);
};
export function salvarAjuda(empresaId: string, entrada: unknown): Ajuda {
  const a = sanearAjuda(entrada, ajuda(empresaId));
  gravarConfig(empresaId, "ajuda", a);
  return a;
}
export { lista };
