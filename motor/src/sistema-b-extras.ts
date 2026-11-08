// Funções extras do Sistema B, pelo painel web (cookie da sessão). Rotas e campos lidos do JavaScript das páginas
// salvas do painel (arquivo do Sistema B). Ainda sem teste com sessão real: o formato pode ter diferenças.

import { MotorErro } from "./erros.ts";
import { CAPACIDADES } from "./lacunas.ts";
import type {
  Adaptador,
  Carteira,
  Cupom,
  Dinamica,
  Estimativa,
  FiltroLista,
  LinhaDoTempo,
  MensagemCorrida,
  Pagina,
  Passageiro,
  PedidoEstimativa,
  Programada,
  Punicao,
  Rastreio,
  SemDado,
  VeiculoCadastro,
} from "./tipos.ts";
import { coord, isoLocal, num, semPrefixo, txt } from "./util.ts";

type Obj = Record<string, unknown>;
type PainelPhp = (arquivo: string, opts?: { query?: Obj; formulario?: Obj }) => Promise<Obj>;

const ORIGEM = "sistema-b" as const;
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const sd = (campo: string, motivo: string): SemDado => ({ campo, motivo: `Sistema B: ${motivo}`, doSistema: true });
const sim = (v: unknown) => v === true || v === 1 || String(v) === "1";
const totalPaginas = (o: Obj) => num(((o.paginacao ?? {}) as Obj).total_paginas) ?? num(o.total_pags) ?? num(o.paginas);

export type ExtrasSistemaB = Pick<
  Adaptador,
  | "estimarCorrida"
  | "programadas"
  | "posicoesMotoristas"
  | "rastrearCorrida"
  | "linhaDoTempo"
  | "mensagensCorrida"
  | "passageiros"
  | "conveniadas"
  | "extrato"
  | "carteiras"
  | "cupons"
  | "dinamicas"
  | "punicoes"
  | "areas"
  | "veiculos"
  | "cancelarProgramada"
  | "despacharProgramada"
  | "tarifas"
  | "webhooksCadastrados"
>;

export function extrasSistemaB(ctx: { integracaoId: string; painelPhp: PainelPhp; cidadeId: () => string }): ExtrasSistemaB {
  const { integracaoId, painelPhp, cidadeId } = ctx;
  const pre = (id: unknown) => `${integracaoId}:${id}`;
  const naoTem = (f: "posicoes" | "conveniadas" | "extrato" | "areas" | "gerirProgramadas" | "tarifas" | "webhooksCadastrados"): never => {
    throw new MotorErro("NAO_SUPORTADO", `Sistema B: ${CAPACIDADES["sistema-b"][f].motivo}`, { integracaoId });
  };
  const pagina = (f?: FiltroLista) => Math.max(1, f?.pagina ?? 1);
  const temMais = (o: Obj, pg: number, qtd: number) => {
    const t = totalPaginas(o);
    return t !== undefined ? pg < t : qtd > 0 && qtd >= 20;
  };

  return {
    async estimarCorrida(p: PedidoEstimativa): Promise<Estimativa[]> {
      const cidade = cidadeId();
      if (!cidade) throw new MotorErro("NAO_CONFIGURADO", "Sistema B: configure o id da cidade da empresa para estimar preço.", { integracaoId });
      if (p.partida.lat === undefined || p.partida.lng === undefined || p.destino?.lat === undefined || p.destino?.lng === undefined)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema B: a estimativa precisa de latitude e longitude da partida e do destino.", { integracaoId });
      const o = await painelPhp("api_calcular_painel.php", {
        formulario: { cidade_id: cidade, origem_lat: p.partida.lat, origem_lng: p.partida.lng, destino_lat: p.destino.lat, destino_lng: p.destino.lng },
      });
      const comum = { integracaoId, origem: ORIGEM, distanciaKm: num(o.distancia_km), duracaoMin: num(o.duracao_minutos) };
      const alvo = p.categoriaId ? semPrefixo(p.categoriaId) : undefined;
      return lista(o.categorias_com_preco)
        .filter((c) => !alvo || String(c.id) === alvo)
        .map((c) => ({
          ...comum,
          categoriaId: pre(c.id),
          categoria: txt(c.nome),
          valor: num(c.preco_estimado),
          dinamica: c.dinamica_ativa === undefined ? undefined : { ativa: sim(c.dinamica_ativa) },
          bruto: c,
        }));
    },

    async programadas(f?: FiltroLista): Promise<Pagina<Programada>> {
      const pg = pagina(f);
      // A lista vem como HTML pronto: tiramos os números e lemos o detalhe (JSON) de cada uma.
      const o = await painelPhp("consultar_programadas.php", { formulario: { acao: "listar", filtro: "futuras", busca: f?.busca ?? "", pagina: pg } });
      const ids = [...new Set([...String(o.html ?? "").matchAll(/abrirSidebar\((\d+)\)/g)].map((m) => m[1]))];
      const itens: Programada[] = [];
      for (const id of ids) {
        const det = await painelPhp("consultar_programadas.php", { query: { acao: "detalhes", id } });
        const d = (det.data ?? {}) as Obj;
        const st = (d.st_ui ?? {}) as Obj;
        itens.push({
          id: pre(d.id ?? id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(d.id ?? id),
          statusTexto: txt(st.label) ?? String(d.status ?? ""),
          statusOriginal: String(d.status ?? ""),
          agendadaPara: isoLocal(d.data_agendamento_fmt),
          passageiro: { nome: txt(d.nome_pax) },
          partida: { texto: String(d.endereco_origem ?? "") },
          destino: txt(d.endereco_destino) ? { texto: String(d.endereco_destino) } : undefined,
          pagamento: txt(d.metodo_pagamento),
          valorEstimado: num(d.valor_fmt),
          observacao: txt(d.observacoes),
          semDado: [sd("categoria", "o detalhe da programada não traz a categoria")],
          bruto: d,
        });
      }
      return { itens, pagina: pg, temMais: temMais(o, pg, ids.length) };
    },

    async posicoesMotoristas() {
      return naoTem("posicoes");
    },

    async rastrearCorrida(idOriginal: string): Promise<Rastreio> {
      const id = semPrefixo(idOriginal);
      const o = await painelPhp("consultar_corridas_api.php", { query: { acao: "rastrear", id } });
      const d = (o.data ?? {}) as Obj;
      const lat = coord(d.mot_lat);
      const lng = coord(d.mot_lng);
      const mot = txt(d.motorista_id);
      if (lat === undefined || lng === undefined)
        return { corridaId: pre(id), motoristaId: mot ? pre(mot) : undefined, disponivel: false, motivo: "Sistema B: sem posição do motorista agora." };
      return { corridaId: pre(id), motoristaId: mot ? pre(mot) : undefined, lat, lng, disponivel: true };
    },

    async linhaDoTempo(idOriginal: string): Promise<LinhaDoTempo> {
      const id = semPrefixo(idOriginal);
      const o = await painelPhp("consultar_corridas_api.php", { query: { acao: "buscar_historico", id } });
      const eventos = lista(o.timeline).map((t) => ({
        em: isoLocal(`${t.data_fmt ?? ""} ${t.hora ?? ""}`.trim()),
        texto: String(t.descricao ?? ""),
      }));
      const ofertas = lista(o.ofertas).map((x) => {
        const v = (x.veiculo ?? {}) as Obj;
        const metros = num(x.distancia_metros);
        return {
          motorista: txt(x.nome ?? x.motorista_nome ?? x.motorista),
          placa: txt(v.placa ?? x.placa),
          distanciaKm: metros !== undefined ? Math.round(metros / 10) / 100 : undefined,
          etapa: txt(x.etapa_envio),
          resultado: (sim(x.ganhou) ? "aceitou" : sim(x.rejeitou) ? "recusou" : sim(x.tentou_aceitar) ? "tentou" : "sem_resposta") as LinhaDoTempo["ofertas"][number]["resultado"],
        };
      });
      return { corridaId: pre(id), eventos, ofertas, semDado: [], bruto: o };
    },

    async mensagensCorrida(idOriginal: string): Promise<MensagemCorrida[]> {
      const id = semPrefixo(idOriginal);
      const o = await painelPhp("consultar_corridas_api.php", { query: { acao: "buscar_chat", id } });
      return lista(o.data).map((m) => {
        const t = String(m.remetente_tipo ?? "");
        return {
          em: isoLocal(m.data_hora ?? m.data ?? m.created_at),
          de: t === "motorista" ? "motorista" : t === "passageiro" ? "passageiro" : t === "central" ? "central" : "outro",
          texto: sim(m.is_audio) ? "[áudio]" : sim(m.is_imagem) ? "[imagem]" : String(m.conteudo ?? ""),
          midiaUrl: txt(m.url_media),
        } as MensagemCorrida;
      });
    },

    async passageiros(f?: FiltroLista): Promise<Pagina<Passageiro>> {
      const pg = pagina(f);
      const b = (f?.busca ?? "").trim();
      const dig = b.replace(/\D/g, "");
      const o = await painelPhp("api_clientes.php", {
        query: { acao: "listar", page: pg, tipo: "todos", nome: dig.length >= 8 ? "" : b, telefone: dig.length >= 8 ? dig : "", cidade_filtro: cidadeId() || undefined },
      });
      const dados = lista(o.data);
      return {
        itens: dados.map((c) => ({
          id: pre(c.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(c.id),
          nome: String(c.nome ?? ""),
          telefone: txt(c.telefone),
          email: txt(c.email),
          ativo: sim(c.ativo ?? 1),
          avaliacao: num(c.nota),
          origemCadastro: txt(c.origem_cadastro),
          aparelho: txt(c.tipo_aparelho),
          semDado: [sd("corridasFinalizadas", "a lista de passageiros não traz a quantidade de corridas")],
          bruto: c,
        })),
        pagina: pg,
        temMais: temMais(o, pg, dados.length),
      };
    },

    async conveniadas() {
      return naoTem("conveniadas");
    },

    async extrato() {
      return naoTem("extrato");
    },

    async carteiras(f?: FiltroLista): Promise<Pagina<Carteira>> {
      const o = await painelPhp("api_carteira.php", {
        formulario: { acao: "listar_usuarios", tipo: "motorista", busca: f?.busca ?? "", status: "", cidade_filtro: cidadeId() || undefined },
      });
      const dados = lista(o.dados);
      return {
        itens: dados.map((u) => ({
          id: pre(u.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(u.id),
          tipoPessoa: "motorista",
          nome: String(u.nome ?? ""),
          telefone: txt(u.telefone),
          saldo: num(u.saldo_atual ?? u.saldo) ?? 0,
          semDado: [],
          bruto: u,
        })),
        pagina: 1,
        temMais: false,
      };
    },

    async cupons(f?: FiltroLista): Promise<Pagina<Cupom>> {
      const pg = pagina(f);
      const o = await painelPhp("api_cupons.php", { query: { acao: "listar", page: pg, status: "", busca: f?.busca ?? "", cidade_filtro: cidadeId() || undefined } });
      const dados = lista(o.data);
      return {
        itens: dados.map((c) => {
          const [ini, fim] = String(c.periodo ?? "").split(/\s+(?:a|até|-)\s+/);
          return {
            id: pre(c.id),
            integracaoId,
            origem: ORIGEM,
            idOriginal: String(c.id),
            codigo: String(c.codigo ?? ""),
            descricao: txt(c.descricao),
            ativo: sim(c.ativo),
            tipoDesconto: /valor|fixo|r\$/i.test(String(c.tipo_desconto)) ? "valor" : "percentual",
            desconto: num(c.valor),
            inicio: isoLocal(c.data_inicio ?? ini),
            fim: isoLocal(c.data_fim ?? fim),
            usos: num(c.usos_reais),
            limiteTotal: num(c.limite_usos_total),
            limitePorPessoa: num(c.limite_usos_por_usuario),
            valorMinimoCorrida: num(c.valor_minimo_corrida),
            valorMaximoDesconto: num(c.limite_maximo_desconto),
            semDado: [],
            bruto: c,
          } as Cupom;
        }),
        pagina: pg,
        temMais: temMais(o, pg, dados.length),
      };
    },

    async dinamicas(): Promise<Dinamica[]> {
      const o = await painelPhp("api_dinamicas.php", { query: { acao: "listar" } });
      const cidade = cidadeId();
      const out: Dinamica[] = [];
      for (const [chave, tipo] of [["mapa", "área"], ["horarios", "horário"], ["demanda", "demanda"]] as const) {
        for (const d of lista(o[chave])) {
          if (cidade && d.cidade_id !== undefined && String(d.cidade_id) !== cidade) continue;
          const cobranca = String(d.tipo_cobranca ?? "").toLowerCase();
          const valor = num(d.adicional);
          out.push({
            id: pre(`${chave}-${d.id}`),
            integracaoId,
            origem: ORIGEM,
            idOriginal: String(d.id),
            nome: String(d.nome ?? ""),
            ativa: sim(d.ativa),
            tipo,
            fator: cobranca.includes("fator") || cobranca.includes("multi") ? valor : undefined,
            adicional: cobranca.includes("fator") || cobranca.includes("multi") ? undefined : valor,
            semDado: [],
            bruto: d,
          });
        }
      }
      return out;
    },

    async punicoes(f?: FiltroLista): Promise<Pagina<Punicao>> {
      const pg = pagina(f);
      const o = await painelPhp("api_punicoes.php", { query: { acao: "listar", page: pg, busca: f?.busca ?? "" } });
      const dados = lista(o.data);
      return {
        itens: dados.map((p) => ({
          id: pre(p.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(p.id),
          motorista: { id: txt(p.motorista_id) ? pre(p.motorista_id) : undefined, nome: txt(p.nome), email: txt(p.email) },
          motivo: txt(p.motivo_bloqueio),
          ate: isoLocal(p.data_fim_formatada),
          situacao: "ativa" as const,
          semDado: [sd("inicio", "a lista de punições não traz quando começou")],
          bruto: p,
        })),
        pagina: pg,
        temMais: temMais(o, pg, dados.length),
      };
    },

    async areas() {
      return naoTem("areas");
    },

    async veiculos(f?: FiltroLista): Promise<Pagina<VeiculoCadastro>> {
      const pg = pagina(f);
      const b = (f?.busca ?? "").trim();
      const placa = /^[a-z]{3}-?\d[a-z0-9]\d{2}$/i.test(b);
      const o = await painelPhp("api_veiculos.php", {
        query: { acao: "listar", page: pg, status: "todos", modelo: placa ? "" : b, placa: placa ? b : "", motorista: "", cidade_filtro: cidadeId() || undefined },
      });
      const dados = lista(o.data);
      return {
        itens: dados.map((v) => ({
          id: pre(v.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(v.id),
          placa: txt(v.placa),
          modelo: txt(v.modelo),
          ano: txt(v.ano),
          cor: txt(v.cor),
          emUso: sim(v.selecionado ?? v.em_uso),
          motorista: txt(v.motorista_nome) || txt(v.motorista_id) ? { id: txt(v.motorista_id) ? pre(v.motorista_id) : undefined, nome: txt(v.motorista_nome) } : undefined,
          semDado: [],
          bruto: v,
        })),
        pagina: pg,
        temMais: temMais(o, pg, dados.length),
      };
    },

    async cancelarProgramada() {
      return naoTem("gerirProgramadas");
    },
    async despacharProgramada() {
      return naoTem("gerirProgramadas");
    },
    async tarifas() {
      return naoTem("tarifas");
    },
    async webhooksCadastrados() {
      return naoTem("webhooksCadastrados");
    },
  };
}
