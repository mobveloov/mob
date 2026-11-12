// Dados da gestão (grupo Cadastro) de cada empresa: DADOS_DIR/empresas/<id>/gestao/<nome>.json.
// Uma empresa nunca lê a pasta de outra (o id é validado).

import path from "node:path";
import { idValido, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

function arquivo(empresaId: string, nome: string) {
  if (!idValido(empresaId) || !/^[a-z-]+$/.test(nome)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", empresaId, "gestao", `${nome}.json`);
}

/** Cópia do arquivo (quem chama pode mudar à vontade e gravar). */
export const lerG = <T>(empresaId: string, nome: string, padrao: T): T => structuredClone(lerJson<T>(arquivo(empresaId, nome), padrao));
export const gravarG = (empresaId: string, nome: string, valor: unknown) => gravarJson(arquivo(empresaId, nome), valor, { espacos: 1 });
