// Abas do CRM-2 registradas no esqueleto da tela "CRM & Engajamento" (web/crm/Painel.tsx): uma linha por aba, {id, titulo, componente}.
// O id é o mesmo do grupo/aba do Painel. Para entregar uma aba nova, crie o componente e acrescente uma linha aqui.

import type { ComponentType } from "react";
import "./crm2.css";
import Auditoria from "./Auditoria";
import Cidades from "./Cidades";
import Contatos from "./Contatos";
import Conversao from "./Conversao";
import Governanca from "./Governanca";
import MapaCalor from "./MapaCalor";
import Recompensas from "./Recompensas";
import Rfm from "./Rfm";

export interface AbaRegistrada { id: string; titulo: string; componente: ComponentType }

export const ABAS_CRM2: AbaRegistrada[] = [
  { id: "contacts", titulo: "Contatos", componente: Contatos },
  { id: "rfm", titulo: "RFM", componente: Rfm },
  { id: "conversion", titulo: "Conversão", componente: Conversao },
  { id: "heatmap", titulo: "Mapa de Calor", componente: MapaCalor },
  { id: "rewards", titulo: "Recompensas", componente: Recompensas },
  { id: "cities", titulo: "Cidades", componente: Cidades },
  { id: "governance", titulo: "Governança", componente: Governanca },
  { id: "audit", titulo: "Auditoria", componente: Auditoria },
];
