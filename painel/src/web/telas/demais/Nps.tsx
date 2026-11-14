// Config › Configuração NPS e Avaliações (abas Avaliações, Contestações e Denúncias; passageiro e motorista).

import { useState } from "react";
import { Download } from "lucide-react";
import { baixar } from "../../api";
import { Abas, Aviso, Cab, Campo, Carregando, Interruptor, dataBr, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

type Papel = "motorista" | "passageiro";
const PapelAbas = ({ valor, onChange }: { valor: Papel; onChange: (p: Papel) => void }) => <Abas abas={[["motorista", "Motoristas"], ["passageiro", "Passageiros"]]} valor={valor} onChange={onChange} />;

// ------------------------------------------------------------------ Configuração NPS

export function ConfigNps() {
  const admin = useAdmin();
  const [papel, setPapel] = useState<Papel>("passageiro");
  const d = useCarregar(() => pedirConfig(`/nps/${papel}`), [papel]);
  const [c, setC] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setC(structuredClone(d.dados.config)); }
  const [etiqueta, setEtiqueta] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setC({ ...c, [k]: v });
  return (
    <>
      <Cab titulo="Configuração NPS" sub="Quando e como o app pergunta a nota do aplicativo.">{admin && <button className="botao" onClick={() => confirm("Quem recusou avaliar voltará a ser perguntado. Continuar?") && salvar(async () => { await pedirConfig(`/nps/${papel}/resetar`, "POST", {}); d.recarregar(); }, "Recusas resetadas.")}>Resetar Recusas</button>}</Cab>
      <PapelAbas valor={papel} onChange={(p) => { setPapel(p); setC(null); setLido(null); }} />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {!c ? <Carregando /> : (
        <section className="dm-cartao dm-secao">
          <h3>Avaliação do App (NPS) · {papel === "motorista" ? "Motoristas" : "Passageiros"}</h3>
          <Interruptor valor={c.ativo} onChange={(v) => set("ativo", v)} rotulo="Perguntar a nota do aplicativo" descricao="Se desligado, o app não mostra a pergunta." desabilitado={!admin} />
          <div className="dm-grade3">
            <Campo rotulo="Perguntar depois de (corridas)"><input type="number" min={1} disabled={!admin} value={c.aposCorridas} onChange={(e) => set("aposCorridas", Number(e.target.value))} /></Campo>
            <Campo rotulo="Perguntar de novo depois de (dias)"><input type="number" min={1} disabled={!admin} value={c.intervaloDias} onChange={(e) => set("intervaloDias", Number(e.target.value))} /></Campo>
            <Campo rotulo="Nota mínima para pedir avaliação na loja"><input type="number" min={1} max={5} disabled={!admin} value={c.notaParaLoja} onChange={(e) => set("notaParaLoja", Number(e.target.value))} /></Campo>
          </div>
          <Campo rotulo="Pergunta mostrada no app"><input disabled={!admin} value={c.pergunta} maxLength={120} onChange={(e) => set("pergunta", e.target.value)} /></Campo>
          <Campo rotulo="Link do app na loja"><input disabled={!admin} value={c.linkLoja} placeholder="https://..." onChange={(e) => set("linkLoja", e.target.value)} /></Campo>
          <h4>Etiquetas de avaliação</h4><p className="sub">Opções que a pessoa marca ao avaliar (ex.: Atendimento, Preço).</p>
          <div className="dm-etiquetas">{c.etiquetas.map((e: string) => <span key={e} className="selo">{e}{admin && <button aria-label={`Remover ${e}`} onClick={() => set("etiquetas", c.etiquetas.filter((x: string) => x !== e))}>×</button>}</span>)}</div>
          {admin && <div className="dm-linha"><input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" maxLength={40} /><button className="botao" onClick={() => { if (etiqueta.trim()) { set("etiquetas", [...c.etiquetas, etiqueta.trim()]); setEtiqueta(""); } }}>Adicionar</button></div>}
          {admin && <div className="dm-salvar"><button className="botao primario" disabled={salvando} onClick={() => salvar(async () => setC((await pedirConfig(`/nps/${papel}`, "PUT", c)).config), "Configuração salva.")}>Salvar</button></div>}
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Avaliações

// ------------------------------------------------------------------ Nota NPS (promotores, neutros e detratores)

const PERIODOS_NPS: Array<[string, string]> = [["TD", "Hoje"], ["LW", "Semana passada"], ["LM", "Mês passado"], ["LS", "Últimos 7 dias"], ["LT", "Últimos 30 dias"], ["CT", "Personalizado"]];
const TIPOS_NPS: Array<[string, string]> = [["T", "Tudo"], ["P", "Promotores"], ["N", "Neutros"], ["D", "Detratores"]];
const FILTRO_NPS = { periodo: "LT", inicio: "", fim: "", tipo: "T", email: "", telefone: "" };
const diaBr = (iso: string) => iso.split("-").reverse().join("/");
const nomeDia = (em: string) => {
  const t = new Date(em).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}, ${em.slice(8, 10)}/${em.slice(5, 7)}/${em.slice(0, 4)}`;
};

function PainelNps({ papel, resumo }: { papel: Papel; resumo?: { media: number | null; recusaram: number } }) {
  const [f, setF] = useState(FILTRO_NPS);
  const [rasc, setRasc] = useState(FILTRO_NPS);
  const [mais, setMais] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [erroEx, setErroEx] = useState<string | null>(null);
  const consulta = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const d = useCarregar(() => pedirConfig(`/nps/${papel}/avaliacoes?${consulta}&pagina=${pagina}`), [papel, consulta, pagina]);
  const x = d.dados;
  const aplicar = () => { setF(rasc); setPagina(1); };
  const limpar = () => { setRasc(FILTRO_NPS); setF(FILTRO_NPS); setPagina(1); };
  async function exportar() {
    setErroEx(null);
    try { const r = await pedirConfig<{ nome: string; csv: string }>(`/nps/${papel}/exportar?${consulta}`); baixar(r.nome, r.csv, "text/csv;charset=utf-8"); }
    catch (e) { setErroEx(e instanceof Error ? e.message : String(e)); }
  }
  // Agrupa a página por dia, como na lista da Machine.
  const dias: Array<[string, any[]]> = [];
  for (const i of x?.lista.itens ?? []) { const k = nomeDia(i.em); const g = dias.find(([n]) => n === k); if (g) g[1].push(i); else dias.push([k, [i]]); }
  const selo = (c: string) => (c === "Promotor" ? "ok" : c === "Neutro" ? "alerta" : "ruim");
  return (
    <>
      <h3 style={{ margin: "4px 0 10px" }}>Net Promoter Score</h3>
      <div className="dm-cartao dm-secao">
        <div className="dm-filtros">
          <Campo rotulo="Período"><select value={rasc.periodo} onChange={(e) => setRasc({ ...rasc, periodo: e.target.value })}>{PERIODOS_NPS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Campo>
          {rasc.periodo === "CT" && <><Campo rotulo="De"><input type="date" value={rasc.inicio} onChange={(e) => setRasc({ ...rasc, inicio: e.target.value })} /></Campo><Campo rotulo="Até"><input type="date" value={rasc.fim} onChange={(e) => setRasc({ ...rasc, fim: e.target.value })} /></Campo></>}
          <Campo rotulo="Tipo"><select value={rasc.tipo} onChange={(e) => setRasc({ ...rasc, tipo: e.target.value })}>{TIPOS_NPS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Campo>
          <button className="botao" type="button" onClick={() => setMais(!mais)} aria-expanded={mais}>Mais filtros</button>
          <button className="botao primario" type="button" onClick={aplicar}>Filtrar</button>
          <button className="botao" type="button" onClick={limpar}>Limpar filtros</button>
          <button className="botao" type="button" onClick={exportar} disabled={!x?.total}><Download size={16} aria-hidden /> Exportar</button>
        </div>
        {mais && (
          <div className="dm-filtros" style={{ marginTop: 10 }}>
            <Campo rotulo="E-mail"><input value={rasc.email} placeholder={papel === "motorista" ? "Buscar motorista" : "Buscar passageiro"} onChange={(e) => setRasc({ ...rasc, email: e.target.value })} /></Campo>
            <Campo rotulo="Telefone"><input value={rasc.telefone} placeholder={papel === "motorista" ? "Buscar motorista" : "Buscar passageiro"} onChange={(e) => setRasc({ ...rasc, telefone: e.target.value })} /></Campo>
          </div>
        )}
        {x && <p className="sub" style={{ margin: "10px 0 0" }}>Filtrando por Período: {diaBr(x.periodo.inicio)} até {diaBr(x.periodo.fim)}{x.tipo !== "T" ? ` · ${TIPOS_NPS.find(([c]) => c === x.tipo)?.[1]}` : ""}</p>}
      </div>
      <Aviso erro={d.erro ?? erroEx} />
      {!x ? <Carregando /> : (
        <>
          <div className="dm-kpis">
            <div className="dm-kpi destaque"><small>Nota NPS</small><strong>{x.nps ?? "—"}</strong><small>{x.media != null ? `Média ${x.media} de 5` : "Sem avaliações no período"}</small></div>
            <div className="dm-kpi"><small>Total avaliações</small><strong>{x.total}</strong></div>
            <div className="dm-kpi"><small>Promotores</small><strong>{x.promotores}</strong></div>
            <div className="dm-kpi"><small>Neutros</small><strong>{x.neutros}</strong></div>
            <div className="dm-kpi"><small>Detratores</small><strong>{x.detratores}</strong></div>
            {resumo && <div className="dm-kpi"><small>Recusaram avaliar</small><strong>{resumo.recusaram}</strong></div>}
          </div>
          <div className="dm-cartao tabela-rola">
            {!dias.length ? <p className="vazio">Nenhuma avaliação neste filtro.</p> : dias.map(([dia, itens]) => (
              <div key={dia}>
                <h4 style={{ margin: "12px 12px 4px" }}>{dia}</h4>
                <table><thead><tr><th>Hora</th><th>{papel === "motorista" ? "Motorista" : "Passageiro"}</th><th>Telefone</th><th>Nota</th><th>Classificação</th></tr></thead><tbody>
                  {itens.map((i, n) => <tr key={`${i.em}-${n}`}><td>{i.em.slice(11, 16)}</td><td className="forte">{i.nome}{i.comentario && <><br /><small className="sub">{i.comentario}</small></>}</td><td>{i.telefone || "—"}</td><td>{i.nota}</td><td><span className={`selo ${selo(i.classe)}`}>{i.classe}</span></td></tr>)}
                </tbody></table>
              </div>
            ))}
            {x.lista.paginas > 1 && (
              <div className="dm-linha" style={{ justifyContent: "space-between", padding: 12 }}>
                <span className="sub">{x.lista.total} avaliações · página {x.lista.pagina} de {x.lista.paginas}</span>
                <span className="dm-linha"><button className="botao" disabled={x.lista.pagina <= 1} onClick={() => setPagina(x.lista.pagina - 1)}>Anterior</button><button className="botao" disabled={x.lista.pagina >= x.lista.paginas} onClick={() => setPagina(x.lista.pagina + 1)}>Próxima</button></span>
              </div>
            )}
          </div>
        </>
      )}
      <section className="dm-cartao dm-secao">
        <h3>O que é NPS?</h3>
        <p>Net Promoter Score é uma métrica que tem como objetivo medir a satisfação e a lealdade dos clientes com a empresa. A nota NPS é a porcentagem de promotores menos a porcentagem de detratores.</p>
        <p className="sub">Aqui as notas vão de 1 a 5: nota 5 é promotor, nota 4 é neutro e notas de 1 a 3 são detratores.</p>
      </section>
    </>
  );
}

export function Avaliacoes() {
  const admin = useAdmin();
  const [papel, setPapel] = useState<Papel>("passageiro");
  const [aba, setAba] = useState<"avaliacoes" | "contestacoes" | "reclamacoes">("avaliacoes");
  const d = useCarregar(() => pedirConfig(`/nps/${papel}`), [papel]);
  const oc = useCarregar(() => fetch("/api/cadastros/ocorrencias", { credentials: "same-origin" }).then((r) => r.json()), []);
  const { msg, salvar } = useSalvar();
  const x = d.dados?.resumo;
  const ocorr: any[] = oc.dados?.registros ?? [];
  const filtradas = ocorr.filter((o) => { const t = `${o.tipo ?? ""} ${o.titulo ?? ""} ${o.assunto ?? ""}`.toLowerCase(); return aba === "contestacoes" ? /conte|taxa/.test(t) : /den|recl|abus/.test(t); });
  return (
    <>
      <Cab titulo="Avaliação do App (NPS)" sub="Feedback nas Lojas">{admin && <button className="botao" onClick={() => confirm("Quem recusou avaliar voltará a ser perguntado. Continuar?") && salvar(async () => { await pedirConfig(`/nps/${papel}/resetar`, "POST", {}); d.recarregar(); }, "Recusas resetadas.")}>Resetar Recusas</button>}</Cab>
      <Abas abas={[["avaliacoes", "Avaliações"], ["contestacoes", "Contestações"], ["reclamacoes", "Denúncias"]]} valor={aba} onChange={setAba} />
      <PapelAbas valor={papel} onChange={setPapel} />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {aba === "avaliacoes" ? (
        <PainelNps papel={papel} resumo={x} />
      ) : (
        <div className="dm-cartao tabela-rola"><table><thead><tr><th>Data</th><th>OS</th><th>Detalhe</th><th>Passageiro</th><th>Motorista</th><th>Status</th></tr></thead><tbody>
          {!oc.dados ? <tr><td colSpan={6}><Carregando /></td></tr> : !filtradas.length ? <tr><td colSpan={6} className="vazio">{aba === "contestacoes" ? "Nenhuma contestação de taxa." : "Nenhuma denúncia."}</td></tr> : filtradas.map((o) => <tr key={o.id}><td>{dataBr(o.criadoEm)}</td><td>{o.os ?? "—"}</td><td>{o.descricao ?? o.titulo ?? o.assunto ?? "—"}</td><td>{o.passageiro ?? "—"}</td><td>{o.motorista ?? "—"}</td><td>{o.situacao ?? o.status ?? "—"}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
