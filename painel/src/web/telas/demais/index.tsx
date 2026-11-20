// Telas de Financeiro, Comunicação, Config, Avaliações e Ajuda. O App liga cada chave abaixo à rota do menu.

import type { JSX } from "react";
import "./demais.css";
import "./grupoc.css";
import { ConfigCarteirasCredito } from "./ConfigCarteirasCredito";
import { Carteiras, Extrato, Recargas, Relatorios, Saques } from "./Financeiro";
import { ExtratoCentral, ExtratoOnline, VisaoGeral } from "./FinanceiroMachine";
import { TransacaoPix } from "./Pix";
import { ExtratoCreditos, PainelCartao, RecargasESaques, SaldoCentral, SaldoMotorista, TransacoesCartao, UltimoBoleto } from "./CreditosCartao";
import { RelatorioFaturamento } from "./RelatorioFaturamento";
import { AlertasEmpresas } from "./Alertas";
import { Conversas, Notificacoes } from "./Comunicacao";
import { ConfigGerais } from "./ConfigGerais";
import { Categorias } from "./Categorias";
import { Descontos, RegrasCredito } from "./ConfigRegras";
import { DespachoResumo } from "../grupoc/DespachoResumo";
import { TransbordosParceiras } from "../grupoc/TransbordosParceiras";
import { TaxasCentral } from "./TaxasCentral";
import { TarifasDinamicas } from "./Dinamica";
import { Integracoes } from "./Integracoes";
import { Avaliacoes, ConfigNps } from "./Nps";
import { CentralAjuda, Juridico, TermosApp } from "./TermosAjuda";

export const TELAS_DEMAIS: Record<string, JSX.Element> = {
  "visao-geral": <VisaoGeral />,
  "relatorio-faturamento": <RelatorioFaturamento />,
  "extrato-central": <ExtratoCentral />,
  "extrato-online": <ExtratoOnline />,
  "transacao-pix": <TransacaoPix />,
  "creditos-recargas-saques": <RecargasESaques />,
  "creditos-extrato": <ExtratoCreditos />,
  "cartao-painel": <PainelCartao />,
  "cartao-transacoes": <TransacoesCartao />,
  "cartao-saldo-central": <SaldoCentral />,
  "cartao-saldo-motorista": <SaldoMotorista />,
  "ultimo-boleto": <UltimoBoleto />,
  "alertas-empresas": <AlertasEmpresas />,
  carteiras: <Carteiras />,
  "carteiras-credito": <ConfigCarteirasCredito />,
  extrato: <Extrato />,
  saques: <Saques />,
  recargas: <Recargas />,
  relatorios: <Relatorios />,
  conversas: <Conversas />,
  notificacoes: <Notificacoes />,
  "config-gerais": <ConfigGerais />,
  "regras-credito": <RegrasCredito />,
  "taxas-central": <TaxasCentral />,
  categorias: <Categorias />,
  "tarifas-dinamicas": <TarifasDinamicas />,
  descontos: <Descontos />,
  "regras-despacho": <DespachoResumo />,
  transbordos: <TransbordosParceiras />,
  integracoes: <Integracoes />,
  "config-nps": <ConfigNps />,
  "termos-app": <TermosApp />,
  avaliacoes: <Avaliacoes />,
  juridico: <Juridico />,
  "central-ajuda": <CentralAjuda />,
};
