import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O painel (porta 5173) fala com o servidor (porta 8787) pelo caminho /api.
const api = `http://localhost:${Number(process.env.PAINEL_API_PORTA) || 8787}`;
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Produção: sem mapa do código (ninguém reconstrói o fonte pelo navegador), sem console.*, sem debugger e sem
  // comentários. Em desenvolvimento (vite dev) nada disso muda.
  build: { sourcemap: false, minify: "esbuild", cssMinify: true },
  esbuild: command === "build" ? { drop: ["console", "debugger"], legalComments: "none" } : {},
  server: { port: Number(process.env.PORT) || 5173, proxy: { "/api": api, "/manifest.webmanifest": api } },
}));
