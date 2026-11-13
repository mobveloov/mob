// Build dos apps do passageiro e do motorista (React). Usado pelo scripts/build-app-empresa.mjs e para testar no navegador:
//
//   npx vite --config vite.apps.config.ts            abre http://localhost:5174/passageiro/?empresa=<id> e /motorista/?empresa=<id>
//   APP=passageiro SAIDA=<pasta> npx vite build --config vite.apps.config.ts    gera só um app, com caminhos relativos (APK)
//
// O código fica em src/apps/web/. A API é a do painel (/api/apps), pelo proxy em desenvolvimento.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "src/apps/web");
const api = `http://localhost:${Number(process.env.PAINEL_API_PORTA) || 8787}`;
const app = process.env.APP;
const entradas = (app ? [app] : ["passageiro", "motorista", "baixar"]).map((a) => [a, path.join(raiz, a, "index.html")]);

export default defineConfig({
  root: app ? path.join(raiz, app) : raiz,
  base: "./",
  plugins: [react()],
  build: {
    outDir: path.resolve(process.env.SAIDA || path.resolve(import.meta.dirname, "dist-apps")),
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: Object.fromEntries(entradas) },
  },
  server: { port: Number(process.env.PORT) || 5174, proxy: { "/api": api } },
});
