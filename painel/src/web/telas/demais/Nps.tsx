// Config › Configuração NPS e Avaliações (abas Avaliações, Contestações e Denúncias; passageiro e motorista).

import { useState } from "react";
import { Star } from "lucide-react";
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

export function Avaliacoes() {
  const admin = useAdmin();
  const [papel, setPapel] = useState<Papel>("motorista");
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
        !x ? <Carregando /> : (
          <>
            <div className="dm-kpis">
              <div className="dm-kpi destaque"><small>Média Geral</small><strong>{x.media ?? "—"} <Star size={18} aria-hidden /></strong><small>{x.votos} votos</small></div>
              <div className="dm-kpi"><small>Recusaram Avaliar</small><strong>{x.recusaram}</strong></div>
              <div className="dm-kpi"><small>Detratores Potenciais</small><strong>{x.detratores}</strong></div>
              <div className="dm-kpi"><small>Notas</small><span className="dm-notas">{[5, 4, 3, 2, 1].map((n) => <b key={n}>{n} <Star size={12} aria-hidden /> {x.contagem[n]}</b>)}</span></div>
            </div>
            <div className="dm-cartao tabela-rola"><h3>Últimas 50 Interações</h3><table><thead><tr><th>Usuário</th><th>Telefone</th><th>Status</th><th>Nota</th><th>Data</th></tr></thead><tbody>
              {!x.ultimas.length ? <tr><td colSpan={5} className="vazio">Nenhuma interação ainda.</td></tr> : x.ultimas.map((u: any, i: number) => <tr key={i}><td className="forte">{u.nome}</td><td>{u.telefone || "—"}</td><td><span className={`selo ${u.situacao === "Avaliou" ? "ok" : "alerta"}`}>{u.situacao}</span></td><td>{u.nota ?? "—"}</td><td>{dataBr(u.em)}</td></tr>)}</tbody></table></div>
          </>
        )
      ) : (
        <div className="dm-cartao tabela-rola"><table><thead><tr><th>Data</th><th>OS</th><th>Detalhe</th><th>Passageiro</th><th>Motorista</th><th>Status</th></tr></thead><tbody>
          {!oc.dados ? <tr><td colSpan={6}><Carregando /></td></tr> : !filtradas.length ? <tr><td colSpan={6} className="vazio">{aba === "contestacoes" ? "Nenhuma contestação de taxa." : "Nenhuma denúncia."}</td></tr> : filtradas.map((o) => <tr key={o.id}><td>{dataBr(o.criadoEm)}</td><td>{o.os ?? "—"}</td><td>{o.descricao ?? o.titulo ?? o.assunto ?? "—"}</td><td>{o.passageiro ?? "—"}</td><td>{o.motorista ?? "—"}</td><td>{o.situacao ?? o.status ?? "—"}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}
