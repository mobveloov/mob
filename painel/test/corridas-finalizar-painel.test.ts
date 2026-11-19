// Finalizar a corrida pelo painel também move a carteira (pago com saldo e taxas), uma vez só.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-finpainel-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { rotasCorridasProprias } = await import("../src/corridas/rotas.ts");
const X = await import("../src/apps/extras.ts");
const B = await import("../src/servidor/banco.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/corridas-proprias", rotasCorridasProprias);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Finaliza Painel").id;
const adm = D.criarUsuario({ email: "adm@fp.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
criar(E, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Pedro", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
const FONE = "11920000001";

async function cookie() {
  const r = await fetch(`${base}/teste/entrar/${adm.id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function post(url: string, corpo: unknown, ck: string) {
  const r = await fetch(base + url, { method: "POST", headers: { "content-type": "application/json", cookie: ck }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("finalizar pelo painel passa o saldo do passageiro para o motorista, uma vez só", async () => {
  const ck = await cookie();
  X.lancar(E, "passageiro", FONE, 100, "Recarga", "t");
  const c = await R.criarCorridaPropria(E, { passageiro: { nome: "Ana", telefone: FONE }, embarque: { texto: "Rua A, 1", lat: -23.55, lng: -46.63 }, destino: { texto: "Rua B, 2", lat: -23.58, lng: -46.65 }, categoria: "Carro", pagamento: X.PAGAMENTO_SALDO, canal: "painel" }, "t");
  await R.atribuirMotorista(E, c.id, mot.id as string, "t");
  for (const s of ["no_local", "em_andamento"]) assert.equal((await post(`/api/corridas-proprias/${c.id}/status`, { status: s }, ck)).status, 200);
  const fin = await post(`/api/corridas-proprias/${c.id}/status`, { status: "finalizada", valor: 20 }, ck);
  assert.equal(fin.status, 200, JSON.stringify(fin.corpo));
  assert.equal(X.saldo(E, "passageiro", FONE), 80, "saiu do passageiro");
  assert.equal(X.saldo(E, "motorista", mot.id as string), 20, "entrou para o motorista");
  // Repetir o lançamento não duplica
  X.aposFinalizar(E, R.listarProprias(E).find((x) => x.id === c.id)!);
  assert.equal(X.saldo(E, "passageiro", FONE), 80);
  assert.equal(X.saldo(E, "motorista", mot.id as string), 20);
});
