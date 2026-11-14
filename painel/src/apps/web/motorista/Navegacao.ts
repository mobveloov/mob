// GPS do próprio app (passo a passo): pede ao servidor a rota pelas ruas com as instruções de cada curva (OSRM), acompanha a
// posição do motorista, avisa a próxima curva ("Em 200 m, vire à direita") por voz e recalcula quando ele sai da rota.

import { useEffect, useRef, useState } from "react";
import { api, type Posicao } from "../comum/api";
import { falar } from "./ajustes";

export interface Passo { texto: string; distanciaM: number; lat: number; lng: number; tipo: string; modificador: string }
interface Resposta { pelasRuas: boolean; caminho: Array<[number, number]>; passos: Passo[]; distanciaKm: number; minutos: number }
export interface EstadoNavegacao {
  carregando: boolean; disponivel: boolean; caminho: Array<[number, number]> | null; passo: Passo | null; metros: number | null; fora: boolean; restamKm: number | null; restamMin: number | null;
}

const R = 6371000, rad = (g: number) => (g * Math.PI) / 180;
export const metrosEntre = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/** Menor distância (m) do ponto até a linha do caminho (aproximação por vértices, o OSRM traz vértices a poucos metros). */
export function distanciaDaLinha(p: Posicao, linha: Array<[number, number]>): number {
  let menor = Infinity;
  for (const [lat, lng] of linha) { const d = metrosEntre(p, { lat, lng }); if (d < menor) menor = d; }
  return menor;
}
export const textoMetros = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

export function useNavegacao(posicao: Posicao | null, alvo: { lat?: number; lng?: number } | null, ligada: boolean, voz: boolean): EstadoNavegacao {
  const [rota, setRota] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [fora, setFora] = useState(false);
  const ultimaBusca = useRef(0);
  const buscando = useRef(false);
  const falados = useRef<Set<string>>(new Set());
  const alvoOk = alvo && Number.isFinite(alvo.lat) && Number.isFinite(alvo.lng) ? { lat: alvo.lat as number, lng: alvo.lng as number } : null;
  const chaveAlvo = alvoOk ? `${alvoOk.lat.toFixed(5)},${alvoOk.lng.toFixed(5)}` : "";

  const buscar = async (de: Posicao) => {
    if (!alvoOk || buscando.current) return;
    buscando.current = true; ultimaBusca.current = Date.now(); setCarregando(true);
    try {
      const r = await api<Resposta>(`/navegacao?pontos=${encodeURIComponent(`${de.lat.toFixed(5)},${de.lng.toFixed(5)};${alvoOk.lat},${alvoOk.lng}`)}`);
      if (r.pelasRuas && r.caminho.length > 1) { setRota(r); setIndice(r.passos.length > 1 ? 1 : 0); setFora(false); falados.current = new Set(); }
    } catch { /* tenta de novo na próxima posição */ } finally { buscando.current = false; setCarregando(false); }
  };

  // Alvo novo (outra etapa da corrida): rota nova.
  useEffect(() => { setRota(null); setIndice(0); setFora(false); falados.current = new Set(); ultimaBusca.current = 0; }, [chaveAlvo, ligada]);

  useEffect(() => {
    if (!ligada || !posicao || !alvoOk) return;
    if (!rota) { if (Date.now() - ultimaBusca.current > 8000) void buscar(posicao); return; }
    // Saiu da rota (mais de 60 m da linha): recalcula, no máximo a cada 6 s.
    const longe = distanciaDaLinha(posicao, rota.caminho) > 60;
    setFora(longe);
    if (longe && Date.now() - ultimaBusca.current > 6000) { void buscar(posicao); return; }
    // Passou da manobra (a menos de 25 m): vai para a seguinte.
    const p = rota.passos[indice];
    if (p && indice < rota.passos.length - 1 && metrosEntre(posicao, p) < 25) setIndice(indice + 1);
  }, [posicao?.lat, posicao?.lng, ligada, chaveAlvo, rota, indice]); // eslint-disable-line react-hooks/exhaustive-deps

  const passo = rota?.passos[indice] ?? null;
  const metros = passo && posicao ? metrosEntre(posicao, passo) : null;

  // Voz: avisa uma vez a ~300 m e uma vez a ~50 m de cada curva.
  useEffect(() => {
    if (!ligada || !voz || !passo || metros == null || fora) return;
    const faixa = metros < 60 ? "perto" : metros < 320 ? "meio" : "";
    const k = `${indice}-${faixa}`;
    if (!faixa || falados.current.has(k)) return;
    falados.current.add(k);
    falar(faixa === "perto" ? passo.texto : `Em ${textoMetros(metros)}, ${passo.texto.charAt(0).toLowerCase()}${passo.texto.slice(1)}`);
  }, [metros, indice, ligada, voz, fora]); // eslint-disable-line react-hooks/exhaustive-deps

  let restam: number | null = null;
  if (rota && passo && posicao) restam = metros! + rota.passos.slice(indice).reduce((s, p) => s + p.distanciaM, 0) - (rota.passos[indice]?.distanciaM ?? 0);
  return {
    carregando, disponivel: !!rota, caminho: rota?.caminho ?? null, passo, metros, fora,
    restamKm: restam != null ? Math.round(restam / 10) / 100 : null, restamMin: restam != null && rota ? Math.max(1, Math.round((restam / (rota.distanciaKm * 1000 || 1)) * rota.minutos)) : null,
  };
}
