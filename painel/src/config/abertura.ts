// Imagem de abertura de cada app (Personalização app passageiro / app motorista): a tela que aparece assim que o app abre,
// no lugar do "Carregando". Guardada em WebP (qualidade 85, retrato até 1920 px) na pasta da empresa; sem arquivo = tela padrão.
// O app lê a url (com versão) por GET /api/apps/<empresa>/abertura/<app> (público) e também dentro da personalização.

import sharp from "sharp";
import * as D from "../servidor/dados.ts";

export type AppAbertura = "passageiro" | "motorista";
export const APPS_ABERTURA: readonly AppAbertura[] = ["passageiro", "motorista"];
export const MAX_ABERTURA = 8 * 1024 * 1024;
const TIPO: Record<AppAbertura, string> = { passageiro: "aberturaPassageiro", motorista: "aberturaMotorista" };
export interface Abertura { url: string; versao: string }

export const ehAppAbertura = (v: unknown): v is AppAbertura => v === "passageiro" || v === "motorista";

/** A imagem de abertura do app, ou null (usa a tela padrão). */
export function aberturaDoApp(empresaId: string, app: AppAbertura): Abertura | null {
  const nome = `${TIPO[app]}.webp`;
  if (!D.caminhoImagem(empresaId, nome)) return null;
  const versao = D.versaoImagem(empresaId, nome);
  return { url: `/api/publico/arquivo/${empresaId}/${nome}?v=${encodeURIComponent(versao)}&cors=1`, versao }; // &cors=1: chave de cache nova (o Cloudflare guardou por 1 ano a versão sem CORS)
}

/** Recebe PNG, JPG ou WebP, converte para WebP e grava. */
export async function enviarAbertura(empresaId: string, app: AppAbertura, mime: string, bytes: Uint8Array): Promise<Abertura> {
  if (!bytes.length || !/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("Envie uma imagem PNG, JPG ou WEBP.");
  if (bytes.length > MAX_ABERTURA) throw new Error("Imagem grande demais (máximo 8 MB).");
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(bytes), { failOn: "error" }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new Error("O arquivo não é uma imagem válida."); }
  D.salvarImagem(empresaId, TIPO[app], "image/webp", new Uint8Array(webp), MAX_ABERTURA);
  return aberturaDoApp(empresaId, app)!;
}

export function removerAbertura(empresaId: string, app: AppAbertura): null {
  D.apagarImagem(empresaId, `${TIPO[app]}.webp`);
  return null;
}
