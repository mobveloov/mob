// Telas do grupo C (tarifas e configurações) que não existiam: Alteração de dados da OS, Personalização do app do passageiro
// e Recompensas por indicação. O registro (web/telas/registro.ts) junta este arquivo sozinho.

import type { JSX } from "react";
import "../demais/grupoc.css";
import { AlterarOS } from "./AlterarOS";
import { Personalizacao } from "./Personalizacao";
import { Recompensas } from "./Recompensas";

export const TELAS_GRUPOC: Record<string, JSX.Element> = {
  "alterar-os": <AlterarOS />,
  "personalizacao-app": <Personalizacao />,
  "recompensas-indicacao": <Recompensas />,
};
