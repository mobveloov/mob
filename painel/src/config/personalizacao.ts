// Config › Personalização app passageiro (Machine): nome, cor principal, veículo no mapa, marca na tela inicial,
// estilo da tela e recursos (ordem e visibilidade). Fica em config/personalizacao.json.
// Os apps leem por GET /api/apps/<empresa>/personalizacao (dadosParaOApp): tudo normalizado, com valores padrão e imagens por URL.
// A Machine não tem personalização própria do app do motorista (só "Personalização app passageiro"): não há versão do motorista.

import crypto from "node:crypto";
import fs from "node:fs";
import * as D from "../servidor/dados.ts";
import { marca } from "../servidor/dados.ts";
import { VEICULOS_MAPA, TIPO_VEICULO, type VeiculoMapa } from "../comum/icone-carro.ts";
import { gravarConfig, lerConfig, lista, texto, umDe } from "./armazem.ts";

export { VEICULOS_MAPA };
export const MARCAS_TELA = ["texto", "imagem", "texto_imagem", "imagem_alongada"] as const;
export const ESTILOS_TELA = ["flutuante", "neutro", "marcante"] as const;
export const RECURSOS = ["mapa", "selecao_destino", "aviso_cupons", "anuncio", "desafio"] as const;
export type IdRecurso = (typeof RECURSOS)[number];
export type MarcaTela = (typeof MARCAS_TELA)[number];
export const MAX_IMAGEM_MARCA = 5 * 1024 * 1024;
/** Tamanho pedido da imagem da marca em cada modo (a Machine pede 184 x 52 na alongada). */
export const DIMENSOES_MARCA: Record<MarcaTela, { largura: number; altura: number } | null> = {
  texto: null, imagem: { largura: 52, altura: 52 }, texto_imagem: { largura: 52, altura: 52 }, imagem_alongada: { largura: 184, altura: 52 },
};
/** As 36 cores da paleta da Machine (a cor principal se escolhe nesta grade). */
export const CORES_PRINCIPAIS = [
  "#404857", "#2c2c2c", "#000000", "#13d1fe", "#00c0d9", "#2b7aff", "#3463b4", "#297188", "#0c6094", "#102b5e", "#00b1b3", "#04d7b1",
  "#0ed872", "#8bc34a", "#02a862", "#59835d", "#007068", "#ffc400", "#e8a73a", "#f2c869", "#ff9c1b", "#ff7000", "#e48d4e", "#ff7a64",
  "#ff9294", "#ff6ba9", "#8a7bfc", "#7148cc", "#8b2ec6", "#dc256c", "#ff355a", "#e14f54", "#ce3345", "#bb1d44", "#951329", "#e72f49",
];

export interface Personalizacao {
  nome: string; corPrincipal: string; veiculoMapa: VeiculoMapa;
  /** nome do arquivo da imagem (vazio = sem imagem) */ marca: MarcaTela; imagemMarca: string; estiloTela: (typeof ESTILOS_TELA)[number];
  recursos: Array<{ id: IdRecurso; visivel: boolean }>;
}
export interface PersonalizacaoVista extends Personalizacao { imagemMarcaUrl: string; desafioLiberado: boolean }

const RECURSOS_PADRAO: Personalizacao["recursos"] = [{ id: "mapa", visivel: true }, { id: "selecao_destino", visivel: true }, { id: "aviso_cupons", visivel: false }, { id: "anuncio", visivel: true }, { id: "desafio", visivel: false }];
const RECURSOS_ANTIGOS: Record<string, string> = { destino: "selecao_destino", cupons: "aviso_cupons" }; // nomes de antes
const MARCAS_ANTIGAS: Record<string, MarcaTela> = { nome: "texto", nome_imagem: "texto_imagem" };

/** Desafio de cliente liberado? Hoje não existe desafio para clientes aqui (Cadastro > Desafios > Clientes), então fica bloqueado. */
export const desafioLiberado = (_empresaId: string) => false;

export function sanearPersonalizacao(e: unknown, nomePadrao = "", corPadrao = "#2563eb", liberaDesafio = false): Personalizacao {
  const o = (e ?? {}) as Record<string, unknown>;
  const cor = texto(o.corPrincipal, 9);
  const arq = typeof o.imagemMarca === "string" && /^personalizacaoMarca\.(png|jpg)$/.test(o.imagemMarca) ? o.imagemMarca : "";
  const estiloTela = umDe(o.estiloTela, ESTILOS_TELA, "flutuante");
  // Ordem pedida primeiro; o que faltar entra no fim. Desafio só existe quando há desafio para clientes (fica bloqueado aqui).
  const pedidos = lista(o.recursos).map((r) => { const x = { ...(r as Record<string, unknown>) }; x.id = RECURSOS_ANTIGOS[String(x.id)] ?? x.id; return x; }).filter((r) => RECURSOS.includes(r?.id as IdRecurso));
  const vistos = new Set<string>();
  const ordem: Personalizacao["recursos"] = [];
  for (const r of pedidos) { if (!vistos.has(String(r.id))) { vistos.add(String(r.id)); ordem.push({ id: r.id as IdRecurso, visivel: r.visivel !== false && r.visivel !== "false" }); } }
  for (const r of RECURSOS_PADRAO) if (!vistos.has(r.id)) ordem.push({ ...r });
  // O mapa não pode ser ocultado nem reordenado no estilo Flutuante.
  const recursos = ordem.map((r) => (r.id === "desafio" && !liberaDesafio ? { ...r, visivel: false } : r));
  if (estiloTela === "flutuante") { const i = recursos.findIndex((r) => r.id === "mapa"); const [m] = recursos.splice(i, 1); recursos.unshift({ ...m, visivel: true }); }
  const marcaPedida = MARCAS_ANTIGAS[String(o.marca)] ?? o.marca;
  return {
    nome: texto(o.nome, 60) || nomePadrao, corPrincipal: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toLowerCase() : corPadrao,
    veiculoMapa: umDe(o.veiculoMapa, VEICULOS_MAPA, "realista"), marca: umDe(marcaPedida, MARCAS_TELA, "texto"), imagemMarca: arq, estiloTela, recursos,
  };
}

function urlDaImagem(empresaId: string, nome: string): string {
  if (!nome) return "";
  const a = D.caminhoImagem(empresaId, nome);
  if (!a) return "";
  return `/api/publico/arquivo/${empresaId}/${nome}?v=${Math.round(fs.statSync(a.arquivo).mtimeMs)}`;
}

/** Converte a imagem antiga (guardada dentro do JSON como data:) em arquivo, uma vez só. */
function migrarImagemAntiga(empresaId: string, bruto: Record<string, unknown>): void {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(bruto.imagemMarca ?? ""));
  if (!m) return;
  try { bruto.imagemMarca = D.salvarImagem(empresaId, "personalizacaoMarca", `image/${m[1]}`, new Uint8Array(Buffer.from(m[2], "base64")), MAX_IMAGEM_MARCA); } catch { bruto.imagemMarca = ""; }
  gravarConfig(empresaId, "personalizacao", bruto);
}

function ler(empresaId: string): Personalizacao {
  const m = marca(empresaId);
  const bruto = lerConfig<Record<string, unknown>>(empresaId, "personalizacao", {});
  migrarImagemAntiga(empresaId, bruto);
  const p = sanearPersonalizacao(bruto, m.nomeExibido, m.cores.primaria, desafioLiberado(empresaId));
  if (p.imagemMarca && !D.caminhoImagem(empresaId, p.imagemMarca)) p.imagemMarca = "";
  return p;
}
const vista = (empresaId: string, p: Personalizacao): PersonalizacaoVista => ({ ...p, imagemMarcaUrl: urlDaImagem(empresaId, p.imagemMarca), desafioLiberado: desafioLiberado(empresaId) });

export const personalizacao = (empresaId: string): PersonalizacaoVista => vista(empresaId, ler(empresaId));

export function salvarPersonalizacao(empresaId: string, entrada: unknown): PersonalizacaoVista {
  const m = marca(empresaId);
  const atual = ler(empresaId);
  const o = (entrada ?? {}) as Record<string, unknown>;
  if (!texto(o.nome, 60)) throw new Error("Insira um nome.");
  const novo = sanearPersonalizacao({ ...o, imagemMarca: atual.imagemMarca }, m.nomeExibido, m.cores.primaria, desafioLiberado(empresaId)); // a imagem só muda pelo envio
  if (novo.marca !== "texto" && !novo.imagemMarca) throw new Error("Envie uma imagem para salvar as alterações.");
  gravarConfig(empresaId, "personalizacao", novo);
  return vista(empresaId, novo);
}

/** Envio da imagem da marca (PNG ou JPG até 5 MB). Vale na hora, como na Machine. */
export function enviarImagemMarca(empresaId: string, mime: string, bytes: Uint8Array): PersonalizacaoVista {
  if (!bytes.length || (mime !== "image/png" && mime !== "image/jpeg")) throw new Error("Envie uma imagem em formato PNG ou JPG.");
  const nome = D.salvarImagem(empresaId, "personalizacaoMarca", mime, bytes, MAX_IMAGEM_MARCA);
  const novo = { ...ler(empresaId), imagemMarca: nome };
  gravarConfig(empresaId, "personalizacao", novo);
  return vista(empresaId, novo);
}

export function removerImagemMarca(empresaId: string): PersonalizacaoVista {
  const atual = ler(empresaId);
  if (atual.imagemMarca) D.apagarImagem(empresaId, atual.imagemMarca);
  const novo = { ...atual, imagemMarca: "", marca: "texto" as MarcaTela }; // sem imagem, volta a mostrar só o nome
  gravarConfig(empresaId, "personalizacao", novo);
  return vista(empresaId, novo);
}

// ------------------------------------------------------------------ o que o app lê

/** Escurece (fator < 1) ou clareia (fator > 1, mistura com branco) uma cor #rrggbb. */
export function ajustarCor(hex: string, fator: number): string {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(fator <= 1 ? v * fator : v + (255 - v) * (fator - 1))));
  return `#${c.map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}
export const luminosidade = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

export function dadosParaOApp(empresaId: string) {
  const m = marca(empresaId);
  const p = ler(empresaId), v = vista(empresaId, p);
  const arq = (n: string) => (n ? `/api/publico/arquivo/${empresaId}/${n}` : "");
  const base = `/api/apps/${empresaId}/personalizacao/icone/${p.veiculoMapa}`;
  const recursos = p.recursos.map((r, i) => ({ id: r.id, visivel: r.visivel, posicao: i + 1 }));
  const visiveis = recursos.filter((r) => r.visivel);
  const sobre = luminosidade(p.corPrincipal) > 0.6 ? "#111827" : "#ffffff";
  const dados = {
    empresa: { id: empresaId, nome: p.nome, nomeExibido: m.nomeExibido, logoClaro: arq(m.arquivos.logoClaro), logoEscuro: arq(m.arquivos.logoEscuro), icone: arq(m.arquivos.iconeApp || m.arquivos.favicon) },
    cores: { principal: p.corPrincipal, textoSobrePrincipal: sobre, escura: ajustarCor(p.corPrincipal, 0.7), clara: ajustarCor(p.corPrincipal, 1.85), paleta: CORES_PRINCIPAIS },
    design: {
      estiloTela: p.estiloTela, marca: p.marca, mostrarNome: p.marca !== "imagem" && p.marca !== "imagem_alongada",
      mostrarImagem: p.marca !== "texto" && !!v.imagemMarcaUrl, imagemMarcaUrl: v.imagemMarcaUrl, dimensoesImagem: DIMENSOES_MARCA[p.marca],
    },
    veiculoMapa: {
      id: p.veiculoMapa, tipo: TIPO_VEICULO[p.veiculoMapa], iconeLivreUrl: `${base}/livre.svg`, iconeOcupadoUrl: `${base}/ocupado.svg`,
      // Realista não diferencia livre de ocupado; no limite de recálculo da rota o Realista vira Moderno.
      diferenciaOcupado: p.veiculoMapa !== "realista", trocaParaModernoNoLimiteDeRecalculo: p.veiculoMapa === "realista",
      iconeAlternativoUrl: `/api/apps/${empresaId}/personalizacao/icone/moderno/livre.svg`,
    },
    telaInicial: { estilo: p.estiloTela, recursos, ordemVisiveis: visiveis.map((r) => r.id), mapaFixo: p.estiloTela === "flutuante" },
    recursos: Object.fromEntries(p.recursos.map((r) => [r.id, r.visivel])) as Record<IdRecurso, boolean>,
    desafioLiberado: desafioLiberado(empresaId),
  };
  const versao = crypto.createHash("sha1").update(JSON.stringify(dados)).digest("hex").slice(0, 12);
  return { versao, ...dados };
}
