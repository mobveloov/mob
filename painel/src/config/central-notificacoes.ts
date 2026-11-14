// Central de notificações (o sino do topo): avisos para quem opera o painel, montados a partir do que está acontecendo na empresa.
// Fontes: alertas para empresas valendo agora, saques pendentes, pedidos de recarga de saldo, pendências de pagamento em aberto,
// Pix em disputa ou com chargeback e corridas canceladas ou não atendidas na última hora (ocorrências).
// Nada disso é gravado: cada aviso tem uma chave estável. O que cada pessoa já leu fica na tabela central_notif_lidas (empresa, e-mail, chave).

import { saques } from "../apps/extras.ts";
import { listarProprias } from "../corridas/index.ts";
import { todasPendencias } from "../operacao/pendencias.ts";
import { pixDasCorridas } from "../operacao/pix.ts";
import { agoraBr } from "../servidor/util.ts";
import { alertasAtivos } from "./alertas.ts";
import { bancoConfig } from "./armazem.ts";
import { pedidosRecarga } from "./financeiro-visao.ts";

export type NivelNotificacao = "urgente" | "atencao" | "aviso" | "info";
export interface Notificacao { chave: string; nivel: NivelNotificacao; titulo: string; texto: string; em: string; rota: string; lida: boolean }

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NIVEL_ALERTA: Record<string, NivelNotificacao> = { Urgente: "urgente", "Atenção": "atencao", Aviso: "aviso" };
const POR_FONTE = 30;

function montar(empresaId: string): Omit<Notificacao, "lida">[] {
  const n: Omit<Notificacao, "lida">[] = [];
  for (const a of alertasAtivos(empresaId).slice(0, POR_FONTE)) n.push({ chave: `alerta:${a.id}`, nivel: NIVEL_ALERTA[a.tipo] ?? "aviso", titulo: `Alerta ${a.tipo.toLowerCase()} (${a.empresaAlvo})`, texto: a.conteudo, em: a.inicioEm, rota: "/alertas-empresas" });
  for (const s of saques(empresaId).filter((x) => x.situacao === "Pendente").slice(0, POR_FONTE)) n.push({ chave: `saque:${s.id}`, nivel: "atencao", titulo: "Saque aguardando pagamento", texto: `${s.nome} pediu ${reais(s.valor)}.`, em: s.em, rota: "/saques" });
  for (const p of pedidosRecarga(empresaId).filter((x) => x.situacao === "Solicitado").slice(0, POR_FONTE)) n.push({ chave: `recarga:${p.id}`, nivel: "info", titulo: "Pedido de recarga de saldo", texto: `${reais(p.valor)} aguardando confirmação${p.observacao ? ` (${p.observacao})` : ""}.`, em: p.em, rota: "/extrato-central" });
  const pend = todasPendencias(empresaId).filter((x) => x.situacao === "pendente").sort((a, b) => b.data.localeCompare(a.data));
  for (const p of pend.slice(0, POR_FONTE)) n.push({ chave: `pendencia:${p.id}`, nivel: "atencao", titulo: `Pendência de pagamento: ${p.tipo.toLowerCase()}`, texto: `${p.passageiro}${p.os ? ` (OS ${p.os})` : ""} deve ${reais(p.valor)}.`, em: p.data, rota: "/pagamentos-pendentes" });
  for (const x of pixDasCorridas(empresaId).filter((p) => p.situacao === "Em disputa" || p.situacao === "Chargeback").slice(0, POR_FONTE)) n.push({ chave: `pix:${x.id}:${x.situacao}`, nivel: x.situacao === "Chargeback" ? "urgente" : "atencao", titulo: `Pix ${x.situacao === "Chargeback" ? "com chargeback" : "em disputa"}`, texto: `OS ${x.os}, ${x.passageiro}, ${reais(x.valor)}.`, em: x.marcadaEm ?? x.data, rota: "/transacao-pix" });
  const agora = agoraBr(), h = agora.toISOString().slice(0, 13), desde = new Date(agora.getTime() - 3_600_000).toISOString();
  const falhas = listarProprias(empresaId).filter((c) => (c.status === "cancelada" || c.status === "nao_atendida") && c.solicitadaEm >= desde).length;
  if (falhas) n.push({ chave: `ocorrencias:${h}`, nivel: "atencao", titulo: "Corridas que podem pedir atenção", texto: `${falhas} corrida${falhas > 1 ? "s" : ""} cancelada${falhas > 1 ? "s" : ""} ou não atendida${falhas > 1 ? "s" : ""} na última hora. Veja a tela de Retorno/Ocorrências.`, em: agora.toISOString(), rota: "/ocorrencias" });
  return n.sort((a, b) => b.em.localeCompare(a.em));
}

const lidasDe = (empresaId: string, usuario: string) =>
  new Set((bancoConfig().prepare("SELECT chave FROM central_notif_lidas WHERE empresa = ? AND usuario = ?").all(empresaId, usuario) as unknown as Array<{ chave: string }>).map((r) => r.chave));

export function central(empresaId: string, usuario: string, somenteNaoLidas: boolean) {
  const lidas = lidasDe(empresaId, usuario);
  const todas: Notificacao[] = montar(empresaId).map((x) => ({ ...x, lida: lidas.has(x.chave) }));
  const naoLidas = todas.filter((x) => !x.lida).length;
  return { total: todas.length, naoLidas, itens: somenteNaoLidas ? todas.filter((x) => !x.lida) : todas };
}

/** Marca como lidas as chaves pedidas (ou todas as de agora). Só vale para a pessoa que pediu. */
export function marcarCentralLidas(empresaId: string, usuario: string, chaves: unknown, todas: boolean): number {
  const validas = new Set(montar(empresaId).map((x) => x.chave));
  const alvo = todas ? [...validas] : (Array.isArray(chaves) ? chaves : []).map((c) => String(c).slice(0, 160)).filter((c) => validas.has(c)).slice(0, 500);
  const db = bancoConfig(), em = agoraBr().toISOString(), quem = usuario.slice(0, 120);
  const ins = db.prepare("INSERT OR IGNORE INTO central_notif_lidas (empresa, usuario, chave, em) VALUES (?, ?, ?, ?)");
  for (const c of alvo) ins.run(empresaId, quem, c, em);
  // Leituras com mais de 90 dias não precisam ficar para sempre.
  db.prepare("DELETE FROM central_notif_lidas WHERE empresa = ? AND usuario = ? AND em < ?").run(empresaId, quem, new Date(Date.parse(em) - 90 * 86_400_000).toISOString());
  return alvo.length;
}
