// Mapa de Calor com corridas de integração que informam coordenada (as sem coordenada seguem de fora).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-mapa-int-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "m".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { corridaVazia } = await import("../src/comum/corrida.ts");
const { corridaDoMotor } = await import("../src/servidor/fontes/motor.ts");
const { gradeDeCalor, deIntegracaoComPonto, atualizarMapa, lerMapa } = await import("../src/crm2/mapa.ts");

const base = { id: "x:1", origem: "principal", origemNome: "Integração", os: "1", grupo: "finalizada" as const, statusTexto: "Finalizada" };

test("a corrida traduzida do motor leva as coordenadas quando existem", () => {
  const c = corridaDoMotor({ idOriginal: "7", grupo: "finalizada", partida: { texto: "Rua A", lat: -21.1, lng: -48.2 }, destino: { texto: "Rua B", lat: -21.2, lng: -48.3 } }, "principal", "Integração");
  assert.deepEqual(c.embarquePonto, { lat: -21.1, lng: -48.2 });
  assert.deepEqual(c.destinoPonto, { lat: -21.2, lng: -48.3 });
  const sem = corridaDoMotor({ idOriginal: "8", grupo: "finalizada", partida: { texto: "Rua A" } }, "principal", "Integração");
  assert.equal(sem.embarquePonto, undefined);
  assert.equal(sem.destinoPonto, undefined);
});

test("só corridas de integração com coordenada entram; as próprias não contam duas vezes", () => {
  const com = { ...corridaVazia(base), embarquePonto: { lat: -21.1004, lng: -48.2004 }, solicitadaEm: "2026-11-10T10:00:00Z" };
  const semPonto = corridaVazia({ ...base, id: "x:2", os: "2" });
  const propria = { ...corridaVazia({ ...base, id: "propria:3", origem: "propria", os: "3" }), embarquePonto: { lat: -21.1, lng: -48.2 } };
  const lista = deIntegracaoComPonto([com, semPonto, propria]);
  assert.equal(lista.length, 1);
  const grade = gradeDeCalor(lista);
  assert.equal(grade.length, 1);
  assert.equal(grade[0].pickup_count, 1);
  assert.equal(grade[0].destination_count, 0);
});

test("atualizarMapa grava os quadrados da integração; coordenada fora do Brasil é ignorada", () => {
  const e = D.criarEmpresa("Mapa Int").id;
  const c1 = { ...corridaVazia(base), embarquePonto: { lat: -21.1, lng: -48.2 }, destinoPonto: { lat: -21.2, lng: -48.3 }, solicitadaEm: "2026-11-10T10:00:00Z" };
  const c2 = { ...corridaVazia({ ...base, id: "x:9", os: "9" }), embarquePonto: { lat: -21.1, lng: -48.2 }, solicitadaEm: "2026-11-10T11:00:00Z" };
  const fora = { ...corridaVazia({ ...base, id: "x:10", os: "10" }), embarquePonto: { lat: 40.7, lng: -74.0 } };
  assert.equal(atualizarMapa(e, [c1, c2, fora]), 2);
  const mapa = lerMapa(e);
  assert.equal(mapa[0].pickup_count, 2);
  assert.equal(mapa.find((m) => m.destination_count === 1)?.grid_lat, -21.2);
});
