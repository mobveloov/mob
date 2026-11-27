// Rotas dos webhooks de saída (/api/integracoes/webhooks). Só administrador (a barreira fica no index.ts).
import { Router, type Request, type Response } from "express";
import { verificarDns, validarUrl, alterarWebhook, criarWebhook, entregasRecentes, girarSegredo, listarWebhooks, MAX_POR_TIPO, removerWebhook, testarWebhook, TIPOS_WEBHOOK } from "./webhooks.ts";

export const rotasWebhooks = Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};
const emp = (req: Request) => req.ctx!.empresaId;

rotasWebhooks.get("/", ok((req, res) => res.json({ webhooks: listarWebhooks(emp(req)), entregas: entregasRecentes(emp(req)), tipos: TIPOS_WEBHOOK, maximoPorTipo: MAX_POR_TIPO })));
rotasWebhooks.post("/", ok(async (req, res) => { await verificarDns(validarUrl(req.body?.url)); res.json(criarWebhook(emp(req), req.body ?? {})); }));
rotasWebhooks.put("/:id", ok(async (req, res) => { if (req.body?.url !== undefined) await verificarDns(validarUrl(req.body.url)); res.json({ webhook: alterarWebhook(emp(req), String(req.params.id), req.body ?? {}) }); }));
rotasWebhooks.delete("/:id", ok((req, res) => { removerWebhook(emp(req), String(req.params.id)); res.json({ ok: true }); }));
rotasWebhooks.post("/:id/segredo", ok((req, res) => res.json(girarSegredo(emp(req), String(req.params.id)))));
rotasWebhooks.post("/:id/testar", ok(async (req, res) => res.json(await testarWebhook(emp(req), String(req.params.id)))));
