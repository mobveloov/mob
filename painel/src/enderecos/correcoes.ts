// Base extra de endereços: "casas" e pontos de rua que o CNEFE não tem (correções). Fica no banco do painel,
// vale para todas as empresas (só entra na busca das cidades que a empresa atende) e é importada de um arquivo TSV.
// Formato do arquivo (uma linha por casa; linhas com # são comentário):
//   cod_municipio <TAB> numero <TAB> nome_logradouro <TAB> bairro <TAB> tipo <TAB> latitude <TAB> longitude [<TAB> qualquer coisa]
// numero 0 = ponto da rua. Este módulo não lê nem liga nenhum outro sistema: só o arquivo que o usuário entregar.
import { banco, transacao } from "../servidor/banco.ts";

export const normalizar = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());

export interface CasaCorrigida { municipio: string; numero: number; rua: string; bairro: string; tipo: string; lat: number; lng: number }

/** Importa o conteúdo de um arquivo de correções. Linhas repetidas atualizam a anterior. Devolve quantas entraram e quantas foram ignoradas. */
export function importarCorrecoes(conteudo: string): { importadas: number; ignoradas: number } {
  let importadas = 0, ignoradas = 0;
  const ins = banco().prepare(`INSERT INTO enderecos_correcoes (municipio, numero, rua, rua_norm, bairro, bairro_norm, tipo, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT (municipio, rua_norm, bairro_norm, numero) DO UPDATE SET rua = excluded.rua, bairro = excluded.bairro, tipo = excluded.tipo, lat = excluded.lat, lng = excluded.lng`);
  transacao(() => {
    for (const linha of String(conteudo).split(/\r?\n/)) {
      if (!linha.trim() || linha.trim().startsWith("#")) continue;
      const c = linha.split("\t");
      const municipio = (c[0] ?? "").trim(), numero = Number((c[1] ?? "").trim()), rua = (c[2] ?? "").trim(), bairro = (c[3] ?? "").trim(), tipo = (c[4] ?? "").trim();
      const lat = Number(c[5]), lng = Number(c[6]);
      if (!/^\d{7}$/.test(municipio) || !Number.isInteger(numero) || numero < 0 || !rua || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { ignoradas++; continue; }
      ins.run(municipio, numero, rua, normalizar(rua), bairro, normalizar(bairro), tipo, lat, lng);
      importadas++;
    }
  });
  return { importadas, ignoradas };
}

export function totalCorrecoes(municipios?: string[]): number {
  const db = banco();
  if (!municipios) return Number((db.prepare("SELECT COUNT(*) AS n FROM enderecos_correcoes").get() as { n: number }).n);
  let t = 0;
  for (const m of municipios) t += Number((db.prepare("SELECT COUNT(*) AS n FROM enderecos_correcoes WHERE municipio = ?").get(m) as { n: number }).n);
  return t;
}

interface Linha { municipio: string; numero: number; rua: string; bairro: string; tipo: string; lat: number; lng: number }

/** Procura nas correções das cidades dadas. Com número: a casa exata, senão a mais próxima da mesma rua. Sem número: o ponto da rua. */
export function buscarNasCorrecoes(municipios: string[], palavras: string[], numero: string, bairro: string, limite: number): Array<Linha & { exato: boolean }> {
  if (!municipios.length || !palavras.length) return [];
  const db = banco();
  const alvo = Number(numero) || 0;
  const filtroPalavras = palavras.map(() => "rua_norm LIKE ?").join(" AND ");
  const achados: Array<Linha & { exato: boolean }> = [];
  for (const m of municipios) {
    const ruas = db.prepare(`SELECT DISTINCT rua_norm, bairro_norm FROM enderecos_correcoes WHERE municipio = ? AND ${filtroPalavras} LIMIT 20`).all(m, ...palavras.map((p) => `%${p}%`)) as Array<{ rua_norm: string; bairro_norm: string }>;
    for (const r of ruas) {
      if (bairro && !r.bairro_norm.includes(bairro)) continue;
      const casas = db.prepare("SELECT * FROM enderecos_correcoes WHERE municipio = ? AND rua_norm = ? AND bairro_norm = ?").all(m, r.rua_norm, r.bairro_norm) as unknown as Array<Linha & { rua_norm: string }>;
      let melhor = casas[0], dif = Infinity;
      for (const c of casas) {
        const d = alvo ? Math.abs(c.numero - alvo) : c.numero === 0 ? 0 : 1;
        if (d < dif) { dif = d; melhor = c; }
      }
      if (melhor) achados.push({ ...melhor, exato: !!alvo && melhor.numero === alvo });
    }
  }
  achados.sort((a, b) => Number(b.exato) - Number(a.exato));
  return achados.slice(0, limite);
}

/** Casa corrigida mais perto de um ponto (até ~60 m). */
export function correcaoDoPonto(municipios: string[], lat: number, lng: number): (Linha & { exato: boolean }) | null {
  if (!municipios.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const db = banco(), d = 0.0006;
  let melhor: (Linha & { dist: number }) | null = null;
  for (const m of municipios) {
    const linhas = db.prepare("SELECT * FROM enderecos_correcoes WHERE municipio = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?").all(m, lat - d, lat + d, lng - d, lng + d) as unknown as Linha[];
    for (const c of linhas) {
      const dist = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (!melhor || dist < melhor.dist) melhor = { ...c, dist };
    }
  }
  return melhor ? { ...melhor, exato: true } : null;
}

export const formatarTitulo = titulo;
