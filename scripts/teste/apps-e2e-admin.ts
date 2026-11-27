// Cria o usuário admin de TESTE no painel de teste (senha vem da variável PAINEL_TESTE_SENHA, nunca do código). SÓ para a pasta de teste.
import * as D from "../../painel/src/servidor/dados.ts";
const senha = process.env.PAINEL_TESTE_SENHA ?? "";
if (senha.length < 12) throw new Error("Defina PAINEL_TESTE_SENHA (12+ caracteres).");
const ja = D.listarUsuarios().find((u) => u.email === "dono@teste.local");
if (ja) D.atualizarUsuario(ja.id, { senha });
else D.criarUsuario({ email: "dono@teste.local", nome: "Dono Teste", senha, empresaId: process.argv[2] ?? "up-corridas", papel: "admin" });
console.log("admin de teste pronto");
