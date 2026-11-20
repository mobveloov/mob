// Personalização do app do passageiro (Configurações do painel): o app lê GET /personalizacao ao abrir, a cada minuto e quando volta
// para a tela, e aplica na hora (cores por variável CSS, nome, ícone do carro no mapa, recursos e estilo da tela inicial), sem gerar APK.
// Guarda a última resposta no aparelho para já abrir com as cores certas.

import { useSyncExternalStore } from "react";
import { api, config } from "./api";

export interface PersonalizacaoApp {
  versao: string;
  empresa: { id: string; nome: string; nomeExibido: string; logoClaro: string; logoEscuro: string; icone: string };
  cores: { principal: string; textoSobrePrincipal: string; escura: string; clara: string };
  design: { estiloTela: "flutuante" | "neutro" | "marcante"; marca: string; mostrarNome: boolean; mostrarImagem: boolean; imagemMarcaUrl: string; dimensoesImagem: { largura: number; altura: number } | null };
  veiculoMapa: { id: string; tipo: number; iconeLivreUrl: string; iconeOcupadoUrl: string; diferenciaOcupado: boolean; iconeAlternativoUrl: string };
  telaInicial: { estilo: string; recursos: Array<{ id: string; visivel: boolean; posicao: number }>; ordemVisiveis: string[]; mapaFixo: boolean };
  recursos: Record<"mapa" | "destino" | "cupons" | "anuncio" | "desafio", boolean>;
}

const chave = () => `personalizacao-${config().empresaId}`;
let atual: PersonalizacaoApp | null = null;
const ouvintes = new Set<() => void>();

function aplicarNoDocumento(p: PersonalizacaoApp) {
  const s = document.documentElement.style;
  s.setProperty("--cor", p.cores.principal);
  s.setProperty("--cor-texto", p.cores.textoSobrePrincipal);
  s.setProperty("--cor2", p.cores.escura);
  s.setProperty("--cor-clara", p.cores.clara);
  document.documentElement.dataset.estiloTela = p.design.estiloTela;
  if (p.empresa.nome) document.title = p.empresa.nome;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.cores.principal);
}

/** Aplica uma resposta do servidor (ou do cache). Só avisa a tela se algo mudou. */
export function aplicarPersonalizacao(p: PersonalizacaoApp, guardar = true) {
  const mudou = !atual || atual.versao !== p.versao;
  atual = p;
  aplicarNoDocumento(p);
  if (guardar) { try { localStorage.setItem(chave(), JSON.stringify(p)); } catch { /* sem armazenamento */ } }
  if (mudou) for (const f of ouvintes) f();
}

/** Reaplica o que já se sabe (a marca do app grava as cores dela por cima ao carregar). */
export function reaplicarPersonalizacao() { if (atual) aplicarNoDocumento(atual); }

export function personalizacaoDoCache() {
  if (atual) return;
  try { const t = localStorage.getItem(chave()); if (t) aplicarPersonalizacao(JSON.parse(t) as PersonalizacaoApp, false); } catch { /* cache ruim: ignora */ }
}

export async function carregarPersonalizacao() {
  try { aplicarPersonalizacao(await api<PersonalizacaoApp>("/personalizacao")); } catch { /* sem sinal: segue com o que já tem */ }
}

export const personalizacaoAtual = () => atual;
export function usePersonalizacao(): PersonalizacaoApp | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual);
}
