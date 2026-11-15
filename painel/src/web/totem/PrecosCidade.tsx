// Totens & Preços › Preços › Preços por cidade. Tabela de valores da empresa: dentro da cidade, locais (zoológico, pesqueiro,
// sítio...) e entre cidades, com valor de dia, noite, faixas de horário, domingo, feriado e pedágio. Uma aba por tipo, o
// formulário de cadastro e a busca para editar ou excluir (a tela não lista todas). Tarifa repetida é recusada.

import { useEffect, useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, ListCollapse, Loader2, MapPin, Pencil, PartyPopper, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiCentral, type TarifaCidade, type TipoTarifa } from "./api";

const TIPOS: ReadonlyArray<readonly [TipoTarifa, string]> = [["dentro", "Dentro da cidade"], ["local", "Locais"], ["cidades", "Entre cidades"]];
interface Form {
  id?: string; tipo: TipoTarifa; origemCidade: string; origemUf: string; destinoCidade: string; destinoUf: string; local: string; categoria: string;
  normal: string; noite: string; noiteInicio: string; noiteFim: string; domingo: string; feriado: string; faixas: Array<{ inicio: string; fim: string; valor: string }>;
  pedagio: string; pedagioIdaVolta: boolean; ativa: boolean; obs: string;
}
const vazio = (tipo: TipoTarifa): Form => ({ tipo, origemCidade: "", origemUf: "", destinoCidade: "", destinoUf: "", local: "", categoria: "", normal: "", noite: "", noiteInicio: "22:00", noiteFim: "06:00", domingo: "", feriado: "", faixas: [], pedagio: "", pedagioIdaVolta: true, ativa: true, obs: "" });
const s = (v: number | null) => (v != null ? String(v) : "");
const doTarifa = (t: TarifaCidade): Form => ({
  id: t.id, tipo: t.tipo, origemCidade: t.origemCidade, origemUf: t.origemUf, destinoCidade: t.destinoCidade, destinoUf: t.destinoUf, local: t.local, categoria: t.categoria,
  normal: String(t.normal), noite: s(t.noite), noiteInicio: t.noiteInicio, noiteFim: t.noiteFim, domingo: s(t.domingo), feriado: s(t.feriado),
  faixas: t.faixas.map((b) => ({ inicio: b.inicio, fim: b.fim, valor: String(b.valor) })), pedagio: s(t.pedagio), pedagioIdaVolta: t.pedagioIdaVolta, ativa: t.ativa, obs: t.obs,
});
const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export default function PrecosCidade() {
  const { dados, recarregar } = useCarregar(() => apiCentral.tarifasCidade(), []);
  const [aba, setAba] = useState<TipoTarifa>("dentro");
  const [f, setF] = useState<Form>(vazio("dentro"));
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<TarifaCidade[] | null>(null);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [espera, setEspera] = useState("");
  const tarifas = dados?.tarifas ?? [];

  useEffect(() => { if (dados) setEspera(dados.esperaPorHora ? String(dados.esperaPorHora) : ""); }, [dados?.esperaPorHora]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Formulário novo do tipo da aba: dentro e locais já vêm com a cidade das outras tarifas. */
  const novo = (tipo: TipoTarifa): Form => {
    const n = vazio(tipo);
    if (tipo !== "cidades") { const b = tarifas.find((t) => t.tipo !== "cidades" && t.destinoCidade.trim()); if (b) { n.destinoCidade = b.destinoCidade; n.destinoUf = b.destinoUf; } }
    return n;
  };
  useEffect(() => { setF((x) => (x.id ? x : novo(aba))); setAchadas(null); }, [aba, tarifas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (campo: keyof Form, v: string | boolean) => setF((x) => ({ ...x, [campo]: v }));
  const buscar = () => {
    const q = norm(busca);
    const da = tarifas.filter((t) => t.tipo === aba);
    setAchadas(q ? da.filter((t) => norm(`${t.titulo} ${t.destinoCidade} ${t.origemCidade} ${t.obs}`).includes(q)) : da);
  };
  const salvar = async () => {
    setMsg(null); setSalvando(true);
    try {
      const corpo = { ...f, faixas: f.faixas.filter((b) => b.inicio || b.fim || b.valor.trim()) };
      if (f.id) await apiCentral.salvarTarifaCidade(f.tipo, corpo, f.id); else await apiCentral.novaTarifaCidade(f.tipo, corpo);
      setMsg({ texto: f.id ? "Tarifa atualizada!" : "Tarifa adicionada!" });
      setF(novo(aba)); recarregar();
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setSalvando(false); }
  };
  const excluir = async (t: TarifaCidade) => {
    if (!confirm(`Excluir a tarifa "${t.titulo}"?`)) return;
    try { await apiCentral.apagarTarifaCidade(t.id); if (f.id === t.id) setF(novo(aba)); setAchadas((r) => r?.filter((x) => x.id !== t.id) ?? null); setMsg({ texto: "Tarifa excluída!" }); recarregar(); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const abaNome = TIPOS.find(([k]) => k === aba)?.[1] ?? "";
  const pedagioNum = parseFloat(f.pedagio.replace(",", "."));

  if (!dados) return <div className="vazio"><Loader2 className="gira" /></div>;
  return (
    <div className="form">
      <Cartao>
        <p><MapPin size={15} /> <b>Preços por cidade</b></p>
        <small>Tabela de valores da empresa: dentro da cidade, locais (Zoológico, pesqueiro, sítio...) e entre cidades, com valor de dia, noite, domingo e feriado. No totem, se o passageiro digita um destino de outra cidade ou um local da tabela, a corrida vai com o valor do horário (noite, domingo e feriado, se preenchidos, + pedágio). A cidade do totem vem do cadastro do local. Cada cadastro entre cidades vale nos dois sentidos. Tarifa repetida é recusada.</small>
      </Cartao>

      <Cartao titulo="Hora de espera (todas as cidades)">
        <div className="acoes">
          <label>Valor por hora de espera (R$)<input type="number" step="0.01" min="0" value={espera} onChange={(e) => setEspera(e.target.value)} placeholder="Ex: 30,00 — vazio = não mostra" /></label>
          <button type="button" className="botao" onClick={async () => { try { await apiCentral.esperaCidade(espera); setMsg({ texto: "Hora de espera salva!" }); recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } }}><Save size={14} /> Salvar</button>
        </div>
        <small>Aparece junto com a tabela de preços ("Hora de espera: R$ 30,00 por hora").</small>
      </Cartao>

      <div className="acoes">
        {TIPOS.map(([k, nome]) => <button key={k} type="button" className={`botao ${aba === k ? "primario" : ""}`} disabled={!!f.id && k !== aba} onClick={() => !f.id && setAba(k)}>{nome} ({tarifas.filter((t) => t.tipo === k).length})</button>)}
      </div>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.erro ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {msg.texto}</div>}

      <form className="cartao form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{f.id ? `Editando: ${f.tipo === "local" ? f.local : f.tipo === "dentro" ? f.categoria || "Corrida" : `${f.origemCidade || "Qualquer cidade"} ⇄ ${f.destinoCidade}`}` : `Nova tarifa — ${abaNome}`}</h3>
          {f.id && <button type="button" className="botao" onClick={() => { setF(novo(aba)); setMsg(null); }}><X size={14} /> Cancelar</button>}
        </div>

        {f.tipo !== "cidades" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <fieldset className="cartao"><legend className="sub">Cidade (obrigatório)</legend>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
                <input placeholder="Cidade" value={f.destinoCidade} onChange={(e) => mudar("destinoCidade", e.target.value)} maxLength={80} />
                <input placeholder="UF" value={f.destinoUf} onChange={(e) => mudar("destinoUf", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
            </fieldset>
            {f.tipo === "local" && (
              <fieldset className="cartao"><legend className="sub">Nome do local (obrigatório)</legend>
                <input value={f.local} onChange={(e) => mudar("local", e.target.value)} maxLength={80} placeholder="Ex: Zoológico, Pesqueiro do Diu, Sítio Santo Antônio" />
                <small>O totem usa este valor quando o passageiro digita o nome do local (no destino).</small>
              </fieldset>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <fieldset className="cartao"><legend className="sub">Cidade de origem (opcional)</legend>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
                <input placeholder="Cidade" value={f.origemCidade} onChange={(e) => mudar("origemCidade", e.target.value)} maxLength={80} />
                <input placeholder="UF" value={f.origemUf} onChange={(e) => mudar("origemUf", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
            </fieldset>
            <fieldset className="cartao"><legend className="sub">Cidade de destino (obrigatório)</legend>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
                <input placeholder="Cidade" value={f.destinoCidade} onChange={(e) => mudar("destinoCidade", e.target.value)} maxLength={80} />
                <input placeholder="UF" value={f.destinoUf} onChange={(e) => mudar("destinoUf", e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
            </fieldset>
            {f.origemCidade && f.destinoCidade && <small style={{ gridColumn: "1 / -1" }}>Vale nos dois sentidos: {f.origemCidade} → {f.destinoCidade} e {f.destinoCidade} → {f.origemCidade}.</small>}
          </div>
        )}

        <label>Categoria / tipo de corrida (opcional — vazio = todas)
          <input value={f.categoria} onChange={(e) => mudar("categoria", e.target.value)} maxLength={60} placeholder="Ex: CENTRAL, Supermercado" />
        </label>

        <fieldset className="cartao"><legend className="sub">Valor da corrida (o passageiro vê e paga este valor)</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <label>Valor normal / dia (R$)<input type="number" step="0.01" min="0" value={f.normal} onChange={(e) => mudar("normal", e.target.value)} placeholder="Ex: 15,00" /></label>
            <label>Noite (R$, opcional)<input type="number" step="0.01" min="0" value={f.noite} onChange={(e) => mudar("noite", e.target.value)} placeholder="Vazio = valor normal" /></label>
            <label>Noite começa<input type="time" value={f.noiteInicio} onChange={(e) => mudar("noiteInicio", e.target.value)} /></label>
            <label>Noite termina<input type="time" value={f.noiteFim} onChange={(e) => mudar("noiteFim", e.target.value)} /></label>
            <label>Domingo (R$)<input type="number" step="0.01" min="0" value={f.domingo} onChange={(e) => mudar("domingo", e.target.value)} placeholder="Opcional" /></label>
            <label>Feriado (R$)<input type="number" step="0.01" min="0" value={f.feriado} onChange={(e) => mudar("feriado", e.target.value)} placeholder="Opcional" /></label>
          </div>
          <b>Outras faixas de horário (opcional)</b>
          <small>Para ter mais de um valor à noite. Ex.: noite das 22:00 às 23:59 = R$ 20,00 (campos acima) e madrugada das 00:00 às 05:59 = R$ 25,00 (aqui). Domingo e feriado continuam com o valor deles.</small>
          {f.faixas.map((b, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <label>Começa<input type="time" value={b.inicio} onChange={(e) => setF((x) => ({ ...x, faixas: x.faixas.map((y, j) => (j === i ? { ...y, inicio: e.target.value } : y)) }))} /></label>
              <label>Termina<input type="time" value={b.fim} onChange={(e) => setF((x) => ({ ...x, faixas: x.faixas.map((y, j) => (j === i ? { ...y, fim: e.target.value } : y)) }))} /></label>
              <label>Valor (R$)<input type="number" step="0.01" min="0" value={b.valor} onChange={(e) => setF((x) => ({ ...x, faixas: x.faixas.map((y, j) => (j === i ? { ...y, valor: e.target.value } : y)) }))} placeholder="Ex: 25,00" /></label>
              <button type="button" className="icone" aria-label="Remover faixa" onClick={() => setF((x) => ({ ...x, faixas: x.faixas.filter((_, j) => j !== i) }))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="botao" onClick={() => setF((x) => ({ ...x, faixas: [...x.faixas, { inicio: "", fim: "", valor: "" }] }))}><Plus size={14} /> Adicionar faixa de horário</button>
        </fieldset>

        {f.tipo === "cidades" && (
          <fieldset className="cartao"><legend className="sub">Pedágio (opcional)</legend>
            <label>Valor por passagem (R$, carro de passeio)<input type="number" step="0.01" min="0" value={f.pedagio} onChange={(e) => mudar("pedagio", e.target.value)} placeholder="Vazio = sem pedágio" /></label>
            <label className="check"><input type="checkbox" checked={f.pedagioIdaVolta} onChange={(e) => mudar("pedagioIdaVolta", e.target.checked)} /> Cobrar ida e volta (×2)</label>
            {pedagioNum > 0 && <small>Soma ao valor da corrida: <b>{brl(pedagioNum * (f.pedagioIdaVolta ? 2 : 1))}</b>. Atualize quando as rodovias reajustarem o pedágio.</small>}
          </fieldset>
        )}

        <label>Observações (opcional)<input value={f.obs} onChange={(e) => mudar("obs", e.target.value)} maxLength={200} placeholder="Ex: Tarifa promocional de verão" /></label>
        <label className="check"><input type="checkbox" checked={f.ativa} onChange={(e) => mudar("ativa", e.target.checked)} /> Tarifa ativa (o totem usa este valor)</label>
        <button className="botao primario" disabled={salvando}>{salvando ? <Loader2 size={14} className="gira" /> : f.id ? <Save size={14} /> : <Plus size={14} />} {salvando ? "Salvando..." : f.id ? "Salvar alterações" : "Adicionar"}</button>
      </form>

      <Cartao>
        <div className="acoes">
          <Search size={15} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} placeholder={`Procurar em ${abaNome} (vazio = ver todas) para editar ou excluir...`} style={{ flex: 1 }} />
          <button type="button" className="botao primario" onClick={buscar}>Buscar</button>
        </div>
        {achadas && !achadas.length && <p className="sub"><ListCollapse size={14} /> Nada encontrado em {abaNome}.</p>}
        <ul className="lista">{achadas?.map((t) => (
          <li key={t.id}>
            <strong>{t.titulo}</strong>{!t.ativa && <small> (desativada)</small>}<br /><small>{t.resumo}</small>
            <div className="acoes">
              <button type="button" className="icone" title="Editar" onClick={() => { setF(doTarifa(t)); setMsg(null); }}><Pencil size={14} /></button>
              <button type="button" className="icone" title="Excluir" onClick={() => void excluir(t)}><Trash2 size={14} /></button>
            </div>
          </li>
        ))}</ul>
      </Cartao>

      <Cartao titulo="Feriados da empresa">
        <p><PartyPopper size={14} /> <small>Adicione feriados municipais e pontos facultativos da sua região. Feriados nacionais já são calculados automaticamente pelo sistema.</small></p>
        <Feriados feriados={dados.feriados} recarregar={recarregar} aoErro={(t) => setMsg({ texto: t, erro: true })} />
      </Cartao>
    </div>
  );
}

function Feriados({ feriados, recarregar, aoErro }: { feriados: Array<{ id: string; data: string; nome: string }>; recarregar: () => void; aoErro: (t: string) => void }) {
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  return (
    <>
      <div className="acoes">
        <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label>Nome (opcional)<input value={nome} maxLength={60} placeholder="Ex: Aniversário da cidade" onChange={(e) => setNome(e.target.value)} /></label>
        <button type="button" className="botao" disabled={!data} onClick={async () => { try { await apiCentral.novoFeriadoCidade(data, nome); setData(""); setNome(""); recarregar(); } catch (e) { aoErro(e instanceof Error ? e.message : String(e)); } }}><Plus size={14} /> Adicionar</button>
      </div>
      <ul className="lista">{feriados.map((h) => (
        <li key={h.id}><Calendar size={13} /> {new Date(`${h.data}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}{h.nome && <small> — {h.nome}</small>}
          <button type="button" className="icone" aria-label="Remover feriado" onClick={async () => { await apiCentral.apagarFeriadoCidade(h.id); recarregar(); }}><Trash2 size={13} /></button></li>
      ))}</ul>
    </>
  );
}
