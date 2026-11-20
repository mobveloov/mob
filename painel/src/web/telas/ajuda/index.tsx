// Telas novas de Cadastro (Passe Livre, Consulta de cartões) e de Ajuda (Termos de uso, Central de suporte, Ouvidoria).
// O registro (telas/registro.ts) junta todo export TELAS_* daqui, por id do menu (src/comum/funcoes.ts).

import type { JSX } from "react";
import PasseLivre from "../cadastro/PasseLivre";
import ConsultaCartoes from "../cadastro/ConsultaCartoes";
import CentralSuporte from "./CentralSuporte";
import Ouvidoria from "./Ouvidoria";
import TermosPainel from "./TermosPainel";

export const TELAS_AJUDA: Record<string, JSX.Element> = {
  "passe-livre": <PasseLivre />,
  "consulta-cartoes": <ConsultaCartoes />,
  "ajuda-termos": <TermosPainel />,
  "central-suporte": <CentralSuporte />,
  ouvidoria: <Ouvidoria />,
};
