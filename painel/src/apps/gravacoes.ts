// Gravação das corridas (segurança do motorista): o app do motorista grava o áudio (ou o vídeo, se a empresa liberar) em pedaços leves e
// manda ao servidor. O passageiro é avisado de que a corrida é gravada. Só a central (cargo alto) acessa, e cada acesso fica registrado.
// As gravações somem sozinhas depois de N dias, salvo corrida com SOS/ocorrência ou marcada para guardar.
// Fica em DADOS_DIR/empresas/<id>/apps/gravacoes/<corridaId>/ (índice.json + partes).

import fs from "node:fs";
import path from "node:path";
import { arquivo, idCorridaValido, ler, gravar } from "./armazem.ts";
import { alertas } from "./despacho.ts";
import { gerais } from "../config/gerais.ts";

export interface ConfigGravacao { ativa: boolean; obrigatoria: boolean; video: boolean; dias: number }
export const GRAVACAO_PADRAO: ConfigGravacao = { ativa: true, obrigatoria: false, video: false, dias: 30 };

/** Configuração da empresa: Configurações › Gerais › Regras do motorista (o arquivo ajustes.json › gravacao ainda vale, se existir, para quem já usava). */
export function configGravacao(empresaId: string): ConfigGravacao {
  let doPainel: Partial<ConfigGravacao> = {};
  try { doPainel = gerais(empresaId).motorista.gravacao; } catch { /* sem configuração: valem os padrões */ }
  const a = { ...doPainel, ...(ler<{ gravacao?: Partial<ConfigGravacao> }>(arquivo(empresaId, "ajustes.json"), {}).gravacao ?? {}) };
  const dias = Number(a.dias);
  return {
    ativa: a.ativa ?? GRAVACAO_PADRAO.ativa, obrigatoria: !!a.obrigatoria && (a.ativa ?? true), video: !!a.video,
    dias: Number.isFinite(dias) ? Math.min(365, Math.max(1, Math.round(dias))) : GRAVACAO_PADRAO.dias,
  };
}

export interface ParteGravacao { n: number; tipo: string; bytes: number; segundos: number; em: string }
export interface IndiceGravacao { corridaId: string; os: string; motoristaId: string; consentimento: { em: string; video: boolean }; guardar: boolean; partes: ParteGravacao[]; acessos: Array<{ em: string; por: string }> }

const MAX_PARTE = 12 * 1024 * 1024;
const TIPOS: Record<string, string> = { "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "video/mp4": "mp4" };
const pasta = (empresaId: string, corridaId: string) => { if (!idCorridaValido(corridaId)) throw new Error("Corrida inválida."); return arquivo(empresaId, "gravacoes", corridaId); };
const arqIndice = (empresaId: string, corridaId: string) => path.join(pasta(empresaId, corridaId), "indice.json");

/** Recebe um pedaço da gravação (continuação do mesmo arquivo: só o primeiro pedaço traz o cabeçalho). */
export function salvarParte(empresaId: string, corrida: { id: string; os: string }, motoristaId: string, buf: Buffer, mime: string, n: number, segundos: number, video: boolean): ParteGravacao {
  const cfg = configGravacao(empresaId);
  if (!cfg.ativa) throw new Error("A empresa não usa gravação das corridas.");
  if (video && !cfg.video) throw new Error("A empresa só libera gravação de áudio.");
  const tipo = mime.split(";")[0].trim().toLowerCase();
  if (!TIPOS[tipo]) throw new Error("Formato de gravação não aceito.");
  if (!buf.length) throw new Error("Pedaço vazio.");
  if (buf.length > MAX_PARTE) throw new Error("Pedaço grande demais.");
  if (!Number.isInteger(n) || n < 0 || n > 5000) throw new Error("Número do pedaço inválido.");
  if (n === 0 && tipo.endsWith("webm") && buf.readUInt32BE(0) !== 0x1a45dfa3) throw new Error("Arquivo de gravação inválido.");
  const dir = pasta(empresaId, corrida.id);
  fs.mkdirSync(dir, { recursive: true });
  const idx = structuredClone(ler<IndiceGravacao>(arqIndice(empresaId, corrida.id), { corridaId: corrida.id, os: corrida.os, motoristaId, consentimento: { em: new Date().toISOString(), video }, guardar: false, partes: [], acessos: [] }));
  if (idx.motoristaId !== motoristaId) throw new Error("Esta gravação é de outro motorista.");
  const parte: ParteGravacao = { n, tipo, bytes: buf.length, segundos: Math.max(0, Math.min(3600, Math.round(segundos) || 0)), em: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, `${n}.${TIPOS[tipo]}`), buf);
  idx.partes = [...idx.partes.filter((p) => p.n !== n), parte].sort((a, b) => a.n - b.n);
  gravar(arqIndice(empresaId, corrida.id), idx);
  return parte;
}

/** Lista das corridas que têm gravação (para o painel), da mais nova para a mais antiga. */
export function listarGravacoes(empresaId: string, corridaId?: string): IndiceGravacao[] {
  const raiz = arquivo(empresaId, "gravacoes");
  if (!fs.existsSync(raiz)) return [];
  const ids = corridaId ? [corridaId] : fs.readdirSync(raiz);
  return ids.filter(idCorridaValido).map((id) => ler<IndiceGravacao | null>(arqIndice(empresaId, id), null)).filter((x): x is IndiceGravacao => !!x)
    .sort((a, b) => (b.partes.at(-1)?.em ?? "").localeCompare(a.partes.at(-1)?.em ?? ""));
}

/** Arquivo de um pedaço, registrando quem viu (cada acesso fica no índice). */
export function abrirParte(empresaId: string, corridaId: string, n: number, por: string): { caminho: string; mime: string } | null {
  const lido = ler<IndiceGravacao | null>(arqIndice(empresaId, corridaId), null);
  const idx = lido ? structuredClone(lido) : null;
  const p = idx?.partes.find((x) => x.n === n);
  if (!idx || !p) return null;
  const caminho = path.join(pasta(empresaId, corridaId), `${n}.${TIPOS[p.tipo]}`);
  if (!fs.existsSync(caminho)) return null;
  idx.acessos = [...idx.acessos, { em: new Date().toISOString(), por: por.slice(0, 120) }].slice(-500);
  gravar(arqIndice(empresaId, corridaId), idx);
  return { caminho, mime: p.tipo };
}

export function marcarParaGuardar(empresaId: string, corridaId: string, guardar: boolean) {
  const lido = ler<IndiceGravacao | null>(arqIndice(empresaId, corridaId), null);
  if (!lido) throw new Error("Gravação não encontrada.");
  const idx = structuredClone(lido);
  idx.guardar = guardar;
  gravar(arqIndice(empresaId, corridaId), idx);
  return idx;
}

/** Apaga as gravações mais velhas que o prazo da empresa, menos as de corrida com SOS/ocorrência ou marcadas para guardar. */
export function limparGravacoes(empresaId: string, agora = Date.now()): number {
  const limite = agora - configGravacao(empresaId).dias * 86_400_000;
  const comOcorrencia = new Set(alertas(empresaId).map((a) => a.corridaId));
  let apagadas = 0;
  for (const idx of listarGravacoes(empresaId)) {
    const ultima = Date.parse(idx.partes.at(-1)?.em ?? idx.consentimento.em);
    if (idx.guardar || comOcorrencia.has(idx.corridaId) || !(ultima < limite)) continue;
    fs.rmSync(pasta(empresaId, idx.corridaId), { recursive: true, force: true });
    apagadas++;
  }
  return apagadas;
}
