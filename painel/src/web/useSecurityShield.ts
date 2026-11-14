// Escudo do painel (só em produção): dificulta baixar e clonar a tela. Não é a proteção de verdade (essa é o servidor
// exigir login em toda rota de dados), mas barra a cópia casual: atalhos de salvar/ver código, botão direito,
// arrastar e selecionar texto, uso dentro de iframe de terceiros e uso fora do domínio oficial da marca.
// Os apps (WebView/Capacitor) não passam por aqui: este módulo só é ligado no App do painel.

import { useEffect } from "react";

/** Onde a seleção, o arrastar e o botão direito continuam funcionando (formulários e tabelas de dados). */
const LIBERADOS = "input, textarea, select, [contenteditable], [contenteditable] *, table, table *, [data-permitir-copia], [data-permitir-copia] *";

const alvoLiberado = (t: EventTarget | null) => t instanceof Element && !!t.closest(LIBERADOS);

/** Atalhos bloqueados: Ctrl/Cmd+S, U, P; F12; Ctrl/Cmd+Shift+I, J, C (e Cmd+Alt+I/J/C no Mac). */
export function atalhoBloqueado(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  const k = (e.key ?? "").toLowerCase();
  if (k === "f12") return true;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return false;
  if (!e.shiftKey && !e.altKey && (k === "s" || k === "u" || k === "p")) return true;
  if ((e.shiftKey || e.altKey) && (k === "i" || k === "j" || k === "c")) return true;
  return false;
}

/** O domínio atual é permitido? Sem domínio configurado (lista vazia), nunca trava. Localhost e IP também passam. */
export function dominioPermitido(host: string, dominios: string[]): boolean {
  const h = host.trim().toLowerCase();
  const lista = dominios.map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!lista.length) return true;
  if (h === "localhost" || h.endsWith(".localhost") || /^[\d.]+$/.test(h) || h.includes(":")) return true;
  return lista.some((d) => h === d || h.endsWith(`.${d}`));
}

const emProducao = () => {
  try { return import.meta.env.PROD; } catch { return false; }
};
/** App nativo (Capacitor/WebView) ou página dos apps: fora do escudo. */
const emAppNativo = () => {
  const w = window as unknown as { Capacitor?: unknown };
  return !!w.Capacitor || !/^https?:$/.test(location.protocol) || location.pathname.startsWith("/apps/");
};

function sairDoIframe() {
  if (window.top === window.self) return;
  try {
    if (window.top && window.top.location.hostname === location.hostname) return; // mesmo domínio: é nosso
  } catch { /* outro domínio: não dá para ler */ }
  try { window.top!.location.href = location.href; } catch { document.documentElement.innerHTML = ""; }
}

/** Liga o escudo. `dominios` vem da marca/configuração da empresa (nunca fixo no código). */
export function useSecurityShield(dominios: string[]) {
  const chave = dominios.join("|");
  useEffect(() => {
    if (!emProducao() || emAppNativo()) return;

    sairDoIframe();

    if (!dominioPermitido(location.hostname, dominios)) {
      // Fora do domínio oficial: leva para o primeiro domínio da lista, mantendo o caminho.
      const destino = dominios.map((d) => d.trim()).find(Boolean);
      if (destino) { location.replace(`https://${destino}${location.pathname}${location.search}`); return; }
    }

    const estilo = document.createElement("style");
    estilo.textContent =
      `body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}` +
      `${LIBERADOS.split(", ").join(",")}{-webkit-user-select:text;user-select:text}` +
      `img,svg{-webkit-user-drag:none}`;
    document.head.appendChild(estilo);

    const tecla = (e: KeyboardEvent) => { if (atalhoBloqueado(e)) { e.preventDefault(); e.stopPropagation(); } };
    const bloquear = (e: Event) => { if (!alvoLiberado(e.target)) e.preventDefault(); };
    document.addEventListener("keydown", tecla, true);
    document.addEventListener("contextmenu", bloquear, true);
    document.addEventListener("dragstart", bloquear, true);
    document.addEventListener("selectstart", bloquear, true);
    return () => {
      estilo.remove();
      document.removeEventListener("keydown", tecla, true);
      document.removeEventListener("contextmenu", bloquear, true);
      document.removeEventListener("dragstart", bloquear, true);
      document.removeEventListener("selectstart", bloquear, true);
    };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
}
