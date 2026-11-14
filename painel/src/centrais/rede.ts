// Rede de centrais: uma empresa pode ser CENTRAL PRINCIPAL e ter centrais ASSOCIADAS (filhas). Só um nível: associada não tem associadas.
//
// Regras de isolamento (valem para todas as telas e rotas de centrais):
// - Cada central continua sendo uma empresa (tenant) com os próprios dados. Nada aqui dá acesso aos dados de outra empresa.
// - Uma central só enxerga a si mesma e, se for principal, as associadas dela. Nunca irmãs, nunca a principal de outra rede.
// - A principal NÃO entra no painel da associada: vê só o que esta camada devolve (controle financeiro, plano, demonstrativo e,
//   se a associada permitir, o extrato SEM nomes de pessoas). Quem troca de empresa continua sendo só o papel "plataforma".
// - Para o chamador, central que não existe e central que não é sua dão a mesma resposta ("Central não encontrada").
//
// Os vínculos ficam em dados/centrais.json (nível da plataforma, fora da pasta de cada empresa).

import path from "node:path";
import { criarEmpresa, criarUsuario, empresa, listarEmpresas, listarUsuarios, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

export const OPCOES_EXTRATO = ["Não permitir", "Permitir"] as const;
export const OPCOES_DEBITO = ["Usar conta desta central", "Usar conta da central principal"] as const;
export const OPCOES_CONTA = ["Conta própria", "Conta da central principal"] as const;
export interface ControleCentral { exibirExtrato: typeof OPCOES_EXTRATO[number]; debitoAutomatico: typeof OPCOES_DEBITO[number]; contaOnline: typeof OPCOES_CONTA[number] }
export const CONTROLE_PADRAO: ControleCentral = { exibirExtrato: "Não permitir", debitoAutomatico: "Usar conta desta central", contaOnline: "Conta própria" };

interface Estado {
  /** associada -> principal */
  vinculos: Record<string, string>;
  /** código numérico exibido ("3916 - Nome") */
  codigos: Record<string, number>;
  controle: Record<string, ControleCentral>;
  /** plano de cobrança escolhido por central */
  planos: Record<string, string>;
  /** serviços adicionais ativos por central */
  servicos: Record<string, string[]>;
}
const VAZIO: Estado = { vinculos: {}, codigos: {}, controle: {}, planos: {}, servicos: {} };
export const MAX_ASSOCIADAS = 50;

export class ErroCentral extends Error { constructor(msg: string, public status = 400) { super(msg); } }
export const naoEncontrada = () => new ErroCentral("Central não encontrada.", 404);

const arquivo = () => path.join(raiz(), "centrais.json");
export function estado(): Estado {
  const e = lerJson<Partial<Estado>>(arquivo(), {});
  return { vinculos: e.vinculos ?? {}, codigos: e.codigos ?? {}, controle: e.controle ?? {}, planos: e.planos ?? {}, servicos: e.servicos ?? {} };
}
/** Muda o estado numa cópia e grava (o cache do disco é congelado). */
export function alterar(fn: (e: Estado) => void) {
  const e = structuredClone(estado());
  fn(e);
  gravarJson(arquivo(), e, { espacos: 2 });
}

// ------------------------------------------------------------------ consulta

export const principalDe = (id: string): string | null => estado().vinculos[id] ?? null;
export const associadasDe = (id: string): string[] => Object.entries(estado().vinculos).filter(([, p]) => p === id).map(([a]) => a).filter((a) => empresa(a));
export type PapelNaRede = "principal" | "associada" | "isolada";
export function papelNaRede(id: string): PapelNaRede {
  if (principalDe(id)) return "associada";
  return associadasDe(id).length ? "principal" : "isolada";
}

/** O visor pode consultar a central alvo? Ele mesmo, ou a principal dele. Nunca uma irmã nem outra rede. */
export const podeVer = (visorId: string, alvoId: string) => !!empresa(alvoId) && (visorId === alvoId || principalDe(alvoId) === visorId);

/** Exige que o alvo seja o próprio visor ou uma associada dele. Senão: "não encontrada" (não diz se existe). */
export function exigirVisivel(visorId: string, alvoId: unknown): string {
  const id = typeof alvoId === "string" && alvoId ? alvoId : visorId;
  if (!podeVer(visorId, id)) throw naoEncontrada();
  return id;
}

export function codigoDe(id: string): number {
  const e = estado();
  if (e.codigos[id]) return e.codigos[id];
  const novo = Math.max(1000, ...Object.values(e.codigos)) + 1;
  alterar((x) => { x.codigos[id] = x.codigos[id] ?? novo; });
  return estado().codigos[id];
}

export interface CentralResumo { id: string; nome: string; codigo: number; tipo: "principal" | "associada"; ativa: boolean; rotulo: string }
function resumo(id: string, tipo: CentralResumo["tipo"]): CentralResumo {
  const e = empresa(id)!, codigo = codigoDe(id);
  return { id, nome: e.nome, codigo, tipo, ativa: e.ativa, rotulo: `${codigo} - ${e.nome}` };
}

/** Centrais que o visor pode escolher: ele mesmo e, se for principal, as associadas. A associada vê só a si mesma. */
export function centraisVisiveis(visorId: string): CentralResumo[] {
  if (!empresa(visorId)) return [];
  const propria = resumo(visorId, principalDe(visorId) ? "associada" : "principal");
  const filhas = associadasDe(visorId).map((a) => resumo(a, "associada")).sort((a, b) => a.nome.localeCompare(b.nome));
  return [propria, ...filhas];
}

export function controleDe(id: string): ControleCentral {
  const c = estado().controle[id];
  return {
    exibirExtrato: OPCOES_EXTRATO.find((o) => o === c?.exibirExtrato) ?? CONTROLE_PADRAO.exibirExtrato,
    debitoAutomatico: OPCOES_DEBITO.find((o) => o === c?.debitoAutomatico) ?? CONTROLE_PADRAO.debitoAutomatico,
    contaOnline: OPCOES_CONTA.find((o) => o === c?.contaOnline) ?? CONTROLE_PADRAO.contaOnline,
  };
}

// ------------------------------------------------------------------ vínculos

/** Liga uma central existente como associada de uma principal. Quem chama já conferiu a permissão (só a plataforma). */
export function vincular(principalId: string, associadaId: string) {
  if (!empresa(principalId) || !empresa(associadaId)) throw naoEncontrada();
  if (principalId === associadaId) throw new ErroCentral("Uma central não pode ser associada dela mesma.");
  if (principalDe(principalId)) throw new ErroCentral("Esta central já é associada de outra e não pode ter associadas.");
  if (principalDe(associadaId)) throw new ErroCentral("Esta central já está associada a uma principal.");
  if (associadasDe(associadaId).length) throw new ErroCentral("Esta central já é principal de outras e não pode virar associada.");
  if (associadasDe(principalId).length >= MAX_ASSOCIADAS) throw new ErroCentral(`Limite de ${MAX_ASSOCIADAS} centrais associadas.`);
  alterar((e) => { e.vinculos[associadaId] = principalId; delete e.controle[associadaId]; });
  codigoDe(principalId); codigoDe(associadaId);
}

export function desvincular(associadaId: string) {
  if (!principalDe(associadaId)) throw new ErroCentral("Esta central não é associada.");
  alterar((e) => { delete e.vinculos[associadaId]; delete e.controle[associadaId]; });
}

/** "Abrir uma central associada": cria a empresa nova já ligada à principal. Pode criar o primeiro administrador dela. */
export function criarAssociada(principalId: string, dados: { nome: unknown; adminEmail?: unknown; adminNome?: unknown; adminSenha?: unknown }) {
  if (!empresa(principalId)) throw naoEncontrada();
  if (principalDe(principalId)) throw new ErroCentral("Uma central associada não pode abrir outras centrais.");
  const nome = String(dados.nome ?? "").trim();
  if (nome.length < 2) throw new ErroCentral("Informe o nome da central (pelo menos 2 letras).");
  if (associadasDe(principalId).length >= MAX_ASSOCIADAS) throw new ErroCentral(`Limite de ${MAX_ASSOCIADAS} centrais associadas.`);
  const email = String(dados.adminEmail ?? "").trim();
  if (email) {
    // confere antes de criar a empresa, para não deixar uma central pela metade
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErroCentral("E-mail do administrador inválido.");
    if (String(dados.adminSenha ?? "").length < 8) throw new ErroCentral("A senha do administrador precisa de pelo menos 8 caracteres.");
    if (listarUsuarios().some((u) => u.email === email.toLowerCase())) throw new ErroCentral("Já existe um usuário com este e-mail.");
  }
  const nova = criarEmpresa(nome);
  vincular(principalId, nova.id);
  if (email) criarUsuario({ email, nome: String(dados.adminNome ?? "").trim() || email, senha: String(dados.adminSenha), empresaId: nova.id, papel: "admin" });
  return resumo(nova.id, "associada");
}

// ------------------------------------------------------------------ controle financeiro

export interface LinhaControle extends CentralResumo { controle: ControleCentral; pode: { exibirExtrato: boolean; debitoAutomatico: boolean; contaOnline: boolean } }

/**
 * Quem edita o quê:
 * - "Exibir extrato" é consentimento da própria associada (ela decide se a principal vê o extrato dela);
 * - "Débito automático" e "Conta online" são da principal sobre as associadas;
 * - a plataforma pode tudo (suporte).
 */
export function linhasDeControle(visorId: string, plataforma: boolean): LinhaControle[] {
  return centraisVisiveis(visorId).map((c) => {
    const propria = c.id === visorId, ehAssociada = c.tipo === "associada";
    return {
      ...c, controle: controleDe(c.id),
      pode: {
        exibirExtrato: ehAssociada && (plataforma || propria),
        debitoAutomatico: ehAssociada && (plataforma || !propria),
        contaOnline: ehAssociada && (plataforma || !propria),
      },
    };
  });
}

export function salvarControle(visorId: string, alvoId: unknown, mudanca: Record<string, unknown>, plataforma: boolean): ControleCentral {
  const alvo = exigirVisivel(visorId, alvoId);
  const linha = linhasDeControle(visorId, plataforma).find((l) => l.id === alvo);
  if (!linha || linha.tipo !== "associada") throw new ErroCentral("A central principal não tem controle financeiro por aqui.");
  const novo = { ...linha.controle };
  const aplicar = <K extends keyof ControleCentral>(campo: K, opcoes: readonly ControleCentral[K][]) => {
    if (mudanca[campo] === undefined) return;
    const v = opcoes.find((o) => o === mudanca[campo]);
    if (!v) throw new ErroCentral("Opção inválida.");
    if (v !== linha.controle[campo] && !linha.pode[campo as keyof LinhaControle["pode"]]) throw new ErroCentral("Seu usuário não pode mudar esta opção para esta central.", 403);
    novo[campo] = v;
  };
  aplicar("exibirExtrato", OPCOES_EXTRATO); aplicar("debitoAutomatico", OPCOES_DEBITO); aplicar("contaOnline", OPCOES_CONTA);
  alterar((e) => { e.controle[alvo] = novo; });
  return novo;
}

/** Empresas que ainda não estão em nenhuma rede (para a plataforma escolher ao vincular). */
export const empresasLivres = (principalId: string) =>
  listarEmpresas().filter((e) => e.id !== principalId && !principalDe(e.id) && !associadasDe(e.id).length).map((e) => ({ id: e.id, nome: e.nome }));
