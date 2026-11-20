// Cadastro › Cupons: campanhas por cidade ou cupons exclusivos de cliente (VIP). Lista: /api/gestao/cupons; gravação: /api/cadastros/cupons.

import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { api, empresaEscolhidaAgora } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dataBr, dinheiro, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

type Cupom = Record<string, string | number | boolean | null> & { id: string; usos: number; descontoTotal: number; situacao: string };
interface Resposta { cupons: Cupom[]; automaticos: Cupom[]; paginacao: { atual: number; totalPaginas: number }; kpis: { total: number; usos: number; economia: number } }
const TOM: Record<string, "ok" | "ruim" | "alerta" | "neutro"> = { Ativo: "ok", Vencido: "ruim", Esgotado: "alerta", Inativo: "neutro" };
const TIPOS = [["Todos", "Todos"], ["Resgatavel", "Resgatável"], ["Automatico", "Automático"]] as const;
const SITUACOES = [["Todos", "Todas as situações"], ["Validos", "Ativos"], ["Vencidos", "Vencidos"], ["Pausados", "Pausados"]] as const;

async function baixarPlanilha(tipo: string) {
  const emp = empresaEscolhidaAgora();
  const r = await fetch(`/api/gestao/cupons/exportar${consulta({ tipo })}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob()); a.download = "cupons.csv"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Cupons() {
  const [tipo, setTipo] = useState("Resgatavel");
  const [autoStatus, setAutoStatus] = useState("todos"), [autoBusca, setAutoBusca] = useState("");
  const [aba, setAba] = useState("Todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportar, setExportar] = useState(false);
  const l = useCarregar(() => chamar<Resposta>("GET", `/cupons${consulta({ status: aba, tipo, busca, pagina })}`), [aba, tipo, busca, pagina]);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const [editando, setEditando] = useState<Cupom | "novo" | null>(null);
  const [auto, setAuto] = useState<Cupom | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  useEffect(() => { if (!exportar) return; const f = () => setExportar(false); window.addEventListener("click", f); return () => window.removeEventListener("click", f); }, [exportar]);
  const mostraAuto = tipo === "Automatico", mostraResg = tipo === "Resgatavel";

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Cupons"><button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Criar cupom</button></Cabecalho>
      <div className="cg-linha-tab">
        <Abas itens={[{ id: "Resgatavel" as const, rotulo: "Resgatável" }, { id: "Automatico" as const, rotulo: "Automático" }]} valor={tipo as "Resgatavel" | "Automatico"} onChange={(v) => { setTipo(v); setPagina(1); }} />
        {!mostraResg && <label className="cg-campo" style={{ flex: "0 1 200px" }}><span>Situação</span><select value={autoStatus} onChange={(e) => setAutoStatus(e.target.value)} aria-label="Situação do automático"><option value="todos">Todos</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>}
        {!mostraResg && <input placeholder="Pesquisar" value={autoBusca} onChange={(e) => setAutoBusca(e.target.value)} aria-label="Pesquisar" />}
        {mostraResg && <label className="cg-campo" style={{ flex: "0 1 200px" }}><span>Situação</span><select value={aba} onChange={(e) => { setAba(e.target.value); setPagina(1); }} aria-label="Situação">{SITUACOES.map(([id, r]) => <option key={id} value={id}>{r}</option>)}</select></label>}
        {mostraResg && <input placeholder="Buscar" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} aria-label="Buscar" />}
        <div className="cg-menu-acoes">
          <button className="cg-botao" aria-haspopup="menu" aria-expanded={exportar} onClick={(e) => { e.stopPropagation(); setExportar(!exportar); }}><Download size={16} /> Exportar</button>
          {exportar && <ul role="menu">
            <li><button role="menuitem" onClick={() => { setExportar(false); window.print(); }}>Impressão (PDF)</button></li>
            <li><button role="menuitem" onClick={() => { setExportar(false); void tentar(() => baixarPlanilha(tipo), "Planilha exportada."); }}>Planilha (CSV)</button></li>
          </ul>}
        </div>
      </div>
      {mostraAuto && <>
        <h2 className="cg-secao">Cupons automáticos</h2>
        <div className="cg-autos">{d?.automaticos.filter((c) => (autoStatus === "todos" || (autoStatus === "ativo") === (c.ativo === true)) && (!autoBusca.trim() || `${c.codigo} ${c.descricao ?? ""}`.toLowerCase().includes(autoBusca.trim().toLowerCase()))).map((c) => (
          <div className="cg-auto" key={String(c.codigo)}>
            <strong>{String(c.codigo)}</strong>
            <span>{String(c.descricao)}</span>
            <span><Selo tom="info">Automático</Selo> <Selo tom={c.ativo === true ? "ok" : "neutro"}>{c.ativo === true ? "Ativo" : "Inativo"}</Selo></span>
            <span>Cupom utilizado: <strong>{c.usos ? `${c.usos} ${c.usos === 1 ? "vez" : "vezes"}` : "Nenhuma vez"}</strong></span>
            <span>Limite de uso: <strong>{String(c.limite)}</strong></span>
            {Number(c.valor) > 0 && <small className="cg-mono">{c.tipoDesconto === "Percentual" ? `${c.valor}%` : dinheiro(Number(c.valor))}{c.valorMaximo ? `, teto ${dinheiro(Number(c.valorMaximo))}` : ""}</small>}
            <button className="cg-botao" onClick={() => setAuto(c)}>{c.ativo === true ? "Configurar" : "Ativar"}</button>
          </div>))}</div>
      </>}
      {mostraResg && <>
        {mostraAuto && <h2 className="cg-secao">Cupons resgatáveis</h2>}
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Cupom</th><th>Desconto</th><th>Destinatário</th><th>Validade &amp; Regras</th><th>Usos</th><th>Status</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.cupons.map((c) => (
              <tr key={c.id}>
                <td><strong>{String(c.codigo)}</strong><br /><small className="cg-mono">{String(c.descricao ?? "")}</small></td>
                <td>{c.tipoDesconto === "Percentual" ? `${c.valor}%` : dinheiro(Number(c.valor))}{c.valorMaximo ? <><br /><small className="cg-mono">teto {dinheiro(Number(c.valorMaximo))}</small></> : null}</td>
                <td>{c.clienteTelefone ? <Selo tom="roxo">VIP {String(c.clienteNome || c.clienteTelefone)}</Selo> : <span>Todos{c.cidade ? ` · ${c.cidade}` : ""}</span>}</td>
                <td>{c.inicio ? dataBr(String(c.inicio)) : "—"} a {c.fim ? dataBr(String(c.fim)) : "sem fim"}<br /><small className="cg-mono">{c.minimoCorrida ? `mín. ${dinheiro(Number(c.minimoCorrida))}` : "sem mínimo"}{c.usoPorPassageiro ? ` · ${c.usoPorPassageiro}/cliente` : ""}</small></td>
                <td>{c.usos}{c.limiteUsos ? ` / ${c.limiteUsos}` : ""}</td>
                <td><Selo tom={TOM[c.situacao] ?? "neutro"}>{c.situacao === "Inativo" ? "Pausado" : c.situacao}</Selo></td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: "Editar", onClick: () => setEditando(c) },
                  { rotulo: c.ativo === true ? "Pausar" : "Ativar", onClick: () => void tentar(async () => { await api.salvarRegistro("cupons", c.id, { ...c, ativo: c.ativo !== true }); l.recarregar(); }) },
                  { rotulo: "Excluir", perigo: true, onClick: () => confirm(`Excluir o cupom ${c.codigo}?`) && void tentar(async () => { await api.apagarRegistro("cupons", c.id); l.recarregar(); }, "Cupom excluído.") },
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.cupons.length && <Vazio titulo="Nenhum cupom resgatável encontrado." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </>}
      {editando && <Formulario c={editando === "novo" ? null : editando} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {auto && <FormularioAutomatico c={auto} onFechar={() => setAuto(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function FormularioAutomatico({ c, onFechar, onSalvo }: { c: Cupom; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ tipoDesconto: String(c.tipoDesconto || "Percentual"), valor: Number(c.valor) > 0 ? String(c.valor) : "", valorMaximo: c.valorMaximo ? String(c.valorMaximo) : "", ativo: c.ativo === true });
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
    const corpo: Record<string, unknown> = { ...c, tipoDesconto: f.tipoDesconto, valor: n(f.valor), valorMaximo: n(f.valorMaximo), ativo: f.ativo, automatico: true };
    for (const k of ["usos", "descontoTotal", "situacao", "limite", "id"]) delete corpo[k];
    if (await tentar(() => (c.id ? api.salvarRegistro("cupons", c.id, corpo) : api.criarRegistro("cupons", corpo)), "Cupom automático salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={String(c.codigo)} sub={`${String(c.descricao)}. Limite de uso: ${String(c.limite)}.`} onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Tipo"><select value={f.tipoDesconto} onChange={(e) => setF({ ...f, tipoDesconto: e.target.value })}><option value="Percentual">% Porcentagem</option><option value="Valor fixo">R$ Fixo</option></select></Campo>
        <Campo rotulo="Valor"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo rotulo="Teto Máx (R$)"><input inputMode="decimal" value={f.valorMaximo} onChange={(e) => setF({ ...f, valorMaximo: e.target.value })} /></Campo>
        <Campo rotulo="Situação"><select value={f.ativo ? "1" : "0"} onChange={(e) => setF({ ...f, ativo: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Campo>
      </div>
    </Janela>
  );
}

function Formulario({ c, cidades, onFechar, onSalvo }: { c: Cupom | null; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const t = (k: string) => (c?.[k] == null ? "" : String(c[k]));
  const [f, setF] = useState({
    codigo: t("codigo"), descricao: t("descricao"), tipoDesconto: t("tipoDesconto") || "Valor fixo", valor: t("valor"), valorMaximo: t("valorMaximo"), cidade: t("cidade"),
    clienteTelefone: t("clienteTelefone"), clienteNome: t("clienteNome"), inicio: t("inicio"), fim: t("fim"), minimoCorrida: t("minimoCorrida"), limiteUsos: t("limiteUsos"), usoPorPassageiro: t("usoPorPassageiro"),
  });
  const { aviso, tentar } = useAviso();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const salvar = async () => {
    const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
    const corpo = { ...f, codigo: f.codigo.trim().toUpperCase(), valor: n(f.valor), valorMaximo: n(f.valorMaximo), minimoCorrida: n(f.minimoCorrida), limiteUsos: n(f.limiteUsos), usoPorPassageiro: n(f.usoPorPassageiro), ativo: c ? c.ativo === true : true };
    if (await tentar(() => (c ? api.salvarRegistro("cupons", c.id, corpo) : api.criarRegistro("cupons", corpo)), "Cupom salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela cheia aberta titulo={c ? "Editar Cupom" : "Novo Cupom"} sub="Configure as condições e o público-alvo" onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar Cupom</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Código do Cupom *"><input value={f.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} /></Campo>
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} /></Campo>
        <Campo rotulo="Tipo"><select value={f.tipoDesconto} onChange={(e) => set("tipoDesconto", e.target.value)}><option value="Valor fixo">R$ Fixo</option><option value="Percentual">% Porcentagem</option></select></Campo>
        <Campo rotulo="Valor"><input inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></Campo>
        <Campo rotulo="Teto Máx (R$)"><input inputMode="decimal" value={f.valorMaximo} onChange={(e) => set("valorMaximo", e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><select value={f.cidade} onChange={(e) => set("cidade", e.target.value)}><option value="">Todas</option>{cidades.map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo rotulo="Cliente Exclusivo (VIP)" dica="Vazio = Cupom liberado para todos na cidade."><input placeholder="Telefone do cliente" value={f.clienteTelefone} onChange={(e) => set("clienteTelefone", e.target.value)} /></Campo>
        <Campo rotulo="Nome do cliente VIP"><input value={f.clienteNome} onChange={(e) => set("clienteNome", e.target.value)} /></Campo>
        <Campo rotulo="Início"><input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Campo>
        <Campo rotulo="Expiração"><input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} /></Campo>
        <Campo rotulo="Mínimo Corrida"><input inputMode="decimal" value={f.minimoCorrida} onChange={(e) => set("minimoCorrida", e.target.value)} /></Campo>
        <Campo rotulo="Limite Total"><input type="number" value={f.limiteUsos} onChange={(e) => set("limiteUsos", e.target.value)} /></Campo>
        <Campo rotulo="Usos / Cliente"><input type="number" value={f.usoPorPassageiro} onChange={(e) => set("usoPorPassageiro", e.target.value)} /></Campo>
      </div>
    </Janela>
  );
}
