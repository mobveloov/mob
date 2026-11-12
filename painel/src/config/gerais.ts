// Config › Gerais do App: suporte e contato, motorista, preferências, passageiro, indicações, cancelamentos,
// maçaneta, banners e textos jurídicos. Por empresa. Os apps leem daqui (ver configParaApp).

import crypto from "node:crypto";
import fs from "node:fs";
import { centavos, gravarConfig, lerConfig, lista, novoId, numero, pastaConfig, sim, texto, umDe } from "./armazem.ts";

export interface DocumentoExigido { id: string; nome: string; alvo: "motorista" | "veiculo"; validade: boolean; exigir: boolean }
export interface Preferencia { id: string; nome: string; tipo: "exigencia" | "pagamento"; ativo: boolean }
export interface Banner { id: string; arquivo: string; mime: string; link: string; tipo: "app" | "login"; criadoEm: string }
export interface Indicacao { ativo: boolean; valorIndicado: number; valorIndicador: number; corridas: number }

export interface ConfigGerais {
  suporte: { whatsapp: string; telefone: string; linkAjuda: string };
  motorista: {
    bonusCadastroAtivo: boolean; bonusCadastroValor: number; editarValorFinal: boolean; confirmarTaxas: boolean; editarRota: boolean;
    cpfObrigatorio: boolean; descontarCupomNoToque: boolean; botaoPanico: boolean; mapaNavegacao: boolean; distanciaRecalculo: number;
    mensagensRapidas: string[]; documentos: DocumentoExigido[];
  };
  preferencias: Preferencia[];
  passageiro: {
    cpfObrigatorio: boolean; avisoDinamica: boolean; editarRota: boolean; bonusAtivo: boolean; bonusValor: number;
    paradasAtivo: boolean; limiteParadas: number; destinoLivre: boolean;
  };
  indicacoes: { ativo: boolean; motMot: Indicacao; motPax: Indicacao; paxPax: Indicacao; limiteGlobal: number };
  cancelamento: {
    metodo: "tempo" | "distancia";
    passageiro: { ativo: boolean; minutos: number; distanciaKm: number; motivos: string[] };
    motorista: { ativo: boolean; minutos: number; reenvio: boolean; reenvioMinutos: number; motivos: string[] };
    rejeicao: { ativo: boolean; limite: number; minutos: number };
  };
  macaneta: { ativo: boolean; pedeNome: boolean; pedeTelefone: boolean; pedeCpf: boolean; pedeEmail: boolean; categorias: string[] };
  banners: Banner[];
}

const DOCS_PADRAO: DocumentoExigido[] = [
  { id: "cnh", nome: "CNH (frente e verso)", alvo: "motorista", validade: true, exigir: true },
  { id: "veiculo", nome: "Documento do veículo (CRLV)", alvo: "veiculo", validade: true, exigir: true },
  { id: "residencia", nome: "Comprovante de residência", alvo: "motorista", validade: false, exigir: false },
  { id: "foto", nome: "Foto do rosto", alvo: "motorista", validade: false, exigir: true },
];
const PREF_PADRAO: Preferencia[] = [
  ...["Dinheiro", "Pix", "Cartão de crédito", "Cartão de débito", "Cartão no App"].map((nome, i) => ({ id: `p${i}`, nome, tipo: "pagamento" as const, ativo: true })),
  ...["Porta-malas grande", "Aceita encomendas", "Adaptado para cadeirante", "Ficar à disposição do passageiro"].map((nome, i) => ({ id: `e${i}`, nome, tipo: "exigencia" as const, ativo: true })),
];
const ind = (valorIndicado: number, valorIndicador: number, corridas: number, ativo = false): Indicacao => ({ ativo, valorIndicado, valorIndicador, corridas });

export const GERAIS_PADRAO: ConfigGerais = {
  suporte: { whatsapp: "", telefone: "", linkAjuda: "" },
  motorista: {
    bonusCadastroAtivo: false, bonusCadastroValor: 0, editarValorFinal: false, confirmarTaxas: false, editarRota: false, cpfObrigatorio: true,
    descontarCupomNoToque: true, botaoPanico: true, mapaNavegacao: true, distanciaRecalculo: 150,
    mensagensRapidas: ["Estou a caminho!", "Cheguei no local", "Aguarde na frente, por favor.", "Bom dia", "Boa tarde", "Boa noite"],
    documentos: DOCS_PADRAO,
  },
  preferencias: PREF_PADRAO,
  passageiro: { cpfObrigatorio: false, avisoDinamica: true, editarRota: true, bonusAtivo: false, bonusValor: 0, paradasAtivo: true, limiteParadas: 3, destinoLivre: false },
  indicacoes: { ativo: false, motMot: ind(0, 0, 1), motPax: ind(0, 0, 1), paxPax: ind(0, 0, 1), limiteGlobal: 50 },
  cancelamento: {
    metodo: "tempo",
    passageiro: { ativo: true, minutos: 2, distanciaKm: 0, motivos: ["Motorista demorou muito", "Valor da corrida", "Pedi por engano", "Outro"] },
    motorista: { ativo: true, minutos: 5, reenvio: true, reenvioMinutos: 2, motivos: ["Passageiro não apareceu", "Local de embarque perigoso", "Problema no veículo", "Outro"] },
    rejeicao: { ativo: false, limite: 15, minutos: 60 },
  },
  macaneta: { ativo: false, pedeNome: true, pedeTelefone: true, pedeCpf: false, pedeEmail: false, categorias: [] },
  banners: [],
};

const motivos = (v: unknown, padrao: string[]) => {
  const l = lista(v).map((x) => texto(x, 60)).slice(0, 4);
  return padrao.map((p, i) => l[i] ?? p).map((x, i) => x || padrao[i]);
};
const indicacao = (v: unknown, p: Indicacao): Indicacao => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { ativo: sim(o.ativo, p.ativo), valorIndicado: centavos(numero(o.valorIndicado, p.valorIndicado, 0, 10_000)), valorIndicador: centavos(numero(o.valorIndicador, p.valorIndicador, 0, 10_000)), corridas: Math.round(numero(o.corridas, p.corridas, 0, 1000)) };
};

/** Confere tudo o que chega do formulário (o que faltar fica como estava). */
export function sanearGerais(entrada: unknown, atual: ConfigGerais = GERAIS_PADRAO): ConfigGerais {
  const e = (entrada ?? {}) as Record<string, Record<string, unknown>>;
  const s = { ...atual.suporte, ...(e.suporte ?? {}) } as Record<string, unknown>;
  const m = { ...atual.motorista, ...(e.motorista ?? {}) } as Record<string, unknown>;
  const p = { ...atual.passageiro, ...(e.passageiro ?? {}) } as Record<string, unknown>;
  const i = { ...atual.indicacoes, ...(e.indicacoes ?? {}) } as Record<string, unknown>;
  const c = { ...atual.cancelamento, ...(e.cancelamento ?? {}) } as Record<string, unknown>;
  const cp = { ...atual.cancelamento.passageiro, ...((c.passageiro ?? {}) as object) } as Record<string, unknown>;
  const cm = { ...atual.cancelamento.motorista, ...((c.motorista ?? {}) as object) } as Record<string, unknown>;
  const cr = { ...atual.cancelamento.rejeicao, ...((c.rejeicao ?? {}) as object) } as Record<string, unknown>;
  const mc = { ...atual.macaneta, ...(e.macaneta ?? {}) } as Record<string, unknown>;
  const docs = Array.isArray(m.documentos) ? (m.documentos as unknown[]) : atual.motorista.documentos;
  const prefs = Array.isArray(e.preferencias) ? (e.preferencias as unknown[]) : atual.preferencias;
  return {
    suporte: { whatsapp: texto(s.whatsapp, 20).replace(/[^\d+]/g, ""), telefone: texto(s.telefone, 30), linkAjuda: /^https?:\/\//i.test(texto(s.linkAjuda, 300)) ? texto(s.linkAjuda, 300) : "" },
    motorista: {
      bonusCadastroAtivo: sim(m.bonusCadastroAtivo), bonusCadastroValor: centavos(numero(m.bonusCadastroValor, 0, 0, 10_000)),
      editarValorFinal: sim(m.editarValorFinal), confirmarTaxas: sim(m.confirmarTaxas), editarRota: sim(m.editarRota), cpfObrigatorio: sim(m.cpfObrigatorio),
      descontarCupomNoToque: sim(m.descontarCupomNoToque), botaoPanico: sim(m.botaoPanico), mapaNavegacao: sim(m.mapaNavegacao),
      distanciaRecalculo: Math.round(numero(m.distanciaRecalculo, 150, 20, 5000)),
      mensagensRapidas: lista(m.mensagensRapidas).map((x) => texto(x, 120)).filter(Boolean).slice(0, 20),
      documentos: docs.map((d) => {
        const o = (d ?? {}) as Record<string, unknown>;
        const nome = texto(o.nome, 80);
        const id = /^[a-z0-9-]{2,40}$/.test(String(o.id)) ? String(o.id) : nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
        return { id, nome, alvo: umDe(o.alvo, ["motorista", "veiculo"] as const, "motorista"), validade: sim(o.validade), exigir: sim(o.exigir, true) };
      }).filter((d, k, l) => d.nome && d.id.length >= 2 && l.findIndex((x) => x.id === d.id) === k).slice(0, 30),
    },
    preferencias: prefs.map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { id: texto(o.id, 20) || novoId(), nome: texto(o.nome, 60), tipo: umDe(o.tipo, ["exigencia", "pagamento"] as const, "exigencia"), ativo: sim(o.ativo, true) };
    }).filter((x) => x.nome).slice(0, 40),
    passageiro: {
      cpfObrigatorio: sim(p.cpfObrigatorio), avisoDinamica: sim(p.avisoDinamica), editarRota: sim(p.editarRota), bonusAtivo: sim(p.bonusAtivo),
      bonusValor: centavos(numero(p.bonusValor, 0, 0, 10_000)), paradasAtivo: sim(p.paradasAtivo), limiteParadas: Math.round(numero(p.limiteParadas, 3, 0, 3)), destinoLivre: sim(p.destinoLivre),
    },
    indicacoes: {
      ativo: sim(i.ativo), motMot: indicacao(i.motMot, atual.indicacoes.motMot), motPax: indicacao(i.motPax, atual.indicacoes.motPax), paxPax: indicacao(i.paxPax, atual.indicacoes.paxPax),
      limiteGlobal: Math.round(numero(i.limiteGlobal, 50, 0, 100_000)),
    },
    cancelamento: {
      metodo: umDe(c.metodo, ["tempo", "distancia"] as const, "tempo"),
      passageiro: { ativo: sim(cp.ativo), minutos: numero(cp.minutos, 2, 0, 120), distanciaKm: numero(cp.distanciaKm, 0, 0, 100), motivos: motivos(cp.motivos, GERAIS_PADRAO.cancelamento.passageiro.motivos) },
      motorista: { ativo: sim(cm.ativo), minutos: numero(cm.minutos, 5, 0, 120), reenvio: sim(cm.reenvio), reenvioMinutos: numero(cm.reenvioMinutos, 2, 0, 120), motivos: motivos(cm.motivos, GERAIS_PADRAO.cancelamento.motorista.motivos) },
      rejeicao: { ativo: sim(cr.ativo), limite: Math.round(numero(cr.limite, 15, 1, 1000)), minutos: Math.round(numero(cr.minutos, 60, 1, 10_000)) },
    },
    macaneta: {
      ativo: sim(mc.ativo), pedeNome: sim(mc.pedeNome), pedeTelefone: sim(mc.pedeTelefone), pedeCpf: sim(mc.pedeCpf), pedeEmail: sim(mc.pedeEmail),
      categorias: lista(mc.categorias).map((x) => texto(x, 60)).filter(Boolean).slice(0, 50),
    },
    banners: atual.banners, // banners só mudam pelo envio de imagem
  };
}

export const gerais = (empresaId: string): ConfigGerais => sanearGerais(lerConfig(empresaId, "gerais", {}), GERAIS_PADRAO);
export function salvarGerais(empresaId: string, entrada: unknown): ConfigGerais {
  const c = sanearGerais(entrada, gerais(empresaId));
  gravarConfig(empresaId, "gerais", c);
  return c;
}

// ------------------------------------------------------------------ banners (imagem da propaganda nos apps)

const MIME_BANNER: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_BANNER = 2 * 1024 * 1024;

export function adicionarBanner(empresaId: string, mime: string, bytes: Uint8Array, link: string, tipo: string): Banner {
  const ext = MIME_BANNER[mime.split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("Envie JPG, PNG ou WEBP.");
  if (!bytes.length || bytes.length > MAX_BANNER) throw new Error("Imagem vazia ou maior que 2 MB.");
  const ok = ext === "png" ? bytes[0] === 0x89 && bytes[1] === 0x50 : ext === "jpg" ? bytes[0] === 0xff && bytes[1] === 0xd8 : Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP";
  if (!ok) throw new Error("O arquivo não é uma imagem válida.");
  const c = gerais(empresaId);
  if (c.banners.length >= 20) throw new Error("No máximo 20 banners.");
  const id = crypto.randomBytes(6).toString("hex");
  const nome = `banner-${id}.${ext}`;
  fs.mkdirSync(pastaConfig(empresaId, "banners"), { recursive: true });
  fs.writeFileSync(pastaConfig(empresaId, "banners", nome), bytes);
  const l = texto(link, 300);
  const b: Banner = { id, arquivo: nome, mime: mime.split(";")[0].trim().toLowerCase(), link: /^https?:\/\//i.test(l) ? l : "", tipo: tipo === "login" ? "login" : "app", criadoEm: new Date().toISOString() };
  gravarConfig(empresaId, "gerais", { ...c, banners: [...c.banners, b] });
  return b;
}

export function removerBanner(empresaId: string, id: string) {
  const c = gerais(empresaId);
  const b = c.banners.find((x) => x.id === id);
  if (!b) throw new Error("Banner não encontrado.");
  fs.rmSync(pastaConfig(empresaId, "banners", b.arquivo), { force: true });
  gravarConfig(empresaId, "gerais", { ...c, banners: c.banners.filter((x) => x.id !== id) });
}

export function arquivoDoBanner(empresaId: string, id: string): { caminho: string; mime: string } | null {
  const b = gerais(empresaId).banners.find((x) => x.id === id);
  if (!b) return null;
  const caminho = pastaConfig(empresaId, "banners", b.arquivo);
  return fs.existsSync(caminho) ? { caminho, mime: b.mime } : null;
}

// ------------------------------------------------------------------ termos (Jurídico, Termos de Uso App, Jurídico & Leis)

export interface Termos { passageiro: string; motorista: string; privacidade: string; versao: number; atualizadoEm: string | null }
export const TERMOS_PADRAO: Termos = {
  passageiro: [
    "1. Aceite dos termos",
    "Ao usar o aplicativo, você concorda com estes Termos de Uso. Se não concordar, não use o serviço.",
    "2. O serviço",
    "A empresa oferece uma plataforma que liga passageiros a motoristas parceiros independentes.",
    "3. Obrigações do usuário",
    "Informar dados verdadeiros, tratar todos com respeito, não usar o serviço para fins ilícitos e pagar as corridas feitas.",
    "4. Cancelamentos e taxas",
    "Cancelar depois que o motorista já está a caminho pode gerar taxa de cancelamento, que compensa o tempo e o deslocamento do parceiro.",
    "5. Alterações",
    "Estes termos podem mudar. Continuar usando o aplicativo significa aceitar a versão nova.",
  ].join("\n"),
  motorista: [
    "1. Parceria",
    "O motorista é parceiro independente e usa a plataforma para receber chamadas de passageiros.",
    "2. Documentos",
    "O motorista mantém CNH, documento do veículo e demais documentos exigidos em dia.",
    "3. Taxas",
    "A central cobra a comissão definida nas regras de cada categoria. Os valores aparecem no aplicativo antes de aceitar a corrida.",
    "4. Conduta",
    "Respeito ao passageiro, às leis de trânsito e às regras da central.",
  ].join("\n"),
  privacidade: [
    "1. Dados coletados",
    "Nome, telefone, e-mail, foto, localização durante o uso e histórico de corridas e pagamentos.",
    "2. Uso dos dados",
    "Ligar passageiros e motoristas, processar pagamentos, evitar fraudes, dar suporte e cumprir a lei.",
    "3. Compartilhamento",
    "Só o necessário: nome, foto e localização durante a corrida; parceiros de pagamento e mapas; autoridades com ordem legal.",
    "4. Seus direitos (LGPD)",
    "Você pode pedir acesso, correção ou exclusão dos seus dados pelo suporte.",
  ].join("\n"),
  versao: 1, atualizadoEm: null,
};

export const termos = (empresaId: string): Termos => ({ ...TERMOS_PADRAO, ...lerConfig<Partial<Termos>>(empresaId, "termos", {}) });
export function salvarTermos(empresaId: string, entrada: Record<string, unknown>): Termos {
  const atual = termos(empresaId);
  const t = (k: "passageiro" | "motorista" | "privacidade") => (typeof entrada[k] === "string" ? String(entrada[k]).replace(/<\/?script/gi, "").slice(0, 60_000) : atual[k]);
  const novo: Termos = { passageiro: t("passageiro"), motorista: t("motorista"), privacidade: t("privacidade"), versao: atual.versao, atualizadoEm: atual.atualizadoEm };
  const mudou = novo.passageiro !== atual.passageiro || novo.motorista !== atual.motorista || novo.privacidade !== atual.privacidade;
  if (mudou) { novo.versao = atual.versao + 1; novo.atualizadoEm = new Date().toISOString(); }
  gravarConfig(empresaId, "termos", novo);
  return novo;
}

/** Documentos que o app do motorista pede (id -> nome), só os marcados como exigidos. */
export function tiposDocumento(empresaId: string): Record<string, string> {
  return Object.fromEntries(gerais(empresaId).motorista.documentos.filter((d) => d.exigir).map((d) => [d.id, d.nome]));
}
