// Motor de integração: uma porta única para Sistema A e Sistema B, POR EMPRESA.
//
//   import { criarMotor } from "../motor/src/index.ts";
//   const motor = criarMotor(empresa);        // empresa = { id, integracoes: [{ id, tipo, credenciais }] }
//   const r = await motor.listarCorridas("todas", { de: "2026-11-07T00:00:00-03:00" });
//
// Não há estado global: cada criarMotor(empresa) tem os próprios adaptadores e credenciais.
// Contrato completo em docs/CONTRATO_MOTOR.md.

import { MotorErro, ehMotorErro } from "./erros.ts";
import { CAPACIDADES, CATEGORIA_NAO_EXPOE, CORRIDA_NAO_EXPOE, MOTORISTA_NAO_EXPOE } from "./lacunas.ts";
import { criarAdaptadorSistemaA } from "./sistema-a.ts";
import { criarObservador, type OpcoesObservador } from "./observador.ts";
import { criarAdaptadorSistemaB } from "./sistema-b.ts";
import type {
  Adaptador,
  Aviso,
  Categoria,
  Corrida,
  CorridaCriada,
  Empresa,
  Evento,
  FiltroCorridas,
  FiltroLista,
  FiltroMotoristas,
  Funcao,
  Integracao,
  Lancamento,
  LinhaDoTempo,
  MensagemCorrida,
  Motorista,
  NovaCorrida,
  OpcoesRede,
  Pagina,
  PedidoEstimativa,
  Rastreio,
  Tarifa,
  TipoIntegracao,
} from "./tipos.ts";
import { NOME_DO_TIPO, ORIGEM_DO_TIPO } from "./tipos.ts";

export * from "./tipos.ts";
export { MotorErro, ehMotorErro } from "./erros.ts";
export { criarAdaptadorSistemaA, assinaturaSistemaAValida } from "./sistema-a.ts";
export { criarAdaptadorSistemaB } from "./sistema-b.ts";
export { criarObservador } from "./observador.ts";
export { CAPACIDADES } from "./lacunas.ts";

export const VERSAO_CONTRATO = "3.2.0";

/** Id de integração da empresa, ou "todas". */
export type Alvo = string | "todas";

const TIPOS: TipoIntegracao[] = ["sistema-a", "sistema-b"];

export function criarAdaptador(i: Integracao, rede: OpcoesRede = {}): Adaptador {
  if (i.tipo === "sistema-a") return criarAdaptadorSistemaA(i, rede);
  if (i.tipo === "sistema-b") return criarAdaptadorSistemaB(i, rede);
  throw new MotorErro("DADOS_INVALIDOS", `Tipo de integração desconhecido: ${(i as { tipo?: string }).tipo}`);
}

/** Tabela de capacidades e lacunas de dados por sistema (não depende de empresa). */
export function capacidadesPorSistema() {
  return TIPOS.map((tipo) => ({
    tipo,
    origem: ORIGEM_DO_TIPO[tipo],
    nome: NOME_DO_TIPO[tipo],
    funcoes: CAPACIDADES[tipo],
    semDado: { corrida: CORRIDA_NAO_EXPOE[tipo], motorista: MOTORISTA_NAO_EXPOE[tipo], categoria: CATEGORIA_NAO_EXPOE[tipo] },
  }));
}

export function criarMotor(empresa: Empresa, rede: OpcoesRede = {}) {
  if (!empresa || !Array.isArray(empresa.integracoes)) throw new MotorErro("DADOS_INVALIDOS", "Configuração da empresa sem a lista de integrações.");
  const ids = new Set<string>();
  const adaptadores: Adaptador[] = empresa.integracoes.map((i) => {
    if (!i.id || /[:\s]/.test(i.id)) throw new MotorErro("DADOS_INVALIDOS", `Id de integração inválido: "${i.id}" (sem espaço nem ":").`);
    if (ids.has(i.id)) throw new MotorErro("DADOS_INVALIDOS", `Id de integração repetido: "${i.id}".`);
    ids.add(i.id);
    return criarAdaptador(i, rede);
  });

  const adaptador = (integracaoId: string) => {
    const a = adaptadores.find((x) => x.integracaoId === integracaoId);
    if (!a) throw new MotorErro("NAO_ENCONTRADO", `A empresa não tem a integração "${integracaoId}".`, { integracaoId });
    return a;
  };

  /** Separa "<integração>:<id original>". */
  const doId = (id: string) => {
    const i = id.lastIndexOf(":");
    if (i <= 0) throw new MotorErro("DADOS_INVALIDOS", `Id "${id}" sem a integração. Use "<integração>:<número>", ex.: "sistema-a:123".`);
    return { a: adaptador(id.slice(0, i)), original: id.slice(i + 1) };
  };

  /** Em "todas", chama só as integrações configuradas que têm a função e junta; uma com erro vira aviso,
   *  não derruba as outras. Integração sem a função também vira aviso (NAO_SUPORTADO, com o motivo). */
  async function juntar<T>(
    alvo: Alvo,
    chamar: (a: Adaptador) => Promise<Pagina<T>>,
    ordenar?: (a: T, b: T) => number,
    funcao?: Funcao,
  ): Promise<Pagina<T>> {
    if (alvo !== "todas") return chamar(adaptador(alvo));
    const avisos: Aviso[] = [];
    const ativos = adaptadores.filter((a) => {
      if (!a.configurado()) {
        avisos.push({ integracaoId: a.integracaoId, origem: a.origem, codigo: "NAO_CONFIGURADO", mensagem: a.pendencias().join(" ") });
        return false;
      }
      const cap = funcao ? a.capacidades()[funcao] : undefined;
      if (cap && !cap.disponivel) {
        avisos.push({ integracaoId: a.integracaoId, origem: a.origem, codigo: "NAO_SUPORTADO", mensagem: `${a.nome}: ${cap.motivo}` });
        return false;
      }
      return true;
    });
    if (!ativos.length) {
      if (avisos.length && avisos.every((x) => x.codigo === "NAO_SUPORTADO"))
        throw new MotorErro("NAO_SUPORTADO", avisos.map((x) => x.mensagem).join(" "));
      throw new MotorErro("NAO_CONFIGURADO", "Nenhuma integração configurada para esta empresa.");
    }
    const res = await Promise.allSettled(ativos.map(chamar));
    const itens: T[] = [];
    let temMais = false;
    let pagina = 1;
    res.forEach((r, i) => {
      if (r.status === "fulfilled") {
        itens.push(...r.value.itens);
        temMais ||= r.value.temMais;
        pagina = r.value.pagina;
      } else {
        const e = r.reason;
        avisos.push({
          integracaoId: ativos[i].integracaoId,
          origem: ativos[i].origem,
          codigo: ehMotorErro(e) ? e.codigo : "ERRO_REMOTO",
          mensagem: e instanceof Error ? e.message : String(e),
        });
      }
    });
    if (res.every((r) => r.status === "rejected")) {
      const e = (res[0] as PromiseRejectedResult).reason;
      throw ehMotorErro(e) ? e : new MotorErro("ERRO_REMOTO", String(e));
    }
    if (ordenar) itens.sort(ordenar);
    return { itens, pagina, temMais, avisos: avisos.length ? avisos : undefined };
  }

  // Compara como data (os sistemas mandam fusos diferentes: "Z" no Sistema A, "-03:00" no Sistema B).
  const quando = (c: Corrida) => (c.solicitadaEm ? Date.parse(c.solicitadaEm) || 0 : 0);
  const maisNovaPrimeiro = (a: Corrida, b: Corrida) => quando(b) - quando(a);

  return {
    versao: VERSAO_CONTRATO,
    empresaId: empresa.id,
    adaptadores,
    adaptador,

    /** Situação de cada integração da empresa (sem chamar a rede). */
    status() {
      return adaptadores.map((a) => ({
        integracaoId: a.integracaoId,
        tipo: a.tipo,
        origem: a.origem,
        nome: a.nome,
        configurado: a.configurado(),
        pendencias: a.pendencias(),
        capacidades: a.capacidades(),
      }));
    },

    listarCorridas(alvo: Alvo, f: FiltroCorridas = {}): Promise<Pagina<Corrida>> {
      return juntar(alvo, (a) => a.listarCorridas(f), maisNovaPrimeiro);
    },

    /** id do motor: "<integração>:<número>". */
    async detalharCorrida(id: string): Promise<Corrida> {
      const { a, original } = doId(id);
      return a.detalharCorrida(original);
    },

    async criarCorrida(integracaoId: string, n: NovaCorrida): Promise<CorridaCriada> {
      return adaptador(integracaoId).criarCorrida(n);
    },

    async cancelarCorrida(id: string, motivo?: string): Promise<void> {
      const { a, original } = doId(id);
      return a.cancelarCorrida(original, motivo);
    },

    motoristas(alvo: Alvo, f: FiltroMotoristas = {}): Promise<Pagina<Motorista>> {
      return juntar(alvo, (a) => a.motoristas(f), (x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
    },

    async categorias(alvo: Alvo): Promise<Pagina<Categoria>> {
      return juntar(alvo, async (a) => ({ itens: await a.categorias(), pagina: 1, temMais: false }));
    },

    /** Traduz um webhook recebido para esta integração (hoje só o Sistema A envia). */
    async lerWebhook(integracaoId: string, corpo: string, cabecalhos?: Record<string, string | undefined>): Promise<Evento[]> {
      return adaptador(integracaoId).lerWebhook(corpo, cabecalhos);
    },

    /** Gera eventos consultando a lista de tempos em tempos (para o Sistema B, que não tem webhook). */
    observador(integracaoId: string, o?: OpcoesObservador) {
      return criarObservador(adaptador(integracaoId), o);
    },

    // ------------------------------------------------ funções extras (v3)

    estimarCorrida: (alvo: Alvo, p: PedidoEstimativa) => lista(alvo, "estimativa", (a) => a.estimarCorrida(p)),
    programadas: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.programadas(f), undefined, "programadas"),
    posicoesMotoristas: (alvo: Alvo) => lista(alvo, "posicoes", (a) => a.posicoesMotoristas()),
    async rastrearCorrida(id: string): Promise<Rastreio> {
      const { a, original } = doId(id);
      return a.rastrearCorrida(original);
    },
    async linhaDoTempo(id: string): Promise<LinhaDoTempo> {
      const { a, original } = doId(id);
      return a.linhaDoTempo(original);
    },
    async mensagensCorrida(id: string): Promise<MensagemCorrida[]> {
      const { a, original } = doId(id);
      return a.mensagensCorrida(original);
    },
    passageiros: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.passageiros(f), porNome, "passageiros"),
    conveniadas: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.conveniadas(f), porNome, "conveniadas"),
    extrato: (alvo: Alvo, f: FiltroLista = {}) =>
      juntar(alvo, (a) => a.extrato(f), (x: Lancamento, y: Lancamento) => (Date.parse(y.em ?? "") || 0) - (Date.parse(x.em ?? "") || 0), "extrato"),
    carteiras: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.carteiras(f), porNome, "carteiras"),
    cupons: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.cupons(f), undefined, "cupons"),
    dinamicas: (alvo: Alvo) => lista(alvo, "dinamicas", (a) => a.dinamicas()),
    punicoes: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.punicoes(f), undefined, "punicoes"),
    areas: (alvo: Alvo) => lista(alvo, "areas", (a) => a.areas()),
    veiculos: (alvo: Alvo, f: FiltroLista = {}) => juntar(alvo, (a) => a.veiculos(f), undefined, "veiculos"),

    // ------------------------------------------------ 3.2
    /** id do motor da programada: "<integração>:<número>". */
    async cancelarProgramada(id: string): Promise<void> {
      const { a, original } = doId(id);
      return a.cancelarProgramada(original);
    },
    async despacharProgramada(id: string): Promise<void> {
      const { a, original } = doId(id);
      return a.despacharProgramada(original);
    },
    /** id do motor da categoria: "<integração>:<número>". */
    async tarifas(categoriaId: string): Promise<Tarifa[]> {
      const { a, original } = doId(categoriaId);
      return a.tarifas(original);
    },
    webhooksCadastrados: (alvo: Alvo) => lista(alvo, "webhooksCadastrados", (a) => a.webhooksCadastrados()),
  };

  /** Funções que devolvem lista simples: embrulha em Pagina para juntar as integrações. */
  function lista<T>(alvo: Alvo, funcao: Funcao, chamar: (a: Adaptador) => Promise<T[]>): Promise<Pagina<T>> {
    return juntar(alvo, async (a) => ({ itens: await chamar(a), pagina: 1, temMais: false }), undefined, funcao);
  }
}

const porNome = <T extends { nome: string }>(x: T, y: T) => x.nome.localeCompare(y.nome, "pt-BR");

export type Motor = ReturnType<typeof criarMotor>;

/** Para uso com UMA empresa só (ex.: testes, instalação própria): monta a empresa a partir de variáveis de ambiente.
 *  Cria a integração só se alguma variável dela estiver preenchida. Ids: "sistema-a" e "sistema-b". */
export function empresaDoEnv(env: Record<string, string | undefined> = process.env, id = "padrao"): Empresa {
  const e = (k: string) => (env[k] ?? "").trim() || undefined;
  const integracoes: Integracao[] = [];
  if (e("SISTEMA_A_API_KEY") || e("SISTEMA_A_USUARIO") || e("SISTEMA_A_SENHA"))
    integracoes.push({
      id: "sistema-a",
      tipo: "sistema-a",
      credenciais: {
        apiKey: e("SISTEMA_A_API_KEY"),
        usuario: e("SISTEMA_A_USUARIO"),
        senha: e("SISTEMA_A_SENHA"),
        apiUrl: e("SISTEMA_A_API_URL"),
        motivoCancelamentoId: e("SISTEMA_A_MOTIVO_CANCELAMENTO_ID") ? Number(e("SISTEMA_A_MOTIVO_CANCELAMENTO_ID")) : undefined,
        latPadrao: e("SISTEMA_A_LAT") ? Number(e("SISTEMA_A_LAT")) : undefined,
        lngPadrao: e("SISTEMA_A_LNG") ? Number(e("SISTEMA_A_LNG")) : undefined,
      },
    });
  if (e("SISTEMA_B_COOKIE") || e("SISTEMA_B_CIDADE_ID"))
    integracoes.push({
      id: "sistema-b",
      tipo: "sistema-b",
      credenciais: { cookie: e("SISTEMA_B_COOKIE"), cidadeId: e("SISTEMA_B_CIDADE_ID"), painelUrl: e("SISTEMA_B_PAINEL_URL"), appApiUrl: e("SISTEMA_B_APP_API_URL") },
    });
  return { id, integracoes };
}
