// Telas do grupo Corridas, iguais ao painel de referência (white-label). A frente de layout liga cada chave a uma rota do menu:
//   solicitar -> Nova Solicitação, recuperacao -> Recuperação de Vendas, monitoramento -> Monitoramento, mapa -> Mapa Real-Time,
//   historico -> Histórico, ocorrencias -> Retorno/Ocorrências, programadas -> Programadas, pagamentos-pendentes -> Pagamentos Pend., objetos -> Objetos Perdidos.
import type { JSX } from "react";
import Historico from "./Historico";
import MapaReal from "./MapaReal";
import Monitoramento from "./Monitoramento";
import Objetos from "./Objetos";
import Ocorrencias from "./Ocorrencias";
import Pendentes from "./Pendentes";
import Programadas from "./Programadas";
import Recuperacao from "./Recuperacao";
import Solicitar from "./Solicitar";
import Taxas from "./Taxas";

export const TELAS_CORRIDAS: Record<string, JSX.Element> = {
  solicitar: <Solicitar />,
  recuperacao: <Recuperacao />,
  monitoramento: <Monitoramento />,
  mapa: <MapaReal />,
  historico: <Historico />,
  ocorrencias: <Ocorrencias />,
  programadas: <Programadas />,
  "pagamentos-pendentes": <Pendentes />,
  "taxas-cancelamento": <Taxas />,
  objetos: <Objetos />,
};
