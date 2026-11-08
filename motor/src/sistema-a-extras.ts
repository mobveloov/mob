// Funções extras do Sistema A (API de Integração v2). Formatos tirados da OpenAPI oficial
// (documentação pública do Sistema A, /pages/v2/openapi-corridas.json). Ainda sem teste com credencial real.

import { MotorErro } from "./erros.ts";
import { CAPACIDADES } from "./lacunas.ts";
import type {
  Adaptador,
  Area,
  Conveniada,
  Cupom,
  Dinamica,
  Endereco,
  Estimativa,
  FiltroLista,
  Lancamento,
  LinhaDoTempo,
  MensagemCorrida,
  Pagina,
  Passageiro,
  PedidoEstimativa,
  PosicaoMotorista,
  Programada,
  Punicao,
  Rastreio,
  SemDado,
} from "./tipos.ts";
import { coord, isoLocal, num, partesBrasilia, semPrefixo, txt } from "./util.ts";

type Obj = Record<string, unknown>;
type Chamar = <T = Obj>(metodo: "GET" | "POST", caminho: string, json?: unknown, query?: Record<string, string | number | undefined>) => Promise<T>;

const ORIGEM = "sistema-a" as const;
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const semDadoDoSistema = (campo: string, motivo: string): SemDado => ({ campo, motivo: `Sistema A: ${motivo}`, doSistema: true });

function endereco(o: unknown): Endereco | undefined {
  if (!o || typeof o !== "object") return undefined;
  const e = o as Obj;
  const texto = [txt(e.endereco ?? e.address), txt(e.complemento ?? e.complement)].filter(Boolean).join(", ");
  if (!texto) return undefined;
  return {
    texto,
    bairro: txt(e.bairro ?? e.neighborhood),
    cidade: txt(e.cidade ?? e.city),
    estado: txt(e.estado ?? e.uf ?? e.state),
    lat: coord(e.lat ?? e.latitude),
    lng: coord(e.lng ?? e.longitude),
  };
}

export type ExtrasSistemaA = Pick<
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
>;

export function extrasSistemaA(ctx: { integracaoId: string; chamar: Chamar }): ExtrasSistemaA {
  const { integracaoId, chamar } = ctx;
  const pre = (id: unknown) => `${integracaoId}:${id}`;
  const naoTem = (f: "carteiras" | "veiculos") => {
    throw new MotorErro("NAO_SUPORTADO", `Sistema A: ${CAPACIDADES["sistema-a"][f].motivo}`, { integracaoId });
  };
  const pagina = (f?: FiltroLista) => Math.max(1, f?.pagina ?? 1);
  const limite = (f?: FiltroLista, padrao = 50) => Math.min(Math.max(1, f?.limite ?? padrao), 100);

  return {
    async estimarCorrida(p: PedidoEstimativa): Promise<Estimativa[]> {
      if (p.partida.lat === undefined && !p.partida.texto) throw new MotorErro("DADOS_INVALIDOS", "Sistema A: informe a partida.", { integracaoId });
      const d = p.destino;
      const corpo: Obj = {
        lat_partida: p.partida.lat,
        lng_partida: p.partida.lng,
        endereco_partida: p.partida.texto || undefined,
        bairro_partida: p.partida.bairro,
        cidade_partida: p.partida.cidade,
        estado_partida: p.partida.estado,
        lat_desejado: d?.lat,
        lng_desejado: d?.lng,
        endereco_desejado: d?.texto || undefined,
        bairro_desejado: d?.bairro,
        cidade_desejado: d?.cidade,
        estado_desejado: d?.estado,
        categoria_id: p.categoriaId ? Number(semPrefixo(p.categoriaId)) : undefined,
        multicategorias: p.categoriaId ? undefined : true,
      };
      const r = await chamar<Obj>("POST", "/corridas/estimativas", corpo);
      const x = (r.data ?? {}) as Obj;
      const comum = { integracaoId, origem: ORIGEM, distanciaKm: num(x.estimativa_km), duracaoMin: num(x.estimativa_minutos) };
      const fator = num(x.fator);
      if (Array.isArray(x.categorias)) {
        return lista(x.categorias).map((c) => ({
          ...comum,
          categoriaId: txt(c.categoria_id) ? pre(c.categoria_id) : undefined,
          categoria: txt(c.categoria_nome),
          valor: num(c.estimativa_valor),
          valorSemDesconto: num(c.valor_original),
          tarifa: txt(c.tarifa_nome),
          bruto: c,
        }));
      }
      return [
        {
          ...comum,
          categoriaId: p.categoriaId ? pre(semPrefixo(p.categoriaId)) : undefined,
          categoria: txt(x.categoria_nome),
          valor: num(x.estimativa_valor),
          valorSemDesconto: num(x.valor_original),
          tarifa: txt(x.tarifa_nome),
          dinamica: fator ? { ativa: fator !== 1, fator } : undefined,
          bruto: x,
        },
      ];
    },

    async programadas(f?: FiltroLista): Promise<Pagina<Programada>> {
      const pg = pagina(f);
      const lim = limite(f);
      const r = await chamar<Obj>("GET", "/corridas/programadas", undefined, { pagina: pg, limite: lim });
      const dados = lista(r.data); // sem programadas, `data` vem como objeto com mensagem
      const itens = dados.map((o): Programada => {
        const valor = (o.valor ?? {}) as Obj;
        const cat = (o.categoria ?? {}) as Obj;
        const corrida = txt(o.id_mch);
        return {
          id: pre(o.id_mch_programada),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(o.id_mch_programada ?? ""),
          statusTexto: txt(o.situacao_formatada) ?? String(o.situacao ?? ""),
          statusOriginal: String(o.situacao ?? ""),
          agendadaPara: isoLocal(`${o.data_previsao_disparo ?? ""} ${o.hora_previsao_disparo ?? ""}`.trim()),
          passageiro: { nome: txt(o.nome_passageiro) },
          partida: endereco(o.partida) ?? { texto: "" },
          destino: endereco(o.desejado),
          categoria: txt(cat.nome),
          valorEstimado: num(valor.prefixado) ?? num(valor.estimado),
          observacao: txt(o.observacao),
          corridaId: corrida ? pre(corrida) : undefined,
          semDado: [semDadoDoSistema("pagamento", "a lista de programadas não traz a forma de pagamento")],
          bruto: o,
        };
      });
      return { itens, pagina: pg, temMais: dados.length >= lim };
    },

    async posicoesMotoristas(): Promise<PosicaoMotorista[]> {
      const r = await chamar<Obj>("GET", "/condutores/posicoes");
      return lista(((r.data ?? {}) as Obj).condutores)
        .map((c) => ({
          integracaoId,
          origem: ORIGEM,
          motoristaId: pre(c.id),
          nome: txt(c.nome),
          lat: coord(c.lat) as number,
          lng: coord(c.lng) as number,
          em: txt(c.ultima_atividade),
          livre: true,
          inativo: c.inativo === true,
        }))
        .filter((p) => p.lat !== undefined && p.lng !== undefined);
    },

    async rastrearCorrida(idOriginal: string): Promise<Rastreio> {
      const id = semPrefixo(idOriginal);
      const r = await chamar<Obj>("GET", `/corridas/${encodeURIComponent(id)}/condutor/posicao`);
      const d = (r.data ?? {}) as Obj;
      const lat = coord(d.lat_condutor ?? d.lat_taxi);
      const lng = coord(d.lng_condutor ?? d.lng_taxi);
      const mot = txt(d.condutor_id);
      if (lat === undefined || lng === undefined)
        return { corridaId: pre(id), motoristaId: mot ? pre(mot) : undefined, disponivel: false, motivo: "Sistema A: sem posição agora (só com a corrida aceita ou em andamento)." };
      return { corridaId: pre(id), motoristaId: mot ? pre(mot) : undefined, lat, lng, disponivel: true };
    },

    async linhaDoTempo(idOriginal: string): Promise<LinhaDoTempo> {
      const id = semPrefixo(idOriginal);
      const r = await chamar<Obj>("GET", `/corridas/${encodeURIComponent(id)}/detalhes`);
      const d = (r.data ?? {}) as Obj;
      const pr = (d.progress ?? {}) as Obj;
      const fim = (d.finished ?? {}) as Obj;
      const mot = (d.driver ?? {}) as Obj;
      const canc = lista(d.cancellation)[0];
      const quem: Record<string, string> = { P: "passageiro", T: "motorista", C: "central" };
      const ev: { em?: string; texto: string }[] = [];
      const add = (em: unknown, texto: string) => {
        const t = txt(em);
        if (t) ev.push({ em: isoLocal(t) ?? t, texto });
      };
      add(d.requested_at, "Corrida pedida");
      add(pr.pending_at, "Entrou em pendência (ninguém aceitou)");
      add(pr.accepted_at, `Aceita${txt(mot.name) ? ` por ${mot.name}` : ""}${num(pr.accept_distance_km) ? ` a ${num(pr.accept_distance_km)} km` : ""}`);
      add(pr.arrival_at_surroundings, "Motorista perto do embarque");
      add(pr.pickup_arrival, "Motorista chegou no embarque");
      add(pr.start_trip, "Corrida iniciada");
      add(fim.finished_at, `Corrida finalizada${num(fim.final_value) !== undefined ? ` (R$ ${num(fim.final_value)!.toFixed(2)})` : ""}`);
      if (canc) add(canc.cancelled_at, `Cancelada${quem[String(canc.cancelled_by)] ? ` pelo ${quem[String(canc.cancelled_by)]}` : ""}${txt(canc.cancelled_reason) ? `: ${canc.cancelled_reason}` : ""}`);
      ev.sort((a, b) => (Date.parse(a.em ?? "") || 0) - (Date.parse(b.em ?? "") || 0));
      return {
        corridaId: pre(id),
        eventos: ev,
        ofertas: [],
        semDado: [semDadoDoSistema("ofertas", "a API não informa para quais motoristas a corrida foi oferecida")],
        bruto: d,
      };
    },

    async mensagensCorrida(idOriginal: string): Promise<MensagemCorrida[]> {
      const id = semPrefixo(idOriginal);
      const r = await chamar<Obj>("GET", `/mensagens/corridas/condutor/${encodeURIComponent(id)}`);
      return lista(((r.data ?? {}) as Obj).mensagens).map((m) => {
        const rem = (m.remetente ?? {}) as Obj;
        const tipo = String(rem.tipo ?? "");
        return {
          em: isoLocal(m.data_hora),
          de: tipo === "condutor" ? "motorista" : tipo === "passageiro" || tipo === "central" ? tipo : "outro",
          nome: txt(rem.nome),
          texto: String(m.texto ?? ""),
        } as MensagemCorrida;
      });
    },

    async passageiros(f?: FiltroLista): Promise<Pagina<Passageiro>> {
      const pg = pagina(f);
      const lim = limite(f, 20);
      const b = (f?.busca ?? "").trim();
      const dig = b.replace(/\D/g, "");
      const q: Record<string, string | number | undefined> = { pagina: pg, limite: lim };
      if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(b)) q.cpf = b;
      else if (b.includes("@")) q.email = b;
      else if (dig.length >= 8) q.telefone = dig;
      else if (b.length >= 3) q.nome = b;
      const r = await chamar<Obj>("GET", "/clientes", undefined, q);
      const dados = lista(r.data);
      return {
        itens: dados.map((c) => ({
          id: pre(c.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(c.id),
          nome: String(c.nome ?? ""),
          telefone: txt(c.telefone),
          email: txt(c.email),
          cpf: txt(c.cpf),
          ativo: String(c.status_cliente ?? "A").toUpperCase() === "A",
          avaliacao: num(c.avaliacao_media),
          corridasFinalizadas: num(c.quantidade_corridas_finalizadas),
          ultimaCorridaEm: txt(c.ultima_corrida_em),
          cadastradoEm: txt(c.cadastrado_em),
          semDado: [semDadoDoSistema("origemCadastro", "a API não informa por onde o passageiro se cadastrou")],
          bruto: c,
        })),
        pagina: pg,
        temMais: dados.length >= lim,
      };
    },

    async conveniadas(f?: FiltroLista): Promise<Pagina<Conveniada>> {
      const pg = pagina(f);
      const lim = limite(f, 20);
      const r = await chamar<Obj>("GET", "/empresas", undefined, { pagina: pg, limite: lim });
      const dados = lista(r.data);
      const alvo = (f?.busca ?? "").trim().toLowerCase();
      return {
        itens: dados
          .map((e) => ({
            id: pre(e.id),
            integracaoId,
            origem: ORIGEM,
            idOriginal: String(e.id),
            nome: String(e.nome ?? ""),
            documento: txt(e.documento),
            telefone: txt(e.telefone),
            cidade: txt(e.cidade),
            ativa: String(e.status_empresa ?? "") === "A",
            categorias: lista(e.categorias).map((c) => String(c.nome ?? "")).filter(Boolean),
            semDado: [semDadoDoSistema("funcionarios", "a lista de empresas não traz a quantidade de funcionários")],
            bruto: e,
          }))
          .filter((e) => !alvo || e.nome.toLowerCase().includes(alvo)),
        pagina: pg,
        temMais: dados.length >= lim,
      };
    },

    async extrato(f?: FiltroLista): Promise<Pagina<Lancamento>> {
      const pg = pagina(f);
      const deIso = f?.de ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      const ateIso = f?.ate ?? new Date().toISOString();
      // A API aceita no máximo 31 dias por consulta (e só os últimos 6 meses).
      if (Date.parse(ateIso) - Date.parse(deIso) > 31 * 86_400_000)
        throw new MotorErro("DADOS_INVALIDOS", "Sistema A: o extrato aceita no máximo 31 dias por consulta. Diminua o período.", { integracaoId });
      const de = partesBrasilia(deIso).dia;
      const ate = partesBrasilia(ateIso).dia;
      const r = await chamar<Obj>("GET", "/financeiro/extrato", undefined, { data_ini: de, data_fim: ate, pagina: pg, tipo: "T" });
      const d = (r.data ?? {}) as Obj;
      const itens = lista(d.lista).map((l) => {
        const p = l.pessoa as Obj | null;
        return {
          integracaoId,
          origem: ORIGEM,
          em: txt(l.data_hora),
          valor: num(l.valor) ?? 0,
          pessoa: p ? { tipo: String(p.tipo ?? ""), nome: txt(p.nome) } : undefined,
          operacao: txt(l.operacao_descricao) ?? String(l.tipo_operacao ?? ""),
          descricao: txt(l.descricao),
          estornado: l.estornado === true,
          bruto: l,
        };
      });
      return { itens, pagina: pg, temMais: itens.length >= 10 };
    },

    async carteiras() {
      return naoTem("carteiras");
    },

    async cupons(f?: FiltroLista): Promise<Pagina<Cupom>> {
      const pg = pagina(f);
      const b = (f?.busca ?? "").trim();
      const r = await chamar<Obj>("GET", "/cupons", undefined, { pagina: pg, codigo: b || undefined });
      const dados = lista(r.data);
      return {
        itens: dados.map((c) => ({
          id: pre(c.id),
          integracaoId,
          origem: ORIGEM,
          idOriginal: String(c.id),
          codigo: String(c.codigo ?? ""),
          ativo: c.status === "ativo",
          tipoDesconto: c.tipo_desconto === "valor_fixo" ? "valor" : "percentual",
          desconto: num(c.desconto),
          inicio: isoLocal(c.data_hora_inicio),
          fim: isoLocal(c.data_hora_fim),
          usos: num(c.vezes_utilizado),
          limitePorPessoa: num(c.limite_uso_individual),
          valorMaximoDesconto: num(c.valor_maximo),
          semDado: [semDadoDoSistema("descricao", "a API de cupons não traz descrição")],
          bruto: c,
        })),
        pagina: pg,
        temMais: dados.length >= 10,
      };
    },

    async dinamicas(): Promise<Dinamica[]> {
      const r = await chamar<Obj>("GET", "/dinamicas/area");
      return lista(r.data).map((d) => ({
        id: pre(d.id),
        integracaoId,
        origem: ORIGEM,
        idOriginal: String(d.id),
        nome: String(d.nome ?? ""),
        ativa: d.ativo === true,
        tipo: `área (${txt(d.tipo) ?? "embarque"})`,
        fator: num(d.fator),
        adicional: num(d.valor_adicional),
        semDado: [],
        bruto: d,
      }));
    },

    async punicoes(f?: FiltroLista): Promise<Pagina<Punicao>> {
      const pg = pagina(f);
      const lim = limite(f, 20);
      const r = await chamar<Obj>("GET", "/condutores/historico-punicoes", undefined, { pagina: pg, limite: lim, busca: (f?.busca ?? "").trim() || undefined });
      const dados = lista(r.data);
      const sit: Record<string, Punicao["situacao"]> = { E: "ativa", C: "concluida", R: "revogada" };
      return {
        itens: dados.map((p) => {
          const c = (p.condutor ?? {}) as Obj;
          return {
            id: pre(p.id),
            integracaoId,
            origem: ORIGEM,
            idOriginal: String(p.id),
            motorista: { id: txt(c.id) ? pre(c.id) : undefined, nome: txt(c.nome), telefone: txt(c.telefone), email: txt(c.email) },
            motivo: txt(p.motivo),
            inicio: isoLocal(p.data_hora),
            ate: isoLocal(p.impedido_ate),
            situacao: sit[String(p.situacao)] ?? "desconhecida",
            automatica: p.origem === "A",
            semDado: [],
            bruto: p,
          };
        }),
        pagina: pg,
        temMais: dados.length >= lim,
      };
    },

    async areas(): Promise<Area[]> {
      const todas: Area[] = [];
      for (let pg = 1; pg <= 10; pg++) {
        const r = await chamar<Obj>("GET", "/configuracoes/areas-geograficas", undefined, { pagina: pg, limite: 100 });
        const dados = lista(r.data);
        todas.push(
          ...dados.map((a) => ({
            id: pre(a.id),
            integracaoId,
            origem: ORIGEM,
            idOriginal: String(a.id),
            nome: String(a.nome ?? ""),
            semDado: [semDadoDoSistema("poligono", "a lista de áreas não traz o desenho da área")],
            bruto: a,
          })),
        );
        if (dados.length < 100) break;
      }
      return todas;
    },

    async veiculos() {
      return naoTem("veiculos");
    },
  };
}
