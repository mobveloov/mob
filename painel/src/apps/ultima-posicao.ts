// Última posição conhecida de cada motorista (para o Mapa de motoristas mostrar quem está desconectado, com pin cinza).
// Grava no máximo uma vez por minuto enquanto ele envia posição, e sempre que ele fica offline.

import { banco } from "../servidor/banco.ts";

const INTERVALO_MS = 60_000;
const gravadas = new Map<string, number>();

export function gravarUltimaPosicao(empresaId: string, motoristaId: string, lat: number, lng: number, agora = Date.now(), forcar = false) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const k = `${empresaId}|${motoristaId}`;
  if (!forcar && agora - (gravadas.get(k) ?? 0) < INTERVALO_MS) return;
  banco().prepare("INSERT INTO motorista_ultima_posicao (empresa, motorista, lat, lng, em) VALUES (?, ?, ?, ?, ?) ON CONFLICT (empresa, motorista) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, em = excluded.em")
    .run(empresaId, motoristaId, lat, lng, agora);
  if (gravadas.size > 50_000) gravadas.clear();
  gravadas.set(k, agora);
}

export function ultimasPosicoes(empresaId: string): Map<string, { lat: number; lng: number; em: number }> {
  const m = new Map<string, { lat: number; lng: number; em: number }>();
  for (const r of banco().prepare("SELECT motorista, lat, lng, em FROM motorista_ultima_posicao WHERE empresa = ?").all(empresaId) as Array<{ motorista: string; lat: number; lng: number; em: number }>) m.set(r.motorista, { lat: r.lat, lng: r.lng, em: r.em });
  return m;
}
