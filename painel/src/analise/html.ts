// Relatório e plano de ação em HTML (páginas completas para ver, baixar e imprimir/salvar em PDF).
// Usam a marca da empresa: nome, logo, cores e fonte. Tudo que vem de dados ou da IA passa por esc().

import { contraste, type Marca } from "../comum/marca.ts";
import type { Analise, Item, Plano } from "./analise.ts";
import type { Alerta, Contagem, Distribuicao, Estatisticas } from "./estatisticas.ts";
import { SECOES, TITULO_SECAO, type SecaoId } from "./prompts.ts";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const num = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const real = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pc = (n: number) => `${num(n)}%`;

export interface MetaRelatorio { marca: Marca; logo: string | null; geradoEm: Date; filtroTexto: string }

function css(m: Marca) {
  const p = m.cores.primaria;
  return `:root{--p:${p};--pt:${contraste(p)};--t:${m.cores.texto};--s:#5b6576;--b:#e3e8f0;--f:"${m.fonte}",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 var(--f);color:var(--t);background:#f5f7fb}.pg{max-width:980px;margin:0 auto;padding:28px 22px;background:#fff}
header{display:flex;gap:16px;align-items:center;border-bottom:4px solid var(--p);padding-bottom:14px;margin-bottom:18px}header img{max-height:54px;max-width:180px}
h1{font-size:22px;margin:0}h2{font-size:17px;color:var(--p);margin:26px 0 8px;border-bottom:1px solid var(--b);padding-bottom:4px}h3{font-size:14px;margin:14px 0 6px}
.sub{color:var(--s);font-size:13px}.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0}
.kpi{border:1px solid var(--b);border-left:4px solid var(--p);border-radius:8px;padding:8px 10px}.kpi b{display:block;font-size:20px}.kpi span{color:var(--s);font-size:12px}
table{width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:13px}th{text-align:left;background:#f3f5f9;color:var(--s);font-weight:600}th,td{padding:6px 8px;border-bottom:1px solid var(--b)}td.n,th.n{text-align:right}
.alerta{border-radius:8px;padding:9px 12px;margin:8px 0;border-left:5px solid}.critico{background:#fde8e6;border-color:#c0362c}.atencao{background:#fff3dc;border-color:#a76200}.ok,.info{background:#e3f6ec;border-color:#138a4b}
.ia{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#3730a3;margin:12px 0}
.texto{margin:4px 0 8px}ul{padding-left:20px}li{margin:4px 0}.barra{display:inline-block;height:9px;background:var(--p);border-radius:4px;vertical-align:middle}
.etq{display:inline-block;background:var(--p);color:var(--pt);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
footer{margin-top:30px;border-top:1px solid var(--b);padding-top:10px;color:var(--s);font-size:12px}
@media print{body{background:#fff}.pg{padding:0}h2{break-after:avoid}table,.alerta{break-inside:avoid}}`;
}

function pagina(titulo: string, meta: MetaRelatorio, corpo: string) {
  const m = meta.marca;
  const fonte = encodeURIComponent(m.fonte).replace(/%20/g, "+");
  const rodape = [m.textos.rodapeRelatorio, m.textos.suporteEmail, m.textos.suporteTelefone].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fonte}:wght@400;600;700&display=swap"><style>${css(m)}</style></head>
<body><div class="pg"><header>${meta.logo ? `<img src="${meta.logo}" alt="">` : ""}<div><h1>${esc(titulo)}</h1><div class="sub">${esc(m.produto)} · ${esc(meta.filtroTexto)} · gerado em ${esc(meta.geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}</div></div></header>
${corpo}<footer>${esc(m.produto)}${rodape ? ` · ${rodape}` : ""}</footer></div></body></html>`;
}

const tabela = (cab: string[], linhas: Array<Array<string | number>>, numeros: number[] = []) =>
  linhas.length ? `<table><tr>${cab.map((c, i) => `<th${numeros.includes(i) ? ' class="n"' : ""}>${esc(c)}</th>`).join("")}</tr>${linhas.map((l) => `<tr>${l.map((v, i) => `<td${numeros.includes(i) ? ' class="n"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="sub">Sem dados.</p>`;
const contagem = (titulo: string, l: Contagem[]) => (l.length ? `<h3>${esc(titulo)}</h3>${tabela(["", "Corridas", "%"], l.map((x) => [x.nome, x.qtd, pc(x.pct)]), [1, 2])}` : "");
const dist = (titulo: string, d: Distribuicao, f: (n: number | null) => string) =>
  d.n ? `<h3>${esc(titulo)}</h3>${tabela(["Típico (mediana)", "Média", "25% até", "75% até", "90% até", "Maior"], [[f(d.mediana), f(d.media), f(d.p25), f(d.p75), f(d.p90), f(d.max)]])}` : "";
const alerta = (a: Alerta | { nivel: string; titulo: string; texto: string }) => `<div class="alerta ${esc(a.nivel)}"><b>${esc(a.titulo)}</b><br>${esc(a.texto)}</div>`;
const itens = (l: Item[]) => (l.length ? `<ul>${l.map((i) => `<li><b>${esc(i.destaque)}</b>${i.texto ? ` — ${esc(i.texto)}` : ""}</li>`).join("")}</ul>` : "");
const barras = (l: Array<{ rotulo: string; valor: number; extra?: string }>) => {
  if (!l.length) return `<p class="sub">Sem dados.</p>`;
  const max = Math.max(1, ...l.map((x) => x.valor));
  return `<table>${l.map((x) => `<tr><td>${esc(x.rotulo)}</td><td style="width:45%"><span class="barra" style="width:${((x.valor / max) * 100).toFixed(1)}%"></span></td><td class="n">${x.valor}${x.extra ? ` (${esc(x.extra)})` : ""}</td></tr>`).join("")}</table>`;
};

function blocoSecao(id: SecaoId, e: Estatisticas): string {
  switch (id) {
    case "panorama": return contagem("Origem dos dados", e.origens) + contagem("Cidades", e.cidades);
    case "status": return contagem("Status", e.status.textos);
    case "cancelamentos": return e.cancelamento.total ? contagem("Quem cancelou", e.cancelamento.porQuem) + contagem("Motivos", e.cancelamento.motivos) + `<p class="texto">${e.cancelamento.porDemora} cancelamentos citam demora ou espera (${pc(e.cancelamento.porDemoraPct)}).</p>` : `<p class="sub">Nenhum cancelamento.</p>`;
    case "categorias": return `<h3>Categorias</h3>${tabela(["Categoria", "Corridas", "Finalizadas", "% cancel.", "Faturamento", "Valor típico"], e.porCategoria.map((c) => [c.nome, c.corridas, c.finalizadas, pc(c.taxaCancelamento), real(c.faturamento), real(c.valorTipico)]), [1, 2, 3, 4, 5])}` + contagem("Formas de pagamento", e.pagamentos) + contagem("Canal do pedido", e.canais);
    case "financeiro": return dist("Valor das corridas finalizadas", e.valor, real) + contagem("Faixas de valor", e.faixasValor)
      + `<p class="texto">Com desconto ou cupom: ${e.descontos.corridas} corridas (${pc(e.descontos.pct)}), ${real(e.descontos.valorTotal)} em descontos. Tarifa dinâmica: ${e.dinamica.corridas} corridas (${pc(e.dinamica.pct)})${e.dinamica.fator.mediana ? `, fator típico ${num(e.dinamica.fator.mediana, 2)}` : ""}.</p>`;
    case "motoristas": return `<p class="texto">${e.motoristas.ativos} motoristas rodaram. Os 3 primeiros fizeram ${pc(e.motoristas.top3Pct)} das corridas com motorista.</p>` + contagem("Top 10 motoristas", e.motoristas.top);
    case "distancias": return dist("Distância das corridas (km)", e.distancia, (n) => num(n)) + dist("Motorista até o passageiro no aceite (km)", e.distanciaMotorista, (n) => num(n))
      + (e.distanciaMotorista.n ? `<p class="texto">Aceites a mais de 4 km: ${e.distanciaMotorista.acima4km} (${pc(e.distanciaMotorista.acima4kmPct)}). Cancelamento até 4 km: ${pc(e.distanciaMotorista.cancelamentoAte4km)}; acima de 4 km: ${pc(e.distanciaMotorista.cancelamentoAcima4km)}.</p>` : "");
    case "horarios": return `<p class="texto">Pico: ${e.temporal.pico ? `${e.temporal.pico.hora}h (${e.temporal.pico.total} corridas)` : "—"}. Dia mais forte: ${e.temporal.diaMaisMovimentado ? `${e.temporal.diaMaisMovimentado.dia} (${e.temporal.diaMaisMovimentado.total})` : "—"}. Entre 23h e 6h: ${e.temporal.noturnas} pedidos (${pc(e.temporal.noturnasPct)}).</p>`
      + `<h3>Por dia da semana</h3>` + barras(e.temporal.porDiaSemana.map((d) => ({ rotulo: d.dia, valor: d.total, extra: `${pc(d.taxaCancelamento)} canc.` })))
      + `<h3>Por hora</h3>` + barras(e.temporal.porHora.filter((h) => h.total).map((h) => ({ rotulo: `${String(h.hora).padStart(2, "0")}h`, valor: h.total, extra: `${pc(h.taxaCancelamento)} canc.` })));
    case "qualidade": return (e.qualidade.length ? tabela(["Campo", "Em branco", "%"], e.qualidade.map((q) => [q.campo, q.vazios, pc(q.pct)]), [1, 2]) : `<p class="sub">Todos os campos principais estão preenchidos.</p>`)
      + (e.semDados.length ? `<p class="texto">Não foi possível medir: ${esc(e.semDados.join(", "))}.</p>` : "");
  }
}

export function relatorioHtml(e: Estatisticas, a: Analise, meta: MetaRelatorio): string {
  const m = meta.marca, tx = a.textos;
  const periodo = e.periodo.inicio ? (e.periodo.inicio === e.periodo.fim ? e.periodo.inicio : `${e.periodo.inicio} a ${e.periodo.fim}`) : "sem período";
  const titulo = tx?.titulo || `Relatório de corridas — ${m.nomeExibido} | ${periodo}`;
  const kpis = [["Corridas", num(e.total, 0)], ["Finalizadas", pc(e.status.taxaFinalizacao)], ["Canceladas", pc(e.status.taxaCancelamento)], ["Não atendidas", pc(e.status.taxaNaoAtendidas)], ["Faturamento", real(e.valor.soma)], ["Valor típico", real(e.valor.mediana)], ["Motoristas", num(e.motoristas.ativos, 0)]]
    .map(([r, v]) => `<div class="kpi"><span>${esc(r)}</span><b>${esc(v)}</b></div>`).join("");
  const aviso = tx ? `<div class="ia"><b>Análise escrita por ${esc(m.assistente.nome)} (inteligência artificial).</b> Os números foram calculados direto das corridas; os textos e as recomendações foram escritos por IA, são informativos e não substituem a avaliação da gestão.</div>` : "";
  const casos = e.foraDoPadrao.length ? `<h2>Casos fora do padrão</h2>${tabela(["OS", "Data", "Motorista", "Categoria", "Valor", "O que chamou atenção", "Análise"], e.foraDoPadrao.map((c) => [c.os, c.data, c.motorista || "—", c.categoria || "—", real(c.valor), c.detalhe, tx?.casos.find((x) => x.os === c.os)?.texto ?? ""]), [4])}` : "";
  const recs = tx && (tx.recomendacoes.operacionais.length || tx.recomendacoes.comerciais.length) ? `<h2>Recomendações</h2><h3>Operação</h3>${itens(tx.recomendacoes.operacionais)}<h3>Comercial</h3>${itens(tx.recomendacoes.comerciais)}<h3>Dados</h3>${itens(tx.recomendacoes.dados)}` : "";
  const corpo = `<p><span class="etq">${num(e.total, 0)} corridas · ${esc(periodo)}</span></p>${aviso}<div class="kpis">${kpis}</div>
<h2>Alertas</h2>${(tx?.alertas.length ? tx.alertas : e.alertas).map(alerta).join("")}
${tx?.resumo.length ? `<h2>Resumo</h2>${itens(tx.resumo)}` : ""}
${SECOES.map((s, i) => `<h2>${i + 1}. ${esc(TITULO_SECAO[s])}</h2>${tx?.secoes[s] ? `<p class="texto">${esc(tx.secoes[s])}</p>` : ""}${blocoSecao(s, e)}`).join("\n")}
${casos}${recs}`;
  return pagina(titulo, meta, corpo);
}

export function planoHtml(e: Estatisticas, p: Plano, meta: MetaRelatorio): string {
  const corpo = `<div class="ia"><b>Plano sugerido por ${esc(meta.marca.assistente.nome)} (inteligência artificial)</b> a partir de ${num(e.total, 0)} corridas. Revise antes de aprovar.</div>
<h2>Diagnóstico</h2><p class="texto">${esc(p.diagnostico)}</p>
${p.problemas.length ? `<h2>Problemas</h2>${tabela(["Problema", "Impacto", "Causa provável", "Nível"], p.problemas.map((x) => [x.problema, x.impacto, x.causa, x.nivel]))}` : ""}
<h2>Ações imediatas</h2>${p.acoesImediatas.map((a) => `<div class="alerta ${esc(a.nivel)}"><b>${esc(a.titulo)}</b><br>${esc(a.porque)}<br><b>O que fazer:</b> ${esc(a.oQueFazer)}<br><b>Responsável:</b> ${esc(a.responsavel)} · <b>Prazo:</b> ${esc(a.prazo)} · <b>Meta:</b> ${esc(a.meta)}</div>`).join("")}
${p.curtoPrazo.length ? `<h2>Curto prazo</h2>${itens(p.curtoPrazo)}` : ""}${p.medioPrazo.length ? `<h2>Médio prazo</h2>${itens(p.medioPrazo)}` : ""}
${p.indicadores.length ? `<h2>Indicadores</h2>${tabela(["Indicador", "Hoje", "Meta (60 dias)"], p.indicadores.map((i) => [i.indicador, i.atual, i.meta]))}` : ""}
${p.checklist.length ? `<h2>Para aprovar</h2><ul>${p.checklist.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}</ul>` : ""}`;
  return pagina(p.titulo, meta, corpo);
}
