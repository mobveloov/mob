// Menu lateral enxuto: telas parecidas ficam numa ENTRADA do menu, com ABAS internas. Nenhuma função some:
// cada id de funcoes.ts (e sua rota antiga) continua existindo e vira uma aba de uma entrada.
// Aqui só fica o arranjo (puro, sem React); os ícones e a aparência ficam em src/web/menu/MenuLateral.tsx e as abas
// em src/web/telas/abas/EntradaAbas.tsx. Os testes test/menu-lateral.test.ts e test/menu-enxuto.test.ts conferem:
//  - todo id de FUNCOES está em exatamente UMA aba de UMA entrada;
//  - toda rota antiga leva à entrada e à aba certas (?aba=<id da função>);
//  - a entrada só aparece se ao menos uma aba é permitida (cargo e módulo ligado).
// A lista antes/depois está em docs/MENU_ENXUTO.md.

import { FUNCOES, type Funcao } from "./funcoes.ts";

export type CorMenu = "laranja" | "azul" | "verde" | "roxo" | "rosa" | "lima" | "ciano" | "ambar" | "indigo" | "teal" | "ardosia" | "fucsia";

export interface AbaMenu {
  /** id da função de funcoes.ts; também é o valor de `?aba=` na rota da entrada. */
  id: string;
  /** Rótulo curto na barra de abas (padrão: nome da função). */
  rotulo?: string;
  /** Seção da aba: quando há seções, a barra de abas mostra primeiro as seções e depois as abas da escolhida. */
  secao?: string;
}
export interface EntradaMenu {
  /** Id próprio da entrada (igual ao id da função principal, quando existe uma). */
  id: string;
  nome: string;
  /** Rota da entrada (padrão: rota da primeira aba). Telas antigas redirecionam para ela com ?aba=. */
  rota?: string;
  abas: AbaMenu[];
}
export interface GrupoMenu { id: string; nome: string; cor: CorMenu; entradas: EntradaMenu[] }

const a = (id: string, rotulo?: string, secao?: string): AbaMenu => ({ id, rotulo, secao });

export const GRUPOS_MENU: GrupoMenu[] = [
  { id: "painel", nome: "Painel", cor: "laranja", entradas: [{ id: "painel", nome: "Painel", abas: [a("painel")] }] },
  {
    id: "cadastro", nome: "Cadastro", cor: "verde", entradas: [
      { id: "equipe", nome: "Equipe e filiais", abas: [a("equipe", "Minha equipe"), a("filiais")] },
      { id: "motoristas", nome: "Motoristas", abas: [a("motoristas"), a("punicoes"), a("destravar"), a("veiculos"), a("desafios")] },
      { id: "passageiros", nome: "Clientes", abas: [a("passageiros"), a("consulta-cartoes")] },
      { id: "empresas", nome: "Empresas", abas: [a("empresas")] },
      { id: "cupons", nome: "Cupons e passes", abas: [a("cupons"), a("passe-livre"), a("indicacoes")] },
      { id: "faixas-vouchers", nome: "Vouchers", abas: [a("faixas-vouchers"), a("entrega-voucher")] },
      { id: "areas", nome: "Áreas e ruas", abas: [a("areas"), a("plantao"), a("ruas"), a("enderecos")] },
    ],
  },
  {
    id: "corridas", nome: "Corridas", cor: "azul", entradas: [
      { id: "solicitar", nome: "Solicitar nova corrida", abas: [a("solicitar")] },
      { id: "monitoramento", nome: "Acompanhamento e mapas", abas: [a("monitoramento"), a("mapa"), a("engajamento"), a("mapa-bairros")] },
      { id: "historico", nome: "Consultar corridas", abas: [a("historico"), a("programadas"), a("alterar-os"), a("taxas-cancelamento"), a("objetos"), a("gravacoes")] },
    ],
  },
  {
    id: "financeiro", nome: "Financeiro", cor: "roxo", entradas: [
      {
        id: "carteiras", nome: "Pagamentos", abas: [
          a("carteiras", undefined, "Créditos"), a("creditos-recargas-saques", undefined, "Créditos"), a("creditos-extrato", undefined, "Créditos"),
          a("recargas", undefined, "Créditos"), a("saques", undefined, "Créditos"), a("extrato", undefined, "Créditos"),
          a("cartao-painel", undefined, "Cartão"), a("cartao-transacoes", "Transações", "Cartão"), a("cartao-saldo-central", undefined, "Cartão"), a("cartao-saldo-motorista", undefined, "Cartão"),
          a("transacao-pix", "Transações", "Pix"),
        ],
      },
      {
        id: "faturamento-empresa", nome: "Faturamento e contas", abas: [
          a("faturamento-empresa", undefined, "A receber"), a("faturamento-centro-custo", undefined, "A receber"), a("faturamento-periodo", undefined, "A receber"),
          a("vouchers-motoristas", undefined, "A pagar"), a("pagamentos-pendentes", undefined, "A pagar"),
        ],
      },
      {
        id: "visao-geral", nome: "Relatórios", abas: [
          a("visao-geral", undefined, "Resumo"), a("relatorios", undefined, "Resumo"), a("relatorio-faturamento", undefined, "Resumo"), a("extrato-online", undefined, "Resumo"),
          a("indice-relatorios", undefined, "Modelos"), a("km-rodados", undefined, "Poder público"),
        ],
      },
      { id: "os-motorista", nome: "Estatísticas de OS", abas: [a("os-motorista"), a("os-empresa"), a("os-bairro"), a("os-pagamento"), a("os-operador"), a("os-percentual-motorista")] },
    ],
  },
  {
    id: "comunicacao", nome: "Comunicação", cor: "ciano", entradas: [
      { id: "conversas", nome: "WhatsApp", abas: [a("conversas"), a("bot")] },
      { id: "alertas-seguranca", nome: "Alertas e avisos", abas: [a("alertas-seguranca"), a("ocorrencias"), a("notificacoes"), a("alertas-empresas")] },
    ],
  },
  {
    id: "configuracoes", nome: "Configurações", cor: "rosa", entradas: [
      { id: "config-gerais", nome: "Configurações gerais", abas: [a("config-gerais")] },
      { id: "categorias", nome: "Tarifas e taxas", abas: [a("categorias"), a("tarifas-dinamicas"), a("taxas-central")] },
      { id: "regras-despacho", nome: "Despacho", abas: [a("regras-despacho"), a("transbordos")] },
      { id: "descontos", nome: "Descontos e regras", abas: [a("descontos"), a("regras-credito"), a("carteiras-credito"), a("config-nps"), a("termos-app")] },
      { id: "integracoes", nome: "Integrações e empresa", abas: [a("integracoes"), a("marca")] },
      {
        id: "apps", nome: "Apps", rota: "/aplicativos", abas: [
          a("personalizacao-app", "Personalização do app", "Passageiro"),
          a("personalizacao-motorista", "Personalização do app", "Motorista"), a("documentos", undefined, "Motorista"), a("apps", "Online e SOS", "Motorista"),
          a("totem", undefined, "Totem"), a("app-totem", undefined, "Totem"),
        ],
      },
    ],
  },
  {
    id: "cobranca", nome: "Cobrança", cor: "ambar", entradas: [
      { id: "ultimo-boleto", nome: "Cobrança da plataforma", abas: [a("ultimo-boleto"), a("demonstrativo-mensal"), a("meus-planos"), a("extrato-central"), a("controle-centrais")] },
    ],
  },
  { id: "avaliacoes", nome: "Avaliações", cor: "lima", entradas: [{ id: "avaliacoes", nome: "Avaliações (NPS)", abas: [a("avaliacoes")] }] },
  {
    id: "ajuda", nome: "Ajuda", cor: "teal", entradas: [
      { id: "central-suporte", nome: "Ajuda e suporte", abas: [a("central-suporte"), a("central-ajuda"), a("ouvidoria")] },
      { id: "ajuda-termos", nome: "Termos e privacidade", abas: [a("ajuda-termos"), a("juridico")] },
    ],
  },
  // Só existem aqui (não são da Machine).
  { id: "crm", nome: "CRM", cor: "fucsia", entradas: [{ id: "crm", nome: "CRM e recuperação", abas: [a("crm"), a("recuperacao"), a("funil-clientes")] }] },
  {
    id: "mais", nome: "Mais", cor: "ardosia", entradas: [
      { id: "analise", nome: "Análise com IA", abas: [a("analise")] },
      { id: "superadmin", nome: "Painel do dono", abas: [a("superadmin")] },
      { id: "alterar-senha", nome: "Trocar senha", abas: [a("alterar-senha")] },
    ],
  },
];

/** Nome da aba no menu quando difere do nome da tela. */
export const ROTULO_MENU: Record<string, string> = { marca: "Dados da Empresa" };

const porIdFuncao = new Map(FUNCOES.map((f) => [f.id, f]));

export const todasEntradas = (): EntradaMenu[] => GRUPOS_MENU.flatMap((g) => g.entradas);
export const rotaDaEntrada = (e: EntradaMenu): string => e.rota ?? porIdFuncao.get(e.abas[0].id)!.rota;

/** Onde cada função mora hoje: entrada e aba. Serve às rotas antigas, à busca e aos testes. */
export function destinoDaFuncao(id: string): { grupo: GrupoMenu; entrada: EntradaMenu; aba: AbaMenu } | null {
  for (const grupo of GRUPOS_MENU) for (const entrada of grupo.entradas) {
    const aba = entrada.abas.find((x) => x.id === id);
    if (aba) return { grupo, entrada, aba };
  }
  return null;
}

export interface AbaVisivel { id: string; rotulo: string; secao?: string; funcao: Funcao; /** rota completa da aba (com ?aba=, menos na aba que abre por padrão) */ rota: string }
export interface EntradaVisivel { id: string; nome: string; rota: string; abas: AbaVisivel[] }
export interface GrupoMenuVisivel { id: string; nome: string; cor: CorMenu; entradas: EntradaVisivel[] }

/** Rota de uma aba: a primeira aba permitida abre sem parâmetro; as outras levam ?aba=<id>. */
export const rotaDaAba = (rotaEntrada: string, primeira: string, id: string) => (id === primeira ? rotaEntrada : `${rotaEntrada}?aba=${encodeURIComponent(id)}`);

/** Menu do usuário: recebe só as funções que o cargo e os módulos ligados permitem. Aba sem permissão some; entrada sem aba e grupo vazio somem. */
export function menuLateral(funcoes: Funcao[] = FUNCOES): GrupoMenuVisivel[] {
  const porId = new Map(funcoes.map((f) => [f.id, f]));
  return GRUPOS_MENU.map((g) => ({
    id: g.id, nome: g.nome, cor: g.cor,
    entradas: g.entradas.map((e): EntradaVisivel => {
      const rota = rotaDaEntrada(e);
      const ok = e.abas.filter((x) => porId.has(x.id));
      const primeira = ok[0]?.id ?? "";
      return {
        id: e.id, nome: e.nome, rota,
        abas: ok.map((x) => { const funcao = porId.get(x.id)!; return { id: x.id, rotulo: x.rotulo ?? ROTULO_MENU[x.id] ?? funcao.nome, secao: x.secao, funcao, rota: rotaDaAba(rota, primeira, x.id) }; }),
      };
    }).filter((e) => e.abas.length),
  })).filter((g) => g.entradas.length);
}

/** Rotas antigas (rota da função e `antigas`) que devem redirecionar, com o destino. Não inclui a rota própria da entrada. */
export function redirecionamentos(funcoes: Funcao[] = FUNCOES): Array<{ de: string; para: string }> {
  const saida: Array<{ de: string; para: string }> = [];
  for (const g of menuLateral(funcoes)) for (const e of g.entradas) for (const x of e.abas) {
    for (const r of [x.funcao.rota, ...(x.funcao.antigas ?? [])]) if (r !== e.rota) saida.push({ de: r, para: x.rota });
  }
  return saida;
}

/** Uma aba do menu com o caminho "Grupo > Entrada > Seção" (usado pela busca). `tambem` guarda o nome antigo da tela. */
export interface ItemBusca { id: string; nome: string; rota: string; caminho: string; tambem: string }

/** Itens da busca (Ctrl K): uma linha por aba permitida. Acha o nome novo (da entrada e da aba) e os nomes antigos. */
export function itensParaBusca(funcoes: Funcao[] = FUNCOES, assistente = "IA"): ItemBusca[] {
  return menuLateral(funcoes).flatMap((g) => g.entradas.flatMap((e) => e.abas.map((x) => {
    const antigo = x.id === "analise" ? `Análise com ${assistente}` : ROTULO_MENU[x.id] ?? x.funcao.nome;
    const nome = x.id === "analise" ? antigo : x.rotulo;
    const partes = [g.nome, e.nome === g.nome || (e.abas.length === 1 && e.nome === nome) ? "" : e.nome, x.secao ?? ""];
    return { id: x.id, nome, rota: x.rota, caminho: partes.filter(Boolean).join(" > "), tambem: `${antigo} ${x.funcao.nome} ${x.secao ?? ""}`.trim() };
  })));
}
