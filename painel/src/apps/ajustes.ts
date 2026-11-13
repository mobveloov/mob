// Ajustes dos apps por empresa: motivos de cancelamento, etiquetas de avaliação, opcionais da corrida e contatos.
// Cada empresa pode trocar a lista gravando DADOS_DIR/empresas/<id>/apps/ajustes.json (o painel edita esse arquivo
// quando a tela de configurações dos apps ficar pronta). Sem o arquivo, valem os padrões abaixo.
// Os contatos (WhatsApp, telefone, site, termos e privacidade) vêm da marca da empresa.

import { gerais } from "../config/gerais.ts";
import * as D from "../servidor/dados.ts";
import { arquivo, ler } from "./armazem.ts";

export interface Opcional { id: string; nome: string }
export interface Ajustes {
  motivosPassageiro: string[];
  motivosMotorista: string[];
  etiquetasBoas: string[];
  etiquetasRuins: string[];
  opcionais: Opcional[];
  /** Formas de pagamento que o motorista pode aceitar (as preferências). */
  pagamentos: string[];
  mensagensRapidas: string[];
}

export const AJUSTES_PADRAO: Ajustes = {
  motivosPassageiro: ["Motorista demorou muito", "Valor da corrida", "Pedi por engano", "Mudei de ideia", "Outro motivo"],
  motivosMotorista: ["Passageiro não apareceu", "Local de embarque perigoso", "Problema no veículo", "Passageiro pediu para cancelar", "Outro motivo"],
  etiquetasBoas: ["Direção segura", "Carro limpo", "Simpático", "Rota boa", "Pontual"],
  etiquetasRuins: ["Direção perigosa", "Carro sujo", "Mal-educado", "Rota ruim", "Atrasou"],
  opcionais: [
    { id: "malas", nome: "Porta-malas grande" }, { id: "encomenda", nome: "Encomenda" },
    { id: "adaptado", nome: "Carro adaptado" }, { id: "disposicao", nome: "Motorista à disposição" },
  ],
  pagamentos: ["Dinheiro", "Pix", "Cartão na maquininha", "Saldo da carteira"],
  mensagensRapidas: ["Estou a caminho!", "Cheguei no local", "Aguarde na frente, por favor.", "Bom dia", "Boa tarde", "Boa noite"],
};

const lista = (v: unknown, padrao: string[]) => (Array.isArray(v) ? v.map((x) => String(x).replace(/[<>]/g, "").trim().slice(0, 60)).filter(Boolean).slice(0, 20) : padrao);

export function ajustes(empresaId: string): Ajustes {
  const a = ler<Partial<Ajustes>>(arquivo(empresaId, "ajustes.json"), {});
  const opcionais = Array.isArray(a.opcionais)
    ? a.opcionais.filter((o) => o && /^[\w-]{1,20}$/.test(String(o.id)) && String(o.nome ?? "").trim()).map((o) => ({ id: String(o.id), nome: String(o.nome).replace(/[<>]/g, "").trim().slice(0, 40) })).slice(0, 12)
    : AJUSTES_PADRAO.opcionais;
  // Config › Gerais do App (painel) manda em motivos, opcionais e mensagens rápidas; o arquivo da empresa e o padrão cobrem o resto.
  let g: ReturnType<typeof gerais> | null = null;
  try { g = gerais(empresaId); } catch { /* sem configuração: vale o padrão */ }
  const opcionaisDoPainel = g?.preferencias.filter((x) => x.ativo && x.tipo === "exigencia").map((x) => ({ id: x.id, nome: x.nome })) ?? [];
  return {
    motivosPassageiro: lista(a.motivosPassageiro ?? g?.cancelamento.passageiro.motivos, AJUSTES_PADRAO.motivosPassageiro),
    motivosMotorista: lista(a.motivosMotorista ?? g?.cancelamento.motorista.motivos, AJUSTES_PADRAO.motivosMotorista),
    etiquetasBoas: lista(a.etiquetasBoas, AJUSTES_PADRAO.etiquetasBoas), etiquetasRuins: lista(a.etiquetasRuins, AJUSTES_PADRAO.etiquetasRuins),
    opcionais: Array.isArray(a.opcionais) ? opcionais : opcionaisDoPainel.length ? opcionaisDoPainel : AJUSTES_PADRAO.opcionais,
    pagamentos: lista(a.pagamentos, AJUSTES_PADRAO.pagamentos),
    mensagensRapidas: lista(a.mensagensRapidas ?? g?.motorista.mensagensRapidas, AJUSTES_PADRAO.mensagensRapidas),
  };
}

export function contatos(empresaId: string) {
  const t = D.marca(empresaId).textos;
  let s: { whatsapp: string; telefone: string; linkAjuda: string } = { whatsapp: "", telefone: "", linkAjuda: "" };
  try { s = gerais(empresaId).suporte; } catch { /* sem configuração */ }
  // Marca (Marca e aparência) primeiro; Config › Gerais do App completa o que faltar.
  return {
    whatsapp: (t.suporteWhatsapp || s.whatsapp || "").replace(/\D/g, ""), telefone: t.suporteTelefone || s.telefone || "", email: t.suporteEmail,
    site: t.suporteSite || s.linkAjuda || "", termosUrl: t.termosUrl ?? "", privacidadeUrl: t.privacidadeUrl ?? "",
  };
}
