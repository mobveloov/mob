import type { ComponentType } from "react";
import Campanhas from "./Campanhas";
import Comportamentos from "./Comportamentos";
import Descadastros from "./Descadastros";
import Envio from "./Envio";
import Fila from "./Fila";
import Gatilhos from "./Gatilhos";
import Historico from "./Historico";
import Jornadas from "./Jornadas";
import Notificacoes from "./Notificacoes";
import Publico from "./Publico";
import Regua from "./Regua";
import Segmentos from "./Segmentos";
import Templates from "./Templates";
import TemplatesComportamentais from "./TemplatesComportamentais";
import Visao from "./Visao";

/** Propriedades que o esqueleto entrega a toda aba. */
export interface PropsAba { emojis: boolean }

/** Registro simples de aba: id (o mesmo do grupo em Painel.tsx), título e a tela. */
export interface AbaCrm { id: string; titulo: string; componente: ComponentType<PropsAba> }

const Passageiros = () => <Publico tipoInicial="passageiro" />;
const Motoristas = () => <Publico tipoInicial="motorista" />;
const ComEmojis = ({ emojis }: PropsAba) => <Templates emojis={emojis} />;

/** Abas do esqueleto (CRM-1). Abas novas de outras frentes entram em abas-extras.tsx. */
export const ABAS: AbaCrm[] = [
  { id: "dashboard", titulo: "Visão Geral", componente: Visao },
  { id: "triggers", titulo: "Gatilhos", componente: Gatilhos },
  { id: "queue", titulo: "Fila de Dispatches", componente: Fila },
  { id: "journeys", titulo: "Jornadas", componente: Jornadas },
  { id: "regua", titulo: "Régua de reativação", componente: Regua },
  { id: "behavior_templates", titulo: "Templates Comportamentais", componente: TemplatesComportamentais },
  { id: "campaigns", titulo: "Campanhas", componente: Campanhas },
  { id: "templates", titulo: "Templates", componente: ComEmojis },
  { id: "logs", titulo: "Notificações", componente: Notificacoes },
  { id: "behavior_history", titulo: "Histórico de Disparos", componente: Historico },
  { id: "whatsapp", titulo: "WhatsApp", componente: Envio },
  { id: "optout", titulo: "Descadastros", componente: Descadastros },
  { id: "passengers", titulo: "Passageiros", componente: Passageiros },
  { id: "drivers", titulo: "Motoristas", componente: Motoristas },
  { id: "behavior", titulo: "Comportamentos", componente: Comportamentos },
  { id: "segments", titulo: "Segmentos", componente: Segmentos },
];
