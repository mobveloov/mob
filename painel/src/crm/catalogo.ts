// Catálogo do CRM (portado do sistema de referência): variáveis, modelos prontos de template e tipos de gatilho.
// Sem a Machine: a corrida é nativa, então os eventos vêm das corridas do próprio painel.

export type CategoriaTemplate = "coupon" | "expiration_warning" | "referral" | "reactivation" | "birthday" | "loyalty" | "sweepstake" | "nps" | "welcome" | "abandoned" | "post_ride" | "operational" | "strategic" | "custom";
export type TipoGatilhoCatalogo = string;
export type CanalEnvio = "whatsapp";

export const CATEGORIAS: { value: CategoriaTemplate; label: string }[] = [
  { value: "coupon", label: "Cupom de Desconto" },
  { value: "expiration_warning", label: "Aviso de Vencimento" },
  { value: "referral", label: "Indicação" },
  { value: "reactivation", label: "Reativação" },
  { value: "birthday", label: "Aniversário" },
  { value: "loyalty", label: "Fidelidade / Cashback" },
  { value: "sweepstake", label: "Sorteio" },
  { value: "nps", label: "Pesquisa NPS" },
  { value: "welcome", label: "Boas-vindas" },
  { value: "abandoned", label: "Intenção abandonada" },
  { value: "post_ride", label: "Pós-corrida" },
  { value: "operational", label: "Operacional (status)" },
  { value: "strategic", label: "Estratégico / horário" },
  { value: "custom", label: "Personalizado" },
];

export const CANAIS_ENVIO: { value: CanalEnvio; label: string; hint: string }[] = [
  { value: "whatsapp", label: "WhatsApp", hint: "Só pelo WhatsApp da empresa. Nada vai para o app." },
];

export const VARIAVEIS_TEMPLATE: { key: string; label: string }[] = [
  { key: 'nome', label: 'Primeiro nome' },
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'empresa', label: 'Nome da central' },
  { key: 'os', label: 'Número da corrida' },
  { key: 'valor', label: 'Valor da corrida/estimativa' },
  { key: 'motorista', label: 'Nome do motorista' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'dias_sem_corrida', label: 'Dias sem corrida' },
  { key: 'cupom', label: 'Código do cupom (jornadas)' },
];

// ── Modelos prontos ──

export interface ModeloTemplate {
  key: string;
  name: string;
  category: CategoriaTemplate;
  title: string;
  content: string;
}

export interface ModeloGatilho {
  template: ModeloTemplate;
  trigger_type: string;
  send_channel: CanalEnvio;
  config: Record<string, unknown>;
}

const t = (key: string, name: string, category: CategoriaTemplate, title: string, content: string): ModeloTemplate => ({ key, name, category, title, content });

export const MODELOS_GATILHO: ModeloGatilho[] = [
  { template: t('boas_vindas', 'Boas-vindas (cadastro no app)', 'welcome', 'Que bom ter você, {{nome}}! 👋', '{Sua conta na {{empresa}} está pronta|Pronto, sua conta na {{empresa}} foi criada}. Peça um carro em poucos toques 🚗'),
    trigger_type: 'new_passenger', send_channel: 'whatsapp', config: { delay_seconds: 60, once_per_contact: true } },
  { template: t('carrinho', 'Simulou e não pediu', 'abandoned', 'Ficou faltando um toque 🚗', '{{nome}}, sua corrida já está calculada. É só confirmar no app que a gente busca você!'),
    trigger_type: 'simulated_no_request', send_channel: 'whatsapp', config: { delay_seconds: 600, cooldown_hours: 24, respect_window: true, respect_daily_cap: true } },
  { template: t('quase_cliente', 'Simulou e pediu', 'post_ride', 'Pedido recebido ✅', '{{nome}}, já estamos procurando o motorista mais perto de você.'),
    trigger_type: 'simulated_and_requested', send_channel: 'whatsapp', config: { delay_seconds: 20 } },
  { template: t('aceita', 'Corrida aceita', 'operational', 'Motorista a caminho 🚘', '{{nome}}, {{motorista}} aceitou sua corrida. Acompanhe pelo app.'),
    trigger_type: 'ride_accepted', send_channel: 'whatsapp', config: {} },
  { template: t('finalizada', 'Pós-corrida: avaliação', 'post_ride', 'Como foi a viagem, {{nome}}? ⭐', 'Sua opinião ajuda a manter o padrão. Avalie a corrida no app.'),
    trigger_type: 'ride_completed', send_channel: 'whatsapp', config: { delay_seconds: 90 } },
  { template: t('cancelada', 'Cancelada: tente de novo', 'abandoned', 'Vamos tentar de novo? 🔄', '{{nome}}, tem motorista perto de você agora. Peça outra corrida pelo app.'),
    trigger_type: 'ride_canceled', send_channel: 'whatsapp', config: { delay_seconds: 180, cooldown_hours: 12 } },
  { template: t('nao_atendida', 'Não atendida: desculpas', 'abandoned', 'Desculpa, {{nome}} 😔', 'Não encontramos motorista naquele momento. Tente de novo, vamos fazer de tudo para te levar!'),
    trigger_type: 'ride_not_served', send_channel: 'whatsapp', config: { delay_seconds: 30, cooldown_hours: 6 } },
  { template: t('primeira_corrida', 'Cadastrou e não fez a 1ª corrida', 'welcome', 'Sua 1ª corrida espera você 🚗', '{{nome}}, é só abrir o app e pedir. Em poucos minutos um motorista chega até você.'),
    trigger_type: 'incomplete_signup', send_channel: 'whatsapp', config: { hours: 24, respect_window: true } },
  { template: t('inativo_15', 'Inativo há 15 dias', 'reactivation', 'Sentimos sua falta, {{nome}}', 'Faz {{dias_sem_corrida}} dias que você não anda com a {{empresa}}. Quando precisar, é só chamar 🚗'),
    trigger_type: 'inactive_passenger', send_channel: 'whatsapp', config: { days_inactive: 15, respect_window: true, respect_daily_cap: true } },
  { template: t('aniversario', 'Aniversário', 'birthday', 'Feliz aniversário, {{nome}}! 🎉', 'A {{empresa}} deseja um dia incrível. Conte com a gente para ir e voltar com segurança.'),
    trigger_type: 'birthday', send_channel: 'whatsapp', config: { hour: '09:00', respect_window: true } },
];

export const MODELOS_TEMPLATE: ModeloTemplate[] = [
  ...MODELOS_GATILHO.map((p) => p.template),
  t('pico_noite', 'Horário de pico: noite', 'strategic', 'Voltando para casa? 🏠', 'Peça agora e evite a espera. Tem motorista disponível perto de você!'),
  t('bom_dia', 'Bom dia', 'strategic', 'Bom dia! ☀️', '{Precisa ir a algum lugar hoje|Vai sair hoje}? A {{empresa}} está pronta para te levar.'),
  t('sextou', 'Sextou sem carro', 'strategic', 'Sextou! 🍻', 'Deixe o carro em casa: a gente leva e traz com segurança. É só chamar!'),
  t('chuva', 'Dia de chuva', 'strategic', 'Chovendo aí? ☔', 'Não se molhe: peça um carro e chegue sequinho.'),
];


// ── Tipos de gatilho (aba Gatilhos) ──
// Mesmos eventos do sistema de referência; sem a Machine: os eventos vêm das corridas e do cadastro do próprio painel.

export interface InfoTipoGatilho {
  value: string;
  label: string;
  group: "App do passageiro" | "Status da corrida" | "Tempo" | "Bot / WhatsApp" | "Legado";
  description: string;
  defaultDelaySeconds?: number;
  transactional?: boolean;
  source: "cadastro" | "status" | "tempo" | "bot" | "nenhum";
}

export const TIPOS_GATILHO: InfoTipoGatilho[] = [
  { value: "new_passenger", label: "Cadastrou no app (novo passageiro)", group: "App do passageiro", source: "cadastro", description: "Boas-vindas logo após o cadastro do passageiro." },
  { value: "simulated_no_request", label: "Simulou e não pediu (carrinho abandonado)", group: "App do passageiro", source: "cadastro", defaultDelaySeconds: 600, description: "Fez estimativa no app e não abriu corrida no prazo. Cancela sozinho se ele pedir antes." },
  { value: "simulated_and_requested", label: "Simulou e pediu (quase-cliente)", group: "App do passageiro", source: "cadastro", description: "Abriu corrida até 1h depois de simular. Bom para reforçar confiança." },
  { value: "simulated", label: "Simulou (toda estimativa)", group: "App do passageiro", source: "cadastro", description: "Cada estimativa feita no app. Use com intervalo por contato para não exagerar." },
  { value: "ride_requested", label: "Abriu corrida (pedido feito)", group: "Status da corrida", source: "status", transactional: true, description: "Primeiro aviso de corrida procurando motorista, ou abertura no app." },
  { value: "ride_accepted", label: "Aceita pelo condutor", group: "Status da corrida", source: "status", transactional: true, description: "O motorista aceitou e está a caminho." },
  { value: "ride_driver_arrived", label: "Condutor chegou ao local", group: "Status da corrida", source: "status", transactional: true, description: "O motorista chegou ao embarque." },
  { value: "ride_in_progress", label: "Em andamento", group: "Status da corrida", source: "status", transactional: true, description: "A corrida começou." },
  { value: "ride_completed", label: "Finalizada", group: "Status da corrida", source: "status", transactional: true, description: "Corrida finalizada. Dispara uma única vez por corrida." },
  { value: "ride_canceled", label: "Cancelada", group: "Status da corrida", source: "status", defaultDelaySeconds: 180, description: "Corrida cancelada. Não sai se ele pedir outra antes." },
  { value: "ride_not_served", label: "Não atendida (sem condutor)", group: "Status da corrida", source: "status", defaultDelaySeconds: 30, description: "Nenhum motorista atendeu. Pedido de desculpas; não sai se outra corrida for aceita." },
  { value: "inactive_passenger", label: "Passageiro inativo (X dias sem corrida)", group: "Tempo", source: "tempo", description: "Uma vez por período de inatividade, dentro da janela de envio." },
  { value: "inactivity_recurring", label: "Inatividade recorrente (7/15/30 dias)", group: "Tempo", source: "tempo", description: "Mesmo motor do inativo; útil para criar uma régua com vários gatilhos." },
  { value: "incomplete_signup", label: "Cadastrou e não fez a 1ª corrida", group: "Tempo", source: "tempo", description: "X horas depois do cadastro sem nenhuma corrida." },
  { value: "birthday", label: "Aniversário do passageiro", group: "Tempo", source: "tempo", description: "No dia do aniversário (campo do cadastro), a partir da hora escolhida. 1x por ano." },
  { value: "ride_canceled_no_car", label: "Motorista cancelou (corrida do bot)", group: "Bot / WhatsApp", source: "bot", description: "Corrida pedida pelo WhatsApp em que o motorista cancelou e o sistema busca outro." },
  { value: "plan_expiring", label: "Plano vencendo (não usado)", group: "Legado", source: "nenhum", description: "Sem evento de origem. Mantido só para gatilhos antigos." },
  { value: "custom", label: "Personalizado (não usado)", group: "Legado", source: "nenhum", description: "Sem evento de origem. Mantido só para gatilhos antigos." },
];

export const infoGatilho = (v: string) => TIPOS_GATILHO.find((t) => t.value === v);

/** Origem do envio, como aparece em Notificações. */
export const ROTULOS_ORIGEM: Record<string, string> = {
  campaign: "Campanha", trigger: "Gatilho", journey: "Jornada", manual: "Manual", behavior: "Comportamental", automation: "Automação", regua: "Régua de reativação",
};
