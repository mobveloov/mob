// Pacotes prontos de templates comportamentais (copiados do sistema de referência). Instalados DESATIVADOS para revisar antes.

export interface ModeloComportamental {
  key: string;
  emoji: string;
  name: string;
  description: string;
  hour_start: number;
  hour_end: number;
  weekdays: number[];
  match_weekday: boolean;
  lead_minutes: number;
  min_rides: number;
  min_inactive_days?: number | null;
  max_inactive_days?: number | null;
  min_cancel_rate?: number | null;
  channel: 'whatsapp';
  title: string;
  body: string;
  second_after_minutes?: number | null;
  second_title?: string | null;
  second_body?: string | null;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEK = [1, 2, 3, 4, 5];

export const MODELOS_COMPORTAMENTAIS: ModeloComportamental[] = [
  {
    key: 'coruja', emoji: '🦉', name: 'Coruja Noturna', description: 'Quem costuma chamar entre 22h e 3h: lembrete 30 min antes do horário dele.',
    hour_start: 22, hour_end: 3, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Vai sair hoje à noite, {{nome}}?', body: 'Seu horário de sempre está chegando. Tem motorista perto de você.',
    second_after_minutes: 30, second_title: 'Motorista livre agora 🌙', second_body: 'Peça pelo app em poucos toques e volte em segurança.',
  },
  {
    key: 'madrugador', emoji: '🌅', name: 'Madrugador', description: 'Quem chama bem cedo (4h às 6h), de segunda a sábado.',
    hour_start: 4, hour_end: 6, weekdays: [1, 2, 3, 4, 5, 6], match_weekday: true, lead_minutes: 20, min_rides: 2, channel: 'whatsapp',
    title: 'Bom dia, {{nome}} 🌅', body: 'Já tem motorista acordado esperando por você. Peça seu carro.',
  },
  {
    key: 'pico_manha', emoji: '💼', name: 'Profissional de Pico (manhã)', description: 'Ida ao trabalho: preferência entre 6h e 9h, dias úteis.',
    hour_start: 6, hour_end: 9, weekdays: WEEK, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Seu carro para o trabalho', body: '{{nome}}, chegue no horário: peça agora e o motorista vai até você.',
    second_after_minutes: 20, second_title: 'Ainda dá tempo ⏱️', second_body: 'Tem motorista perto de você neste momento.',
  },
  {
    key: 'pico_tarde', emoji: '🏠', name: 'Profissional de Pico (volta)', description: 'Volta para casa: preferência entre 17h e 19h, dias úteis.',
    hour_start: 17, hour_end: 19, weekdays: WEEK, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Hora de voltar pra casa 🏠', body: '{{nome}}, seu carro de volta está a um toque.',
  },
  {
    key: 'almoco', emoji: '🍽️', name: 'Horário de almoço', description: 'Preferência entre 11h e 13h, dias úteis.',
    hour_start: 11, hour_end: 13, weekdays: WEEK, match_weekday: true, lead_minutes: 20, min_rides: 2, channel: 'whatsapp',
    title: 'Vai almoçar fora?', body: 'Tem motorista perto de você. Peça pelo app, {{nome}}.',
  },
  {
    key: 'balada', emoji: '🎉', name: 'Sexta e sábado à noite', description: 'Preferência entre 20h e 2h na sexta e no sábado.',
    hour_start: 20, hour_end: 2, weekdays: [5, 6], match_weekday: false, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Bora sair hoje? 🎉', body: '{{nome}}, vá e volte com segurança com a {{empresa}}.',
  },
  {
    key: 'domingo', emoji: '👨‍👩‍👧', name: 'Domingo em família', description: 'Preferência entre 9h e 14h no domingo.',
    hour_start: 9, hour_end: 14, weekdays: [0], match_weekday: false, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Programa de domingo?', body: 'Almoço, igreja ou visita: a {{empresa}} leva você.',
  },
  {
    key: 'cancelador', emoji: '🛟', name: 'Resgate de Cancelador', description: 'Quem cancela 30%+ das corridas: mensagem de confiança no horário dele.',
    hour_start: 0, hour_end: 23, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 1, min_cancel_rate: 30, channel: 'whatsapp',
    title: 'Dessa vez vai dar certo 💪', body: '{{nome}}, temos mais motoristas perto de você no seu horário. Conte com a gente.',
  },
  {
    key: 'inativo_horario', emoji: '⏰', name: 'Inativo no horário dele', description: 'Sem corrida há 15 a 90 dias: lembrete na hora em que ele costumava chamar.',
    hour_start: 0, hour_end: 23, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 2, min_inactive_days: 15, max_inactive_days: 90, channel: 'whatsapp',
    title: 'No seu horário de sempre', body: '{{nome}}, sentimos sua falta. Seu motorista de confiança está perto.',
  },
  {
    key: 'pack_manha', emoji: '☀️', name: '[Pack] Manhã', description: 'Todos com preferência entre 5h e 11h, qualquer dia.',
    hour_start: 5, hour_end: 11, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Bom dia, {{nome}} ☀️', body: 'Precisa de um carro hoje cedo? A {{empresa}} está pronta.',
  },
  {
    key: 'pack_tarde', emoji: '🌤️', name: '[Pack] Tarde', description: 'Todos com preferência entre 12h e 17h, qualquer dia.',
    hour_start: 12, hour_end: 17, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Boa tarde, {{nome}}', body: 'Seu horário de sempre chegou. Peça seu carro pelo app.',
  },
  {
    key: 'pack_noite', emoji: '🌙', name: '[Pack] Noite', description: 'Todos com preferência entre 18h e 23h, qualquer dia.',
    hour_start: 18, hour_end: 23, weekdays: ALL, match_weekday: true, lead_minutes: 30, min_rides: 2, channel: 'whatsapp',
    title: 'Boa noite, {{nome}} 🌙', body: 'Vai sair? Tem motorista perto de você agora.',
  },
];
