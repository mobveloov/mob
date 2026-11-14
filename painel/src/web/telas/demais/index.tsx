// Telas de Financeiro, Comunicação, Config, Avaliações e Ajuda. O App liga cada chave abaixo à rota do menu.

import type { JSX } from "react";
import "./demais.css";
import { Carteiras, Extrato, Recargas, Relatorios, Saques } from "./Financeiro";
import { ExtratoCentral, ExtratoOnline, VisaoGeral } from "./FinanceiroMachine";
import { TransacaoPix } from "./Pix";
import { AlertasEmpresas } from "./Alertas";
import { Conversas, Notificacoes } from "./Comunicacao";
import { ConfigGerais } from "./ConfigGerais";
import { Categorias } from "./Categorias";
import { Descontos, RegrasCredito, RegrasDespacho, Transbordos } from "./ConfigRegras";
import { TarifasDinamicas } from "./Dinamica";
import { Integracoes } from "./Integracoes";
import { Avaliacoes, ConfigNps } from "./Nps";
import { CentralAjuda, Juridico, TermosApp } from "./TermosAjuda";

export const TELAS_DEMAIS: Record<string, JSX.Element> = {
  "visao-geral": <VisaoGeral />,
  "extrato-central": <ExtratoCentral />,
  "extrato-online": <ExtratoOnline />,
  "transacao-pix": <TransacaoPix />,
  "alertas-empresas": <AlertasEmpresas />,
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
