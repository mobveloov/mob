// Adaptador do Sistema B.
//
// O Sistema B NÃO tem API pública documentada nem webhooks. O que existe (visto nas páginas salvas do painel e no
// código dos apps) são duas partes do mesmo servidor, com endereços vindos da configuração da empresa:
//   1) Painel web (painelUrl):  páginas *.php     -> pede a sessão do painel (cookie PHPSESSID)
//   2) API do app (appApiUrl):  rotas *.php       -> usada pelo app do passageiro
// O motor usa o painel (com o cookie de uma sessão da própria empresa) para corridas, motoristas,
// criar e cancelar. Para categorias usa o endpoint público do app (testado de verdade, sem login).
// Eventos: como não há webhook, use o observador (motor/src/observador.ts), que compara listagens.
//
// As credenciais chegam por empresa (CredenciaisSistemaB). Nada é lido de variável global aqui.

import { MotorErro } from "./erros.ts";
import { criarHttp, mensagemRemota } from "./http.ts";
import { extrasSistemaB } from "./sistema-b-extras.ts";
import { CAPACIDADES, CATEGORIA_NAO_EXPOE, CORRIDA_NAO_EXPOE, MOTORISTA_NAO_EXPOE, camposEsperados, semDado } from "./lacunas.ts";
import type {
  Adaptador,
  Categoria,
  Corrida,
  CorridaCriada,
  CredenciaisSistemaB,
  FiltroCorridas,
  FiltroMotoristas,
  FormaPagamento,
  Motorista,
  NovaCorrida,
  OpcoesRede,
  Pagina,
  StatusCorrida,
} from "./tipos.ts";
import { coord, grupoDe, isoLocal, num, partesBrasilia, semPrefixo, txt } from "./util.ts";

const TIPO = "sistema-b" as const;
const ORIGEM = "sistema-b" as const;
const NOME = "sistema-b";

type Obj = Record<string, unknown>;

/** Códigos de status do Sistema B (filtro "status" do painel Consultar corridas). */
export const STATUS_B: Record<string, { status: StatusCorrida; texto: string; canceladaPor?: "passageiro" | "motorista" }> = {
  "0": { status: "distribuindo", texto: "Aguardando" },
  "6": { status: "pendente", texto: "Pendente" },
  "10": { status: "em_espera", texto: "Em fila" },
  "1": { status: "aceita", texto: "A caminho" },
  "2": { status: "no_local", texto: "Chegou" },
  "3": { status: "em_andamento", texto: "Em viagem" },
  "9": { status: "em_andamento", texto: "Maçaneta" },
  "4": { status: "finalizada", texto: "Finalizada" },
  "5": { status: "cancelada", texto: "Cancelada pelo passageiro", canceladaPor: "passageiro" },
  "8": { status: "cancelada", texto: "Cancelada pelo motorista", canceladaPor: "motorista" },
  "11": { status: "nao_atendida", texto: "Não atendida" },
};

export function pagamentoSistemaB(v: unknown): FormaPagamento {
  const s = String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!s) return "outro";
  if (s.includes("pix")) return "pix";
  if (s.includes("dinheiro")) return "dinheiro";
  if (s.includes("maquin")) return "cartao_maquina";
  if (s.includes("carteira") || s.includes("saldo")) return "carteira";
  if (s.includes("cart")) return "cartao_app";
  if (s.includes("voucher")) return "voucher";
  return "outro";
}

const PAGAMENTO_PARA_B: Partial<Record<FormaPagamento, string>> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_app: "Cartão",
  cartao_maquina: "Maquininha",
};

/** Converte um item de consultar_corridas_api.php (listar ou detalhes) para o modelo único. */
export function corridaSistemaB(o: Obj, integracaoId: string = TIPO): Corrida {
  const cod = String(o.status ?? "").trim();
  const st = STATUS_B[cod];
  const status = st?.status ?? "desconhecido";
  const stUi = (o.st_ui ?? {}) as Obj;
  const id = String(o.id ?? "");
  const canal = txt(o.origem_visual ?? o.origem_solicitacao);
  const quem = String(o.quem_cancelou ?? "").toLowerCase();
  const canceladaPor =
    st?.canceladaPor ??
    (status === "cancelada" && quem ? (quem.includes("motor") ? "motorista" : quem.includes("pass") ? "passageiro" : "central") : undefined);
  const motoristaNome = txt(o.motorista_nome ?? o.nome_motorista);
  let paradas: Corrida["paradas"] = [];
  if (typeof o.paradas_json === "string" && o.paradas_json.trim().startsWith("[")) {
    try {
      paradas = (JSON.parse(o.paradas_json) as Obj[]).map((p) => ({ texto: String(p.endereco ?? p.texto ?? ""), lat: coord(p.lat), lng: coord(p.lng) }));
    } catch {
      /* paradas ilegíveis: ignora */
    }
  }
  const c: Omit<Corrida, "semDado"> = {
    id: `${integracaoId}:${id}`,
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    idOriginal: id,
    status,
    grupo: grupoDe(status),
    statusOriginal: cod,
    statusTexto: txt(stUi.label) ?? st?.texto ?? (cod ? `Status ${cod}` : "Sem status"),
    canceladaPor,
    motivoCancelamento: txt(o.motivo_cancel ?? o.info_cancelamento),
    solicitadaEm: isoLocal(o.date ?? o.data ?? o.data_solicitacao_fmt),
    aceitaEm: isoLocal(o.data_aceite_fmt),
    chegadaEm: isoLocal(o.data_chegada_fmt),
    iniciadaEm: isoLocal(o.data_inicio_fmt),
    finalizadaEm: isoLocal(o.data_finalizacao_fmt),
    canceladaEm: isoLocal(o.data_cancel),
    passageiro: { id: txt(o.cliente_id), nome: txt(o.nome_cliente), telefone: txt(o.passageiro_telefone ?? o.tel_cliente_cadastro) },
    motorista:
      motoristaNome || txt(o.motorista_id) ? { id: txt(o.motorista_id), nome: motoristaNome, telefone: txt(o.motorista_fone_fmt ?? o.tel_mot_fmt) } : undefined,
    veiculo: txt(o.placa) || txt(o.motorista_carro) ? { modelo: txt(o.motorista_carro ?? o.veiculo), placa: txt(o.placa), cor: txt(o.cor) } : undefined,
    partida: { texto: String(o.endereco_ini_txt ?? ""), lat: coord(o.lat_ini), lng: coord(o.lng_ini) },
    destino: txt(o.endereco_fim_txt) ? { texto: String(o.endereco_fim_txt), lat: coord(o.lat_fim), lng: coord(o.lng_fim) } : undefined,
    paradas,
    categoria: txt(o.nome_categoria) ? { nome: String(o.nome_categoria) } : undefined,
    pagamento: pagamentoSistemaB(o.f_pagamento),
    pagamentoOriginal: txt(o.f_pagamento),
    valor: num(o.valor_final ?? o.valor_final_fmt),
    valorSemDesconto: num(o.valor_inicial ?? o.valor_inicial_fmt),
    distanciaKm: num(o.distancia_prevista),
    distanciaMotoristaKm: num(o.distancia_deslocamento_km),
    descontoValor: num(o.valor_desconto_fmt) || undefined,
    avaliacao: num(o.nota) ? { nota: num(o.nota)! } : undefined,
    dinamica:
      o.tem_dinamica === undefined && o.dinamica_info === undefined
        ? undefined
        : { ativa: String(o.tem_dinamica) === "1" || o.tem_dinamica === true, descricao: txt(o.dinamica_info) },
    programada: false, // agendadas ficam em consultar_programadas.php (ainda não usado)
    canal: cod === "9" ? "macaneta" : canal?.toLowerCase(),
    observacao: txt(o.obs_txt),
    linkAcompanhamento: txt(o.share_link),
    bruto: o,
  };
  return { ...c, semDado: semDado(TIPO, c, CORRIDA_NAO_EXPOE["sistema-b"], camposEsperados(c)) };
}

export function motoristaSistemaB(m: Obj, integracaoId: string = TIPO): Motorista {
  const r: Omit<Motorista, "semDado"> = {
    id: `${integracaoId}:${m.id}`,
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    idOriginal: String(m.id),
    nome: String(m.nome ?? ""),
    telefone: txt(m.telefone),
    cpf: txt(m.cpf),
    ativo: String(m.ativo ?? "1") === "1" || m.ativo === true,
    online: m.online === undefined ? undefined : String(m.online) === "1" || m.online === true,
    categorias: [],
    veiculo: txt(m.placa) || txt(m.veiculo) ? { modelo: txt(m.veiculo), placa: txt(m.placa) } : undefined,
    bruto: m,
  };
  return { ...r, semDado: semDado(TIPO, r, MOTORISTA_NAO_EXPOE["sistema-b"], ["veiculo"]) };
}

export function criarAdaptadorSistemaB(
  integ: { id?: string; credenciais: Partial<CredenciaisSistemaB> },
  rede: OpcoesRede = {},
): Adaptador {
  const integracaoId = integ.id || TIPO;
  const cred = integ.credenciais ?? {};
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
  // Os endereços vêm da configuração da empresa: nenhum servidor fica fixo no código.
  const painel = () => s(cred.painelUrl).replace(/\/+$/, "");
  const app = () => s(cred.appApiUrl).replace(/\/+$/, "");
  const pedir = criarHttp(NOME, rede.fetch ?? fetch, rede.timeoutMs, integracaoId);

  const pendencias = () =>
    [
      !s(cred.painelUrl) && "Falta o endereço do painel web do Sistema B (pasta onde ficam as páginas .php).",
      !s(cred.cookie) && "Falta o cookie PHPSESSID de uma sessão da empresa no painel do Sistema B.",
    ].filter(Boolean) as string[];

  const exigirCookie = () => {
    const p = pendencias();
    if (p.length) throw new MotorErro("NAO_CONFIGURADO", `Sistema B não configurado: ${p.join(" ")}`, { integracaoId });
  };

  const cookie = () => (s(cred.cookie).includes("=") ? s(cred.cookie) : `PHPSESSID=${s(cred.cookie)}`);

  /** Chama uma página PHP do painel. O painel responde 200 mesmo com erro, então olhamos success/msg. */
  async function painelPhp(arquivo: string, opts: { query?: Obj; formulario?: Obj } = {}): Promise<Obj> {
    exigirCookie();
    const url = new URL(`${painel()}/${arquivo}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const r = await pedir<unknown>({
      metodo: opts.formulario ? "POST" : "GET",
      url,
      cabecalhos: { Cookie: cookie(), "X-Requested-With": "XMLHttpRequest" },
      formulario: opts.formulario as Record<string, string | number | undefined> | undefined,
    });
    const corpo = r.corpo;
    if (typeof corpo === "string") {
      // Sessão vencida: o painel devolve a página de login (HTML) em vez de JSON.
      if (/<html|login|senha/i.test(corpo))
        throw new MotorErro("SEM_AUTORIZACAO", "Sistema B: a sessão do painel venceu. Entre no painel e copie o cookie de novo.", { integracaoId, statusHttp: r.status });
      throw new MotorErro("ERRO_REMOTO", "Sistema B: resposta inesperada (não veio JSON).", { integracaoId, detalhe: corpo.slice(0, 200) });
    }
    const o = (corpo ?? {}) as Obj;
    if (o.success === false || o.status === "erro" || o.erro === true) {
      const msg = mensagemRemota(o);
      if (/acesso negado|login|sess/i.test(msg))
        throw new MotorErro("SEM_AUTORIZACAO", "Sistema B: acesso negado. O cookie do painel está errado ou venceu.", { integracaoId, detalhe: o });
      if (/n[aã]o encontrad/i.test(msg)) throw new MotorErro("NAO_ENCONTRADO", `Sistema B: ${msg}`, { integracaoId, detalhe: o });
      throw new MotorErro("DADOS_INVALIDOS", `Sistema B: ${msg || "pedido recusado."}`, { integracaoId, detalhe: o });
    }
    return o;
  }

  return {
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    nome: NOME,
    configurado: () => pendencias().length === 0,
    pendencias,
    capacidades: () => CAPACIDADES["sistema-b"],

    async listarCorridas(f: FiltroCorridas = {}): Promise<Pagina<Corrida>> {
      const pagina = Math.max(1, f.pagina ?? 1);
      const de = partesBrasilia(f.de ?? new Date(Date.now() - 86_400_000).toISOString());
      const ate = partesBrasilia(f.ate ?? new Date().toISOString());
      const codigos = (f.status ?? []).flatMap((st) =>
        Object.entries(STATUS_B)
          .filter(([, v]) => v.status === st)
          .map(([k]) => k),
      );
      const o = await painelPhp("consultar_corridas_api.php", {
        formulario: {
          acao: "listar",
          pagina,
          data_ini: de.dia,
          hora_ini: de.hora,
          data_fim: ate.dia,
          hora_fim: ate.hora,
          // O painel aceita UM status por vez; com mais de um, filtramos aqui.
          status: codigos.length === 1 ? codigos[0] : "todos",
          categoria: "todos",
          pagamento: "todos",
          origem_solicitacao: "todos",
          motorista_id: f.motoristaId ? semPrefixo(f.motoristaId) : undefined,
          cidade_filtro: s(cred.cidadeId) || undefined,
        },
      });
      const dados = Array.isArray(o.data) ? (o.data as Obj[]) : [];
      let itens = dados.map((d) => corridaSistemaB(d, integracaoId));
      if (f.status?.length) itens = itens.filter((c) => f.status!.includes(c.status));
      if (f.motoristaId) itens = itens.filter((c) => !c.motorista?.id || c.motorista.id === semPrefixo(f.motoristaId!));
      const totalPags = num(o.total_pags);
      const stats = (o.stats ?? {}) as Obj;
      return { itens, pagina, temMais: totalPags !== undefined ? pagina < totalPags : dados.length > 0, total: num(stats.total) };
    },

    async detalharCorrida(idOriginal) {
      const id = semPrefixo(idOriginal);
      const o = await painelPhp("consultar_corridas_api.php", { query: { acao: "detalhes", id } });
      const d = o.data as Obj | undefined;
      if (!d || !d.id) throw new MotorErro("NAO_ENCONTRADO", `Sistema B: corrida ${id} não encontrada.`, { integracaoId });
      return corridaSistemaB(d, integracaoId);
    },

    async criarCorrida(n: NovaCorrida): Promise<CorridaCriada> {
      const cidade = s(cred.cidadeId);
      if (!cidade) throw new MotorErro("NAO_CONFIGURADO", "Sistema B: configure o id da cidade da empresa para criar corridas.", { integracaoId });
      if (n.partida.lat === undefined || n.partida.lng === undefined)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema B: a partida precisa de latitude e longitude.", { integracaoId });
      const pag = PAGAMENTO_PARA_B[n.pagamento];
      if (!pag) throw new MotorErro("DADOS_INVALIDOS", `Sistema B: forma de pagamento "${n.pagamento}" não é aceita no painel.`, { integracaoId });
      const o = await painelPhp("solicitar_corrida.php", {
        formulario: {
          acao: "criar_corrida",
          cidade_id_final: cidade,
          cliente_id: "",
          nome_passageiro: n.passageiro.nome,
          tel_passageiro: n.passageiro.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""),
          origem: n.partida.texto,
          lat_origem: n.partida.lat,
          lng_origem: n.partida.lng,
          destino: n.destino?.texto ?? "informar depois",
          lat_destino: n.destino?.lat ?? 0,
          lng_destino: n.destino?.lng ?? 0,
          valor_final: (n.valor ?? 0).toFixed(2),
          categoria_id: n.categoriaId ? semPrefixo(n.categoriaId) : "",
          observacao: n.observacao ?? "",
          forma_pagamento: pag,
          distancia: 0,
          tempo: 0,
          exigencias: "[]",
        },
      });
      // Formato da resposta não confirmado (não criamos corrida real). Procuramos o número em nomes usuais.
      const id = txt(o.id ?? o.id_corrida ?? o.corrida_id ?? (o.data as Obj | undefined)?.id);
      if (!id) throw new MotorErro("ERRO_REMOTO", "Sistema B: o painel aceitou mas não devolveu o número da corrida.", { integracaoId, detalhe: o });
      return { id: `${integracaoId}:${id}`, integracaoId, origem: ORIGEM, idOriginal: id, valor: n.valor, bruto: o };
    },

    async cancelarCorrida(idOriginal, motivo) {
      await painelPhp("cancelar_corrida_painel.php", {
        formulario: {
          id_corrida: semPrefixo(idOriginal),
          origem: "central",
          motivo: motivo || "Cancelamento realizado via Painel Administrativo (central)",
        },
      });
    },

    async motoristas(f: FiltroMotoristas = {}): Promise<Pagina<Motorista>> {
      const pagina = Math.max(1, f.pagina ?? 1);
      const b = (f.busca ?? "").trim();
      const dig = b.replace(/\D/g, "");
      const ehCpf = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(b);
      const o = await painelPhp("api_motoristas.php", {
        query: {
          acao: "listar",
          page: pagina,
          nome: dig.length < 8 ? b : "",
          telefone: !ehCpf && dig.length >= 8 ? dig : "",
          cpf: ehCpf ? b : "",
          cidade_filtro: s(cred.cidadeId) || undefined,
        },
      });
      const dados = Array.isArray(o.data) ? (o.data as Obj[]) : [];
      const pg = (o.paginacao ?? {}) as Obj;
      const total = num(pg.total_paginas);
      return { itens: dados.map((m) => motoristaSistemaB(m, integracaoId)), pagina, temMais: total !== undefined ? pagina < total : false };
    },

    async categorias(): Promise<Categoria[]> {
      // Endpoint público do app do passageiro: não precisa de cookie, só da cidade.
      const cidade = s(cred.cidadeId);
      if (!cidade) throw new MotorErro("NAO_CONFIGURADO", "Sistema B: configure o id da cidade da empresa para listar categorias.", { integracaoId });
      if (!app()) throw new MotorErro("NAO_CONFIGURADO", "Sistema B: configure o endereço da API do app para listar categorias.", { integracaoId });
      const r = await pedir<unknown>({ url: `${app()}/get_categorias_ativas.php`, formulario: { cidade_id: cidade } });
      const lista = Array.isArray(r.corpo) ? (r.corpo as Obj[]) : [];
      return lista.map((c) => {
        const cat: Omit<Categoria, "semDado"> = {
          id: `${integracaoId}:${c.id}`,
          integracaoId,
          tipo: TIPO,
          origem: ORIGEM,
          idOriginal: String(c.id),
          nome: String(c.nome ?? ""),
          descricao: txt(c.descricao),
          tarifa: { base: num(c.tx_base), km: num(c.tx_km), minuto: num(c.tx_minuto), minima: num(c.tx_minima) },
          bruto: c,
        };
        return { ...cat, semDado: semDado(TIPO, cat, CATEGORIA_NAO_EXPOE["sistema-b"], []) };
      });
    },

    lerWebhook() {
      throw new MotorErro("NAO_SUPORTADO", "Sistema B: o sistema não envia webhooks. Use o observador (consulta periódica).", { integracaoId });
    },

    ...extrasSistemaB({ integracaoId, painelPhp, cidadeId: () => s(cred.cidadeId) }),
  };
}
