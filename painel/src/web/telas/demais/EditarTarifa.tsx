// Config › Tarifas e categorias › Tarifa: "Detalhes das tarifas" (padrão e extras) e a janela "Editar tarifa" no formato da Machine:
// método de cálculo (km e minuto, tabela de KM, bairro, hora parada), componentes principais e extras (parada adicional, bônus de deslocamento).

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Aviso, Campo, Interruptor, Modal, dinheiro, pedirConfig, useSalvar } from "./comum";

const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const METODOS: Array<[string, string, string]> = [
  ["km_minuto", "Por tarifa inicial, km e minuto", "O valor da corrida será calculado a partir de uma tarifa inicial, acrescida do custo proporcional à distância percorrida (km) e ao tempo de viagem (minutos)."],
  ["tabela_km", "Por tabela de KM", "A cobrança é baseada em faixas de distância. O sistema identifica em qual intervalo a quilometragem final se encaixa e aplica o valor fixo correspondente àquela faixa."],
  ["bairro", "Por bairro de destino", "O valor da tarifa é fixo e calculado com base no bairro de destino. Quando o destino não está na lista, vale a tarifa inicial mais km e minuto."],
  ["hora_parada", "Por tarifa inicial, km e hora parada", "O valor da corrida será a soma de uma tarifa inicial (preço base), o custo da distância percorrida (km) e o tempo em que o motorista permanecer parado ou em espera."],
];
const rotuloMetodo = (m: string) => METODOS.find(([k]) => k === m)?.[1] ?? m;

/** Tarifa (padrão ou extra) no formato único que a janela edita. */
function daCategoria(c: any, extra?: any) {
  if (extra) return structuredClone(extra);
  return {
    metodo: c.extra.tarifa.metodo, precoBase: c.taxaBase, valorKm: c.precoKm, valorMinuto: c.precoMin, valorHoraParada: c.extra.tarifa.valorHoraParada, valorMinimo: c.tarifaMinima,
    tabelaKm: structuredClone(c.extra.tarifa.tabelaKm), kmAdicional: c.extra.tarifa.kmAdicional, limiteKm: c.extra.tarifa.limiteKm, bairros: structuredClone(c.extra.tarifa.bairros),
    paradaAdicional: c.extra.paradas.tipo === "fixo" ? c.extra.paradas.valor : 0,
    bonusDeslocamento: { ativo: c.extra.deslocamento.ativo, minKm: c.extra.deslocamento.minKm, tipo: c.extra.deslocamento.tipo, valor: c.extra.deslocamento.valor, teto: c.extra.deslocamento.teto },
  };
}

const bonusTexto = (b: any) => (!b?.ativo ? "---" : b.tipo === "por_km" ? `${dinheiro(b.valor)}/km acima de ${b.minKm} km` : dinheiro(b.valor));
const dinOuTraco = (v: number) => (v > 0 ? dinheiro(v) : "---");

/** Linhas do "Detalhes das tarifas": a padrão e cada tarifa extra. */
export function DetalhesTarifas({ cat, admin, onEditar, onExtra, onRemover, onAtivar }: { cat: any; admin: boolean; onEditar: (extra: any | null) => void; onExtra: () => void; onRemover: (e: any) => void; onAtivar: (e: any, v: boolean) => void }) {
  const linhas = [{ chave: "padrao", nome: "Tarifa padrão", extra: null as any, t: daCategoria(cat) }, ...cat.extra.tarifasExtras.map((e: any) => ({ chave: e.id, nome: e.nome, extra: e, t: e }))];
  return (
    <div className="dm-tarifas" aria-label={`Detalhes das tarifas de ${cat.nome}`}>
      <div className="dm-linha dm-entre"><h4>Detalhes das tarifas</h4>{admin && <button className="botao" onClick={onExtra}><Plus size={14} /> Criar tarifa extra</button>}</div>
      <p className="sub">A tarifa padrão é aplicada a todos os dias e horários que não tiverem tarifas extras definidas.</p>
      <div className="tabela-rola"><table>
        <thead><tr><th>Tarifa</th><th>Valor tabelado</th><th>Preço base</th><th>Valor Km</th><th>Valor minuto</th><th>Valor hora parada</th><th>Bônus de deslocamento</th><th>Valor mínimo</th><th>Parada adicional</th>{admin && <th>Ações</th>}</tr></thead>
        <tbody>{linhas.map((l) => (
          <tr key={l.chave}>
            <td className="forte">{l.nome}{l.extra && <small className="bloco">{l.extra.dias.map((d: number) => DIAS[d].slice(0, 3)).join(", ")} · {l.extra.inicio} às {l.extra.fim}{l.extra.ativa ? "" : " · desligada"}</small>}<small className="bloco">{rotuloMetodo(l.t.metodo)}</small></td>
            <td>{l.t.metodo === "tabela_km" ? `${l.t.tabelaKm.length} faixa(s)` : l.t.metodo === "bairro" ? `${l.t.bairros.length} bairro(s)` : "---"}</td>
            <td>{dinOuTraco(l.t.precoBase)}</td><td>{dinOuTraco(l.t.valorKm)}</td><td>{dinOuTraco(l.t.valorMinuto)}</td><td>{dinOuTraco(l.t.valorHoraParada)}</td>
            <td>{bonusTexto(l.t.bonusDeslocamento)}</td><td>{dinOuTraco(l.t.valorMinimo)}</td><td>{dinOuTraco(l.t.paradaAdicional)}</td>
            {admin && <td><span className="dm-linha">
              {l.extra && <Interruptor valor={l.extra.ativa} rotulo={`${l.nome} ativa`} onChange={(v) => onAtivar(l.extra, v)} />}
              <button className="icone" aria-label={`Editar tarifa ${l.nome}`} title="Editar tarifa" onClick={() => onEditar(l.extra)}><Pencil size={14} /></button>
              {l.extra && <button className="icone" aria-label={`Remover tarifa ${l.nome}`} onClick={() => onRemover(l.extra)}><Trash2 size={14} /></button>}
            </span></td>}
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/** Janela "Editar tarifa". extra: null = tarifa padrão; "nova" = criar tarifa extra; objeto = editar a extra. */
export function JanelaTarifa({ cat, extra, onFechar, onSalvo }: { cat: any; extra: any | "nova" | null; onFechar: () => void; onSalvo: () => void }) {
  const ehExtra = extra !== null;
  const [t, setT] = useState<any>(() => extra === "nova"
    ? { ...daCategoria(cat), nome: "", dias: [], inicio: "00:00", fim: "23:59", ativa: true, metodo: "km_minuto" }
    : daCategoria(cat, extra && extra !== "nova" ? extra : undefined));
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setT((x: any) => ({ ...x, [k]: v }));
  const bonus = (k: string, v: unknown) => set("bonusDeslocamento", { ...t.bonusDeslocamento, [k]: v });
  const faixas: any[] = t.tabelaKm;
  const ultima = faixas.length ? Math.max(...faixas.map((f) => f.ate)) : 0;
  const primeira = faixas.length ? Math.min(...faixas.map((f) => f.ate)) : 0;
  const enviar = async () => {
    const url = !ehExtra ? `/categorias/${cat.id}/tarifa` : extra === "nova" ? `/categorias/${cat.id}/tarifas-extras` : `/categorias/${cat.id}/tarifas-extras/${extra.id}`;
    const r = await salvar(() => pedirConfig(url, !ehExtra || extra !== "nova" ? "PUT" : "POST", t));
    if (r) onSalvo();
  };
  const campoValor = (rotulo: string, k: string, dica?: string) => <Campo rotulo={rotulo} dica={dica}><div className="dm-linha">R$ <input inputMode="decimal" value={txt(t[k])} placeholder="0,00" onChange={(e) => set(k, num(e.target.value))} /></div></Campo>;
  return (
    <Modal aberto onFechar={onFechar} titulo={extra === "nova" ? "Criar tarifa extra" : "Editar tarifa"} sub={`Categoria: ${cat.nome}`} larga>
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <p className="sub">Campos com * são obrigatórios.</p>
        <h3>{ehExtra ? "Tarifa extra" : "Tarifa padrão"}</h3>
        {ehExtra && (
          <>
            <Campo rotulo="Nome da tarifa extra *"><input value={t.nome} onChange={(e) => set("nome", e.target.value)} required maxLength={60} placeholder="Ex: Madrugada" /></Campo>
            <fieldset><legend>Dias da semana *</legend><div className="dm-radios">{DIAS.map((d, i) => <label key={d} className="dm-check"><input type="checkbox" checked={t.dias.includes(i)} onChange={() => set("dias", t.dias.includes(i) ? t.dias.filter((x: number) => x !== i) : [...t.dias, i])} /> {d}</label>)}</div></fieldset>
            <div className="dm-duplo"><Campo rotulo="Das *"><input type="time" value={t.inicio} onChange={(e) => set("inicio", e.target.value)} required /></Campo><Campo rotulo="Até *"><input type="time" value={t.fim} onChange={(e) => set("fim", e.target.value)} required /></Campo></div>
          </>
        )}
        <Campo rotulo="Método de cálculo *" dica="Escolha como a tarifa será calculada.">
          <select value={t.metodo} onChange={(e) => set("metodo", e.target.value)}>{METODOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        </Campo>
        <p className="sub"><strong>Método selecionado:</strong> {METODOS.find(([k]) => k === t.metodo)?.[2]}</p>

        <h3>Componentes principais</h3>
        {t.metodo === "tabela_km" ? (
          <div>
            {faixas.map((f, i) => (
              <div key={i} className="dm-grade4">
                <Campo rotulo="Distância até (KM) *"><input inputMode="decimal" value={txt(f.ate)} onChange={(e) => set("tabelaKm", faixas.map((x, j) => (j === i ? { ...x, ate: num(e.target.value) } : x)))} /></Campo>
                <Campo rotulo="Valor fixo (R$) *"><div className="dm-linha">R$ <input inputMode="decimal" value={txt(f.valor)} onChange={(e) => set("tabelaKm", faixas.map((x, j) => (j === i ? { ...x, valor: num(e.target.value) } : x)))} /></div></Campo>
                <button type="button" className="icone" aria-label={`Remover faixa ${i + 1}`} onClick={() => set("tabelaKm", faixas.filter((_, j) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            <button type="button" className="botao" onClick={() => set("tabelaKm", [...faixas, { ate: ultima + 5, valor: 0 }])}><Plus size={14} /> Adicionar nova faixa</button>
            <div className="dm-grade3">
              {campoValor("Valor por km adicional (R$)", "kmAdicional", "Cobrado por km que passar da última faixa.")}
              <Campo rotulo="Percurso máximo (km)" dica="0 = sem limite. Acima disso a corrida não pode ser solicitada."><input inputMode="decimal" value={txt(t.limiteKm)} placeholder="0" onChange={(e) => set("limiteKm", num(e.target.value))} /></Campo>
              {campoValor("Valor mínimo (R$)", "valorMinimo")}
            </div>
            <div className="dm-guia"><p>A corrida realizada com esta tarifa será cobrada pelo valor fixo definido na quilometragem ao lado. Por exemplo: se o percurso tiver até <strong>{String(ultima).replace(".", ",")} km</strong>, será cobrado o valor da faixa correspondente; se o taxímetro virtual registrar um percurso maior que <strong>{String(ultima).replace(".", ",")} km</strong>, será cobrado <strong>{dinheiro(t.kmAdicional)}</strong> por km adicional.</p></div>
            {t.limiteKm > 0 && <p className="sub"><strong>Atenção:</strong> não será possível solicitar corridas com um percurso maior que {String(t.limiteKm).replace(".", ",")} km.</p>}
            {faixas.length > 0 && primeira <= 0 && <p className="sub">A primeira faixa precisa ter distância maior que zero.</p>}
          </div>
        ) : t.metodo === "bairro" ? (
          <div>
            {t.bairros.map((b: any, i: number) => (
              <div key={i} className="dm-grade4">
                <Campo rotulo="Bairro de destino *"><input value={b.nome} maxLength={80} onChange={(e) => set("bairros", t.bairros.map((x: any, j: number) => (j === i ? { ...x, nome: e.target.value } : x)))} /></Campo>
                <Campo rotulo="Valor fixo (R$) *"><div className="dm-linha">R$ <input inputMode="decimal" value={txt(b.valor)} onChange={(e) => set("bairros", t.bairros.map((x: any, j: number) => (j === i ? { ...x, valor: num(e.target.value) } : x)))} /></div></Campo>
                <button type="button" className="icone" aria-label={`Remover bairro ${i + 1}`} onClick={() => set("bairros", t.bairros.filter((_: any, j: number) => j !== i))}><X size={14} /></button>
              </div>
            ))}
            <button type="button" className="botao" onClick={() => set("bairros", [...t.bairros, { nome: "", valor: 0 }])}><Plus size={14} /> Adicionar bairro</button>
            <p className="sub">Para os destinos fora da lista:</p>
            <div className="dm-grade4">{campoValor("Preço base", "precoBase")}{campoValor("Valor Km", "valorKm")}{campoValor("Valor minuto", "valorMinuto")}{campoValor("Valor mínimo", "valorMinimo")}</div>
          </div>
        ) : (
          <div className="dm-grade4">
            {campoValor("Preço base *", "precoBase")}{campoValor("Valor Km *", "valorKm")}
            {t.metodo === "hora_parada" ? campoValor("Valor hora parada *", "valorHoraParada") : campoValor("Valor minuto *", "valorMinuto")}
            {campoValor("Valor mínimo", "valorMinimo")}
          </div>
        )}

        <h3>Extras da tarifa</h3>
        <p className="sub">Valores adicionais que podem ser aplicados em situações específicas.</p>
        {campoValor("Valor por parada adicional", "paradaAdicional", "Define o valor fixo cobrado por paradas no meio do trajeto.")}
        <Interruptor valor={t.bonusDeslocamento.ativo} onChange={(v) => bonus("ativo", v)} rotulo="Bônus de deslocamento" descricao="Valor pago pela central para compensar longos deslocamentos até o passageiro." />
        {t.bonusDeslocamento.ativo && (
          <div className="dm-grade4">
            <Campo rotulo="A partir de (KM)"><input inputMode="decimal" value={txt(t.bonusDeslocamento.minKm)} placeholder="0" onChange={(e) => bonus("minKm", num(e.target.value))} /></Campo>
            <Campo rotulo="Tipo"><select value={t.bonusDeslocamento.tipo} onChange={(e) => bonus("tipo", e.target.value)}><option value="fixo">Valor fixo (R$)</option><option value="por_km">Por km acima (R$)</option></select></Campo>
            <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={txt(t.bonusDeslocamento.valor)} placeholder="0,00" onChange={(e) => bonus("valor", num(e.target.value))} /></Campo>
            <Campo rotulo="Teto (R$)"><input inputMode="decimal" value={txt(t.bonusDeslocamento.teto)} placeholder="0,00" onChange={(e) => bonus("teto", num(e.target.value))} /></Campo>
          </div>
        )}
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>{extra === "nova" ? "Criar tarifa extra" : "Editar tarifa"}</button></div>
      </form>
    </Modal>
  );
}
