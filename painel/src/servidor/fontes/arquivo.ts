// Importação de planilha: lê o CSV exportado em "Consultar corridas" (separado por ";", em Latin-1 ou UTF-8)
// e transforma no formato do painel. Os arquivos ficam na pasta da empresa (fora do Git).

import { corridaVazia, type CorridaPainel, type GrupoStatus } from "../../comum/corrida.ts";
import { dataBr, normal, numero } from "../util.ts";

/** UTF-8 quando válido; senão Windows-1252 (Latin-1). */
export function decodificar(bytes: Uint8Array): string {
  let t: string;
  try { t = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { t = new TextDecoder("windows-1252").decode(bytes); }
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

/** CSV com aspas e quebras de linha dentro de aspas. O separador é o que mais aparece na 1ª linha. */
export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = [";", ",", "\t"].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas: string[][] = [];
  let linha: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

function grupoDoStatus(s: string): GrupoStatus {
  const k = normal(s);
  if (k.startsWith("finaliz") || k.startsWith("conclu")) return "finalizada";
  if (k.startsWith("cancel")) return "cancelada";
  if (k.includes("nao atend") || k.includes("sem motorista")) return "nao_atendida";
  return "aberta";
}

const VAZIO = new Set(["", "-", "---", "nao informado"]);

/** Bytes do CSV -> corridas. Erro em português quando o arquivo não serve. */
export function corridasDoCsv(bytes: Uint8Array, origem = "arquivo", origemNome = "Planilha importada"):
  { ok: true; corridas: CorridaPainel[] } | { ok: false; erro: string } {
  const tabela = lerCsv(decodificar(bytes));
  if (tabela.length < 2) return { ok: false, erro: "O arquivo está vazio ou não é um CSV." };
  const cab = tabela[0].map(normal);
  const col = (...nomes: string[]) => { for (const n of nomes) { const i = cab.indexOf(normal(n)); if (i >= 0) return i; } return -1; };
  const iOs = col("Nº OS", "No OS", "N OS", "OS", "ID");
  const iStatus = col("Status");
  const iData = col("Momento da solicitação", "Data/Hora", "Data da solicitação");
  if (iOs < 0 || iStatus < 0 || iData < 0) return { ok: false, erro: "Não reconheci o arquivo. Envie a exportação de \"Consultar corridas\" em CSV (precisa das colunas Nº OS, Status e Momento da solicitação)." };
  const idx = {
    cidade: col("Cidade"), categoria: col("Categoria"), pagamento: col("Forma de pagamento"), canal: col("Forma de disparo", "Corrida via", "Origem"),
    tarifa: col("Nome da Tarifa"), motorista: col("Motorista"), telMot: col("Telefone do motorista"), passageiro: col("Nome do passageiro", "Nome de cadastro"),
    telPax: col("Telefone do passageiro", "Telefone de cadastro"), embarque: col("Local de embarque", "Endereço de partida"), destino: col("Destino informado"),
    obs: col("Observação"), valor: col("Valor da corrida"), semDesc: col("Valor da corrida sem aplicar descontos e cupons"), estimado: col("Estimativa do valor da corrida"),
    desconto: col("Valor decrescentado da corrida pelo desconto"), cupom: col("Nome do cupom de desconto usado na corrida"), km: col("Estimativa de distância da corrida (KM)"),
    kmReal: col("Distância do início da corrida até o local de encerramento"), kmMot: col("Estimativa de distância até o passageiro no aceite (KM)"),
    fator: col("Fator dinâmico aplicado"), nota: col("Avaliação"), cancPor: col("Cancelada por"), motivo: col("Motivo do cancelamento"), operador: col("Operador"),
    inicio: col("Momento que o motorista registrou início da corrida"), fim: col("Momento que o motorista registrou o encerramento"), programada: col("Data/Hora da programada"),
  };
  const vistos = new Set<string>();
  const corridas: CorridaPainel[] = [];
  for (const l of tabela.slice(1)) {
    const v = (i: number) => { const s = i >= 0 ? String(l[i] ?? "").trim() : ""; return VAZIO.has(normal(s)) ? "" : s; };
    const os = v(iOs);
    if (!os || vistos.has(os)) continue;
    vistos.add(os);
    const statusTexto = v(iStatus) || "Sem status";
    corridas.push({
      ...corridaVazia({ id: `${origem}:${os}`, origem, origemNome, os, grupo: grupoDoStatus(statusTexto), statusTexto }),
      solicitadaEm: dataBr(v(iData)), iniciadaEm: dataBr(v(idx.inicio)), finalizadaEm: dataBr(v(idx.fim)),
      cidade: v(idx.cidade), categoria: v(idx.categoria), pagamento: v(idx.pagamento), canal: v(idx.canal), tarifa: v(idx.tarifa),
      motorista: v(idx.motorista), telefoneMotorista: v(idx.telMot), passageiro: v(idx.passageiro), telefonePassageiro: v(idx.telPax),
      embarque: v(idx.embarque), destino: v(idx.destino).replace(/^[\s,]+$/, ""), observacao: v(idx.obs),
      valor: numero(v(idx.valor)), valorSemDesconto: numero(v(idx.semDesc)), valorEstimado: numero(v(idx.estimado)), desconto: numero(v(idx.desconto)),
      cupom: v(idx.cupom), distanciaKm: numero(v(idx.km)), distanciaRealKm: numero(v(idx.kmReal)), distanciaMotoristaKm: numero(v(idx.kmMot)),
      fatorDinamico: numero(v(idx.fator)), avaliacao: numero(v(idx.nota)), canceladaPor: v(idx.cancPor), motivoCancelamento: v(idx.motivo),
      operador: v(idx.operador), programada: !!v(idx.programada),
    });
  }
  return { ok: true, corridas };
}
