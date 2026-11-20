// Cadastro › Passe Livre: ofertas de passe que os condutores compram no app (durante o passe não pagam a taxa da central)
// e, na aba Resultados, o que a central ganhou com os passes e o que deixou de cobrar de taxa. Servidor: /api/gestao/passe-livre.

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dinheiro, Janela, useAviso, Vazio } from "./base";

interface Oferta { id: string; valor: number; horas: number; rotulo: string }
interface Catalogo { ofertas: Oferta[]; maximo: number }
interface Compra { id: string; motoristaId: string; valor: number; horas: number; criadoEm: string }
interface Resultado { receita: number; passesVendidos: number; motoristas: number; taxaNaoCobrada: number; corridasComPasse: number; semDados: boolean; compras: Compra[] }
/** Horário do painel (Brasília gravado como UTC): lê direto do texto, sem mudar de fuso. */
const quando = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["mes", "Este mês"], ["outro", "Personalizado"]];

export default function PasseLivre() {
  const [aba, setAba] = useState<"catalogo" | "resultados">("catalogo");
  return (
    <div className="cg-pagina-solta">
      <Cabecalho titulo="Passe Livre" />
      <Abas itens={[{ id: "catalogo" as const, rotulo: "Catálogo" }, { id: "resultados" as const, rotulo: "Resultados" }]} valor={aba} onChange={setAba} />
      {aba === "catalogo" ? <CatalogoAba /> : <ResultadosAba />}
    </div>
  );
}

function CatalogoAba() {
  const l = useCarregar(() => chamar<Catalogo>("GET", "/passe-livre"), []);
  const [editando, setEditando] = useState<Oferta | "nova" | null>(null);
  const [previa, setPrevia] = useState(true);
  const { aviso, tentar, setAviso } = useAviso();
  const d = l.dados;
  const cheio = !!d && d.ofertas.length >= d.maximo;
  return (
    <>
      {aviso}
      <p style={{ color: "var(--cg-suave)", margin: "0 0 14px" }}>Defina as ofertas de passe livre que os seus condutores podem comprar no aplicativo. Durante o passe, o condutor não paga a taxa da central nas corridas.</p>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      <section className="cg-tabela-caixa" style={{ padding: "10px 16px", marginBottom: 14 }}>
        <button type="button" className="cg-botao" style={{ width: "100%", justifyContent: "space-between", border: 0, background: "none" }} aria-expanded={previa} onClick={() => setPrevia(!previa)}>
          O que o seu condutor vê hoje {previa ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {previa && (!d?.ofertas.length
          ? <Vazio titulo="O condutor não vê nenhum passe à venda." sub="Crie uma oferta para ela aparecer no app do condutor." />
          : <div className="cg-autos" style={{ marginTop: 10 }}>{d.ofertas.map((o) => (
            <div className="cg-auto" key={o.id}><strong>Passe Livre de {o.rotulo}</strong><span>Sem taxa da central nas corridas durante o passe.</span><span><strong>{dinheiro(o.valor)}</strong></span></div>
          ))}</div>)}
      </section>
      {!d ? <div className="cg-tabela-caixa"><Vazio titulo="Carregando..." /></div> : !d.ofertas.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhuma oferta criada." sub="Clique em Nova oferta." /></div> : (
        <div className="cg-autos">{d.ofertas.map((o) => (
          <div className="cg-auto" key={o.id}>
            <strong>{o.rotulo}</strong>
            <span><strong>{dinheiro(o.valor)}</strong></span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="cg-botao" onClick={() => setEditando(o)}>Alterar</button>
              <button className="cg-botao perigo" onClick={() => confirm(`Remover a oferta de ${o.rotulo}? Quem já comprou continua com o passe.`) && void tentar(async () => { await chamar("DELETE", `/passe-livre/ofertas/${o.id}`); l.recarregar(); }, "Oferta removida.")}>Remover</button>
            </span>
          </div>))}</div>
      )}
      <p style={{ margin: "14px 0 10px", color: "var(--cg-suave)" }}>Você tem {d?.ofertas.length ?? 0} de {d?.maximo ?? 3} ofertas ativas.</p>
      <button className="cg-botao primario" disabled={!d || cheio} title={cheio ? "Remova uma oferta para criar outra." : undefined} onClick={() => setEditando("nova")}><Plus size={16} /> Nova oferta</button>
      {editando && <FormOferta oferta={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { l.recarregar(); setAviso({ texto: "Oferta gravada." }); }} />}
    </>
  );
}

function FormOferta({ oferta, onFechar, onSalvo }: { oferta: Oferta | null; onFechar: () => void; onSalvo: () => void }) {
  const [valor, setValor] = useState(oferta ? oferta.valor.toFixed(2).replace(".", ",") : "");
  const [horas, setHoras] = useState(oferta ? String(oferta.horas) : "");
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const corpo = { valor, horas };
    if (await tentar(() => (oferta ? chamar("PUT", `/passe-livre/ofertas/${oferta.id}`, corpo) : chamar("POST", "/passe-livre/ofertas", corpo)), "")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={oferta ? "Alterar oferta" : "Nova oferta"} onFechar={onFechar} largura="pequena"
      rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Valor *"><input inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor (R$)" /></Campo>
        <Campo rotulo="Duração *" dica="Em horas fechadas, de 1 a 720."><input inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Duração em horas" /></Campo>
      </div>
    </Janela>
  );
}

function ResultadosAba() {
  const [periodo, setPeriodo] = useState("hoje");
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const pronto = periodo !== "outro" || !!de;
  const l = useCarregar(() => (pronto ? chamar<Resultado>("GET", `/passe-livre/resultados${consulta({ periodo, de, ate })}`) : Promise.resolve(null as unknown as Resultado)), [periodo, de, ate]);
  const d = l.dados;
  return (
    <>
      <p style={{ color: "var(--cg-suave)", margin: "0 0 14px" }}>Compare o que a central ganhou com a venda de passes e o que deixou de cobrar de taxa nas corridas com passe vigente.</p>
      <div className="cg-filtros-linha">
        <select aria-label="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{PERIODOS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        {periodo === "outro" && <><input type="date" aria-label="Data inicial" value={de} onChange={(e) => setDe(e.target.value)} /><input type="date" aria-label="Data final" value={ate} onChange={(e) => setAte(e.target.value)} /></>}
      </div>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      <div className="cg-kpis">
        <div className="cg-kpi"><span>Receita com passes</span><strong>{dinheiro(d?.receita)}</strong>{!!d?.passesVendidos && <small>{d.passesVendidos} {d.passesVendidos === 1 ? "passe vendido" : "passes vendidos"} a {d.motoristas} {d.motoristas === 1 ? "condutor" : "condutores"}</small>}</div>
        <div className="cg-kpi"><span>Taxa não cobrada</span><strong>{dinheiro(d?.taxaNaoCobrada)}</strong>{!!d?.corridasComPasse && <small>{d.corridasComPasse} {d.corridasComPasse === 1 ? "corrida" : "corridas"} com passe vigente</small>}</div>
      </div>
      {d?.semDados && <div className="cg-tabela-caixa"><Vazio titulo="Sem dados no período selecionado." /></div>}
      {!!d?.compras.length && (
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Quando</th><th>Duração</th><th>Valor</th></tr></thead>
          <tbody>{d.compras.map((c) => <tr key={c.id}><td>{quando(c.criadoEm)}</td><td>{c.horas % 24 === 0 ? `${c.horas / 24} ${c.horas === 24 ? "dia" : "dias"}` : `${c.horas} ${c.horas === 1 ? "hora" : "horas"}`}</td><td>{dinheiro(c.valor)}</td></tr>)}</tbody>
        </table></div></div>
      )}
    </>
  );
}
