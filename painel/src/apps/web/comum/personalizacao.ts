// Personalização do app (Configurações do painel): o app lê ao abrir, a cada minuto e quando volta para a tela, e aplica na hora
// (cores por variável CSS, nome, logo do topo, tema, ícone do carro, estilo e recursos), sem gerar APK.
// Passageiro lê GET /personalizacao; motorista lê GET /personalizacao-motorista. Guarda a última resposta no aparelho
// para já abrir com as cores certas (a rota exige o login do app).

import { useSyncExternalStore } from "react";
import { api, config } from "./api";

interface Basico {
  versao: string;
  empresa: { id: string; nome: string; nomeExibido: string; logoClaro: string; logoEscuro: string; icone: string };
  cores: { principal: string; textoSobrePrincipal: string; escura: string; clara: string };
  design: { estiloTela: "flutuante" | "neutro" | "marcante"; marca: string; mostrarNome: boolean; mostrarImagem: boolean; imagemMarcaUrl: string; dimensoesImagem: { largura: number; altura: number } | null };
  voz?: { ligada: boolean; motor: string; genero: "feminina" | "masculina"; velocidade: number; app: "passageiro" | "motorista"; url: string; formato: string; maxCaracteres: number };
  veiculoMapa: { id: string; tipo: number; iconeLivreUrl: string; iconeOcupadoUrl: string; diferenciaOcupado: boolean };
}
export interface PersonalizacaoPassageiro extends Basico {
  veiculoMapa: Basico["veiculoMapa"] & { iconeAlternativoUrl: string };
  telaInicial: { estilo: string; recursos: Array<{ id: string; visivel: boolean; posicao: number }>; ordemVisiveis: string[]; mapaFixo: boolean };
  recursos: Record<"mapa" | "selecao_destino" | "aviso_cupons" | "anuncio" | "desafio", boolean>; desafioLiberado: boolean;
}
export interface PersonalizacaoMotoristaApp extends Basico {
  tema: "sistema" | "claro" | "escuro";
  recursos: Record<"saldo" | "notificacoes" | "ajuda" | "tema" | "centralizar" | "preferencias" | "macaneta" | "iniciar" | "rodape", boolean>;
}
export type PersonalizacaoApp = PersonalizacaoPassageiro & PersonalizacaoMotoristaApp;

const rota = () => (config().papel === "motorista" ? "/personalizacao-motorista" : "/personalizacao");
const chave = () => `personalizacao-${config().papel}-${config().empresaId}`;
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
  try { aplicarPersonalizacao(await api<PersonalizacaoApp>(rota())); } catch { /* sem sinal: segue com o que já tem */ }
}

/** Lê ao entrar, a cada 60 s e ao voltar para o app. Devolve a função que para. */
export function acompanharPersonalizacao(): () => void {
  void carregarPersonalizacao();
  const t = setInterval(() => void carregarPersonalizacao(), 60000);
  const f = () => { if (document.visibilityState === "visible") void carregarPersonalizacao(); };
  document.addEventListener("visibilitychange", f);
  return () => { clearInterval(t); document.removeEventListener("visibilitychange", f); };
}

export const personalizacaoAtual = () => atual;
export function usePersonalizacao(): PersonalizacaoApp | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual);
}

/** Logo do topo vindo da Personalização: a imagem escolhida (ou nada, para mostrar o nome). Nunca uma imagem fixa do app. */
export function logoDaPersonalizacao(p: PersonalizacaoApp | null): string {
  return p && p.design.mostrarImagem ? p.design.imagemMarcaUrl : "";
}
