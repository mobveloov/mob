import { useMemo, useState } from "react";
import { Download, Loader2, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { cadastroPorId, type Campo } from "../../comum/cadastros.ts";
import { api, baixar, dinheiro, numero, type Registro } from "../api";
import { useSessao } from "../App";
import { Avisos, Cartao, Gaveta, Titulo, useCarregar } from "../componentes/ui";

const dataBr = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split("-").reverse().join("/") : "");
const telefone = (s: string) => (s.length === 11 ? `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}` : s.length === 10 ? `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}` : s);

/** Valor formatado para a lista. */
export function mostrar(c: Campo | undefined, v: unknown): string {
  if (v == null || v === "") return "—";
  switch (c?.tipo) {
    case "dinheiro": return dinheiro(Number(v));
    case "numero": return numero(Number(v), 2);
    case "data": return dataBr(v);
    case "booleano": return v ? "Sim" : "Não";
    case "telefone": return telefone(String(v));
    case "cpf": return String(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    default: return String(v);
  }
}

const CLASSE_STATUS: Record<string, string> = { Ativo: "ok", Ativa: "ok", Bloqueado: "ruim", "Bloqueio definitivo": "ruim", Suspenso: "alerta", Suspensa: "alerta", "Em vigor": "ruim", Aberta: "alerta", Resolvida: "ok", Devolvido: "ok", Encerrada: "info" };

/** Tela de cadastro: lista com busca, novo, editar, excluir, importar e planilha. Serve para todos os cadastros. */
export default function TelaCadastro({ id }: { id: string }) {
  const cad = cadastroPorId(id)!;
  const { sessao } = useSessao();
  const podeEditar = sessao.usuario.papel !== "operador" || !!cad.operadorEdita;
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Registro | "novo" | null>(null);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [importando, setImportando] = useState(false);
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.registros(id), [id]);
  const campo = (k: string) => cad.campos.find((c) => c.chave === k);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const l = dados?.registros ?? [];
    return b ? l.filter((r) => cad.campos.some((c) => String(r[c.chave] ?? "").toLowerCase().includes(b) || mostrar(c, r[c.chave]).toLowerCase().includes(b))) : l;
  }, [dados, busca, cad]);

  async function importar() {
    setImportando(true); setMsg(null);
    try {
      const r = await api.importarRegistros(id);
      setMsg({ texto: `Importação pronta: ${r.criados} novo(s), ${r.atualizados} atualizado(s).${r.avisos.length ? ` ${r.avisos.join(" ")}` : ""}` });
      recarregar();
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setImportando(false); }
  }
  function planilha() {
    const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const linhas = lista.map((r) => cad.campos.map((c) => esc(mostrar(c, r[c.chave]).replace(/^—$/, ""))).join(";"));
    baixar(`${cad.id}.csv`, "﻿" + [cad.campos.map((c) => c.rotulo).join(";"), ...linhas].join("\n"), "text/csv;charset=utf-8");
  }

  return (
    <>
      <Titulo titulo={cad.nome} sub={cad.descricao}>
        {cad.importa && podeEditar && <button className="botao" onClick={importar} disabled={importando}>{importando ? <Loader2 size={16} className="gira" /> : <RefreshCw size={16} />} Importar</button>}
        <button className="botao" onClick={planilha} disabled={!lista.length}><Download size={16} /> Planilha</button>
        {podeEditar && <button className="botao primario" onClick={() => setAberto("novo")}><Plus size={16} /> Novo {cad.singular}</button>}
      </Titulo>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <Avisos lista={[erro]} />
      <Cartao>
        <div className="linha-filtro">
          <input placeholder={`Buscar ${cad.singular}`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="sub">{lista.length} de {dados?.registros.length ?? 0}</span>
        </div>
      </Cartao>
      <Cartao>
        {carregando && !dados && <p className="vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
        {dados && !lista.length && (
          <p className="vazio">{dados.registros.length ? "Nada encontrado nesta busca." : `Nenhum ${cad.singular} ainda.${podeEditar ? ` Clique em "Novo ${cad.singular}"${cad.importa ? " ou em Importar" : ""}.` : ""}`}</p>
        )}
        {!!lista.length && (
          <div className="tabela-rola">
            <table>
              <thead><tr>{cad.colunas.map((k) => <th key={k} className={["numero", "dinheiro"].includes(campo(k)?.tipo ?? "") ? "num" : ""}>{campo(k)?.rotulo}</th>)}<th></th></tr></thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} onClick={() => setAberto(r)}>
                    {cad.colunas.map((k, i) => {
                      const c = campo(k), v = mostrar(c, r[k]);
                      return <td key={k} className={`${i === 0 ? "forte" : ""} ${["numero", "dinheiro"].includes(c?.tipo ?? "") ? "num" : ""}`}>{c?.tipo === "selecao" && CLASSE_STATUS[String(r[k])] ? <span className={`selo ${CLASSE_STATUS[String(r[k])]}`}>{v}</span> : v}</td>;
                    })}
                    <td><button className="icone" aria-label="Editar" onClick={(e) => { e.stopPropagation(); setAberto(r); }}><Pencil size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
      {aberto && (
        <FormRegistro id={id} registro={aberto === "novo" ? null : aberto} podeEditar={podeEditar}
          onFechar={() => setAberto(null)} onSalvou={(t) => { setAberto(null); setMsg({ texto: t }); recarregar(); }} />
      )}
    </>
  );
}

function FormRegistro({ id, registro, podeEditar, onFechar, onSalvou }: { id: string; registro: Registro | null; podeEditar: boolean; onFechar: () => void; onSalvou: (msg: string) => void }) {
  const cad = cadastroPorId(id)!;
  const inicial = Object.fromEntries(cad.campos.map((c) => [c.chave, registro?.[c.chave] ?? (c.tipo === "booleano" ? (registro ? false : true) : c.tipo === "selecao" && c.obrigatorio ? c.opcoes?.[0] ?? "" : "")]));
  const [v, setV] = useState<Record<string, unknown>>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    try {
      if (registro) await api.salvarRegistro(id, registro.id, v); else await api.criarRegistro(id, v);
      onSalvou(registro ? "Alterações salvas." : `${cad.singular[0].toUpperCase()}${cad.singular.slice(1)} criado.`);
    } catch (x) { setErro(x instanceof Error ? x.message : String(x)); } finally { setSalvando(false); }
  }
  async function excluir() {
    if (!registro || !confirm(`Excluir este ${cad.singular}? Não dá para desfazer.`)) return;
    try { await api.apagarRegistro(id, registro.id); onSalvou("Excluído."); } catch (x) { setErro(x instanceof Error ? x.message : String(x)); }
  }

  const entrada = (c: Campo) => {
    const valor = v[c.chave];
    const ro = c.calculado || !podeEditar;
    const set = (x: unknown) => setV({ ...v, [c.chave]: x });
    if (c.calculado) return <input value={mostrar(c, valor)} readOnly disabled />;
    switch (c.tipo) {
      case "booleano": return <input type="checkbox" checked={!!valor} disabled={ro} onChange={(e) => set(e.target.checked)} />;
      case "selecao": return <select value={String(valor ?? "")} disabled={ro} onChange={(e) => set(e.target.value)}>{!c.obrigatorio && <option value="">—</option>}{c.opcoes?.map((o) => <option key={o}>{o}</option>)}</select>;
      case "textoLongo": return <textarea rows={3} value={String(valor ?? "")} readOnly={ro} onChange={(e) => set(e.target.value)} />;
      case "data": return <input type="date" value={String(valor ?? "").slice(0, 10)} readOnly={ro} onChange={(e) => set(e.target.value)} />;
      case "numero": case "dinheiro": return <input inputMode="decimal" value={valor == null ? "" : String(valor).replace(".", ",")} readOnly={ro} onChange={(e) => set(e.target.value)} />;
      case "email": return <input type="email" value={String(valor ?? "")} readOnly={ro} onChange={(e) => set(e.target.value)} />;
      default: return <input value={c.tipo === "telefone" && valor ? mostrar(c, valor) : String(valor ?? "")} readOnly={ro} onChange={(e) => set(e.target.value)} />;
    }
  };

  return (
    <Gaveta aberta onFechar={onFechar} titulo={registro ? `Editar ${cad.singular}` : `Novo ${cad.singular}`}>
      <form className="form" onSubmit={salvar}>
        {cad.campos.map((c) => (
          <label key={c.chave} className={c.tipo === "booleano" ? "check" : ""}>
            {c.tipo === "booleano" ? <>{entrada(c)} {c.rotulo}</> : <>{c.rotulo}{c.obrigatorio && !c.calculado ? " *" : ""}{entrada(c)}</>}
            {c.dica && <small>{c.dica}</small>}
          </label>
        ))}
        {registro && <p className="sub">Atualizado em {new Date(registro.atualizadoEm).toLocaleString("pt-BR")} por {registro.atualizadoPor}.</p>}
        {erro && <div className="aviso erro">{erro}</div>}
        {podeEditar && (
          <div className="acoes">
            <button className="botao primario" disabled={salvando}>{salvando ? <Loader2 size={16} className="gira" /> : <Save size={16} />} Salvar</button>
            {registro && <button type="button" className="botao" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
          </div>
        )}
      </form>
    </Gaveta>
  );
}
