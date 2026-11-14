// Config › Personalização app passageiro (Machine): nome, cor principal, veículo no mapa, marca na tela inicial,
// estilo da tela e recursos (ordem e visibilidade). Fica em config/personalizacao.json; o app lê por configDosApps.

import { marca } from "../servidor/dados.ts";
import { gravarConfig, lerConfig, lista, texto, umDe } from "./armazem.ts";

export const VEICULOS_MAPA = ["realista", "moderno", "classico"] as const;
export const MARCAS_TELA = ["nome", "imagem", "nome_imagem"] as const;
export const ESTILOS_TELA = ["flutuante", "neutro", "marcante"] as const;
export const RECURSOS = ["mapa", "destino", "cupons", "anuncio", "desafio"] as const;
export type IdRecurso = (typeof RECURSOS)[number];
export const MAX_IMAGEM_MARCA = 700_000;

export interface Personalizacao {
  nome: string; corPrincipal: string; veiculoMapa: (typeof VEICULOS_MAPA)[number];
  marca: (typeof MARCAS_TELA)[number]; imagemMarca: string; estiloTela: (typeof ESTILOS_TELA)[number];
  recursos: Array<{ id: IdRecurso; visivel: boolean }>;
}

const RECURSOS_PADRAO: Personalizacao["recursos"] = [{ id: "mapa", visivel: true }, { id: "destino", visivel: true }, { id: "cupons", visivel: false }, { id: "anuncio", visivel: true }, { id: "desafio", visivel: false }];

export function sanearPersonalizacao(e: unknown, nomePadrao = "", corPadrao = "#2563eb"): Personalizacao {
  const o = (e ?? {}) as Record<string, unknown>;
  const cor = texto(o.corPrincipal, 9);
  const imagem = typeof o.imagemMarca === "string" ? o.imagemMarca : "";
  if (imagem && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(imagem) || imagem.length > MAX_IMAGEM_MARCA)) throw new Error("Envie uma imagem PNG ou JPG de até 500 KB.");
  const estiloTela = umDe(o.estiloTela, ESTILOS_TELA, "flutuante");
  // Ordem pedida primeiro; o que faltar entra no fim. Desafio só existe quando há desafio para clientes (fica bloqueado aqui).
  const pedidos = lista(o.recursos).map((r) => r as Record<string, unknown>).filter((r) => RECURSOS.includes(r?.id as IdRecurso));
  const vistos = new Set<string>();
  const ordem: Personalizacao["recursos"] = [];
  for (const r of pedidos) { if (!vistos.has(String(r.id))) { vistos.add(String(r.id)); ordem.push({ id: r.id as IdRecurso, visivel: r.visivel !== false && r.visivel !== "false" }); } }
  for (const r of RECURSOS_PADRAO) if (!vistos.has(r.id)) ordem.push({ ...r });
  // O mapa não pode ser ocultado nem reordenado no estilo Flutuante.
  const recursos = ordem.map((r) => (r.id === "desafio" ? { ...r, visivel: false } : r));
  if (estiloTela === "flutuante") { const i = recursos.findIndex((r) => r.id === "mapa"); const [m] = recursos.splice(i, 1); recursos.unshift({ ...m, visivel: true }); }
  return {
    nome: texto(o.nome, 40) || nomePadrao, corPrincipal: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toLowerCase() : corPadrao,
    veiculoMapa: umDe(o.veiculoMapa, VEICULOS_MAPA, "realista"), marca: umDe(o.marca, MARCAS_TELA, "nome"), imagemMarca: imagem, estiloTela, recursos,
  };
}

export function personalizacao(empresaId: string): Personalizacao {
  const m = marca(empresaId);
  return sanearPersonalizacao(lerConfig(empresaId, "personalizacao", {}), m.nomeExibido, m.cores.primaria);
}
export function salvarPersonalizacao(empresaId: string, entrada: unknown): Personalizacao {
  const m = marca(empresaId);
  const novo = sanearPersonalizacao(entrada, m.nomeExibido, m.cores.primaria);
  gravarConfig(empresaId, "personalizacao", novo);
  return novo;
}
