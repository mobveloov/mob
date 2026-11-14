// Telas do grupo C (tarifas e configurações) que não existiam: Alteração de dados da OS e Personalização do app do passageiro.
// O registro (web/telas/registro.ts) junta este arquivo sozinho.

import type { JSX } from "react";
import "../demais/grupoc.css";
import { AlterarOS } from "./AlterarOS";
import { Personalizacao } from "./Personalizacao";

export const TELAS_GRUPOC: Record<string, JSX.Element> = {
  "alterar-os": <AlterarOS />,
  "personalizacao-app": <Personalizacao />,
};
