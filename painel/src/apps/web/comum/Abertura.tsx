// Tela de abertura dos apps: a imagem que o dono escolheu no painel (Personalização > Imagem de abertura), em tela cheia,
// no lugar do "Carregando". A imagem fica guardada no aparelho por versão: aparece na hora no próximo início e,
// em segundo plano, o app confere se há versão nova (GET /abertura/<app> -> { url|null, versao }).
// Sem imagem no painel: ícone da marca sobre o fundo da marca.

import { useEffect, useState } from "react";
import { config, urlApi, urlArquivo } from "./api";
import type { MarcaApp } from "./ui";

interface Guardada { versao: string; img: string | null; cor: string; icone: string | null }
const chave = () => `abertura-${config().papel}-${config().empresaId}`;

export function lerAbertura(): Guardada | null {
  try { const j = JSON.parse(localStorage.getItem(chave()) ?? "null") as Guardada | null; return j && typeof j.versao === "string" ? j : null; } catch { return null; }
}
function guardar(g: Guardada) { try { localStorage.setItem(chave(), JSON.stringify(g)); } catch { /* sem espaço: segue sem cache */ } }

const paraDataUrl = (b: Blob) => new Promise<string>((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => no(f.error); f.readAsDataURL(b); });

/** Confere a versão no painel; se mudou, baixa a imagem nova e guarda. Devolve o que deve aparecer agora. */
export async function atualizarAbertura(marca: MarcaApp | null, atual: Guardada | null): Promise<Guardada | null> {
  try {
    const r = await fetch(urlApi(`/abertura/${config().papel}`), { cache: "no-store" });
    if (!r.ok) return atual;
    const { url, versao } = (await r.json()) as { url: string | null; versao: string };
    const cor = marca?.cores.primaria ?? atual?.cor ?? "", icone = marca?.icone ?? atual?.icone ?? null;
    if (!url) { const g = { versao: "", img: null, cor, icone }; guardar(g); return g; }
    if (atual && atual.versao === versao && atual.img) { if (atual.cor !== cor || atual.icone !== icone) guardar({ ...atual, cor, icone }); return atual; }
    const arq = await fetch(urlArquivo(url));
    if (!arq.ok) return atual;
    const g = { versao, img: await paraDataUrl(await arq.blob()), cor, icone };
    guardar(g);
    return g;
  } catch { return atual; }
}

export function Abertura({ marca }: { marca?: MarcaApp | null }) {
  const [g, setG] = useState<Guardada | null>(lerAbertura);
  useEffect(() => { let vivo = true; void atualizarAbertura(marca ?? null, lerAbertura()).then((n) => { if (vivo && n) setG(n); }); return () => { vivo = false; }; }, [marca]);
  const cor = marca?.cores.primaria ?? g?.cor ?? "var(--cor)";
  const icone = marca?.icone ?? g?.icone ?? null;
  return (
    <div className="abertura" data-testid="abertura" style={{ background: g?.img ? "#000" : cor }} role="status" aria-label="Abrindo o app">
      {g?.img ? <img className="abertura-img" src={g.img} alt="" /> : icone ? <img className="abertura-icone" src={urlArquivo(icone)} alt="" /> : null}
    </div>
  );
}

/**
 * A abertura fica na tela pelo menos ~1,2 s quando o app já foi aberto antes (imagem ou ícone guardados). No PRIMEIRO início (sem nada
 * guardado) ela espera o download da imagem do painel, no máximo 2,5 s, para a imagem já aparecer na 1ª abertura; sem rede, sai logo.
 */
export function useAberturaMinima(): boolean {
  const [fica, setFica] = useState(true);
  useEffect(() => {
    let vivo = true;
    const sair = (ms: number) => setTimeout(() => { if (vivo) setFica(false); }, ms);
    if (lerAbertura()) { const t = sair(1200); return () => { vivo = false; clearTimeout(t); }; }
    const limite = sair(2500);
    void atualizarAbertura(null, null).then(() => { clearTimeout(limite); if (vivo) setFica(false); });
    return () => { vivo = false; clearTimeout(limite); };
  }, []);
  return fica;
}
