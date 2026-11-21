// Config › Personalização app motorista (item nosso, fora da Machine, que só personaliza o app do passageiro).
// Mesmo jeito da do passageiro: nome, cor principal, tema, veículo no mapa, logo no topo, estilo e recursos da tela do mapa.
// Fica em config/personalizacao-motorista.json; o app lê por GET /api/apps/<empresa>/personalizacao-motorista.

import crypto from "node:crypto";
import fs from "node:fs";
import * as D from "../servidor/dados.ts";
import { marca } from "../servidor/dados.ts";
import { TIPO_VEICULO, VEICULOS_MAPA, type VeiculoMapa } from "../comum/icone-carro.ts";
import { gravarConfig, lerConfig, texto, umDe } from "./armazem.ts";
import { ajustarCor, CORES_PRINCIPAIS, ESTILOS_TELA, luminosidade, MAX_IMAGEM_MARCA } from "./personalizacao.ts";

export const TEMAS = ["sistema", "claro", "escuro"] as const;
/** Logo no canto superior esquerdo: só o nome (iniciais) ou a imagem redonda de 52 x 52. */
export const MARCAS_MOTORISTA = ["texto", "imagem"] as const;
/** Recursos da tela do mapa. Os dois fixos nunca saem da tela. */
export const RECURSOS_MOTORISTA = ["saldo", "notificacoes", "ajuda", "tema", "centralizar", "preferencias", "macaneta", "iniciar", "rodape"] as const;
export const RECURSOS_FIXOS: readonly string[] = ["iniciar", "rodape"];
export type IdRecursoMotorista = (typeof RECURSOS_MOTORISTA)[number];
const ARQUIVO = /^personalizacaoMarcaMotorista\.(png|jpg)$/;

export interface PersonalizacaoMotorista {
  nome: string; corPrincipal: string; tema: (typeof TEMAS)[number]; veiculoMapa: VeiculoMapa; marca: (typeof MARCAS_MOTORISTA)[number]; imagemMarca: string;
  estiloTela: (typeof ESTILOS_TELA)[number]; recursos: Array<{ id: IdRecursoMotorista; visivel: boolean }>;
}
export interface PersonalizacaoMotoristaVista extends PersonalizacaoMotorista { imagemMarcaUrl: string }

export function sanearPersonalizacaoMotorista(e: unknown, nomePadrao = "", corPadrao = "#2563eb"): PersonalizacaoMotorista {
  const o = (e ?? {}) as Record<string, unknown>;
  const cor = texto(o.corPrincipal, 9);
  const pedidos = new Map<string, boolean>();
  if (Array.isArray(o.recursos)) for (const r of o.recursos as Array<Record<string, unknown>>) if (r && RECURSOS_MOTORISTA.includes(r.id as IdRecursoMotorista)) pedidos.set(String(r.id), r.visivel !== false && r.visivel !== "false");
  return {
    nome: texto(o.nome, 60) || nomePadrao, corPrincipal: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toLowerCase() : corPadrao,
    tema: umDe(o.tema, TEMAS, "sistema"), veiculoMapa: umDe(o.veiculoMapa, VEICULOS_MAPA, "realista"), marca: umDe(o.marca, MARCAS_MOTORISTA, "texto"),
    imagemMarca: typeof o.imagemMarca === "string" && ARQUIVO.test(o.imagemMarca) ? o.imagemMarca : "", estiloTela: umDe(o.estiloTela, ESTILOS_TELA, "flutuante"),
    recursos: RECURSOS_MOTORISTA.map((id) => ({ id, visivel: RECURSOS_FIXOS.includes(id) ? true : pedidos.get(id) ?? true })),
  };
}

function urlDaImagem(empresaId: string, nome: string): string {
  const a = nome ? D.caminhoImagem(empresaId, nome) : null;
  return a ? `/api/publico/arquivo/${empresaId}/${nome}?v=${Math.round(fs.statSync(a.arquivo).mtimeMs)}` : "";
}
function ler(empresaId: string): PersonalizacaoMotorista {
  const m = marca(empresaId);
  const p = sanearPersonalizacaoMotorista(lerConfig(empresaId, "personalizacao-motorista", {}), m.nomeExibido, m.cores.primaria);
  if (p.imagemMarca && !D.caminhoImagem(empresaId, p.imagemMarca)) p.imagemMarca = "";
  return p;
}
const vista = (empresaId: string, p: PersonalizacaoMotorista): PersonalizacaoMotoristaVista => ({ ...p, imagemMarcaUrl: urlDaImagem(empresaId, p.imagemMarca) });

export const personalizacaoMotorista = (empresaId: string) => vista(empresaId, ler(empresaId));

export function salvarPersonalizacaoMotorista(empresaId: string, entrada: unknown): PersonalizacaoMotoristaVista {
  const m = marca(empresaId);
  const o = (entrada ?? {}) as Record<string, unknown>;
  if (!texto(o.nome, 60)) throw new Error("Insira um nome.");
  const novo = sanearPersonalizacaoMotorista({ ...o, imagemMarca: ler(empresaId).imagemMarca }, m.nomeExibido, m.cores.primaria); // a imagem só muda pelo envio
  if (novo.marca === "imagem" && !novo.imagemMarca) throw new Error("Envie uma imagem para salvar as alterações.");
  gravarConfig(empresaId, "personalizacao-motorista", novo);
  return vista(empresaId, novo);
}

export function enviarImagemMarcaMotorista(empresaId: string, mime: string, bytes: Uint8Array): PersonalizacaoMotoristaVista {
  if (!bytes.length || (mime !== "image/png" && mime !== "image/jpeg")) throw new Error("Envie uma imagem em formato PNG ou JPG.");
  const nome = D.salvarImagem(empresaId, "personalizacaoMarcaMotorista", mime, bytes, MAX_IMAGEM_MARCA);
  const novo = { ...ler(empresaId), imagemMarca: nome };
  gravarConfig(empresaId, "personalizacao-motorista", novo);
  return vista(empresaId, novo);
}

export function removerImagemMarcaMotorista(empresaId: string): PersonalizacaoMotoristaVista {
  const atual = ler(empresaId);
  if (atual.imagemMarca) D.apagarImagem(empresaId, atual.imagemMarca);
  const novo = { ...atual, imagemMarca: "", marca: "texto" as const };
  gravarConfig(empresaId, "personalizacao-motorista", novo);
  return vista(empresaId, novo);
}

/** O que o app do motorista lê: tudo normalizado, com padrão, e imagens por URL. */
export function dadosParaOAppMotorista(empresaId: string) {
  const m = marca(empresaId);
  const p = ler(empresaId), v = vista(empresaId, p);
  const arq = (n: string) => (n ? `/api/publico/arquivo/${empresaId}/${n}?v=${encodeURIComponent(D.versaoImagem(empresaId, n) || n)}` : "");
  const base = `/api/apps/${empresaId}/personalizacao/icone/${p.veiculoMapa}`;
  const dados = {
    empresa: { id: empresaId, nome: p.nome, nomeExibido: m.nomeExibido, logoClaro: arq(m.arquivos.logoClaro), logoEscuro: arq(m.arquivos.logoEscuro), icone: arq(m.arquivos.iconeApp || m.arquivos.favicon) },
    cores: { principal: p.corPrincipal, textoSobrePrincipal: luminosidade(p.corPrincipal) > 0.6 ? "#111827" : "#ffffff", escura: ajustarCor(p.corPrincipal, 0.7), clara: ajustarCor(p.corPrincipal, 1.85), paleta: CORES_PRINCIPAIS },
    tema: p.tema,
    design: { estiloTela: p.estiloTela, marca: p.marca, mostrarNome: p.marca === "texto", mostrarImagem: p.marca === "imagem" && !!v.imagemMarcaUrl, imagemMarcaUrl: v.imagemMarcaUrl, dimensoesImagem: p.marca === "imagem" ? { largura: 52, altura: 52 } : null },
    veiculoMapa: { id: p.veiculoMapa, tipo: TIPO_VEICULO[p.veiculoMapa], iconeLivreUrl: `${base}/livre.svg`, iconeOcupadoUrl: `${base}/ocupado.svg`, diferenciaOcupado: p.veiculoMapa !== "realista" },
    recursos: Object.fromEntries(p.recursos.map((r) => [r.id, r.visivel])) as Record<IdRecursoMotorista, boolean>,
  };
  return { versao: crypto.createHash("sha1").update(JSON.stringify(dados)).digest("hex").slice(0, 12), ...dados };
}
