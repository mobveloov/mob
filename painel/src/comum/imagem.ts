// Fotos e documentos em imagem viram WebP antes de gravar: qualidade 80, lado maior até 1600 px (texto de documento continua legível).
// Vale para tudo que entra pelos apps (perfil, CNH, CRLV, foto do rosto e do veículo, fotos do chat) e pelo painel (documentos do motorista).
// PDF e vídeo passam como estão. Se a conversão falhar (arquivo estranho), segue o arquivo original: o envio nunca quebra por causa disso.

import sharp from "sharp";

export const LADO_MAXIMO = 1600;
export const QUALIDADE_WEBP = 80;
const IMAGENS = new Set(["image/jpeg", "image/png", "image/webp"]);

export const ehImagemConversivel = (mime: string) => IMAGENS.has(String(mime ?? "").split(";")[0].trim().toLowerCase());

/** Converte a imagem para WebP (corrige a rotação da câmera, limita o lado maior e tira os metadados). Outros tipos voltam sem mudar. */
export async function otimizarImagem(bytes: Uint8Array, mime: string): Promise<{ bytes: Buffer; mime: string }> {
  const original = Buffer.from(bytes);
  const tipo = String(mime ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGENS.has(tipo) || !original.length) return { bytes: original, mime: tipo || mime };
  try {
    const saida = await sharp(original, { failOn: "error" })
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALIDADE_WEBP })
      .toBuffer();
    // Se o WebP ficou maior que o original já pequeno (raro), fica com o original.
    if (saida.length >= original.length && tipo === "image/webp") return { bytes: original, mime: tipo };
    return { bytes: saida, mime: "image/webp" };
  } catch {
    return { bytes: original, mime: tipo };
  }
}
