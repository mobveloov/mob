// Telas de Plantão, Ruas, Funil de Clientes e Mapa de Bairros e Demanda, por id do menu (src/comum/funcoes.ts).
import type { JSX } from "react";
import FunilClientes from "./FunilClientes";
import MapaBairros from "./MapaBairros";
import Plantao from "./Plantao";
import Ruas from "./Ruas";

export const TELAS_AREAS: Record<string, JSX.Element> = {
  plantao: <Plantao />,
  ruas: <Ruas />,
  "funil-clientes": <FunilClientes />,
  "mapa-bairros": <MapaBairros />,
};
