// Versões do app Android do totem (modo quiosque). Quem publica é o dono da plataforma (ADMIN Mestre); todas as empresas
// só baixam a versão ativa mais nova, em Bot e Totem › App do Totem. O painel guarda só o endereço do arquivo (https),
// nunca o arquivo. Fica em DADOS_DIR/plataforma/apk-totem.json (fora do Git).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as D from "../servidor/dados.ts";
import { validarUrlExterna } from "../servidor/url.ts";

export interface VersaoApk {
  id: string;
  nome: string;
  codigo: number;
  url: string;
  /** Tamanho do arquivo em bytes (opcional). */
  tamanho: number | null;
  notas: string;
  ativa: boolean;
  criadaEm: string;
}

const arq = () => path.join(D.raiz(), "plataforma", "apk-totem.json");
const ler = (): VersaoApk[] => { try { return JSON.parse(fs.readFileSync(arq(), "utf8")) as VersaoApk[]; } catch { return []; } };
function gravar(l: VersaoApk[]) {
  fs.mkdirSync(path.dirname(arq()), { recursive: true });
  const tmp = `${arq()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(l, null, 1));
  fs.renameSync(tmp, arq());
}

export const listarVersoes = () => ler().sort((a, b) => b.codigo - a.codigo);

/** A versão que as empresas baixam: a ativa de maior código. */
export const versaoAtiva = (): VersaoApk | null => listarVersoes().find((v) => v.ativa) ?? null;

export function publicarVersao(e: Record<string, unknown>): VersaoApk {
  const nome = String(e.nome ?? "").replace(/[<>]/g, "").trim().slice(0, 30);
  if (!nome) throw new Error("Informe o nome da versão (ex.: 1.2.0).");
  const codigo = Math.round(Number(e.codigo));
  if (!Number.isFinite(codigo) || codigo < 1 || codigo > 9_999_999) throw new Error("Informe o código da versão (número inteiro, maior a cada versão nova).");
  const url = String(e.url ?? "").trim();
  validarUrlExterna(url, "do arquivo do app");
  const lista = ler();
  if (lista.some((v) => v.codigo === codigo)) throw new Error("Já existe uma versão com este código.");
  const tam = Number(e.tamanho);
  const v: VersaoApk = {
    id: crypto.randomUUID(), nome, codigo, url, tamanho: Number.isFinite(tam) && tam > 0 ? Math.round(tam) : null,
    notas: String(e.notas ?? "").replace(/[<>]/g, "").trim().slice(0, 1000), ativa: e.ativa !== false, criadaEm: new Date().toISOString(),
  };
  gravar([...lista, v]);
  return v;
}

export function ativarVersao(id: string, ativa: boolean): VersaoApk {
  const lista = ler();
  const v = lista.find((x) => x.id === id);
  if (!v) throw new Error("Versão não encontrada.");
  v.ativa = ativa;
  gravar(lista);
  return v;
}
