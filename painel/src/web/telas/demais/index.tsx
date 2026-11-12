// Telas de Financeiro, Comunicação, Config, Avaliações e Ajuda. O App liga cada chave abaixo à rota do menu.

import type { JSX } from "react";
import "./demais.css";
import { Carteiras, Extrato, Recargas, Relatorios, Saques } from "./Financeiro";
import { Conversas, Notificacoes } from "./Comunicacao";
import { ConfigGerais } from "./ConfigGerais";
import { Categorias } from "./Categorias";
import { Descontos, RegrasCredito, RegrasDespacho, TarifasDinamicas, Transbordos } from "./ConfigRegras";
import { Integracoes } from "./Integracoes";
import { Avaliacoes, ConfigNps } from "./Nps";
import { CentralAjuda, Juridico, TermosApp } from "./TermosAjuda";

export const TELAS_DEMAIS: Record<string, JSX.Element> = {
  carteiras: <Carteiras />,
  extrato: <Extrato />,
  saques: <Saques />,
  recargas: <Recargas />,
  relatorios: <Relatorios />,
  conversas: <Conversas />,
  notificacoes: <Notificacoes />,
  "config-gerais": <ConfigGerais />,
  "regras-credito": <RegrasCredito />,
  categorias: <Categorias />,
  "tarifas-dinamicas": <TarifasDinamicas />,
  descontos: <Descontos />,
  "regras-despacho": <RegrasDespacho />,
  transbordos: <Transbordos />,
  integracoes: <Integracoes />,
  "config-nps": <ConfigNps />,
  "termos-app": <TermosApp />,
  avaliacoes: <Avaliacoes />,
  juridico: <Juridico />,
  "central-ajuda": <CentralAjuda />,
};
