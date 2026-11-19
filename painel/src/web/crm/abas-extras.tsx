import type { AbaCrm } from "./abas";

/**
 * Abas acrescentadas por outras frentes (Contatos, RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança, Auditoria...).
 * Cada uma fica em arquivo próprio e entra aqui: { id, titulo, componente }. O id é o mesmo do grupo em Painel.tsx.
 */
export const ABAS_EXTRAS: AbaCrm[] = [];
