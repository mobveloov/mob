// Registro das telas por id do menu (src/comum/funcoes.ts). Cada frente entrega um arquivo
// src/web/telas/<grupo>/index.tsx que exporta TELAS_CADASTRO, TELAS_CORRIDAS ou TELAS_DEMAIS
// (Record<string, JSX.Element>, uma tela por id). Este registro junta tudo o que existir; não precisa editar.
// Telas entregues vencem as telas provisórias definidas em App.tsx.

type Mapa = Record<string, JSX.Element>;
const modulos = import.meta.glob<Record<string, unknown>>("./*/index.tsx", { eager: true });

export const TELAS_ENTREGUES: Mapa = {};
for (const caminho of Object.keys(modulos).sort()) {
  for (const [nome, valor] of Object.entries(modulos[caminho])) {
    if (/^TELAS_/.test(nome) && valor && typeof valor === "object") Object.assign(TELAS_ENTREGUES, valor as Mapa);
  }
}
