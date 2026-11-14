import type { ComponentType } from "react";
import Campanhas from "./Campanhas";
import Descadastros from "./Descadastros";
import Envio from "./Envio";
import Jornadas from "./Jornadas";
import Publico from "./Publico";
import Templates from "./Templates";
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
  { id: "journeys", titulo: "Jornadas", componente: Jornadas },
  { id: "campaigns", titulo: "Campanhas", componente: Campanhas },
  { id: "templates", titulo: "Templates", componente: ComEmojis },
  { id: "whatsapp", titulo: "WhatsApp", componente: Envio },
  { id: "optout", titulo: "Descadastros", componente: Descadastros },
  { id: "passengers", titulo: "Passageiros", componente: Passageiros },
  { id: "drivers", titulo: "Motoristas", componente: Motoristas },
];
