// Cargos do painel, como na Machine: ADMIN Mestre, ADMIN, Gestor e Operador. Um cargo vê e faz tudo o que os de baixo fazem.
// O valor guardado no usuário (campo "papel") não mudou, para ninguém perder o acesso:
//   plataforma = ADMIN Mestre (dono da plataforma)   admin = ADMIN   gestor = Gestor (novo)   operador = Operador
// Este arquivo vale para o servidor e para o painel. A matriz completa está em docs/CARGOS.md.

export type Cargo = "plataforma" | "admin" | "gestor" | "operador";

/** Do mais baixo para o mais alto. */
export const CARGOS: Cargo[] = ["operador", "gestor", "admin", "plataforma"];
export const NIVEL: Record<Cargo, number> = { operador: 1, gestor: 2, admin: 3, plataforma: 4 };

export const NOME_CARGO: Record<Cargo, string> = { plataforma: "ADMIN Mestre", admin: "ADMIN", gestor: "Gestor", operador: "Operador" };
export const DESCRICAO_CARGO: Record<Cargo, string> = {
  plataforma: "Dono da plataforma. Tudo, em todas as empresas, mais o painel do dono (empresas, planos e faturamento).",
  admin: "Acesso total à empresa: financeiro completo, equipe, integrações, relatórios e estatísticas.",
  gestor: "Cadastros e regras do dia a dia, configurações, marketing e o financeiro de motoristas. Sem equipe, faturamento e relatórios financeiros.",
  operador: "Despacha e acompanha corridas, atende motoristas e passageiros. Sem financeiro, regras e equipe.",
};

export const ehCargo = (v: unknown): v is Cargo => typeof v === "string" && (CARGOS as string[]).includes(v);

/** O cargo é igual ou acima do mínimo? ("plataforma" passa em tudo.) */
export const podeCargo = (cargo: unknown, minimo: Cargo): boolean => ehCargo(cargo) && NIVEL[cargo] >= NIVEL[minimo];

/** Cargos que o usuário pode dar a outras pessoas da equipe (ninguém dá um cargo acima do seu; ADMIN Mestre só pelo dono). */
export const cargosQuePodeDar = (cargo: Cargo): Cargo[] => (cargo === "operador" || cargo === "gestor" ? [] : (["admin", "gestor", "operador"] as Cargo[]));

// ------------------------------------------------------------------ regras da API

/** Regra de acesso por caminho (depois de /api). A primeira que combinar vale. O que não está aqui só exige login. */
export interface RegraApi { metodos?: string[]; caminho: RegExp; minimo: Cargo }
const LEITURA = ["GET", "HEAD"];
const ESCRITA = ["POST", "PUT", "PATCH", "DELETE"];

export const REGRAS_API: RegraApi[] = [
  // Painel do dono da plataforma.
  { caminho: /^\/superadmin(\/|$)/, minimo: "plataforma" },
  { metodos: ESCRITA, caminho: /^\/empresas$/, minimo: "plataforma" },

  // Equipe e cobrança.
  { caminho: /^\/usuarios(\/|$)/, minimo: "admin" },
  { caminho: /^\/gestao\/equipe(\/|$)/, minimo: "admin" },
  { caminho: /^\/centrais\/seletor$/, minimo: "operador" },
  { caminho: /^\/centrais(\/|$)/, minimo: "gestor" },

  // Integrações, chaves, planilhas e IA.
  { caminho: /^\/(integracoes|ia|planilhas)(\/|$)/, minimo: "admin" },
  { caminho: /^\/(relatorio|perguntar)$/, minimo: "admin" },
  { metodos: ESCRITA, caminho: /^\/marca(\/|$)/, minimo: "gestor" },
  { caminho: /^\/marca\/brand\.json$/, minimo: "gestor" },

  // Financeiro: o que o Gestor vê (Pix, transações, contas a pagar, poder público) e o que só o ADMIN vê.
  { caminho: /^\/relatorios\/relatorio\/(vouchers-motoristas|km-rodados)(\/csv)?$/, minimo: "gestor" },
  { caminho: /^\/relatorios\/relatorio\//, minimo: "admin" },
  { caminho: /^\/relatorios\/(indice|modelos)(\/|$)/, minimo: "gestor" },
  { caminho: /^\/relatorios\/vouchers\/faixas(\/|$)/, minimo: "gestor" },
  { caminho: /^\/operacao\/pendencias(\/|$)/, minimo: "admin" },
  { caminho: /^\/operacao\/pix(\/|$)/, minimo: "gestor" },
  { caminho: /^\/config\/(visao-geral|transacoes-online|relatorios)(\/|$)/, minimo: "admin" },
  { metodos: ESCRITA, caminho: /^\/config\/(carteiras|saques|extrato-central|recargas)(\/|$)/, minimo: "admin" },
  { caminho: /^\/config\/(carteiras|extrato|saques|recargas|extrato-central)(\/|$)/, minimo: "gestor" },
  { caminho: /^\/apps-central\/(carteiras|saques)(\/|$)/, minimo: "gestor" },
  { metodos: ESCRITA, caminho: /^\/apps-central\/(carteiras|saques)(\/|$)/, minimo: "admin" },
  { caminho: /^\/(gestao\/)?indicacoes(\/|$)/, minimo: "admin" },
  { caminho: /^\/gestao\/passe-livre(\/|$)/, minimo: "admin" },

  // Configurações (as telas de apoio, como categorias, continuam legíveis para quem despacha).
  { caminho: /^\/config\/(integracao-financeira|pagamentos)(\/|$)/, minimo: "admin" },
  { metodos: LEITURA, caminho: /^\/config\/(gerais|credito|dinamicas|dinamicas-prioridade|dinamicas-automacoes|descontos|descontos-matriz|despacho|transbordos)(\/|$)/, minimo: "gestor" },
  { metodos: LEITURA, caminho: /^\/config\/nps\/[^/]+$/, minimo: "gestor" },
  { metodos: ESCRITA, caminho: /^\/config\/(gerais|credito|categorias|dinamicas|dinamicas-prioridade|dinamicas-automacoes|descontos|descontos-matriz|despacho|nps|termos|ajuda)(\/|$)/, minimo: "gestor" },

  // Cadastros de gestão.
  { caminho: /^\/gestao\/(cupons|areas|desafios|desafios-previa|empresas|empresas-exportar|punicoes|cartoes-clientes)(\/|$)/, minimo: "gestor" },
  { caminho: /^\/gestao\/(config-creditos)(\/|$)/, minimo: "admin" },
  { metodos: ESCRITA, caminho: /^\/areas\/ruas(\/|$)/, minimo: "gestor" },
  { caminho: /^\/areas\/(funil|bairros)(\/|$)/, minimo: "gestor" },
  { caminho: /^\/crm(\/|$)/, minimo: "gestor" },

  // Filiais: a lista curta serve de filtro para todos; o cadastro e os vínculos são do Gestor para cima.
  { caminho: /^\/filiais\/opcoes$/, minimo: "operador" },
  { caminho: /^\/filiais(\/|$)/, minimo: "gestor" },
];

/** O Express casa rotas sem diferenciar maiúsculas e aceita "//", "/./" e "/" no fim; as regras acima não.
 *  Por isso o caminho é normalizado antes de casar (senão "/Relatorios/Relatorio/x" burlaria o cargo e o recurso desligado). */
export function normalizarCaminho(caminho: string): string {
  let c = caminho;
  try { c = decodeURIComponent(c); } catch { /* deixa como veio */ }
  c = c.toLowerCase().replace(/\\/g, "/");
  const saida: string[] = [];
  for (const p of c.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") saida.pop(); else saida.push(p);
  }
  return "/" + saida.join("/");
}

/** Cargo mínimo para o pedido, ou null se só exige login. */
export function cargoMinimoDaRota(metodo: string, caminho: string): Cargo | null {
  const m = metodo.toUpperCase();
  const c = normalizarCaminho(caminho);
  for (const r of REGRAS_API) if ((!r.metodos || r.metodos.includes(m)) && r.caminho.test(c)) return r.minimo;
  return null;
}
