// A Nova Solicitação respeita a configuração da empresa conveniada (Cadastro › Empresas): situação, categorias e
// pagamentos permitidos e "permitir especificar motorista". Sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "empresa-solic-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Solic Um");
const admin = D.criarUsuario({ email: "adm@solic.test", nome: "Adm", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
criar(A.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "t");
criar(A.id, cadastroPorId("categorias")!, { nome: "Luxo", bandeirada: 9, valorKm: 4, valorMinimo: 20, ativa: true }, "t");
const motorista = criar(A.id, cadastroPorId("motoristas")!, { nome: "Carlos", telefone: "11900000000", status: "Ativo" }, "t");
const conv = (nome: string, extra: Record<string, unknown>) => criar(A.id, cadastroPorId("conveniadas")!, { nome, cnpj: null, status: "Ativa", ...extra }, "t");
conv("Ativa Ltda", { categoriasPermitidas: "Econômico", pagamentosPermitidos: JSON.stringify([{ tipo: "Pix", desconto: 5 }]), permiteEspecificarMotorista: "Não" });
conv("Suspensa Ltda", { status: "Suspensa" });
conv("Espera Ltda", { status: "Aguardando ativação" });
conv("Livre Ltda", {});

let cookie = "";
async function pedir(corpo: Record<string, unknown>) {
  const r = await fetch(`${base}/api/operacao/solicitar`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const PEDIDO = (extra: Record<string, unknown>) => ({
  passageiro: { nome: "Maria", telefone: "11988887777" }, embarque: { texto: "Rua das Flores, 10", lat: -21.12, lng: -48.3 }, destino: { texto: "Av. Brasil, 500", lat: -21.13, lng: -48.31 },
  categoria: "Econômico", pagamento: "Pix", ...extra,
});

test("solicitação com empresa conveniada respeita situação, categorias, pagamentos e motorista específico", async () => {
  cookie = ((await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
  assert.match((await pedir(PEDIDO({ empresaConveniada: "Suspensa Ltda" }))).corpo.erro, /Suspensa/);
  assert.match((await pedir(PEDIDO({ empresaConveniada: "Espera Ltda" }))).corpo.erro, /Aguardando ativação/);
  assert.match((await pedir(PEDIDO({ empresaConveniada: "Ativa Ltda", categoria: "Luxo" }))).corpo.erro, /categoria/);
  assert.match((await pedir(PEDIDO({ empresaConveniada: "Ativa Ltda", pagamento: "Dinheiro" }))).corpo.erro, /pagamento/);
  assert.match((await pedir(PEDIDO({ empresaConveniada: "Ativa Ltda", motoristaId: motorista.id }))).corpo.erro, /escolher o motorista/);
  const ok = await pedir(PEDIDO({ empresaConveniada: "Ativa Ltda" }));
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal((await pedir(PEDIDO({ empresaConveniada: "Livre Ltda", categoria: "Luxo", pagamento: "Dinheiro", passageiro: { nome: "Joana", telefone: "11977776666" } }))).status, 200, "sem restrição, vale tudo");
});
