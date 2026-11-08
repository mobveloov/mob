// Servidor HTTP do motor (servidor-a-servidor). O painel manda, em cada pedido, a configuração da empresa
// (empresaId + integrações com credenciais). O motor NÃO guarda credenciais e NÃO registra o corpo em log.
//
// Segurança: com MOTOR_TOKEN, todo pedido precisa de "Authorization: Bearer <token>". Sem token, o servidor
// só aceita escutar em 127.0.0.1 (mesma máquina).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { buscarCorridas, type FiltroPainel } from "./busca.ts";
import { MotorErro, ehMotorErro, type CodigoErro } from "./erros.ts";
import { VERSAO_CONTRATO, capacidadesPorSistema, criarMotor } from "./index.ts";
import type { Empresa, FiltroLista, FiltroMotoristas, Integracao, NovaCorrida, OpcoesRede, PedidoEstimativa } from "./tipos.ts";

const LIMITE_CORPO = 1_000_000; // 1 MB

const HTTP_DO_CODIGO: Record<CodigoErro, number> = {
  DADOS_INVALIDOS: 400,
  NAO_CONFIGURADO: 400,
  NAO_ENCONTRADO: 404,
  NAO_SUPORTADO: 501,
  LIMITE: 429,
  SEM_AUTORIZACAO: 502, // a credencial da EMPRESA foi recusada pelo sistema (não é o acesso ao motor)
  INDISPONIVEL: 503,
  ERRO_REMOTO: 502,
};

export interface OpcoesServidor {
  /** Token exigido no cabeçalho Authorization. Vazio = sem exigência (use só em 127.0.0.1). */
  token?: string;
  rede?: OpcoesRede;
  /** Registro simples (método, caminho, status, tempo). Nunca recebe corpo nem credencial. */
  registrar?: (linha: string) => void;
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok, falha) => {
    let tamanho = 0;
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) {
        falha(new MotorErro("DADOS_INVALIDOS", "Pedido grande demais (máximo 1 MB)."));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", falha);
  });
}

function validarEmpresa(corpo: Record<string, unknown>): Empresa {
  const empresaId = corpo.empresaId;
  const integracoes = corpo.integracoes;
  if (typeof empresaId !== "string" || !empresaId.trim()) throw new MotorErro("DADOS_INVALIDOS", "Falta empresaId.");
  if (!Array.isArray(integracoes)) throw new MotorErro("DADOS_INVALIDOS", "Falta a lista integracoes.");
  for (const i of integracoes as Record<string, unknown>[]) {
    if (!i || typeof i !== "object") throw new MotorErro("DADOS_INVALIDOS", "Integração inválida.");
    if (i.tipo !== "sistema-a" && i.tipo !== "sistema-b") throw new MotorErro("DADOS_INVALIDOS", `Tipo de integração desconhecido: ${String(i.tipo)}. Use "sistema-a" ou "sistema-b".`);
    if (typeof i.id !== "string") throw new MotorErro("DADOS_INVALIDOS", "Cada integração precisa de um id (texto).");
    if (!i.credenciais || typeof i.credenciais !== "object") i.credenciais = {};
  }
  return { id: empresaId, integracoes: integracoes as Integracao[] };
}

function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  const r = Buffer.from((recebido ?? "").replace(/^Bearer\s+/i, ""));
  const e = Buffer.from(esperado);
  return r.length === e.length && timingSafeEqual(r, e);
}

export function criarServidor(op: OpcoesServidor = {}): Server {
  const token = (op.token ?? "").trim();
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const inicio = Date.now();
    const caminho = (req.url ?? "/").split("?")[0];
    const responder = (status: number, json: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(json));
      op.registrar?.(`${req.method} ${caminho} ${status} ${Date.now() - inicio}ms`);
    };
    try {
      if (token && !tokenConfere(req.headers.authorization, token)) return responder(401, { erro: "Acesso ao motor negado (token).", codigo: "TOKEN" });

      if (req.method === "GET" && caminho === "/v1/saude") return responder(200, { ok: true, versao: VERSAO_CONTRATO });
      if (req.method === "GET" && caminho === "/v1/capacidades") {
        const sistemas = capacidadesPorSistema();
        return responder(200, {
          versao: VERSAO_CONTRATO,
          sistemas,
          // Formato curto pedido pelo painel: só os nomes das funções disponíveis.
          fontes: sistemas.map((s) => ({
            tipo: s.tipo,
            origem: s.origem,
            funcoes: Object.entries(s.funcoes)
              .filter(([, c]) => c.disponivel)
              .map(([f]) => f),
          })),
        });
      }
      if (req.method !== "POST") throw new MotorErro("NAO_ENCONTRADO", `Rota não existe: ${req.method} ${caminho}`);

      const texto = await lerCorpo(req);
      let corpo: Record<string, unknown>;
      try {
        corpo = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
      } catch {
        throw new MotorErro("DADOS_INVALIDOS", "O corpo do pedido não é JSON.");
      }
      const motor = criarMotor(validarEmpresa(corpo), op.rede);
      const alvo = typeof corpo.alvo === "string" && corpo.alvo ? corpo.alvo : "todas";
      const filtro = (corpo.filtro && typeof corpo.filtro === "object" ? corpo.filtro : {}) as FiltroLista;

      switch (caminho) {
        case "/v1/status":
          return responder(200, { integracoes: motor.status() });
        case "/v1/corridas/buscar":
          return responder(200, await buscarCorridas(motor, (corpo.filtro ?? {}) as FiltroPainel));
        case "/v1/corridas/detalhe":
          return responder(200, { corrida: await motor.detalharCorrida(String(corpo.id ?? "")) });
        case "/v1/corridas/criar":
          return responder(200, { criada: await motor.criarCorrida(String(corpo.integracaoId ?? ""), corpo.corrida as NovaCorrida) });
        case "/v1/corridas/cancelar":
          await motor.cancelarCorrida(String(corpo.id ?? ""), typeof corpo.motivo === "string" ? corpo.motivo : undefined);
          return responder(200, { ok: true });
        case "/v1/motoristas/buscar":
          return responder(200, await motor.motoristas(alvo, (corpo.filtro ?? {}) as FiltroMotoristas));
        case "/v1/categorias":
          return responder(200, await motor.categorias(alvo));
        // Funções extras (2.1). `filtro` = { busca?, pagina?, limite?, de?, ate? }
        case "/v1/estimativa":
          return responder(200, await motor.estimarCorrida(alvo, corpo.pedido as PedidoEstimativa));
        case "/v1/programadas":
          return responder(200, await motor.programadas(alvo, filtro));
        case "/v1/posicoes":
          return responder(200, await motor.posicoesMotoristas(alvo));
        case "/v1/corridas/rastreio":
          return responder(200, { rastreio: await motor.rastrearCorrida(String(corpo.id ?? "")) });
        case "/v1/corridas/linha-do-tempo":
          return responder(200, { linhaDoTempo: await motor.linhaDoTempo(String(corpo.id ?? "")) });
        case "/v1/corridas/mensagens":
          return responder(200, { mensagens: await motor.mensagensCorrida(String(corpo.id ?? "")) });
        case "/v1/passageiros":
          return responder(200, await motor.passageiros(alvo, filtro));
        case "/v1/conveniadas":
          return responder(200, await motor.conveniadas(alvo, filtro));
        case "/v1/extrato":
          return responder(200, await motor.extrato(alvo, filtro));
        case "/v1/carteiras":
          return responder(200, await motor.carteiras(alvo, filtro));
        case "/v1/cupons":
          return responder(200, await motor.cupons(alvo, filtro));
        case "/v1/dinamicas":
          return responder(200, await motor.dinamicas(alvo));
        case "/v1/punicoes":
          return responder(200, await motor.punicoes(alvo, filtro));
        case "/v1/areas":
          return responder(200, await motor.areas(alvo));
        case "/v1/veiculos":
          return responder(200, await motor.veiculos(alvo, filtro));
        // 3.2
        case "/v1/programadas/cancelar":
          await motor.cancelarProgramada(String(corpo.id ?? ""));
          return responder(200, { ok: true });
        case "/v1/programadas/despachar":
          await motor.despacharProgramada(String(corpo.id ?? ""));
          return responder(200, { ok: true });
        case "/v1/tarifas":
          return responder(200, { tarifas: await motor.tarifas(String(corpo.categoriaId ?? "")) });
        case "/v1/webhooks/cadastrados":
          return responder(200, await motor.webhooksCadastrados(alvo));
        case "/v1/webhooks/ler":
          return responder(200, {
            eventos: await motor.lerWebhook(String(corpo.integracaoId ?? ""), String(corpo.corpo ?? ""), (corpo.cabecalhos ?? {}) as Record<string, string>),
          });
        default:
          throw new MotorErro("NAO_ENCONTRADO", `Rota não existe: POST ${caminho}`);
      }
    } catch (e) {
      if (ehMotorErro(e)) {
        return responder(HTTP_DO_CODIGO[e.codigo] ?? 500, {
          erro: e.message,
          codigo: e.codigo,
          integracaoId: e.integracaoId,
          tentarEmSegundos: e.tentarEmSegundos,
        });
      }
      return responder(500, { erro: "Erro interno do motor.", codigo: "INTERNO" });
    }
  });
}

const LOCAL = new Set(["127.0.0.1", "::1", "localhost"]);

/** Liga o servidor lendo MOTOR_PORTA (padrão 8790), MOTOR_HOST (padrão 127.0.0.1) e MOTOR_TOKEN. */
export function iniciar(env: Record<string, string | undefined> = process.env): Server {
  const host = (env.MOTOR_HOST ?? "").trim() || "127.0.0.1";
  const porta = Number(env.MOTOR_PORTA ?? "") || 8790;
  const token = (env.MOTOR_TOKEN ?? "").trim();
  if (!token && !LOCAL.has(host)) throw new Error("Sem MOTOR_TOKEN o motor só pode escutar em 127.0.0.1. Defina MOTOR_TOKEN para abrir na rede.");
  const s = criarServidor({ token, registrar: (l) => console.log(`[motor] ${l}`) });
  s.listen(porta, host, () => console.log(`[motor] escutando em http://${host}:${porta} (contrato ${VERSAO_CONTRATO})${token ? " com token" : ""}`));
  return s;
}

// Rodar direto: node --experimental-strip-types motor/src/servidor.ts  (ou: deno run -A motor/src/servidor.ts)
const principal = (import.meta as { main?: boolean }).main ?? (typeof process !== "undefined" && process.argv[1]?.replace(/\\/g, "/").endsWith("motor/src/servidor.ts"));
if (principal) iniciar();
