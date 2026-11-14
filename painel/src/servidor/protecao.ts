// Proteção das PÁGINAS do painel (HTML e arquivos do front) contra cópia casual e contra uso em iframe.
// Não vale para as rotas /api (apps, integrações, webhooks, Evolution): essas têm login/token próprio e são usadas
// por programas (curl, Go, Python) de propósito. A proteção de verdade dos dados é o login em toda rota da API.

import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";

/** Programas que baixam site inteiro ou raspam páginas. */
export const ROBOS_DE_CLONAGEM =
  /httrack|wget|curl|webcopier|teleport|sitesucker|offline explorer|webstripper|scrapy|python-requests|go-http-client/i;

export const ehRoboDeClonagem = (userAgent: string | undefined) => ROBOS_DE_CLONAGEM.test(userAgent ?? "");

const CACHE_HTML = "no-store, no-cache, must-revalidate, proxy-revalidate";

/** Cabeçalhos de toda resposta do painel. */
export function cabecalhosDoPainel(res: Response) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", CACHE_HTML);
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

/** Páginas do painel: 403 para programas de clonagem e cabeçalhos de segurança. */
export function protegerPaginas(req: Request, res: Response, next: NextFunction) {
  if (ehRoboDeClonagem(req.headers["user-agent"])) return res.status(403).type("text/plain").send("Acesso negado.");
  cabecalhosDoPainel(res);
  next();
}

/** Em todas as respostas da API: não adivinhar tipo e não vazar o endereço de origem. */
export function cabecalhosDaApi(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}

/**
 * Serve o painel compilado: arquivos com hash em /assets podem ficar em cache por um ano; o HTML nunca.
 * Qualquer caminho que não seja /api devolve o index.html (que, antes do login, só tem a tela de entrada).
 */
export function servirPainel(app: express.Express, dist: string) {
  if (!fs.existsSync(dist)) return;
  const estatico = express.static(dist, {
    index: false,
    setHeaders(res, arquivo) {
      if (arquivo.split(path.sep).includes("assets")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.removeHeader("Pragma"); res.removeHeader("Expires");
      }
    },
  });
  app.use(protegerPaginas, estatico);
  app.get(/^\/(?!api).*/, protegerPaginas, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}
