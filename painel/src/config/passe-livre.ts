// Cadastro › Passe Livre: ofertas de passe que os CONDUTORES (motoristas) compram no app. Durante o passe, o motorista não
// paga a taxa da central nas corridas (taxas do motorista e comissão: ver aposFinalizar em apps/extras.ts).
//
// - Catálogo por empresa (config "passe-livre"): até 3 ofertas, valor maior que zero, duração em horas fechadas de 1 a 720.
// - Compra pelo motorista: debita a carteira dele (nunca deixa o saldo negativo) e é idempotente pela chave do pedido.
//   Comprar com um passe em vigor emenda o novo: ele começa quando o atual termina.
// - Isenção: a taxa que seria cobrada numa corrida com passe vigente é registrada como "taxa não cobrada" (uma linha por corrida).
// - Resultados: receita com passes e taxa não cobrada por período.
//
// Este módulo não importa o resto dos apps (extras.ts é quem o usa): lê a carteira direto da tabela.

import crypto from "node:crypto";
import { arquivoDoBanco, banco, transacao } from "../servidor/banco.ts";
import { agoraBr, arred } from "../servidor/util.ts";
import { centavos, gravarConfig, lerConfig, novoId, numero } from "./armazem.ts";

export const MAX_OFERTAS = 3;
export const HORAS_MIN = 1, HORAS_MAX = 720, VALOR_MAX = 10_000;
export interface Oferta { id: string; valor: number; horas: number }
export interface Compra { id: string; motoristaId: string; ofertaId: string; valor: number; horas: number; inicio: string; fim: string; criadoEm: string }

/** "1 hora", "36 horas", "7 dias" (múltiplos de 24 horas viram dias). */
export function rotuloDaDuracao(horas: number): string {
  if (horas % 24 === 0) { const d = horas / 24; return `${d} ${d === 1 ? "dia" : "dias"}`; }
  return `${horas} ${horas === 1 ? "hora" : "horas"}`;
}
export const comRotulo = (o: Oferta) => ({ ...o, rotulo: rotuloDaDuracao(o.horas) });

// ------------------------------------------------------------------ catálogo

export function ofertas(empresaId: string): Oferta[] {
  const bruto = lerConfig<{ ofertas?: unknown }>(empresaId, "passe-livre", {}).ofertas;
  return (Array.isArray(bruto) ? bruto : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { id: String(o.id ?? ""), valor: centavos(Number(o.valor)), horas: Math.round(Number(o.horas)) };
  }).filter((o) => o.id && o.valor > 0 && o.horas >= HORAS_MIN && o.horas <= HORAS_MAX)
    .sort((a, b) => a.horas - b.horas || a.valor - b.valor);
}

/** Cria (sem id) ou altera (com id) uma oferta. Valor em reais e duração em horas inteiras. */
export function salvarOferta(empresaId: string, entrada: { id?: unknown; valor?: unknown; horas?: unknown }): Oferta[] {
  const valor = centavos(numero(entrada.valor, 0, 0, 1e9));
  if (!(valor > 0)) throw new Error("Informe o valor do passe (maior que zero).");
  if (valor > VALOR_MAX) throw new Error(`O valor do passe pode ir até R$ ${VALOR_MAX.toLocaleString("pt-BR")}.`);
  const bruto = String(entrada.horas ?? "").trim();
  const horas = Number(bruto.replace(",", "."));
  if (!bruto) throw new Error("Informe a duração do passe.");
  if (!Number.isInteger(horas) || horas < HORAS_MIN || horas > HORAS_MAX) throw new Error(`A duração é em horas fechadas, de ${HORAS_MIN} a ${HORAS_MAX}.`);
  const atuais = ofertas(empresaId);
  const id = String(entrada.id ?? "");
  const existe = atuais.some((o) => o.id === id);
  if (id && !existe) throw new Error("Oferta não encontrada.");
  if (!existe && atuais.length >= MAX_OFERTAS) throw new Error(`Você já tem ${MAX_OFERTAS} ofertas ativas. Remova uma para criar outra.`);
  if (atuais.some((o) => o.id !== id && o.horas === horas)) throw new Error("Já existe uma oferta com esta duração.");
  const nova: Oferta = { id: existe ? id : novoId(), valor, horas };
  const lista = existe ? atuais.map((o) => (o.id === id ? nova : o)) : [...atuais, nova];
  gravarConfig(empresaId, "passe-livre", { ofertas: lista });
  return ofertas(empresaId);
}

export function removerOferta(empresaId: string, id: string): Oferta[] {
  const atuais = ofertas(empresaId);
  if (!atuais.some((o) => o.id === id)) throw new Error("Oferta não encontrada.");
  gravarConfig(empresaId, "passe-livre", { ofertas: atuais.filter((o) => o.id !== id) });
  return ofertas(empresaId);
}

// ------------------------------------------------------------------ banco

const criadas = new Set<string>();
function db() {
  const b = banco(), arq = arquivoDoBanco();
  if (!criadas.has(arq)) {
    b.exec(`
      CREATE TABLE IF NOT EXISTS passe_livre_compras (
        empresa TEXT NOT NULL, id TEXT NOT NULL, motorista TEXT NOT NULL, oferta TEXT NOT NULL, valor REAL NOT NULL, horas INTEGER NOT NULL,
        inicio TEXT NOT NULL, fim TEXT NOT NULL, chave TEXT NOT NULL, criado_em TEXT NOT NULL, PRIMARY KEY (empresa, id));
      CREATE UNIQUE INDEX IF NOT EXISTS passe_livre_compras_chave ON passe_livre_compras (empresa, motorista, chave);
      CREATE INDEX IF NOT EXISTS passe_livre_compras_mot ON passe_livre_compras (empresa, motorista, fim);
      CREATE TABLE IF NOT EXISTS passe_livre_isencoes (
        empresa TEXT NOT NULL, corrida TEXT NOT NULL, motorista TEXT NOT NULL, passe TEXT NOT NULL, valor REAL NOT NULL, em TEXT NOT NULL, PRIMARY KEY (empresa, corrida));
      CREATE INDEX IF NOT EXISTS passe_livre_isencoes_em ON passe_livre_isencoes (empresa, em);
    `);
    criadas.add(arq);
  }
  return b;
}
const COLUNAS = "id, motorista AS motoristaId, oferta AS ofertaId, valor, horas, inicio, fim, criado_em AS criadoEm";
const saldoDa = (empresaId: string, motoristaId: string) =>
  arred((banco().prepare("SELECT COALESCE(SUM(valor), 0) AS s FROM carteira WHERE empresa = ? AND papel = 'motorista' AND chave = ?").get(empresaId, motoristaId) as { s: number }).s);

// ------------------------------------------------------------------ compra e passe vigente

/** Passe em vigor do motorista no instante (padrão: agora; horário do painel = Brasília gravado como UTC). */
export function passeVigente(empresaId: string, motoristaId: string, quando: string = agoraBr().toISOString()): (Compra & { restanteMs: number }) | null {
  if (!motoristaId) return null;
  const c = db().prepare(`SELECT ${COLUNAS} FROM passe_livre_compras WHERE empresa = ? AND motorista = ? AND inicio <= ? AND fim > ? ORDER BY fim DESC LIMIT 1`)
    .get(empresaId, motoristaId, quando, quando) as unknown as Compra | undefined;
  return c ? { ...c, restanteMs: Math.max(0, Date.parse(c.fim) - Date.parse(quando)) } : null;
}

/**
 * Compra de passe pelo motorista. A chave identifica o pedido (o app manda uma por toque no botão): repetida, devolve a mesma
 * compra sem cobrar de novo. Sem saldo na carteira, recusa com o valor que falta.
 */
export function comprarPasse(empresaId: string, motoristaId: string, ofertaId: string, chave: string): { compra: Compra; saldo: number; repetido: boolean } {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(chave)) throw new Error("Pedido sem identificador. Feche e abra a tela e tente de novo.");
  return transacao(() => {
    const b = db();
    const ja = b.prepare(`SELECT ${COLUNAS} FROM passe_livre_compras WHERE empresa = ? AND motorista = ? AND chave = ?`).get(empresaId, motoristaId, chave) as unknown as Compra | undefined;
    if (ja) return { compra: ja, saldo: saldoDa(empresaId, motoristaId), repetido: true };
    const oferta = ofertas(empresaId).find((o) => o.id === ofertaId);
    if (!oferta) throw new Error("Esta oferta não está mais disponível.");
    const saldo = saldoDa(empresaId, motoristaId);
    if (saldo < oferta.valor) throw new Error(`Saldo insuficiente na carteira: o passe custa R$ ${oferta.valor.toFixed(2).replace(".", ",")} e você tem R$ ${saldo.toFixed(2).replace(".", ",")}. Faça uma recarga e tente de novo.`);
    const agora = agoraBr().toISOString();
    const atual = passeVigente(empresaId, motoristaId, agora);
    const inicio = atual ? atual.fim : agora; // emenda no passe em vigor
    const fim = new Date(Date.parse(inicio) + oferta.horas * 3_600_000).toISOString();
    const id = crypto.randomUUID();
    b.prepare("INSERT INTO passe_livre_compras (empresa, id, motorista, oferta, valor, horas, inicio, fim, chave, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(empresaId, id, motoristaId, oferta.id, oferta.valor, oferta.horas, inicio, fim, chave, agora);
    b.prepare("INSERT INTO carteira (empresa, id, papel, chave, valor, descricao, corrida_id, em, por) VALUES (?, ?, 'motorista', ?, ?, ?, NULL, ?, 'app')")
      .run(empresaId, `pl-${id}`, motoristaId, -oferta.valor, `Passe Livre ${rotuloDaDuracao(oferta.horas)}`, agora);
    return { compra: { id, motoristaId, ofertaId: oferta.id, valor: oferta.valor, horas: oferta.horas, inicio, fim, criadoEm: agora }, saldo: arred(saldo - oferta.valor), repetido: false };
  });
}

// ------------------------------------------------------------------ taxa não cobrada

/** Registra (ou atualiza) a taxa que deixou de ser cobrada na corrida por causa do passe. Valor zero apaga o registro. */
export function registrarIsencao(empresaId: string, corridaId: string, motoristaId: string, passeId: string, valor: number, em: string) {
  if (valor > 0) {
    db().prepare("INSERT INTO passe_livre_isencoes (empresa, corrida, motorista, passe, valor, em) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (empresa, corrida) DO UPDATE SET valor = excluded.valor, passe = excluded.passe, motorista = excluded.motorista, em = excluded.em")
      .run(empresaId, corridaId, motoristaId, passeId, arred(valor), em);
  } else db().prepare("DELETE FROM passe_livre_isencoes WHERE empresa = ? AND corrida = ?").run(empresaId, corridaId);
}

// ------------------------------------------------------------------ resultados

/** Receita com passes e taxa não cobrada entre duas datas (AAAA-MM-DD, inclusive). */
export function resultados(empresaId: string, de: string, ate: string) {
  const b = db();
  const compras = b.prepare("SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS n, COUNT(DISTINCT motorista) AS motoristas FROM passe_livre_compras WHERE empresa = ? AND substr(criado_em, 1, 10) BETWEEN ? AND ?").get(empresaId, de, ate) as { total: number; n: number; motoristas: number };
  const iso = b.prepare("SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS n FROM passe_livre_isencoes WHERE empresa = ? AND substr(em, 1, 10) BETWEEN ? AND ?").get(empresaId, de, ate) as { total: number; n: number };
  return { de, ate, receita: arred(compras.total), passesVendidos: compras.n, motoristas: compras.motoristas, taxaNaoCobrada: arred(iso.total), corridasComPasse: iso.n, semDados: compras.n === 0 && iso.n === 0 };
}

/** Compras recentes do período (para detalhar no painel). */
export function comprasDoPeriodo(empresaId: string, de: string, ate: string, limite = 100): Compra[] {
  return db().prepare(`SELECT ${COLUNAS} FROM passe_livre_compras WHERE empresa = ? AND substr(criado_em, 1, 10) BETWEEN ? AND ? ORDER BY criado_em DESC LIMIT ?`).all(empresaId, de, ate, limite) as unknown as Compra[];
}
