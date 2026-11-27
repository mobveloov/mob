// Dados de teste para o roteiro ponta a ponta dos apps (scripts/teste/apps-e2e.mjs): empresa UP Corridas (cores da marca),
// categoria, motorista com veículo e placa, desafio, aviso do painel e imagens de abertura. SÓ para a pasta de teste (DADOS_DIR).
//   cd painel && DADOS_DIR=<pasta vazia> npx tsx ../scripts/teste/apps-e2e-seed.ts
import sharp from "sharp";
import * as D from "../../painel/src/servidor/dados.ts";
import { cadastroPorId } from "../../painel/src/comum/cadastros.ts";
import { criar } from "../../painel/src/cadastros/armazem.ts";
import { enviarAbertura } from "../../painel/src/config/abertura.ts";

const E = D.criarEmpresa("UP Corridas", { cores: { primaria: "#FFC400", secundaria: "#000000", fundo: "#F5F5F2", texto: "#111111" } } as never);
criar(E.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
criar(E.id, cadastroPorId("motoristas")!, { nome: "Carlos Motorista", telefone: "11999990001", status: "Ativo", veiculo: "Fiat Argo Prata", placa: "ABC1D23", anoVeiculo: 2022 }, "teste");
const hoje = new Date(); const dia = (n: number) => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
criar(E.id, cadastroPorId("desafios")!, { nome: "Dez corridas na semana", tipo: "Desafio de corridas", meta: 10, premio: 50, inicio: dia(-1), fim: dia(6), aprovacao: "Automático", ativo: true, regras: "Complete 10 corridas e ganhe R$ 50." }, "teste");
for (const app of ["passageiro", "motorista"] as const) {
  const png = await sharp({ create: { width: 900, height: 1600, channels: 3, background: app === "passageiro" ? "#101010" : "#202020" } }).composite([{ input: Buffer.from(`<svg width="900" height="1600"><rect x="0" y="1200" width="900" height="400" fill="#FFC400"/><text x="450" y="800" font-size="120" text-anchor="middle" fill="#FFC400" font-family="Arial">UP ${app.toUpperCase()}</text></svg>`) }]).png().toBuffer();
  await enviarAbertura(E.id, app, "image/png", new Uint8Array(png));
}
console.log(JSON.stringify({ empresa: E.id }));
