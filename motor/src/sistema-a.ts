// Adaptador do Sistema A, pela API de Integração v2 pública do próprio sistema (OpenAPI de corridas v2).
//
// Autenticação: as DUAS coisas em todo pedido
//   - cabeçalho `api-key` (chave criada no painel do Sistema A, em Integrações)
//   - Basic Auth (usuário e senha do usuário de integração)
// Endereço base: vem da configuração da empresa (apiUrl), terminando em /api/v2/integracao.
//
// As credenciais chegam por empresa (CredenciaisSistemaA). Nada é lido de variável global aqui.

import { createHmac, timingSafeEqual } from "node:crypto";
import { MotorErro } from "./erros.ts";
import { criarHttp } from "./http.ts";
import { extrasSistemaA } from "./sistema-a-extras.ts";
import { CAPACIDADES, CATEGORIA_NAO_EXPOE, CORRIDA_NAO_EXPOE, MOTORISTA_NAO_EXPOE, camposEsperados, semDado } from "./lacunas.ts";
import type {
  Adaptador,
  Categoria,
  Corrida,
  CorridaCriada,
  CredenciaisSistemaA,
  Endereco,
  Evento,
  FiltroCorridas,
  FiltroMotoristas,
  FormaPagamento,
  Motorista,
  NovaCorrida,
  OpcoesRede,
  Pagina,
  SituacaoMotorista,
  StatusCorrida,
} from "./tipos.ts";
import { coord, grupoDe, isoLocal, num, semPrefixo, telefoneBr, txt } from "./util.ts";

const TIPO = "sistema-a" as const;
const ORIGEM = "sistema-a" as const;
const NOME = "Sistema A";

type Obj = Record<string, unknown>;

/** Códigos de status do Sistema A -> status do motor. Fonte: documentação pública do Sistema A (status_solicitacao). */
export const STATUS_A: Record<string, { status: StatusCorrida; texto: string }> = {
  D: { status: "distribuindo", texto: "Distribuindo" },
  T: { status: "distribuindo", texto: "Redistribuindo" },
  G: { status: "distribuindo", texto: "Aguardando aceite" },
  P: { status: "pendente", texto: "Pendente" },
  S: { status: "em_espera", texto: "Em espera" },
  A: { status: "aceita", texto: "Aceita" },
  E: { status: "em_andamento", texto: "Em andamento" },
  R: { status: "aguardando_pagamento", texto: "Aguardando pagamento" },
  F: { status: "finalizada", texto: "Finalizada" },
  C: { status: "cancelada", texto: "Cancelada" },
  N: { status: "nao_atendida", texto: "Não atendida" },
  U: { status: "agrupada", texto: "Agrupada" },
};

/** Códigos que só chegam no webhook de status (fases do aceite e liberação). Fonte: Webhooks > Sobre. */
const STATUS_SO_WEBHOOK_A: Record<string, StatusCorrida> = {
  AN: "aceita", // motorista perto do embarque
  AP: "no_local", // motorista chegou
  AW: "no_local", // espera passou do previsto
  L: "pendente", // aguardando liberação
};

/** A API aceita no máximo 100 itens por página (documentação: Paginação). */
export const LIMITE_MAXIMO_A = 100;
/** Intervalo máximo de busca de corridas e do extrato (códigos 39 e 31 dias). */
export const DIAS_MAXIMOS_A = 31;

/** Códigos de erro do Sistema A que dizem "sem permissão" mesmo vindo com HTTP 400 (Códigos de erro). */
const ERROS_PERMISSAO_A = new Set(["1", "19", "63", "67", "68", "B5", "B6"]);
/** Códigos de "não encontrado" que chegam com HTTP 400. */
const ERROS_NAO_ACHOU_A = new Set(["25", "56", "72", "75", "167"]);

/** Códigos de pagamento do Sistema A (tipo_pagamento / forma_pagamento). */
export const PAGAMENTO_A: Record<string, FormaPagamento> = {
  D: "dinheiro",
  B: "cartao_maquina", // débito na máquina
  C: "cartao_maquina", // crédito na máquina
  T: "voucher", // eTicket
  V: "voucher",
  X: "pix",
  P: "outro", // Picpay
  H: "outro", // Whatsapp
  A: "cartao_app",
  F: "faturado",
  I: "pix", // Pix via app
  R: "carteira",
};

const PAGAMENTO_PARA_A: Record<FormaPagamento, string> = {
  dinheiro: "D",
  pix: "X",
  cartao_app: "A",
  cartao_maquina: "C",
  carteira: "R",
  voucher: "V",
  faturado: "F",
  outro: "D",
};

function endereco(o: unknown): Endereco | undefined {
  if (!o || typeof o !== "object") return undefined;
  const e = o as Obj;
  const texto = [txt(e.endereco ?? e.endereco_parada), txt(e.complemento)].filter(Boolean).join(", ");
  if (!texto && coord(e.lat) === undefined) return undefined;
  return {
    texto,
    bairro: txt(e.bairro ?? e.bairro_parada),
    cidade: txt(e.cidade ?? e.cidade_parada),
    estado: txt(e.estado ?? e.uf ?? e.estado_parada),
    lat: coord(e.lat ?? e.lat_parada),
    lng: coord(e.lng ?? e.lng_parada),
  };
}

function descontoEmReais(integral?: number, final?: number): number | undefined {
  if (integral === undefined || final === undefined) return undefined;
  const d = Math.round((integral - final) * 100) / 100;
  return d > 0 ? d : undefined;
}

function notaSistemaA(a: unknown): Corrida["avaliacao"] {
  const nota = num((a as Obj | null)?.nota);
  return nota ? { nota } : undefined;
}

/** Converte um item de `POST /corridas/consultar` ou `GET /corridas/{id}` para o modelo único. */
export function corridaSistemaA(o: Obj, integracaoId: string = TIPO, fase?: string | null): Corrida {
  const cod = String(o.status_solicitacao ?? o.status ?? "").toUpperCase();
  const base = STATUS_A[cod] ?? { status: "desconhecido" as StatusCorrida, texto: cod || "Sem status" };
  let status = base.status;
  let statusTexto = base.texto;
  if (status === "aceita" && (fase === "no_local" || fase === "espera_prolongada")) {
    status = "no_local";
    statusTexto = fase === "espera_prolongada" ? "No local (espera longa)" : "No local";
  } else if (status === "aceita" && o.data_hora_chegada_local) {
    status = "no_local";
    statusTexto = "No local";
  }
  const pag = String(o.tipo_pagamento ?? "").toUpperCase();
  const condutorId = txt(o.condutor_id ?? o.taxista_id);
  const id = String(o.id ?? o.id_mch ?? "");
  const duracaoSeg = num(o.duracao_corrida);
  const temCondutor = condutorId || txt(o.nome_condutor);
  const valor = num(o.valor_corrida);
  const c: Omit<Corrida, "semDado"> = {
    id: `${integracaoId}:${id}`,
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    idOriginal: id,
    status,
    grupo: grupoDe(status),
    statusOriginal: cod,
    statusTexto,
    solicitadaEm: txt(o.data_hora_solicitacao_utc) ?? isoLocal(o.data_hora_solicitacao),
    aceitaEm: txt(o.data_hora_aceite_utc) ?? isoLocal(o.data_hora_aceite),
    chegadaEm: txt(o.data_hora_chegada_local_utc) ?? isoLocal(o.data_hora_chegada_local),
    iniciadaEm: txt(o.data_hora_inicio) ?? undefined,
    finalizadaEm: txt(o.data_hora_finalizacao_utc) ?? isoLocal(o.data_hora_finalizacao),
    canceladaEm: txt(o.data_hora_cancelamento_utc) ?? isoLocal(o.data_hora_cancelamento),
    passageiro: { id: txt(o.cliente_id), nome: txt(o.nome_passageiro) ?? txt(o.nome_cliente) },
    motorista: temCondutor
      ? { id: condutorId, nome: txt(o.nome_condutor ?? o.nome_taxista), telefone: txt(o.telefone_condutor_internacional ?? o.telefone_condutor ?? o.telefone_taxista) }
      : undefined,
    veiculo: txt(o.placa_veiculo) || txt(o.veiculo) ? { modelo: txt(o.veiculo), placa: txt(o.placa_veiculo), cor: txt(o.cor_veiculo) } : undefined,
    partida: endereco(o.partida ?? o.coleta) ?? { texto: "" },
    destino: endereco(o.desejado),
    paradas: Array.isArray(o.paradas) ? (o.paradas.map(endereco).filter(Boolean) as Endereco[]) : [],
    categoria: txt(o.categoria) ? { id: txt(o.id_categoria), nome: String(o.categoria) } : undefined,
    pagamento: PAGAMENTO_A[pag] ?? "outro",
    pagamentoOriginal: pag || undefined,
    valor: valor === 0 && status !== "finalizada" ? undefined : valor,
    valorSemDesconto: num(o.valor_corrida_integral),
    distanciaKm: num(o.distancia_percorrida_km) || undefined,
    duracaoMin: duracaoSeg ? Math.round(duracaoSeg / 60) : undefined,
    distanciaMotoristaKm: num(o.distancia_coleta_km),
    tarifa: txt(o.tarifa),
    cupom: txt(o.codigo_cupom),
    descontoPct: num(o.desconto) || undefined,
    descontoValor: descontoEmReais(num(o.valor_corrida_integral), valor),
    avaliacao: notaSistemaA(o.avaliacao_condutor),
    programada: false, // corridas agendadas ficam em /corridas/programadas (ainda não usado)
    linkAcompanhamento: txt(o.link_acompanhamento_solicitacao),
    bruto: o,
  };
  return { ...c, semDado: semDado(TIPO, c, CORRIDA_NAO_EXPOE["sistema-a"], camposEsperados(c)) };
}

/** Status do motor -> códigos do Sistema A (um status do motor pode valer mais de um código). */
function codigosSistemaA(s: StatusCorrida): string[] {
  if (s === "no_local") return ["A"];
  return Object.entries(STATUS_A)
    .filter(([k, v]) => v.status === s && k !== "U") // a busca recusa U (código 98)
    .map(([k]) => k);
}

/** Códigos dos itens de `errors` numa resposta de erro do Sistema A. */
function codigosErroA(corpo: unknown): string[] {
  const errs = (corpo as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errs)) return [];
  return errs.flat().map((e) => String((e as { code?: unknown } | null)?.code ?? "")).filter(Boolean);
}

/** Corrige a tradução de erros: o Sistema A manda falta de permissão e "não achei" com HTTP 400. */
export function ajustarErroSistemaA(e: unknown): unknown {
  if (!(e instanceof MotorErro) || e.codigo !== "DADOS_INVALIDOS") return e;
  const codigos = codigosErroA(e.detalhe);
  const extra = { integracaoId: e.integracaoId, statusHttp: e.statusHttp, detalhe: e.detalhe };
  if (codigos.some((c) => ERROS_PERMISSAO_A.has(c)))
    return new MotorErro("SEM_AUTORIZACAO", `${NOME}: o usuário de integração não tem permissão ou a licença não inclui a API. Confira no painel do ${NOME}.`, extra);
  if (codigos.some((c) => ERROS_NAO_ACHOU_A.has(c))) return new MotorErro("NAO_ENCONTRADO", `${NOME}: não encontrado.`, extra);
  if (codigos.includes("18")) return new MotorErro("LIMITE", `${NOME}: muitas corridas seguidas para o mesmo passageiro. Espere um pouco.`, { ...extra, tentarEmSegundos: 60 });
  return e;
}

/** Confere o intervalo de datas antes de chamar (a API recusa mais de 31 dias e início igual ao fim). */
function conferirIntervalo(de: string, ate: string, integracaoId: string) {
  const a = Date.parse(de);
  const b = Date.parse(ate);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new MotorErro("DADOS_INVALIDOS", `${NOME}: data inválida no filtro.`, { integracaoId });
  if (b <= a) throw new MotorErro("DADOS_INVALIDOS", `${NOME}: a data final precisa ser depois da inicial.`, { integracaoId });
  if (b - a > DIAS_MAXIMOS_A * 86_400_000)
    throw new MotorErro("DADOS_INVALIDOS", `${NOME}: a busca aceita no máximo ${DIAS_MAXIMOS_A} dias. Diminua o período.`, { integracaoId });
}

/** Confere o cabeçalho Signature-V2 (HMAC-SHA512 do corpo com a api-key).
 *  ATENÇÃO: a documentação não mostra o texto exato assinado; isto segue a descrição e ainda não foi
 *  confirmado com um webhook real. Aceita a assinatura em hexadecimal ou base64. */
export function assinaturaSistemaAValida(corpo: string, assinatura: string | undefined, chave: string): boolean {
  if (!assinatura || !chave) return false;
  const mac = createHmac("sha512", chave).update(corpo, "utf8").digest();
  const recebida = assinatura.trim();
  const hex = mac.toString("hex");
  for (const [esperada, dada] of [
    [hex, recebida.toLowerCase()],
    [mac.toString("base64"), recebida],
  ]) {
    const a = Buffer.from(esperada);
    const b = Buffer.from(dada);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Traduz o corpo de um webhook do Sistema A (tipos status, posicao, mensagens_corrida, mensagens). */
export function eventosSistemaA(corpo: string, integracaoId: string = TIPO): Evento[] {
  let o: unknown;
  try {
    o = JSON.parse(corpo);
  } catch {
    throw new MotorErro("DADOS_INVALIDOS", "Sistema A: o webhook não veio em JSON.", { integracaoId });
  }
  const agora = new Date().toISOString();
  const lista = Array.isArray(o) ? o : [o];
  const saida: Evento[] = [];
  const base = { integracaoId, origem: ORIGEM };
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const e = item as Obj;
    const em = txt(e.datetime) ?? agora;
    // Lote de posições: { event_id, datetime, data: [ { request_id, driver_id, coordinates } ] }
    if (Array.isArray(e.data)) {
      for (const p of e.data as Obj[]) {
        const c = (p.coordinates ?? {}) as Obj;
        const lat = coord(c.latitude ?? p.lat_cond);
        const lng = coord(c.longitude ?? p.lng_cond);
        if (lat === undefined || lng === undefined) continue;
        const req = txt(p.request_id ?? p.id_mch);
        const ts = num(p.timestamp);
        saida.push({
          ...base,
          tipo: "posicao",
          corridaId: req ? `${integracaoId}:${req}` : undefined,
          em: ts ? new Date(ts).toISOString() : em,
          posicao: { lat, lng, motoristaId: txt(p.driver_id ?? p.condutor_id) },
          idEvento: txt(e.event_id),
          bruto: p,
        });
      }
      continue;
    }
    const req = txt(e.request_id ?? e.id_mch ?? e.solicitacao_id);
    const corridaId = req ? `${integracaoId}:${req}` : undefined;
    // Formato antigo (deprecado) de posição: { id_mch, condutor_id, lat_cond, lng_cond }
    if (e.lat_cond !== undefined || e.lng_cond !== undefined) {
      const lat = coord(e.lat_cond);
      const lng = coord(e.lng_cond);
      if (lat !== undefined && lng !== undefined)
        saida.push({ ...base, tipo: "posicao", corridaId, em, posicao: { lat, lng, motoristaId: txt(e.condutor_id) }, bruto: e });
      continue;
    }
    // status_solicitacao = formato antigo (deprecado) do webhook de status
    const codigo = txt(e.status_code ?? e.status_solicitacao ?? e.status)?.toUpperCase();
    if (codigo === "ER") {
      saida.push({ ...base, tipo: "parada", corridaId, em, idEvento: txt(e.event_id), bruto: e });
    } else if (codigo) {
      const ev: Evento = {
        ...base,
        tipo: "status",
        corridaId,
        em,
        status: STATUS_A[codigo]?.status ?? STATUS_SO_WEBHOOK_A[codigo] ?? "desconhecido",
        idEvento: txt(e.event_id),
        bruto: e,
      };
      // Cancelada com will_reopen=true: a MESMA corrida volta para a distribuição (não abrir outra).
      if (codigo === "C" && typeof e.will_reopen === "boolean") ev.reabre = e.will_reopen;
      saida.push(ev);
    } else if (e.content !== undefined || e.message_id !== undefined) {
      saida.push({
        ...base,
        tipo: "mensagem",
        corridaId,
        em,
        mensagem: { texto: String(e.content ?? ""), de: txt(e.sender_type ?? e.type_label) },
        idEvento: txt(e.event_id),
        bruto: e,
      });
    }
  }
  return saida;
}

/** Situação do condutor no Sistema A (status_condutor). */
const SITUACAO_A: Record<string, SituacaoMotorista> = {
  A: "ativo",
  E: "em_analise",
  F: "fila_de_espera",
  I: "inativo",
  S: "suspenso",
  R: "rejeitado",
  D: "deletado",
};
const SITUACAO_PARA_A = Object.fromEntries(Object.entries(SITUACAO_A).map(([k, v]) => [v, k])) as Record<SituacaoMotorista, string>;

export function motoristaSistemaA(m: Obj, integracaoId: string = TIPO): Motorista {
  const veics = Array.isArray(m.veiculos) ? (m.veiculos as Obj[]) : [];
  const v = veics.find((x) => x.em_uso) ?? veics[0];
  const r: Omit<Motorista, "semDado"> = {
    id: `${integracaoId}:${m.id}`,
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    idOriginal: String(m.id),
    nome: String(m.nome ?? ""),
    telefone: txt(m.telefone_internacional ?? m.telefone),
    cpf: txt(m.cpf),
    ativo: String(m.status ?? "").toUpperCase() === "A",
    avaliacao: num(m.avaliacao_media),
    categorias: Array.isArray(m.categorias) ? (m.categorias as Obj[]).map((c) => String(c.nome ?? "")).filter(Boolean) : [],
    veiculo: v ? { modelo: txt(v.modelo), placa: txt(v.placa) } : undefined,
    situacao: SITUACAO_A[String(m.status ?? "").toUpperCase()],
    viatura: txt(m.numero_viatura),
    fotoUrl: txt(m.foto_url),
    bruto: m,
  };
  return { ...r, semDado: semDado(TIPO, r, MOTORISTA_NAO_EXPOE["sistema-a"], ["telefone", "veiculo"]) };
}

export function criarAdaptadorSistemaA(
  integ: { id?: string; credenciais: Partial<CredenciaisSistemaA> },
  rede: OpcoesRede = {},
): Adaptador {
  const integracaoId = integ.id || TIPO;
  const cred = integ.credenciais ?? {};
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
  // O endereço vem da configuração da empresa: nenhum servidor fica fixo no código.
  const base = () => s(cred.apiUrl).replace(/\/+$/, "");
  const pedir = criarHttp(NOME, rede.fetch ?? fetch, rede.timeoutMs, integracaoId);

  const pendencias = () =>
    [
      !s(cred.apiUrl) && "Falta o endereço da API do Sistema A (termina em /api/v2/integracao).",
      !s(cred.apiKey) && "Falta a chave da API do Sistema A (painel do Sistema A > Integrações).",
      !s(cred.usuario) && "Falta o usuário de integração do Sistema A.",
      !s(cred.senha) && "Falta a senha do usuário de integração do Sistema A.",
    ].filter(Boolean) as string[];

  const exigir = () => {
    const p = pendencias();
    if (p.length) throw new MotorErro("NAO_CONFIGURADO", `Sistema A não configurado: ${p.join(" ")}`, { integracaoId });
  };

  const cabecalhos = () => ({
    "api-key": s(cred.apiKey),
    Authorization: "Basic " + Buffer.from(`${s(cred.usuario)}:${s(cred.senha)}`).toString("base64"),
  });

  async function chamar<T = Obj>(metodo: "GET" | "POST", caminho: string, json?: unknown, query?: Record<string, string | number | undefined>) {
    exigir();
    const url = new URL(base() + caminho);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    let r: Awaited<ReturnType<typeof pedir<T>>>;
    try {
      r = await pedir<T>({ metodo, url, cabecalhos: cabecalhos(), json });
    } catch (e) {
      throw ajustarErroSistemaA(e);
    }
    const corpo = r.corpo as Obj;
    if (corpo && typeof corpo === "object" && corpo.success === false)
      throw new MotorErro("ERRO_REMOTO", "Sistema A: pedido recusado.", { integracaoId, detalhe: corpo });
    return r.corpo;
  }

  return {
    integracaoId,
    tipo: TIPO,
    origem: ORIGEM,
    nome: NOME,
    configurado: () => pendencias().length === 0,
    pendencias,
    capacidades: () => CAPACIDADES["sistema-a"],

    async listarCorridas(f: FiltroCorridas = {}): Promise<Pagina<Corrida>> {
      const pagina = Math.max(1, f.pagina ?? 1);
      const limite = Math.min(Math.max(1, f.limite ?? 50), LIMITE_MAXIMO_A);
      const de = f.de ?? new Date(Date.now() - 86_400_000).toISOString();
      const ate = f.ate ?? new Date().toISOString();
      conferirIntervalo(de, ate, integracaoId);
      const codigos = [...new Set((f.status ?? []).flatMap(codigosSistemaA))];
      const pagCodigos = f.pagamento ? Object.entries(PAGAMENTO_A).filter(([, v]) => v === f.pagamento).map(([k]) => k) : [];
      const numero = (v?: string) => (v ? Number(semPrefixo(v)) : undefined);
      const corpo: Obj = {
        pagina,
        limite,
        data_hora_solicitacao_min: de,
        data_hora_solicitacao_max: ate,
        condutor_id: numero(f.motoristaId),
        empresa_id: numero(f.empresaId),
        cliente_id: numero(f.passageiroId),
        // Um pagamento do motor pode valer mais de um código (ex.: pix = X e I); aí filtramos aqui.
        tipo_pagamento: pagCodigos.length === 1 ? pagCodigos[0] : undefined,
        // A API só aceita UM status por pedido; com mais de um, filtramos aqui.
        status_solicitacao: codigos.length === 1 ? codigos[0] : undefined,
      };
      const r = await chamar<Obj>("POST", "/corridas/consultar", corpo);
      const dados = Array.isArray(r.data) ? (r.data as Obj[]) : [];
      let itens = dados.map((o) => corridaSistemaA(o, integracaoId));
      if (f.status?.length) itens = itens.filter((c) => f.status!.includes(c.status));
      if (f.pagamento) itens = itens.filter((c) => c.pagamento === f.pagamento);
      return { itens, pagina, temMais: dados.length >= limite };
    },

    async detalharCorrida(idOriginal) {
      const id = semPrefixo(idOriginal);
      const r = await chamar<Obj>("GET", `/corridas/${encodeURIComponent(id)}`);
      const o = (Array.isArray(r.data) ? r.data[0] : r.data) as Obj | undefined;
      if (!o) throw new MotorErro("NAO_ENCONTRADO", `Sistema A: corrida ${id} não encontrada.`, { integracaoId });
      let fase: string | null = null;
      if (String(o.status_solicitacao).toUpperCase() === "A") {
        try {
          const st = await chamar<Obj>("GET", `/corridas/${encodeURIComponent(id)}/status`);
          fase = (txt((st.data as Obj)?.fase) ?? null) as string | null;
        } catch {
          /* fase é opcional (só para centrais habilitadas) */
        }
      }
      return corridaSistemaA(o, integracaoId, fase);
    },

    async criarCorrida(n: NovaCorrida): Promise<CorridaCriada> {
      const tel = telefoneBr(n.passageiro.telefone);
      if (!tel) throw new MotorErro("DADOS_INVALIDOS", "Sistema A: telefone do passageiro inválido (use DDD + número).", { integracaoId });
      if (!n.partida.texto || !n.partida.bairro)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema A: a partida precisa de endereço e bairro.", { integracaoId });
      // Erro 32 da documentação: parada sem endereço ou bairro. Conferimos antes de chamar.
      if (n.paradas?.some((p) => !p.texto || !p.bairro))
        throw new MotorErro("DADOS_INVALIDOS", "Sistema A: cada parada precisa de endereço e bairro.", { integracaoId });
      if (n.paradas && n.paradas.length > 1000) throw new MotorErro("DADOS_INVALIDOS", "Sistema A: no máximo 1000 paradas.", { integracaoId });
      if (n.idExterno && n.idExterno.length > 36)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema A: o id externo pode ter no máximo 36 caracteres.", { integracaoId });
      const fone = { codigo_pais: tel.codigoPais, codigo_area: tel.ddd, telefone: Number(tel.numero) };
      const end = (x: Endereco) => ({ endereco: x.texto, bairro: x.bairro, cidade: x.cidade, estado: x.estado, lat: x.lat, lng: x.lng });
      const corpo: Obj = {
        id_externo: n.idExterno,
        dados_cadastro: fone,
        dados_passageiro: { ...fone, nome: n.passageiro.nome },
        forma_pagamento: PAGAMENTO_PARA_A[n.pagamento] ?? "D",
        partida: end(n.partida),
        desejado: n.destino ? end(n.destino) : undefined,
        categoria_id: n.categoriaId ? Number(semPrefixo(n.categoriaId)) : undefined,
        info_antes_aceite: n.observacao,
        codigo_cupom: n.cupom?.trim() || undefined,
        empresa: n.empresa
          ? { id: Number(semPrefixo(n.empresa.id)), centro_custo_id: n.empresa.centroCustoId ? Number(semPrefixo(n.empresa.centroCustoId)) : undefined }
          : undefined,
        paradas: n.paradas?.length
          ? n.paradas.map((p) => ({ endereco_parada: p.texto, bairro_parada: p.bairro, cidade_parada: p.cidade, estado_parada: p.estado, lat_parada: p.lat, lng_parada: p.lng }))
          : undefined,
      };
      let r: Obj;
      try {
        r = await chamar<Obj>("POST", "/corridas", corpo);
      } catch (e) {
        // A documentação avisa: no erro 500 por tempo esgotado a corrida pode ter sido criada mesmo assim.
        if (e instanceof MotorErro && e.codigo === "INDISPONIVEL")
          throw new MotorErro(
            "INDISPONIVEL",
            `${e.message} A corrida pode ter sido criada mesmo assim: confira a lista antes de pedir de novo${n.idExterno ? ` (id externo ${n.idExterno})` : ""}.`,
            { integracaoId, statusHttp: e.statusHttp, detalhe: e.detalhe },
          );
        throw e;
      }
      const d = (r.data ?? {}) as Obj;
      const id = String(d.id_mch ?? "");
      if (!id) throw new MotorErro("ERRO_REMOTO", "Sistema A: a corrida foi aceita mas não veio o número dela.", { integracaoId, detalhe: r });
      return { id: `${integracaoId}:${id}`, integracaoId, origem: ORIGEM, idOriginal: id, valor: num(d.valor_corrida), bruto: r };
    },

    async cancelarCorrida(idOriginal, motivo) {
      const id = semPrefixo(idOriginal);
      // O Sistema A pede um número de motivo (motivo_id). Sem um número, usa o padrão da empresa.
      const motivoId = Number(motivo && /^\d+$/.test(motivo) ? motivo : cred.motivoCancelamentoId);
      if (!motivoId)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema A: informe o número do motivo ou configure o motivo padrão de cancelamento.", { integracaoId });
      await chamar("POST", `/corridas/${encodeURIComponent(id)}/cancelar`, { motivo_id: motivoId });
    },

    async motoristas(f: FiltroMotoristas = {}): Promise<Pagina<Motorista>> {
      const pagina = Math.max(1, f.pagina ?? 1);
      const limite = Math.min(Math.max(1, f.limite ?? 50), LIMITE_MAXIMO_A);
      const b = (f.busca ?? "").trim();
      const digitos = b.replace(/\D/g, "");
      const query: Record<string, string | number | undefined> = { pagina, limite, status_condutor: f.situacao ? SITUACAO_PARA_A[f.situacao] : undefined };
      if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(b)) query.cpf = b; // CPF só com máscara, para não confundir com telefone
      else if (digitos.length >= 10) query.telefone = digitos;
      let r: Obj;
      try {
        r = await chamar<Obj>("GET", "/condutores", undefined, query);
      } catch (e) {
        // Sem condutor para o filtro, a API responde 404 com código 56 (e não lista vazia).
        if (e instanceof MotorErro && e.codigo === "NAO_ENCONTRADO") return { itens: [], pagina, temMais: false };
        throw e;
      }
      const dados = Array.isArray(r.data) ? (r.data as Obj[]) : [];
      let itens = dados.map((m) => motoristaSistemaA(m, integracaoId));
      if (b && !query.cpf && !query.telefone) {
        const alvo = b.toLowerCase();
        itens = itens.filter((m) => m.nome.toLowerCase().includes(alvo));
      }
      return { itens, pagina, temMais: dados.length >= limite };
    },

    async categorias(): Promise<Categoria[]> {
      // A API pede um local (lat e lng, ou endereço). Usamos o ponto padrão da empresa, se houver.
      const lat = coord(cred.latPadrao);
      const lng = coord(cred.lngPadrao);
      const temLocal = lat !== undefined && lng !== undefined && lat !== 0 && lng !== 0;
      let r: Obj;
      try {
        r = await chamar<Obj>("GET", "/configuracoes/categorias", undefined, temLocal ? { lat, lng } : undefined);
      } catch (e) {
        if (!temLocal && e instanceof MotorErro && e.codigo === "DADOS_INVALIDOS")
          throw new MotorErro("NAO_CONFIGURADO", `${NOME}: a lista de categorias precisa de um local. Configure latPadrao e lngPadrao da empresa.`, {
            integracaoId,
            statusHttp: e.statusHttp,
            detalhe: e.detalhe,
          });
        throw e;
      }
      const dados = Array.isArray(r.data) ? (r.data as Obj[]) : [];
      return dados.map((c) => {
        const cat: Omit<Categoria, "semDado"> = {
          id: `${integracaoId}:${c.id}`,
          integracaoId,
          tipo: TIPO,
          origem: ORIGEM,
          idOriginal: String(c.id),
          nome: String(c.nome ?? ""),
          descricao: txt(c.descricao),
          bruto: c,
        };
        return { ...cat, semDado: semDado(TIPO, cat, CATEGORIA_NAO_EXPOE["sistema-a"], []) };
      });
    },

    lerWebhook(corpo) {
      return eventosSistemaA(corpo, integracaoId);
    },

    ...extrasSistemaA({ integracaoId, chamar }),
  };
}
