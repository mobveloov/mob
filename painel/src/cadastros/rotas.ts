// Rotas dos cadastros: /api/cadastros/:cadastro (listar, criar, editar, excluir, importar).
// A empresa vem sempre do usuário logado (req.ctx). Operador edita só os cadastros marcados com operadorEdita.

import { Router, type Request, type Response } from "express";
import { cadastroPorId, CADASTROS, type Cadastro } from "../comum/cadastros.ts";
import * as D from "../servidor/dados.ts";
import { buscarCorridas } from "../servidor/fontes/index.ts";
import { categoriasDoMotor, motoristasDoMotor, type TipoMotor } from "../servidor/fontes/motor.ts";
import { normal } from "../servidor/util.ts";
import { atualizar, criar, listar, mesclar, remover, type Valor } from "./armazem.ts";

export const rotasCadastros = Router();

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};
const ctx = (req: Request) => req.ctx!;
function cad(req: Request): Cadastro {
  const c = cadastroPorId(String(req.params.cadastro));
  if (!c) throw new Error("Cadastro não encontrado.");
  return c;
}
function podeEditar(req: Request, c: Cadastro) {
  const p = ctx(req).usuario.papel;
  if (p === "plataforma" || p === "admin" || c.operadorEdita) return;
  throw new Error("Seu usuário só pode consultar este cadastro.");
}
const quem = (req: Request) => ctx(req).usuario.email;

rotasCadastros.get("/", (_req, res) => res.json({ cadastros: CADASTROS }));

rotasCadastros.get("/:cadastro", ok((req, res) => {
  const c = cad(req);
  const busca = normal(req.query.busca);
  let l = listar(ctx(req).empresaId, c);
  if (busca) l = l.filter((r) => c.campos.some((f) => normal(r[f.chave]).includes(busca)));
  res.json({ registros: l.sort((a, b) => String(a[c.colunas[0]] ?? "").localeCompare(String(b[c.colunas[0]] ?? ""), "pt-BR")) });
}));

rotasCadastros.post("/:cadastro", ok((req, res) => {
  const c = cad(req); podeEditar(req, c);
  res.json({ registro: criar(ctx(req).empresaId, c, req.body ?? {}, quem(req)) });
}));

rotasCadastros.put("/:cadastro/:id", ok((req, res) => {
  const c = cad(req); podeEditar(req, c);
  res.json({ registro: atualizar(ctx(req).empresaId, c, String(req.params.id), req.body ?? {}, quem(req)) });
}));

rotasCadastros.delete("/:cadastro/:id", ok((req, res) => {
  const c = cad(req); podeEditar(req, c);
  remover(ctx(req).empresaId, c, String(req.params.id));
  res.json({ ok: true });
}));

const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Importar: puxa dos sistemas conectados (se houver) e das corridas. Não apaga o que a central já editou. */
rotasCadastros.post("/:cadastro/importar", ok(async (req, res) => {
  const c = cad(req); podeEditar(req, c);
  if (!c.importa) throw new Error("Este cadastro não tem importação.");
  const empresaId = ctx(req).empresaId;
  const avisos: string[] = [];
  const novos: Array<Record<string, Valor>> = [];
  const motorizadas = D.integracoes(empresaId).filter((i) => i.ativa && (i.tipo === "sistema-a" || i.tipo === "sistema-b"));
  const seg = D.segredos(empresaId);

  if (c.importa === "motoristas") {
    const r = await buscarCorridas(empresaId, { inicio: diasAtras(29), fim: hoje() });
    const porNome = new Map<string, { telefone: string; corridas: number; notas: number[]; ultima: string; cidade: string; origem: string }>();
    for (const x of r.corridas) {
      if (!x.motorista) continue;
      const m = porNome.get(x.motorista) ?? { telefone: "", corridas: 0, notas: [], ultima: "", cidade: "", origem: x.origemNome };
      m.corridas++; if (x.telefoneMotorista) m.telefone = x.telefoneMotorista.replace(/\D/g, "");
      if (x.avaliacao != null) m.notas.push(x.avaliacao);
      if ((x.solicitadaEm ?? "") > m.ultima) m.ultima = x.solicitadaEm ?? "";
      if (x.cidade) m.cidade = x.cidade;
      porNome.set(x.motorista, m);
    }
    for (const i of motorizadas) {
      try {
        for (const m of await motoristasDoMotor(i.tipo as TipoMotor, seg.integracoes[i.id] ?? {}, i.id)) {
          const tel = String(m.telefone ?? "").replace(/\D/g, "");
          if (!tel) continue;
          novos.push({ nome: m.nome ?? "", telefone: tel, cpf: String(m.cpf ?? "").replace(/\D/g, "") || null, status: m.ativo === false ? "Inativo" : "Ativo",
            categorias: (m.categorias ?? []).join(", ") || null, veiculo: [m.veiculo?.modelo, m.veiculo?.cor].filter(Boolean).join(" ") || null,
            placa: m.veiculo?.placa ?? null, origem: i.nome, avaliacao: m.avaliacao ?? null });
        }
      } catch (e) { avisos.push(`${i.nome}: ${e instanceof Error ? e.message : e}`); }
    }
    for (const [nome, m] of porNome) {
      if (!m.telefone) continue;
      novos.push({ nome, telefone: m.telefone, status: "Ativo", cidade: m.cidade || null, origem: m.origem, corridas: m.corridas,
        avaliacao: m.notas.length ? Math.round((m.notas.reduce((a, b) => a + b, 0) / m.notas.length) * 100) / 100 : null, ultimaCorrida: m.ultima.slice(0, 10) || null });
    }
    const semTelefone = [...porNome.values()].filter((m) => !m.telefone).length;
    if (semTelefone) avisos.push(`${semTelefone} motorista(s) das corridas sem telefone não foram importados.`);
  }

  if (c.importa === "passageiros") {
    const r = await buscarCorridas(empresaId, { inicio: diasAtras(89), fim: hoje() });
    const porTel = new Map<string, { nome: string; corridas: number; gasto: number; ultima: string; cidade: string }>();
    for (const x of r.corridas) {
      const tel = x.telefonePassageiro.replace(/\D/g, "");
      if (tel.length < 10) continue;
      const p = porTel.get(tel) ?? { nome: x.passageiro, corridas: 0, gasto: 0, ultima: "", cidade: "" };
      p.corridas++; if (x.grupo === "finalizada") p.gasto += x.valor ?? 0;
      if (!p.nome && x.passageiro) p.nome = x.passageiro;
      if ((x.solicitadaEm ?? "") > p.ultima) p.ultima = x.solicitadaEm ?? "";
      if (x.cidade) p.cidade = x.cidade;
      porTel.set(tel, p);
    }
    for (const [tel, p] of porTel) novos.push({ nome: p.nome || "Sem nome", telefone: tel, status: "Ativo", cidade: p.cidade || null, corridas: p.corridas, gasto: Math.round(p.gasto * 100) / 100, ultimaCorrida: p.ultima.slice(0, 10) || null });
  }

  if (c.importa === "categorias") {
    for (const i of motorizadas) {
      try {
        for (const k of await categoriasDoMotor(i.tipo as TipoMotor, seg.integracoes[i.id] ?? {}, i.id)) {
          if (!k.nome) continue;
          novos.push({ nome: k.nome, descricao: k.descricao ?? null, bandeirada: k.tarifa?.base ?? null, valorKm: k.tarifa?.km ?? null, valorMinuto: k.tarifa?.minuto ?? null, valorMinimo: k.tarifa?.minima ?? null, ativa: true, origem: i.nome });
        }
      } catch (e) { avisos.push(`${i.nome}: ${e instanceof Error ? e.message : e}`); }
    }
    const r = await buscarCorridas(empresaId, { inicio: diasAtras(29), fim: hoje() });
    const cont = new Map<string, number>();
    for (const x of r.corridas) if (x.categoria) cont.set(x.categoria, (cont.get(x.categoria) ?? 0) + 1);
    for (const [nome, n] of cont) novos.push({ nome, corridas: n, ativa: true, origem: "Corridas" });
  }

  const r = mesclar(empresaId, c, novos, quem(req));
  res.json({ ...r, avisos });
}));
