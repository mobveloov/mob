// Caminho pelas ruas para desenhar no mapa (o servidor consulta o OSRM). Enquanto não chega, ou se falhar, devolve null.

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type P = { lat?: number; lng?: number } | null | undefined;
export type Linha = Array<[number, number]>;

const ok = (p: P): p is { lat: number; lng: number } => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);
const memoria = new Map<string, Linha>();

/**
 * `pontos`: de 2 a 6, na ordem. `espera`: tempo mínimo (ms) entre uma consulta e outra, para o ponto que anda (você).
 * `casas`: casas decimais da chave (4 ≈ 11 m): só consulta de novo quando o ponto muda mais que isso.
 */
export function useCaminho(pontos: P[], espera = 0, casas = 5): Linha | null {
  const validos = pontos.filter(ok);
  const chave = validos.length > 1 ? validos.map((p) => `${p.lat.toFixed(casas)},${p.lng.toFixed(casas)}`).join(";") : "";
  const [linha, setLinha] = useState<Linha | null>(() => (chave ? memoria.get(chave) ?? null : null));
  const ultima = useRef(0);
  const [de_novo, setDeNovo] = useState(0);

  useEffect(() => {
    if (!chave) { setLinha(null); return; }
    const guardada = memoria.get(chave);
    if (guardada) { setLinha(guardada); return; }
    setLinha(null);
    let vivo = true;
    const falta = Math.max(0, ultima.current + espera - Date.now());
    const t = setTimeout(async () => {
      ultima.current = Date.now();
      try {
        const r = await api<{ caminho?: Linha; pelasRuas?: boolean }>(`/rota?pontos=${encodeURIComponent(chave)}`);
        if (!vivo) return;
        // Linha reta não é caminho: nunca desenhamos. Tenta de novo daqui a pouco (no máximo 4 vezes).
        if (!r.pelasRuas || !r.caminho?.length) { if (de_novo < 4) setTimeout(() => vivo && setDeNovo((n) => n + 1), 5000); return; }
        if (memoria.size > 60) memoria.clear();
        memoria.set(chave, r.caminho);
        setLinha(r.caminho);
      } catch { if (vivo && de_novo < 4) setTimeout(() => vivo && setDeNovo((n) => n + 1), 5000); }
    }, falta);
    return () => { vivo = false; clearTimeout(t); };
  }, [chave, espera, de_novo]);

  return chave ? linha : null;
}
