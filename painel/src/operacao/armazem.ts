// Dados da operação de corridas da central (grupo Corridas do painel): ficam em DADOS_DIR/empresas/<id>/operacao/.
//
//   ondas.json        ofertas do despacho a cada motorista (auditoria "Ondas de Envio")
//   cotacoes.json     cotações feitas no app do passageiro (Recuperação de Vendas)
//   contatos.json     quem a central já chamou para recuperar a venda
//   pendencias.json   situação das taxas de cancelamento (pendente, paga, abonada)
//   chat-lido.json    até quando a central já leu o chat de cada corrida
//
// Toda função recebe o id da empresa, validado com idValido: uma empresa nunca lê a pasta de outra.

import path from "node:path";
import { idValido, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

export function arquivoOperacao(empresaId: string, nome: string) {
  if (!idValido(empresaId)) throw new Error("Empresa inválida.");
  if (!/^[a-z-]+\.json$/.test(nome)) throw new Error("Arquivo inválido.");
  return path.join(raiz(), "empresas", empresaId, "operacao", nome);
}

/** Só leitura (cache): para mudar, copie e grave. */
export const lerOperacao = <T>(empresaId: string, nome: string, padrao: T): T => lerJson<T>(arquivoOperacao(empresaId, nome), padrao);
export const gravarOperacao = (empresaId: string, nome: string, valor: unknown) => gravarJson(arquivoOperacao(empresaId, nome), valor, { modo: 0o600 });
