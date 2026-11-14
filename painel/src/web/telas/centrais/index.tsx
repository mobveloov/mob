// Telas de Cobrança por central: Controle financeiro de centrais, Meus planos e Demonstrativo Mensal.
import type { JSX } from "react";
import "./centrais.css";
import { DemonstrativoMensal } from "./Demonstrativo";
import { ControleCentrais } from "./ControleCentrais";
import { MeusPlanos } from "./MeusPlanos";

export const TELAS_CENTRAIS: Record<string, JSX.Element> = {
  "controle-centrais": <ControleCentrais />,
  "meus-planos": <MeusPlanos />,
  "demonstrativo-mensal": <DemonstrativoMensal />,
};
