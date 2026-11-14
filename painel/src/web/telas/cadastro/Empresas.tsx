// Cadastro › Empresas (conveniadas, como na Machine): lista com filtros, Criar Empresa / Alterando Empresa (dados, endereço, situação,
// configurações e outras informações), funcionários e fatura do mês. Servidor: /api/gestao/empresas.

import { useState } from "react";
import { Download, Plus, X } from "lucide-react";
import { empresaEscolhidaAgora } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, ComFiltros, consulta, dataHoraBr, dinheiro, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

type Empresa = Record<string, string | number | boolean | null> & { id: string; funcionarios: number; faturaMes: number; ativa: boolean; ultimaSolicitacao: string | null };
interface Opcoes { bandeiras: string[]; categorias: string[]; pagamentos: string[]; ufs: string[]; situacoes: string[] }
interface Resposta { empresas: Empresa[]; paginacao: { atual: number; totalPaginas: number }; kpis: { ativas: number; faturaMes: number }; opcoes: Opcoes }

/** Situação como a Machine escreve. */
const ROTULO: Record<string, string> = { Ativa: "Ativo", Suspensa: "Suspenso", "Aguardando ativação": "Aguardando Ativação", Encerrada: "Deletado" };
const TOM: Record<string, "ok" | "alerta" | "ruim" | "neutro"> = { Ativa: "ok", "Aguardando ativação": "alerta", Suspensa: "ruim", Encerrada: "neutro" };
const SITUACOES = ["Ativa", "Suspensa", "Aguardando ativação", "Encerrada"];
const VAZIO = { nome: "", documento: "", status: "" };

const soDigitos = (v: string) => v.replace(/\D/g, "");
const mascaraCnpj = (v: string) => soDigitos(v).slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
const mascaraCpf = (v: string) => soDigitos(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const mascaraCep = (v: string) => soDigitos(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
const documentoBonito = (v: unknown) => { const d = soDigitos(String(v ?? "")); return d.length === 11 ? mascaraCpf(d) : d.length === 14 ? mascaraCnpj(d) : String(v ?? ""); };

export default function Empresas() {
  const [form, setForm] = useState(VAZIO);
  const [filtro, setFiltro] = useState(VAZIO);
  const [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/empresas${consulta({ ...filtro, pagina })}`), [filtro, pagina]);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const [editando, setEditando] = useState<Empresa | "nova" | null>(null);
  const [func, setFunc] = useState<Empresa | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  const exportar = () => void tentar(async () => {
    const headers: Record<string, string> = {};
    const emp = empresaEscolhidaAgora(); if (emp) headers["X-Empresa"] = emp;
    const r = await fetch(`/api/gestao/empresas-exportar${consulta(filtro)}`, { headers, credentials: "same-origin" });
    if (!r.ok) throw new Error("Não foi possível exportar.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob()); a.download = "empresas.csv"; a.click(); URL.revokeObjectURL(a.href);
  });

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Empresas" sub="Gestão de Empresas (parceiros B2B)">
        <button className="cg-botao" onClick={exportar}><Download size={16} /> Exportar relatório</button>
        <button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Criar Empresa</button>
      </Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(form); }}>
          <Campo rotulo="Nome fantasia"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="CPF/CNPJ"><input value={form.documento} placeholder="Somente números" onChange={(e) => setForm({ ...form, documento: e.target.value })} /></Campo>
          <Campo rotulo="Status da empresa"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="">Selecione</option>{SITUACOES.map((s) => <option key={s} value={s}>{ROTULO[s]}</option>)}</select></Campo>
          <button className="cg-botao primario cheio">Filtrar</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setForm(VAZIO); setFiltro(VAZIO); setPagina(1); }}>Limpar filtros</button>
        </form>
      }>
        <div className="cg-kpis">
          <div className="cg-kpi"><span>Ativas</span><strong>{d?.kpis.ativas ?? 0}</strong></div>
          <div className="cg-kpi"><span>Fatura Mês</span><strong>{dinheiro(d?.kpis.faturaMes)}</strong></div>
        </div>
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Nome fantasia</th><th>CPF/CNPJ</th><th>Responsável</th><th>Cidade</th><th>Última solicitação</th><th>Funcionários</th><th>Fatura Mês</th><th>Status da empresa</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.empresas.map((e) => (
              <tr key={e.id}>
                <td><strong>{String(e.nome)}</strong>{e.numeroContrato ? <><br /><small className="cg-mono">Contrato {String(e.numeroContrato)}</small></> : null}</td>
                <td className="cg-mono">{documentoBonito(e.cnpj)}</td>
                <td>{String(e.contato ?? "")}<br /><small className="cg-mono">{String(e.telefone ?? "")}</small></td>
                <td>{String(e.cidade ?? "")}</td>
                <td>{e.ultimaSolicitacao ? dataHoraBr(e.ultimaSolicitacao) : "---"}</td>
                <td>{e.funcionarios}</td><td>{dinheiro(e.faturaMes)}</td>
                <td><Selo tom={TOM[String(e.status)] ?? "neutro"}>{ROTULO[String(e.status)] ?? String(e.status)}</Selo></td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: "Editar", onClick: () => setEditando(e) }, { rotulo: "Adicionar funcionário", onClick: () => setFunc(e) },
                  ...(e.status !== "Encerrada" ? [{ rotulo: "Excluir", perigo: true, onClick: () => confirm(`Excluir ${e.nome}? A empresa fica como Deletado e o histórico é mantido.`) && void tentar(async () => { await chamar("DELETE", `/empresas/${e.id}`); l.recarregar(); }, "Empresa excluída.") }] : []),
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.empresas.length && <Vazio titulo="Nenhum resultado encontrado." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {editando && d && <Formulario e={editando === "nova" ? null : editando} opcoes={d.opcoes} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {func && <Funcionario e={func} onFechar={() => setFunc(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

interface Pagamento { tipo: string; desconto: string }
interface Extra { chave: string; valor: string }

function lerJson<T>(v: unknown, padrao: T): T { try { return v ? (JSON.parse(String(v)) as T) : padrao; } catch { return padrao; } }

function Formulario({ e, opcoes, cidades, onFechar, onSalvo }: { e: Empresa | null; opcoes: Opcoes; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const t = (k: string) => (e?.[k] == null ? "" : String(e[k]));
  const docInicial = t("cnpj");
  const [f, setF] = useState({
    bandeira: t("bandeira") || opcoes.bandeiras[0] || "", tipoDocumento: t("tipoDocumento") || (soDigitos(docInicial).length === 11 ? "CPF" : "CNPJ"), cnpj: documentoBonito(docInicial), numeroContrato: t("numeroContrato"),
    razaoSocial: t("razaoSocial"), nome: t("nome"), endereco: t("endereco"), enderecoNumero: t("enderecoNumero"), complemento: t("complemento"), uf: t("uf"), cidade: t("cidade"), bairro: t("bairro"), cep: mascaraCep(t("cep")),
    contato: t("contato"), email: t("email"), telefone: t("telefone"), status: t("status") || "Ativa",
    permiteEspecificarMotorista: t("permiteEspecificarMotorista") || "Sim", obsMotorista: t("obsMotorista"),
    centrosCusto: t("centrosCusto"), limiteMensal: t("limiteMensal"), desconto: t("desconto"), diaFechamento: t("diaFechamento"), observacao: t("observacao"),
  });
  const [cats, setCats] = useState<string[]>(() => t("categoriasPermitidas").split(",").map((x) => x.trim()).filter(Boolean));
  const [pags, setPags] = useState<Pagamento[]>(() => lerJson<Array<{ tipo: string; desconto: number }>>(e?.pagamentosPermitidos, []).map((p) => ({ tipo: p.tipo, desconto: String(p.desconto ?? 0) })));
  const [extras, setExtras] = useState<Extra[]>(() => lerJson<Extra[]>(e?.dadosExtras, []));
  const { aviso, tentar, setAviso } = useAviso();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const salvar = async () => {
    const falta = [["nome", "Nome fantasia"], ["cnpj", f.tipoDocumento === "CPF" ? "CPF" : "CNPJ"], ["numeroContrato", "Número do contrato"], ["bandeira", "Bandeira"]].filter(([k]) => !String(f[k as keyof typeof f]).trim()).map(([, r]) => r);
    if (falta.length) { setAviso({ texto: `Preencha os campos obrigatórios: ${falta.join(", ")}.`, erro: true }); return; }
    const corpo: Record<string, unknown> = {
      ...f, cnpj: soDigitos(f.cnpj), cep: soDigitos(f.cep), categoriasPermitidas: cats.join(", "),
      pagamentosPermitidos: JSON.stringify(pags.filter((p) => p.tipo).map((p) => ({ tipo: p.tipo, desconto: Number(p.desconto.replace(",", ".")) || 0 }))),
      dadosExtras: JSON.stringify(extras.filter((x) => x.chave.trim() || x.valor.trim())),
    };
    for (const k of ["limiteMensal", "desconto", "diaFechamento"]) if (corpo[k] === "") corpo[k] = null;
    if (await tentar(() => (e ? chamar("PUT", `/empresas/${e.id}`, corpo) : chamar("POST", "/empresas", corpo)), "Empresa salva.")) { onSalvo(); onFechar(); }
  };
  const livres = opcoes.pagamentos.filter((p) => !pags.some((x) => x.tipo === p));
  const mascara = f.tipoDocumento === "CPF" ? mascaraCpf : mascaraCnpj;

  return (
    <Janela aberta titulo={e ? "Alterando Empresa" : "Criando Empresa"} sub="Campos com * são obrigatórios." largura="grande" onFechar={onFechar}
      rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void salvar()}>{e ? "Gravar" : "Criar"}</button></>}>
      {aviso}
      <h4 className="cg-secao">Dados da empresa</h4>
      <div className="cg-grade">
        <Campo rotulo="Bandeira *"><select value={f.bandeira} onChange={(x) => set("bandeira", x.target.value)}><option value="">Selecione</option>{[...new Set([...opcoes.bandeiras, f.bandeira].filter(Boolean))].map((b) => <option key={b}>{b}</option>)}</select></Campo>
        <Campo rotulo={`${f.tipoDocumento} *`} dica={e ? undefined : undefined}>
          <div className="cg-duplo"><input value={f.cnpj} inputMode="numeric" onChange={(x) => set("cnpj", mascara(x.target.value))} />
            <button type="button" className="cg-botao" onClick={() => setF({ ...f, tipoDocumento: f.tipoDocumento === "CPF" ? "CNPJ" : "CPF", cnpj: "" })}>Alterar para {f.tipoDocumento === "CPF" ? "CNPJ" : "CPF"}</button></div>
        </Campo>
        <Campo rotulo="Número do contrato *"><input value={f.numeroContrato} onChange={(x) => set("numeroContrato", x.target.value)} /></Campo>
        <Campo rotulo="Razão social"><input value={f.razaoSocial} onChange={(x) => set("razaoSocial", x.target.value)} /></Campo>
        <Campo rotulo="Nome fantasia *"><input value={f.nome} onChange={(x) => set("nome", x.target.value)} /></Campo>
        <Campo rotulo="Responsável"><input value={f.contato} onChange={(x) => set("contato", x.target.value)} /></Campo>
        <Campo rotulo="E-mail do responsável"><input type="email" value={f.email} onChange={(x) => set("email", x.target.value)} /></Campo>
        <Campo rotulo="Telefone"><input value={f.telefone} placeholder="(00) 00000-0000" onChange={(x) => set("telefone", x.target.value)} /></Campo>
      </div>

      <h4 className="cg-secao">Endereço</h4>
      <div className="cg-grade">
        <Campo rotulo="Endereço" className="larga"><input value={f.endereco} onChange={(x) => set("endereco", x.target.value)} /></Campo>
        <Campo rotulo="Número"><input value={f.enderecoNumero} onChange={(x) => set("enderecoNumero", x.target.value)} /></Campo>
        <Campo rotulo="Complemento"><input value={f.complemento} onChange={(x) => set("complemento", x.target.value)} /></Campo>
        <Campo rotulo="UF"><select value={f.uf} onChange={(x) => set("uf", x.target.value)}><option value="">Selecione</option>{opcoes.ufs.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo rotulo="Cidade"><input list="emp-cidades" value={f.cidade} onChange={(x) => set("cidade", x.target.value)} /><datalist id="emp-cidades">{cidades.map((c) => <option key={c} value={c} />)}</datalist></Campo>
        <Campo rotulo="Bairro"><input value={f.bairro} onChange={(x) => set("bairro", x.target.value)} /></Campo>
        <Campo rotulo="CEP"><input value={f.cep} placeholder="00000-000" onChange={(x) => set("cep", mascaraCep(x.target.value))} /></Campo>
      </div>

      <h4 className="cg-secao">Status</h4>
      <div className="cg-grade">
        <Campo rotulo="Última solicitação realizada"><input readOnly value={e?.ultimaSolicitacao ? dataHoraBr(e.ultimaSolicitacao) : ""} /></Campo>
        <Campo rotulo="Situação cadastral"><select value={f.status} onChange={(x) => set("status", x.target.value)}>{SITUACOES.map((s) => <option key={s} value={s}>{ROTULO[s]}</option>)}</select></Campo>
      </div>

      <h4 className="cg-secao">Configurações</h4>
      <Campo rotulo="Permitir especificar motorista ao criar uma nova corrida *"><span /></Campo>
      <div className="cg-caixas" style={{ flexDirection: "row" }}>
        {["Sim", "Não"].map((v) => <label key={v}><input type="radio" name="emp-esp" checked={f.permiteEspecificarMotorista === v} onChange={() => set("permiteEspecificarMotorista", v)} />{v}</label>)}
      </div>
      <Campo rotulo="Lista de categorias" dica="Sem nenhuma, a empresa pode usar todas as categorias."><span /></Campo>
      <div className="cg-caixas">{opcoes.categorias.map((c) => <label key={c}><input type="checkbox" checked={cats.includes(c)} onChange={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])} />{c}</label>)}</div>
      <Campo rotulo="Lista de tipos de pagamento (e desconto de cada um)" dica="Sem nenhum, a empresa pode usar todos os pagamentos."><span /></Campo>
      {pags.map((p, i) => (
        <div key={i} className="cg-duplo" style={{ marginBottom: 6 }}>
          <select value={p.tipo} onChange={(x) => setPags(pags.map((y, j) => (j === i ? { ...y, tipo: x.target.value } : y)))}>{[p.tipo, ...livres].map((o) => <option key={o}>{o}</option>)}</select>
          <input inputMode="decimal" placeholder="Desconto (%)" value={p.desconto} onChange={(x) => setPags(pags.map((y, j) => (j === i ? { ...y, desconto: x.target.value } : y)))} />
          <button type="button" className="cg-icone" aria-label="Remover tipo de pagamento" style={{ flex: "0 0 34px" }} onClick={() => setPags(pags.filter((_, j) => j !== i))}><X size={16} /></button>
        </div>
      ))}
      <p><button type="button" className="cg-botao" disabled={!livres.length} onClick={() => setPags([...pags, { tipo: livres[0], desconto: "0" }])}>+ Adicionar tipo de pagamento</button></p>
      <div className="cg-grade">
        <Campo rotulo="Centros de custo" dica="Separe por vírgula."><input value={f.centrosCusto} onChange={(x) => set("centrosCusto", x.target.value)} /></Campo>
        <Campo rotulo="Limite mensal (R$)"><input inputMode="decimal" value={f.limiteMensal} onChange={(x) => set("limiteMensal", x.target.value)} /></Campo>
        <Campo rotulo="Desconto geral (%)"><input inputMode="decimal" value={f.desconto} onChange={(x) => set("desconto", x.target.value)} /></Campo>
        <Campo rotulo="Dia de fechamento"><input type="number" min={1} max={31} value={f.diaFechamento} onChange={(x) => set("diaFechamento", x.target.value)} /></Campo>
      </div>

      <h4 className="cg-secao">Outras informações</h4>
      <Campo rotulo="Observação para motorista" dica="O motorista vê esta observação nas corridas da empresa."><textarea rows={2} value={f.obsMotorista} onChange={(x) => set("obsMotorista", x.target.value)} /></Campo>
      <Campo rotulo="Observação interna"><textarea rows={2} value={f.observacao} onChange={(x) => set("observacao", x.target.value)} /></Campo>
      <Campo rotulo="Dados extras" dica="Até 10 itens (nome e valor)."><span /></Campo>
      {extras.map((x, i) => (
        <div key={i} className="cg-duplo" style={{ marginBottom: 6 }}>
          <input placeholder="Nome" value={x.chave} onChange={(y) => setExtras(extras.map((z, j) => (j === i ? { ...z, chave: y.target.value } : z)))} />
          <input placeholder="Valor" value={x.valor} onChange={(y) => setExtras(extras.map((z, j) => (j === i ? { ...z, valor: y.target.value } : z)))} />
          <button type="button" className="cg-icone" aria-label="Remover dado extra" style={{ flex: "0 0 34px" }} onClick={() => setExtras(extras.filter((_, j) => j !== i))}><X size={16} /></button>
        </div>
      ))}
      <p><button type="button" className="cg-botao" disabled={extras.length >= 10} onClick={() => setExtras([...extras, { chave: "", valor: "" }])}>+ Adicionar dado extra</button></p>
    </Janela>
  );
}

function Funcionario({ e, onFechar, onSalvo }: { e: Empresa; onFechar: () => void; onSalvo: () => void }) {
  const [tel, setTel] = useState("");
  const { aviso, tentar } = useAviso();
  return (
    <Janela aberta titulo="Adicionar funcionário" sub={String(e.nome)} onFechar={onFechar} largura="pequena" rodape={<button className="cg-botao primario cheio" onClick={() => void tentar(async () => { await chamar("POST", `/empresas/${e.id}/funcionarios`, { telefone: tel }); onSalvo(); onFechar(); }, "Funcionário vinculado.")}>Vincular</button>}>
      {aviso}
      <Campo rotulo="Telefone do passageiro" dica="O passageiro precisa estar cadastrado."><input value={tel} onChange={(x) => setTel(x.target.value)} /></Campo>
    </Janela>
  );
}
