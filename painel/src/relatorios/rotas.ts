// Rotas de Relatórios e Vouchers (/api/relatorios), montadas depois do login. A empresa vem SEMPRE do login (req.ctx).
//
//   GET    /definicoes                       relatórios, filtros de cada um e listas dos filtros
//   GET    /indice                           índice: relatórios padrão e modelos (salvos e sugeridos)
//   POST   /modelos                          Criar modelo (admin)         DELETE /modelos/:id (admin)
//   GET    /relatorio/:id                    resultado paginado (?inicio&fim&pagina&...filtros)
//   GET    /relatorio/:id/csv                CSV completo do filtro (com proteção contra fórmula)
//   GET    /vouchers/faixas                  Faixas de Vouchers (filtros empresa, serie, inicial, final)
//   POST   /vouchers/faixas                  criar faixa (admin)          DELETE /vouchers/faixas/:id (admin)
//   GET    /vouchers/entrega                 OS de voucher pendentes de entrega (?motorista&osCompradas)
//   POST   /vouchers/entrega                 Registrar Entrega ({ ids })

import express, { type Request, type Response } from "express";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr } from "../servidor/util.ts";
import { FORMAS_PAGAMENTO, DEFINICOES, criarModelo, csvDoRelatorio, gerarRelatorio, lerFiltros, listarModelos, opcoesDosFiltros, removerModelo } from "./relatorios.ts";
import { criarFaixa, listarFaixas, nomesConveniadas, pendentesDeEntrega, registrarEntrega, removerFaixa } from "./vouchers.ts";

export const rotasRelatorios = express.Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro.";
    if (!res.headersSent) res.status(/não encontrad/i.test(msg) ? 404 : 400).json({ erro: msg });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;
const admin = exigirPapel("admin");
const central = exigirPapel("admin", "operador");
const q = (req: Request, k: string) => String(req.query[k] ?? "").slice(0, 400);
const inteiroOuNulo = (v: string) => (/^\d{1,12}$/.test(v) ? Number(v) : null);

// Relatórios que têm item no menu (os demais só existem como base de modelo).
const NO_MENU = new Set(["faturamento-empresa", "faturamento-centro-custo", "faturamento-periodo", "vouchers-motoristas", "os-bairro", "os-empresa", "os-pagamento", "os-percentual-motorista", "os-operador", "os-motorista", "km-rodados"]);

rotasRelatorios.get("/definicoes", ok((req, res) => res.json({
  relatorios: DEFINICOES.map((d) => ({ id: d.id, titulo: d.titulo, descricao: d.descricao, filtros: d.filtros, noMenu: NO_MENU.has(d.id) })),
  opcoes: opcoesDosFiltros(emp(req)), formas: FORMAS_PAGAMENTO,
})));

rotasRelatorios.get("/indice", ok((req, res) => res.json({
  padrao: DEFINICOES.filter((d) => NO_MENU.has(d.id)).map((d) => ({ id: d.id, titulo: d.titulo, rota: `/${d.id}` })),
  modelos: listarModelos(emp(req)),
})));

rotasRelatorios.post("/modelos", admin, ok((req, res) => res.status(201).json({ modelo: criarModelo(emp(req), req.body ?? {}, quem(req)) })));
rotasRelatorios.delete("/modelos/:id", admin, ok((req, res) => { removerModelo(emp(req), req.params.id); res.json({ ok: true }); }));

rotasRelatorios.get("/relatorio/:id", ok((req, res) => res.json(gerarRelatorio(emp(req), req.params.id, lerFiltros(req.query), Number(q(req, "pagina")) || 1))));
rotasRelatorios.get("/relatorio/:id/csv", ok((req, res) => {
  const csv = csvDoRelatorio(emp(req), req.params.id, lerFiltros(req.query));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.id.replace(/[^a-z0-9-]/g, "")}-${agoraBr().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ------------------------------------------------------------------ vouchers

rotasRelatorios.get("/vouchers/faixas", ok((req, res) => res.json({
  faixas: listarFaixas(emp(req), { empresa: q(req, "empresa"), serie: q(req, "serie"), inicial: inteiroOuNulo(q(req, "inicial")), final: inteiroOuNulo(q(req, "final")) }),
  empresas: nomesConveniadas(emp(req)),
})));
rotasRelatorios.post("/vouchers/faixas", admin, ok((req, res) => res.status(201).json({ faixa: criarFaixa(emp(req), req.body ?? {}, quem(req)) })));
rotasRelatorios.delete("/vouchers/faixas/:id", admin, ok((req, res) => { removerFaixa(emp(req), req.params.id); res.json({ ok: true }); }));

rotasRelatorios.get("/vouchers/entrega", ok((req, res) => res.json({ itens: pendentesDeEntrega(emp(req), { motorista: q(req, "motorista"), osCompradas: q(req, "osCompradas") }) })));
rotasRelatorios.post("/vouchers/entrega", central, ok((req, res) => res.json(registrarEntrega(emp(req), req.body?.ids, quem(req)))));

rotasRelatorios.use((_req, res) => res.status(404).json({ erro: "Caminho não encontrado." }));
