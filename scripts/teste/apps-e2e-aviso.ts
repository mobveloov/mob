// Manda um aviso da central (como o CRM/painel) para o passageiro de teste: entra na caixa de avisos do app. SÓ para a pasta de teste.
import { entregar } from "../../painel/src/apps/avisos.ts";
const a = await entregar("up-corridas", { papel: "passageiro", chave: process.argv[2] ?? "11988880001" }, { titulo: "Promoção UP", texto: "Hoje, 20% de desconto nas corridas até as 18h. Aproveite!", origem: "crm", origemId: "teste-e2e" });
console.log("aviso gravado:", a.id);
