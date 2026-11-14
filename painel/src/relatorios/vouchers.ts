// Vouchers: Faixas de Vouchers (por empresa conveniada), Entrega de voucher e validação do número na hora de pedir a corrida.
// Tudo por empresa (a central do login). Voucher é forma de pagamento de corridas corporativas: o funcionário entrega ao motorista um vale
// numerado, que ao fim do período é faturado com a empresa conveniada.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { banco, transacao } from "../servidor/banco.ts";
import { empresa as empresaDoPainel } from "../servidor/dados.ts";
import { agoraBr, normal } from "../servidor/util.ts";

const limpar = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
/** Máximo de números numa faixa (evita faixa absurda por engano). */
export const MAX_FAIXA = 100_000;

export interface Faixa { id: string; bandeira: string; conveniada: string; serie: string; inicial: number; final: number; em: string; por: string }

/** Nomes das empresas conveniadas cadastradas (Cadastro › Empresas). */
export const nomesConveniadas = (empresaId: string): string[] =>
  listar(empresaId, cadastroPorId("conveniadas")!).map((r) => String(r.nome ?? "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Nome canônico da conveniada (como está no cadastro), ou erro. */
function conveniadaValida(empresaId: string, nome: unknown): string {
  const alvo = normal(nome);
  if (!alvo) throw new Error("Escolha a empresa.");
  const achada = nomesConveniadas(empresaId).find((n) => normal(n) === alvo);
  if (!achada) throw new Error("Empresa não encontrada no cadastro de Empresas.");
  return achada;
}

const linhaFaixa = (empresaId: string, r: { id: string; conveniada: string; serie: string; inicial: number; final: number; em: string; por: string }): Faixa =>
  ({ ...r, bandeira: empresaDoPainel(empresaId)?.nome ?? "" });

export interface FiltroFaixas { empresa?: string; serie?: string; inicial?: number | null; final?: number | null }

/** Lista as faixas. "Número inicial/final" do filtro pegam as faixas que contêm o número. */
export function listarFaixas(empresaId: string, f: FiltroFaixas = {}): Faixa[] {
  const todas = banco().prepare("SELECT id, conveniada, serie, inicial, final, em, por FROM voucher_faixas WHERE empresa = ? ORDER BY conveniada, serie, inicial")
    .all(empresaId) as unknown as Array<{ id: string; conveniada: string; serie: string; inicial: number; final: number; em: string; por: string }>;
  const emp = normal(f.empresa), serie = normal(f.serie);
  return todas
    .filter((r) => (!emp || normal(r.conveniada) === emp) && (!serie || normal(r.serie) === serie)
      && (f.inicial == null || r.final >= f.inicial) && (f.final == null || r.inicial <= f.final))
    .map((r) => linhaFaixa(empresaId, r));
}

function inteiro(v: unknown, rotulo: string): number {
  const s = String(v ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) throw new Error(`"${rotulo}" precisa ser um número inteiro.`);
  return Number(s);
}

/** Cria a faixa. Não aceita sobreposição com outra faixa da mesma série (o número do voucher precisa ser único na central). */
export function criarFaixa(empresaId: string, d: { conveniada?: unknown; serie?: unknown; inicial?: unknown; final?: unknown }, por: string): Faixa {
  const conveniada = conveniadaValida(empresaId, d.conveniada);
  const serie = limpar(d.serie, 20);
  const inicial = inteiro(d.inicial, "Número inicial"), final = inteiro(d.final, "Número final");
  if (final < inicial) throw new Error("O número final não pode ser menor que o inicial.");
  if (final - inicial + 1 > MAX_FAIXA) throw new Error(`A faixa pode ter no máximo ${MAX_FAIXA.toLocaleString("pt-BR")} números.`);
  const choque = listarFaixas(empresaId).find((x) => normal(x.serie) === normal(serie) && x.inicial <= final && x.final >= inicial);
  if (choque) throw new Error(`Esta faixa se sobrepõe à faixa ${choque.inicial} a ${choque.final} de ${choque.conveniada}.`);
  const r = { id: crypto.randomUUID(), conveniada, serie, inicial, final, em: agoraBr().toISOString(), por: por.slice(0, 80) };
  banco().prepare("INSERT INTO voucher_faixas (empresa, id, conveniada, serie, inicial, final, em, por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, r.id, r.conveniada, r.serie, r.inicial, r.final, r.em, r.por);
  return linhaFaixa(empresaId, r);
}

/** Apaga a faixa (só a faixa; corridas já feitas com esses vouchers continuam como estão). */
export function removerFaixa(empresaId: string, id: string) {
  const r = banco().prepare("DELETE FROM voucher_faixas WHERE empresa = ? AND id = ?").run(empresaId, id);
  if (!r.changes) throw new Error("Faixa não encontrada.");
}

// ------------------------------------------------------------------ voucher na corrida

export const ehVoucher = (pagamento: string) => normal(pagamento) === "voucher";
const NAO_VALE = new Set(["cancelada", "nao_atendida"]);

/** Separa "SERIE-123" ou "123" em série e número. */
export function lerVoucher(texto: string): { serie: string; numero: number } | null {
  const m = /^(.*?)[\s\-/]*(\d{1,12})$/.exec(texto.trim());
  return m ? { serie: m[1].trim(), numero: Number(m[2]) } : null;
}

/** Confere o voucher na hora de pedir a corrida: número dentro de uma faixa da empresa e ainda não usado. */
export function validarVoucher(empresaId: string, conveniada: string, texto: string, ignorarCorrida = ""): string {
  const v = limpar(texto, 30);
  if (!v) throw new Error("Informe o número do voucher.");
  const lido = lerVoucher(v);
  if (!lido) throw new Error("O número do voucher só pode ter letras da série e dígitos (ex.: A-1234).");
  const faixas = listarFaixas(empresaId, { empresa: conveniada });
  if (!faixas.length) throw new Error("Esta empresa não tem faixa de vouchers cadastrada.");
  const faixa = faixas.find((x) => normal(x.serie) === normal(lido.serie) && lido.numero >= x.inicial && lido.numero <= x.final);
  if (!faixa) throw new Error("Voucher fora das faixas desta empresa.");
  const usado = listarProprias(empresaId).find((c) => c.id !== ignorarCorrida && !NAO_VALE.has(c.status) && c.voucher && normal(c.voucher) === normal(v));
  if (usado) throw new Error(`Este voucher já foi usado na OS ${usado.os}.`);
  return v;
}

// ------------------------------------------------------------------ Entrega de voucher

export interface LinhaEntrega { id: string; os: string; voucher: string; motorista: string; passageiro: string; origem: string; destino: string; valor: number | null }

const entregues = (empresaId: string) => new Set((banco().prepare("SELECT corrida_id FROM voucher_entregas WHERE empresa = ?").all(empresaId) as unknown as Array<{ corrida_id: string }>).map((r) => r.corrida_id));

const soNumeros = (texto: string) => new Set(texto.split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean));

/** Corridas finalizadas pagas com voucher e ainda sem entrega registrada. "Motorista" filtra por nome ou viatura; "osCompradas" é uma lista de OS. */
export function pendentesDeEntrega(empresaId: string, f: { motorista?: string; osCompradas?: string } = {}): LinhaEntrega[] {
  const ja = entregues(empresaId), os = soNumeros(f.osCompradas ?? ""), alvo = normal(f.motorista);
  const mots = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  return listarProprias(empresaId)
    .filter((c) => c.status === "finalizada" && ehVoucher(c.pagamento) && !ja.has(c.id) && (!os.size || os.has(c.os)))
    .filter((c) => {
      if (!alvo) return true;
      const m = c.motoristaId ? mots.get(c.motoristaId) : undefined;
      return normal(`${c.motorista} ${m?.viatura ?? ""}`).includes(alvo);
    })
    .sort((a, b) => Number(b.os) - Number(a.os))
    .slice(0, 1000)
    .map((c: CorridaPropria) => ({ id: c.id, os: c.os, voucher: c.voucher ?? "", motorista: c.motorista, passageiro: c.passageiro.nome, origem: c.embarque.texto, destino: c.destino?.texto ?? "", valor: c.valor }));
}

/** Registra a entrega do voucher ao motorista das corridas escolhidas. Só entram corridas da empresa, finalizadas, pagas com voucher e ainda pendentes. */
export function registrarEntrega(empresaId: string, ids: unknown, por: string): { registradas: number } {
  if (!Array.isArray(ids) || !ids.length) throw new Error("Selecione ao menos uma OS.");
  if (ids.length > 500) throw new Error("Selecione no máximo 500 OS por vez.");
  const validas = new Map(listarProprias(empresaId).filter((c) => c.status === "finalizada" && ehVoucher(c.pagamento)).map((c) => [c.id, c]));
  const ja = entregues(empresaId);
  const alvo = [...new Set(ids.map(String))];
  for (const id of alvo) {
    if (!validas.has(id)) throw new Error("Há OS que não é de voucher finalizada desta central.");
    if (ja.has(id)) throw new Error(`A OS ${validas.get(id)!.os} já teve a entrega registrada.`);
  }
  const em = agoraBr().toISOString();
  const ins = banco().prepare("INSERT INTO voucher_entregas (empresa, corrida_id, em, por) VALUES (?, ?, ?, ?)");
  transacao(() => { for (const id of alvo) ins.run(empresaId, id, em, por.slice(0, 80)); });
  return { registradas: alvo.length };
}
