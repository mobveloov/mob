// Painel do dono da plataforma (ADMIN Mestre): empresas, planos, recursos, marca e domínio, uso e faturamento, centrais.
// Só o papel "plataforma" chega aqui (a rota confere e o porteiro geral também). Nada aqui apaga dados de empresa:
// suspender só impede o acesso, e dá para reativar.

import { MODULOS } from "../comum/modulos.ts";
import { definirRecursos, ErroSuperadmin, recursosDesligados } from "./recursos.ts";
import { sanearMarca } from "../comum/marca.ts";
import { competenciaAtual, competenciaValida, demonstrativo, numerosDoMes, PLANOS, planoDe, planoPorId } from "../centrais/cobranca.ts";
import { alterar, associadasDe, codigoDe, principalDe } from "../centrais/rede.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarFiliais } from "../filiais/filiais.ts";
import { criarEmpresa, criarUsuario, definirAtiva, empresa, listarEmpresas, listarUsuarios, marca, salvarMarca } from "../servidor/dados.ts";

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ------------------------------------------------------------------ empresas

const dominioValido = (d: string) => /^(?=.{3,120}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d);

/** Domínio já usado por outra empresa? (Um domínio aponta para uma empresa só.) */
function donoDoDominio(dominio: string, ignorar: string): string | null {
  for (const e of listarEmpresas()) if (e.id !== ignorar && marca(e.id).dominios.includes(dominio)) return e.nome;
  return null;
}

export function resumoDaEmpresa(id: string, competencia = competenciaAtual()) {
  const e = empresa(id)!;
  const plano = planoDe(id), m = marca(id);
  const n = numerosDoMes(id, competencia, plano);
  const motoristas = listar(id, cadastroPorId("motoristas")!);
  const principal = principalDe(id);
  const associadas = associadasDe(id);
  let aPagar = 0;
  try { aPagar = demonstrativo(id, id, competencia).totalAPagar; } catch { aPagar = 0; }
  return {
    id, nome: e.nome, ativa: e.ativa, suspensao: e.suspensao ?? null, criadaEm: e.criadaEm, codigo: codigoDe(id),
    plano: { id: plano.id, nome: plano.nome, mensalidade: plano.mensalidade },
    recursosDesligados: recursosDesligados(id),
    marca: { produto: m.produto, nomeExibido: m.nomeExibido, dominios: m.dominios, corPrimaria: m.cores.primaria },
    rede: { tipo: principal ? "associada" : associadas.length ? "principal" : "isolada", principalId: principal, associadas: associadas.length },
    uso: {
      competencia, corridasFinalizadas: n.finalizadas, corridasNaoFinalizadas: n.naoFinalizadas, receitaBruta: n.bruto, tarifas: n.tarifas, aPagar,
      motoristas: motoristas.length, motoristasAtivos: motoristas.filter((x) => x.status === "Ativo").length,
      passageiros: listar(id, cadastroPorId("clientes")!).length, usuarios: listarUsuarios().filter((u) => u.empresaId === id).length, filiais: listarFiliais(id).length,
    },
  };
}

export const listarResumos = (competencia?: unknown) => {
  const comp = competencia === undefined || competencia === "" ? competenciaAtual() : competencia;
  if (!competenciaValida(comp)) throw new ErroSuperadmin("Competência inválida (use AAAA-MM).");
  return listarEmpresas().map((e) => resumoDaEmpresa(e.id, comp));
};

/** Cria a empresa com o primeiro ADMIN (confere tudo antes, para não deixar empresa pela metade). */
export function criarNovaEmpresa(d: Record<string, unknown>) {
  const nome = String(d.nome ?? "").trim();
  if (nome.length < 2) throw new ErroSuperadmin("Informe o nome da empresa (pelo menos 2 letras).");
  const email = String(d.adminEmail ?? "").trim().toLowerCase();
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErroSuperadmin("E-mail do administrador inválido.");
    if (String(d.adminSenha ?? "").length < 8) throw new ErroSuperadmin("A senha do administrador precisa de pelo menos 8 caracteres.");
    if (listarUsuarios().some((u) => u.email === email)) throw new ErroSuperadmin("Já existe um usuário com este e-mail.");
  }
  const plano = d.plano === undefined || d.plano === "" ? null : planoPorId(String(d.plano));
  if (d.plano !== undefined && d.plano !== "" && !plano) throw new ErroSuperadmin("Plano inválido.");
  const e = criarEmpresa(nome);
  if (plano) alterar((x) => { x.planos[e.id] = plano.id; });
  if (email) criarUsuario({ email, nome: String(d.adminNome ?? "").trim() || email, senha: String(d.adminSenha), empresaId: e.id, papel: "admin" });
  return resumoDaEmpresa(e.id);
}

/** A empresa de qualquer ADMIN Mestre não pode ser suspensa (o dono se trancaria para fora). */
export function suspender(id: string, motivo: unknown, por: string) {
  if (!empresa(id)) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  if (listarUsuarios().some((u) => u.empresaId === id && u.papel === "plataforma")) throw new ErroSuperadmin("Esta é a empresa do dono da plataforma e não pode ser suspensa.");
  definirAtiva(id, false, String(motivo ?? ""), por);
  return resumoDaEmpresa(id);
}
export function reativar(id: string) {
  if (!empresa(id)) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  definirAtiva(id, true);
  return resumoDaEmpresa(id);
}

export function definirPlano(id: string, plano: unknown) {
  if (!empresa(id)) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  const p = planoPorId(String(plano));
  if (!p) throw new ErroSuperadmin("Plano inválido.");
  alterar((e) => { e.planos[id] = p.id; });
  return resumoDaEmpresa(id);
}

/** Marca e domínio: nome do produto, nome exibido, cor principal e domínios. Imagens continuam sendo enviadas pela empresa. */
export function definirMarca(id: string, d: Record<string, unknown>) {
  if (!empresa(id)) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  const atual = marca(id);
  let dominios = atual.dominios;
  if (d.dominios !== undefined) {
    if (!Array.isArray(d.dominios)) throw new ErroSuperadmin("Informe a lista de domínios.");
    dominios = [...new Set(d.dominios.map((x) => String(x).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean))];
    if (dominios.length > 10) throw new ErroSuperadmin("No máximo 10 domínios.");
    for (const x of dominios) {
      if (!dominioValido(x)) throw new ErroSuperadmin(`Domínio inválido: ${x}.`);
      const dono = donoDoDominio(x, id);
      if (dono) throw new ErroSuperadmin(`O domínio ${x} já é da empresa ${dono}.`);
    }
  }
  const nova = sanearMarca({
    ...atual, dominios,
    ...(typeof d.produto === "string" ? { produto: d.produto } : {}), ...(typeof d.nomeExibido === "string" ? { nomeExibido: d.nomeExibido } : {}),
    cores: { ...atual.cores, ...(typeof d.corPrimaria === "string" ? { primaria: d.corPrimaria } : {}) },
  }, atual);
  salvarMarca(id, nova);
  return resumoDaEmpresa(id);
}

// ------------------------------------------------------------------ uso e faturamento

export function usoEFaturamento(competencia?: unknown) {
  const linhas = listarResumos(competencia);
  const soma = (f: (l: (typeof linhas)[number]) => number) => cent(linhas.reduce((s, l) => s + f(l), 0));
  return {
    competencia: linhas[0]?.uso.competencia ?? competenciaAtual(),
    totais: {
      empresas: linhas.length, ativas: linhas.filter((l) => l.ativa).length,
      corridasFinalizadas: soma((l) => l.uso.corridasFinalizadas), receitaBruta: soma((l) => l.uso.receitaBruta), tarifas: soma((l) => l.uso.tarifas), aPagar: soma((l) => l.uso.aPagar),
      motoristas: soma((l) => l.uso.motoristas), motoristasAtivos: soma((l) => l.uso.motoristasAtivos),
    },
    empresas: linhas.map((l) => ({ id: l.id, nome: l.nome, ativa: l.ativa, plano: l.plano.nome, ...l.uso })),
  };
}

// ------------------------------------------------------------------ centrais e franquias

export function redeDeCentrais() {
  const livres = listarEmpresas().filter((e) => !principalDe(e.id) && !associadasDe(e.id).length).map((e) => ({ id: e.id, nome: e.nome, ativa: e.ativa }));
  const principais = listarEmpresas().filter((e) => associadasDe(e.id).length).map((e) => ({
    id: e.id, nome: e.nome, codigo: codigoDe(e.id), ativa: e.ativa,
    associadas: associadasDe(e.id).map((a) => ({ id: a, nome: empresa(a)!.nome, codigo: codigoDe(a), ativa: empresa(a)!.ativa })),
  }));
  return { principais, livres };
}

export { definirRecursos, ErroSuperadmin, MODULOS, PLANOS };
