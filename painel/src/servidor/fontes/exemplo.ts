// Dados de exemplo: corridas inventadas (nomes, ruas e categorias genéricos) para o painel abrir sem nenhuma
// integração. Mesmo formato das corridas reais. Sempre gera os mesmos dados (semente fixa).

import { corridaVazia, type CorridaPainel, type GrupoStatus } from "../../comum/corrida.ts";

function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const MOTORISTAS = ["Ana Souza", "Bruno Lima", "Carlos Pereira", "Daniela Rocha", "Eduardo Alves", "Fernanda Dias", "Gustavo Melo", "Helena Costa", "Igor Santos", "Juliana Prado", "Kleber Nunes", "Larissa Gomes"];
const PASSAGEIROS = ["Marcos", "Patrícia", "Renata", "Sérgio", "Tatiane", "Vitor", "Wesley", "Yara", "Zilda", "Otávio", "Lúcia", "Rogério", "Simone", "Paulo", "Cláudia"];
const RUAS = ["Rua das Flores", "Av. Brasil", "Rua XV de Novembro", "Rua São Paulo", "Av. Central", "Rua do Comércio", "Rua Sete de Setembro", "Rua Goiás"];
const BAIRROS = ["Centro", "Jardim Alvorada", "Vila Nova", "Jardim Primavera", "Parque Industrial", "Jardim Europa"];
const CIDADES = ["Cidade Norte", "Cidade Norte", "Cidade Norte", "Cidade Sul", "Vila Leste"];
const CATEGORIAS = ["Econômico", "Econômico", "Econômico", "Moto", "Moto", "Executivo", "Central: Atendimento", "WhatsApp"];
const PAGAMENTOS = ["Dinheiro", "Dinheiro", "Pix", "Pix", "Cartão no app", "Cartão na maquininha"];
const CANAIS = ["App", "App", "App", "Site", "Ponto fixo", "WhatsApp"];
const MOTIVOS = ["Demora do motorista", "Passageiro desistiu", "Motorista muito longe", "Endereço errado", "Mudou de ideia"];

const cache = new Map<string, CorridaPainel[]>();

/** Corridas de exemplo dos últimos 30 dias (as 6 primeiras estão em andamento agora). */
export function corridasDeExemplo(agoraBrasilia: Date): CorridaPainel[] {
  const chave = agoraBrasilia.toISOString().slice(0, 13); // refaz a cada hora
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  const r = sorteio(42);
  const pick = <T,>(l: T[]) => l[Math.floor(r() * l.length)];
  const tel = () => `(11) 9${String(Math.floor(r() * 1e8)).padStart(8, "0")}`;
  const base = new Date(agoraBrasilia);
  base.setUTCMinutes(0, 0, 0);
  const out: CorridaPainel[] = [];
  for (let i = 0; i < 900; i++) {
    const horasAtras = i < 6 ? 0 : Math.floor(r() * 24 * 30);
    const pedido = new Date(base.getTime() - horasAtras * 3600_000 - Math.floor(r() * 3600) * 1000);
    const p = r();
    const grupo: GrupoStatus = i < 6 ? "aberta" : p < 0.78 ? "finalizada" : p < 0.93 ? "cancelada" : "nao_atendida";
    const statusTexto = grupo === "aberta" ? pick(["Em andamento", "Motorista a caminho", "Procurando motorista"]) : { finalizada: "Finalizada", cancelada: "Cancelada", nao_atendida: "Não atendida" }[grupo];
    const categoria = pick(CATEGORIAS);
    const moto = categoria === "Moto";
    const km = Math.round((1 + r() * 9) * 100) / 100;
    const preco = Math.round(((moto ? 6 : 8) + km * (moto ? 1.4 : 2.1) + (categoria === "Executivo" ? 8 : 0)) * 100) / 100;
    const fator = r() < 0.15 ? Math.round((1.1 + r() * 0.5) * 10) / 10 : null;
    const valor = grupo === "finalizada" ? Math.round(preco * (fator ?? 1) * 100) / 100 : null;
    const temMotorista = grupo !== "nao_atendida" && !(grupo === "aberta" && statusTexto === "Procurando motorista");
    const os = String(78_000_000 + i * 37);
    const inicio = grupo === "finalizada" ? new Date(pedido.getTime() + (3 + r() * 6) * 60_000) : null;
    const cupom = r() < 0.05 ? "BEMVINDO10" : "";
    out.push({
      ...corridaVazia({ id: `exemplo:${os}`, origem: "exemplo", origemNome: "Dados de exemplo", os, grupo, statusTexto }),
      solicitadaEm: pedido.toISOString(), iniciadaEm: inicio?.toISOString() ?? null,
      finalizadaEm: inicio ? new Date(inicio.getTime() + km * 2.5 * 60_000).toISOString() : null,
      cidade: pick(CIDADES), categoria, pagamento: pick(PAGAMENTOS), canal: categoria.startsWith("Central") ? "Ponto fixo" : pick(CANAIS),
      tarifa: r() < 0.1 ? "Noturna" : "Padrão",
      motorista: temMotorista ? pick(MOTORISTAS) : "", telefoneMotorista: temMotorista ? tel() : "",
      passageiro: pick(PASSAGEIROS), telefonePassageiro: tel(),
      embarque: `${pick(RUAS)}, ${Math.floor(r() * 900) + 10}, ${pick(BAIRROS)}`, destino: `${pick(RUAS)}, ${pick(BAIRROS)}`,
      valor, valorSemDesconto: valor != null && cupom ? Math.round(valor * 1.1 * 100) / 100 : valor, valorEstimado: preco,
      desconto: valor != null && cupom ? Math.round(valor * 0.1 * 100) / 100 : null, cupom,
      distanciaKm: km, distanciaRealKm: inicio ? km : null, distanciaMotoristaKm: temMotorista ? Math.round(r() * 60) / 10 : null,
      fatorDinamico: fator, avaliacao: grupo === "finalizada" && r() < 0.6 ? pick([5, 5, 5, 4, 4, 3]) : null,
      canceladaPor: grupo === "cancelada" ? pick(["Passageiro", "Passageiro", "Motorista", "Central"]) : "",
      motivoCancelamento: grupo === "cancelada" ? pick(MOTIVOS) : "", operador: r() < 0.2 ? "Operador 1" : "", programada: r() < 0.05,
    });
  }
  cache.clear();
  cache.set(chave, out);
  return out;
}
