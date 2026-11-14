// Foto (logo) da empresa: enviar, trocar e remover. Fica na pasta da empresa, junto das outras imagens da marca
// (marca.arquivos.fotoEmpresa). Só administrador grava. PNG, JPG ou WEBP, até 2 MB. Montada em /api/empresa.

import express, { Router, type NextFunction, type Request, type Response } from "express";
import { exigirPapel } from "./sessao.ts";
import * as D from "./dados.ts";

export const rotasFotoEmpresa = Router();

const so = exigirPapel("admin");
const falha = (res: Response, status: number, erro: string) => res.status(status).json({ erro });

rotasFotoEmpresa.post("/foto", so,
  // Limite um pouco acima de 2 MB: o aviso de tamanho sai daqui, em português, e não do corpo cortado.
  express.raw({ type: () => true, limit: D.MAX_IMAGEM + 1024 }),
  (req: Request, res: Response) => {
    try {
      const id = req.ctx!.empresaId;
      const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
      if (!bytes.length) return falha(res, 400, "Arquivo vazio.");
      if (bytes.length > D.MAX_IMAGEM) return falha(res, 413, "Imagem grande demais (máximo 2 MB).");
      const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const nome = D.salvarImagem(id, "fotoEmpresa", mime, bytes);
      const m = D.marca(id);
      m.arquivos.fotoEmpresa = nome;
      D.salvarMarca(id, m);
      res.json({ fotoEmpresa: nome, marca: m });
    } catch (e) { falha(res, 400, e instanceof Error ? e.message : "Erro."); }
  });

rotasFotoEmpresa.delete("/foto", so, (req: Request, res: Response) => {
  const id = req.ctx!.empresaId;
  const m = D.marca(id);
  D.apagarImagem(id, m.arquivos.fotoEmpresa);
  m.arquivos.fotoEmpresa = "";
  D.salvarMarca(id, m);
  res.json({ fotoEmpresa: "", marca: m });
});

// Corpo grande demais (o limite do express.raw): resposta curta em português.
rotasFotoEmpresa.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if ((err as { type?: string }).type === "entity.too.large") return falha(res, 413, "Imagem grande demais (máximo 2 MB).");
  next(err);
});
