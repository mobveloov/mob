// O que o servidor dos apps lê das configurações da empresa: um lugar só (Config › Gerais do App, NPS, Categorias, Integrações).

import { categoriasCompletas } from "./categorias.ts";
import { configNps } from "./avaliacoes.ts";
import { gerais, termos } from "./gerais.ts";
import { pagamentos } from "./pagamentos.ts";

/** Documentos que o app do motorista aceita enviar (todos os cadastrados em Gerais do App: id -> nome). */
export function tiposDeDocumento(empresaId: string): Record<string, string> {
  return Object.fromEntries(gerais(empresaId).motorista.documentos.map((d) => [d.id, d.nome]));
}

export function configDosApps(empresaId: string) {
  const g = gerais(empresaId), p = pagamentos(empresaId), t = termos(empresaId);
  return {
    suporte: g.suporte,
    motivosCancelamento: { passageiro: g.cancelamento.passageiro.motivos, motorista: g.cancelamento.motorista.motivos },
    cancelamento: g.cancelamento,
    contatos: { whatsapp: g.suporte.whatsapp, telefone: g.suporte.telefone, linkAjuda: g.suporte.linkAjuda },
    documentosExigidos: g.motorista.documentos.map((d) => ({ id: d.id, nome: d.nome, alvo: d.alvo, validade: d.validade, exigir: d.exigir })),
    mensagensRapidas: g.motorista.mensagensRapidas,
    etiquetasAvaliacao: configNps(empresaId, "passageiro").etiquetas,
    opcionais: g.preferencias.filter((x) => x.ativo && x.tipo === "exigencia").map((x) => x.nome),
    formasDePagamento: g.preferencias.filter((x) => x.ativo && x.tipo === "pagamento").map((x) => x.nome).filter((n) => p.metodos[n] !== false),
    motorista: g.motorista, passageiro: g.passageiro, indicacoes: g.indicacoes, macaneta: g.macaneta,
    banners: g.banners.map((b) => ({ id: b.id, link: b.link, tipo: b.tipo })),
    categorias: categoriasCompletas(empresaId).filter((c) => c.extra.visivel).map((c) => ({
      id: c.id, nome: c.nome, descricao: c.descricao, grupo: c.extra.grupo, ordem: c.extra.ordem, capacidade: c.extra.capacidade, tipoFisico: c.extra.tipoFisico,
      icone: c.extra.icone.modo === "personalizado" ? c.extra.icone.imagem : c.extra.icone.biblioteca, negociacao: c.extra.negociacao, tempoToque: c.extra.tempoToque,
      permiteAgendamento: c.extra.permiteAgendamento, mostrarGanhoKm: c.extra.mostrarGanhoKm,
    })),
    pagamentos: p,
    termos: { versao: t.versao, atualizadoEm: t.atualizadoEm },
  };
}
