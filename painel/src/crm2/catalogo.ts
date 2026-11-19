// Textos e cores das abas de análise do CRM (iguais aos do sistema de referência). Sem acesso a banco: a tela também importa daqui.

export const ESTAGIO_ROTULO: Record<string, string> = { novo: "Novo", ativo: "Ativo", fiel: "Fiel", em_risco: "Em Risco", inativo: "Inativo", perdido: "Perdido" };
export const ESTAGIO_CLASSE: Record<string, string> = { novo: "", ativo: "ok", fiel: "info", em_risco: "alerta", inativo: "alerta", perdido: "ruim" };

export const EVENTO_ROTULO: Record<string, string> = {
  cadastro: "Cadastro", simulou: "Simulou", solicitou: "Solicitou", cancelou: "Cancelou", concluiu: "Concluiu", avaliou: "Avaliou",
  msg_enviada: "Mensagem Enviada", msg_respondida: "Mensagem Respondida", cupom_usado: "Cupom Usado", opt_out: "Opt-out / Descadastro", opt_in: "Reativado (nova autorização)",
};

export const ORIGEM_ENVIO: Record<string, string> = { campaign: "Campanha", trigger: "Gatilho", journey: "Jornada", manual: "Manual", behavior: "Comportamental", automation: "Automação", regua: "Régua de reativação" };

export const RFM_SEGMENTOS: Record<string, { label: string; color: string; action: string }> = {
  champions: { label: "Campeões", color: "#d4a017", action: "Recompense e peça indicação. Maior receita." },
  leais: { label: "Leais", color: "#22c55e", action: "Mantenha por perto com benefícios e cartão fidelidade." },
  novos_promissores: { label: "Novos / Promissores", color: "#38bdf8", action: "Incentive a 2ª e a 3ª corrida." },
  precisam_atencao: { label: "Precisam de atenção", color: "#a78bfa", action: "Lembrete leve antes que esfriem." },
  nao_pode_perder: { label: "Não pode perder", color: "#f97316", action: "Eram frequentes e sumiram: reativação urgente com oferta." },
  em_risco: { label: "Em risco", color: "#f59e0b", action: "Reativação com cupom moderado." },
  hibernando_perdidos: { label: "Hibernando / Perdidos", color: "#ef4444", action: "Última tentativa com desconto mais forte." },
  sem_corrida: { label: "Sem corrida", color: "#64748b", action: "Cadastrados sem corrida: incentive a 1ª." },
  sem_analise: { label: "Sem análise", color: "#475569", action: "Rode a análise RFM." },
};

export const AUDITORIA_ENTIDADES = ["gatilho", "campanha", "jornada", "template", "segmento"] as const;
export const AUDITORIA_ACOES = ["criou", "editou", "ativou", "desativou", "pausou", "arquivou", "excluiu"] as const;
