// Config › Termos de Uso App, Ajuda › Jurídico & Leis e Ajuda › Central de Ajuda.

import { useState } from "react";
import { Play, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Abas, Aviso, Cab, Campo, Carregando, Modal, dataHoraBr, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

// ------------------------------------------------------------------ Termos de Uso (edição, no formato da Machine)

type AbaTermo = "passageiro" | "motorista" | "empresa" | "privacidade";
const TERMOS: Record<"passageiro" | "motorista" | "empresa", { aba: string; modo: string; texto: string; app: string; opcoes: Array<[string, string]> }> = {
  passageiro: { aba: "Aplicativo passageiro", modo: "modoPassageiro", texto: "passageiro", app: "do app passageiro", opcoes: [["nenhum", "Não mostrar Termos de Uso no aplicativo passageiro"], ["padrao", "Usar o termo de uso padrão"], ["proprio", "Enviar Termos de Uso"]] },
  motorista: { aba: "Aplicativo motorista", modo: "modoMotorista", texto: "motorista", app: "do app motorista", opcoes: [["nenhum", "Não mostrar Termos de Uso no aplicativo motorista"], ["proprio", "Enviar Termos de Uso"]] },
  empresa: { aba: "Empresa parceira", modo: "modoEmpresa", texto: "empresa", app: "para as empresas parceiras", opcoes: [["nenhum", "Não mostrar Termos de Uso para as empresas parceiras"], ["proprio", "Enviar Termos de Uso"]] },
};

export function TermosApp() {
  const admin = useAdmin();
  const [aba, setAba] = useState<AbaTermo>("passageiro");
  const d = useCarregar(() => pedirConfig("/termos"), []);
  const [t, setT] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setT(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!t) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const abas: Array<[AbaTermo, string]> = [["passageiro", "Aplicativo passageiro"], ["motorista", "Aplicativo motorista"], ["empresa", "Empresa parceira"], ["privacidade", "Política de privacidade"]];
  const gravar = () => salvar(async () => { setT(await pedirConfig("/termos", "PUT", t)); }, "Mudanças salvas.");
  const lerArquivo = (f: File | undefined, campo: string) => {
    if (!f) return;
    if (f.size > 200_000 || !/\.(txt|md|html?)$/i.test(f.name)) { alert("Envie um arquivo de texto (.txt, .md ou .html) de até 200 KB."); return; }
    const l = new FileReader();
    l.onload = () => setT((x: any) => ({ ...x, [campo]: String(l.result).replace(/<\/?script/gi, "") }));
    l.readAsText(f);
  };
  const info = aba === "privacidade" ? null : TERMOS[aba];
  const modo: string = info ? t[info.modo] : "proprio";
  const campoTexto = info ? info.texto : "privacidade";
  const mostrar = !info ? t.privacidade : modo === "padrao" ? t.padraoPassageiro : modo === "proprio" ? t[campoTexto] : "";
  return (
    <>
      <Cab titulo="Termos de uso" sub={`Versão ${t.versao}${t.atualizadoEm ? ` · atualizado em ${dataHoraBr(t.atualizadoEm)}` : ""}.`} />
      <Abas abas={abas} valor={aba} onChange={setAba} />
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao">
        {info && (
          <>
            <h3>Configuração de Termos de Uso</h3>
            <p className="sub">{aba === "passageiro" ? "Defina se deseja usar o texto padrão para os termos de uso do app passageiro ou se prefere personalizar o seu termo." : aba === "motorista" ? "Defina se deseja usar o texto padrão para os termos de uso do app motorista ou se prefere personalizar o seu termo." : "Defina se deseja mostrar os Termos de Uso para as empresas parceiras."}</p>
            <div className="dm-radios dm-radios-col">{info.opcoes.map(([v, n]) => <label key={v}><input type="radio" name={`modo-${aba}`} disabled={!admin} checked={modo === v} onChange={() => setT({ ...t, [info.modo]: v })} /> {n}</label>)}</div>
          </>
        )}
        {(modo !== "nenhum" || !info) && (
          <>
            <h3>Seus Termos de Uso</h3>
            {modo === "padrao" ? <div className="dm-documento">{mostrar.split("\n").map((l: string, i: number) => (/^\d+\.\s/.test(l) ? <h3 key={i}>{l}</h3> : l.trim() ? <p key={i}>{l}</p> : null))}</div> : (
              <>
                {admin && info && <label className="botao">Enviar arquivo de texto<input type="file" hidden accept=".txt,.md,.html,.htm,text/plain" onChange={(e) => lerArquivo(e.target.files?.[0], campoTexto)} /></label>}
                <textarea className="dm-termo" rows={20} aria-label="Texto dos termos" value={mostrar} disabled={!admin} onChange={(e) => setT({ ...t, [campoTexto]: e.target.value })} />
                <small>{mostrar.length} caracteres. Cada linha em branco separa os itens; títulos começam com número (1. Aceite).</small>
              </>
            )}
          </>
        )}
      </section>
      {admin ? <div className="dm-salvar"><button className="botao" onClick={() => setT(structuredClone(d.dados))}>Voltar</button><button className="botao primario" disabled={salvando} onClick={gravar}>Salvar mudanças</button></div> : <p className="sub">Só o administrador altera os termos.</p>}
    </>
  );
}

// ------------------------------------------------------------------ Jurídico & Leis

const Documento = ({ texto }: { texto: string }) => <div className="dm-documento">{texto.split("\n").map((l, i) => (/^\d+\.\s/.test(l) ? <h3 key={i}>{l}</h3> : l.trim() ? <p key={i}>{l}</p> : null))}</div>;

export function Juridico() {
  const [aba, setAba] = useState<"termos" | "privacidade">("termos");
  const d = useCarregar(() => pedirConfig("/termos"), []);
  return (
    <>
      <Cab titulo="Conformidade e Leis" sub="Termos e Privacidade"><button className="botao" onClick={() => window.print()}><Printer size={14} /> Imprimir</button></Cab>
      <Abas abas={[["termos", "Termos de Uso"], ["privacidade", "Privacidade"]]} valor={aba} onChange={setAba} />
      <Aviso erro={d.erro} />
      {!d.dados ? <Carregando /> : aba === "termos" ? (
        <section className="dm-cartao"><h2>Termos de Uso <span className="selo">Documento Oficial</span></h2><h4>Passageiros</h4><Documento texto={d.dados.passageiro} /><h4>Motoristas</h4><Documento texto={d.dados.motorista} /></section>
      ) : <section className="dm-cartao"><h2>Política de Privacidade <span className="selo">Tratamento de Dados</span></h2><Documento texto={d.dados.privacidade} /></section>}
    </>
  );
}

// ------------------------------------------------------------------ Central de Ajuda

type Aba = "videos" | "faq" | "contato";
const urlVideo = (t: any) => (t.origem === "youtube" ? `https://www.youtube-nocookie.com/embed/${t.codigo}` : t.origem === "loom" ? `https://www.loom.com/embed/${t.codigo}` : t.codigo);

export function CentralAjuda() {
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("videos");
  const [busca, setBusca] = useState("");
  const d = useCarregar(() => pedirConfig("/ajuda"), []);
  const [player, setPlayer] = useState<any>(null);
  const [novo, setNovo] = useState<null | "video" | "duvida">(null);
  const { msg, salvar } = useSalvar();
  const a = d.dados;
  const q = busca.trim().toLowerCase();
  const gravar = (parte: Record<string, unknown>, ok: string) => salvar(async () => { await pedirConfig("/ajuda", "PUT", { ...a, ...parte }); d.recarregar(); }, ok);
  const videos = (a?.tutoriais ?? []).filter((t: any) => !q || `${t.titulo} ${t.descricao}`.toLowerCase().includes(q));
  const duvidas = (a?.duvidas ?? []).filter((x: any) => !q || `${x.pergunta} ${x.resposta}`.toLowerCase().includes(q));
  return (
    <>
      <Cab titulo="Como podemos te ajudar hoje?" sub="Digite abaixo para buscar em nossos tutoriais e na central de dúvidas frequentes." />
      <label className="dm-busca grande"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar vídeos ou dúvidas..." aria-label="Buscar na central de ajuda" /></label>
      <Abas abas={[["videos", "Tutoriais"], ["faq", "Dúvidas Frequentes"], ["contato", "Falar com Matriz"]]} valor={aba} onChange={setAba} />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {!a ? <Carregando /> : aba === "videos" ? (
        <>
          <div className="dm-linha dm-entre"><h2>Vídeos de Treinamento</h2>{admin && <button className="botao" onClick={() => setNovo("video")}><Plus size={14} /> Novo tutorial</button>}</div>
          {!videos.length ? <p className="vazio">{a.tutoriais.length ? "Nenhum tutorial encontrado." : "Nenhum tutorial cadastrado ainda."}</p> : (
            <div className="dm-videos">{videos.map((t: any) => (
              <article key={t.id} className="dm-cartao dm-video"><span className="selo">{t.origem === "youtube" ? "YouTube" : t.origem === "loom" ? "Loom" : "Link"}</span><h3>{t.titulo}</h3><p>{t.descricao}</p>
                <div className="dm-linha"><button className="botao primario" onClick={() => setPlayer(t)}><Play size={14} /> Assistir</button>{admin && <button className="icone" aria-label={`Remover ${t.titulo}`} onClick={() => confirm(`Remover o tutorial "${t.titulo}"?`) && gravar({ tutoriais: a.tutoriais.filter((x: any) => x.id !== t.id) }, "Tutorial removido.")}><Trash2 size={14} /></button>}</div></article>
            ))}</div>
          )}
        </>
      ) : aba === "faq" ? (
        <>
          <div className="dm-linha dm-entre"><h2>Dúvidas Frequentes</h2>{admin && <button className="botao" onClick={() => setNovo("duvida")}><Plus size={14} /> Nova dúvida</button>}</div>
          {!duvidas.length ? <p className="vazio">Nenhuma dúvida encontrada.</p> : duvidas.map((x: any) => <details key={x.id} className="dm-cartao dm-faq"><summary>{x.pergunta}</summary><p>{x.resposta}</p>{admin && <button className="botao" onClick={() => confirm("Remover esta dúvida?") && gravar({ duvidas: a.duvidas.filter((y: any) => y.id !== x.id) }, "Dúvida removida.")}>Remover</button>}</details>)}
        </>
      ) : <Contato a={a} admin={admin} gravar={gravar} />}
      <Modal aberto={!!player} onFechar={() => setPlayer(null)} titulo={player?.titulo ?? ""} larga>
        {player && (player.origem === "link" ? <p><a href={player.codigo} target="_blank" rel="noopener noreferrer">Abrir o vídeo</a></p> : <div className="dm-player"><iframe title={player.titulo} src={urlVideo(player)} allow="fullscreen; picture-in-picture" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" /></div>)}
      </Modal>
      <NovoItem tipo={novo} onFechar={() => setNovo(null)} onAdd={async (item) => { await gravar(novo === "video" ? { tutoriais: [...a.tutoriais, item] } : { duvidas: [...a.duvidas, item] }, "Adicionado."); setNovo(null); }} />
    </>
  );
}

function Contato({ a, admin, gravar }: { a: any; admin: boolean; gravar: (p: Record<string, unknown>, ok: string) => Promise<unknown> }) {
  const [c, setC] = useState(a.contato);
  const zap = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/\D/g, "")}` : "";
  return (
    <section className="dm-cartao dm-secao">
      <h2>Falar com a Matriz</h2>
      <div className="dm-grade3">
        <Campo rotulo="Nome do contato"><input value={c.nome} disabled={!admin} onChange={(e) => setC({ ...c, nome: e.target.value })} /></Campo>
        <Campo rotulo="WhatsApp"><input value={c.whatsapp} disabled={!admin} onChange={(e) => setC({ ...c, whatsapp: e.target.value })} placeholder="5511999999999" /></Campo>
        <Campo rotulo="E-mail"><input value={c.email} disabled={!admin} onChange={(e) => setC({ ...c, email: e.target.value })} /></Campo>
      </div>
      <div className="dm-linha">{admin && <button className="botao primario" onClick={() => gravar({ contato: c }, "Contato salvo.")}>Salvar</button>}{zap && <a className="botao" href={zap} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>}{c.email && <a className="botao" href={`mailto:${c.email}`}>Enviar e-mail</a>}</div>
    </section>
  );
}

function NovoItem({ tipo, onFechar, onAdd }: { tipo: null | "video" | "duvida"; onFechar: () => void; onAdd: (i: unknown) => void }) {
  const [f, setF] = useState({ titulo: "", descricao: "", origem: "youtube", codigo: "", pergunta: "", resposta: "" });
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <Modal aberto={!!tipo} onFechar={onFechar} titulo={tipo === "video" ? "Novo tutorial" : "Nova dúvida"}>
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); onAdd(tipo === "video" ? { titulo: f.titulo, descricao: f.descricao, origem: f.origem, codigo: f.codigo } : { pergunta: f.pergunta, resposta: f.resposta }); }}>
        {tipo === "video" ? (
          <>
            <Campo rotulo="Título"><input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} required maxLength={120} /></Campo>
            <Campo rotulo="Descrição"><textarea value={f.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} maxLength={600} /></Campo>
            <Campo rotulo="Onde está o vídeo?"><select value={f.origem} onChange={(e) => set("origem", e.target.value)}><option value="youtube">YouTube</option><option value="loom">Loom</option><option value="link">Outro link</option></select></Campo>
            <Campo rotulo="Link do vídeo" dica="Cole o endereço do vídeo."><input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} required /></Campo>
          </>
        ) : (
          <>
            <Campo rotulo="Pergunta"><input value={f.pergunta} onChange={(e) => set("pergunta", e.target.value)} required maxLength={160} /></Campo>
            <Campo rotulo="Resposta"><textarea value={f.resposta} onChange={(e) => set("resposta", e.target.value)} rows={5} required maxLength={1500} /></Campo>
          </>
        )}
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario">Adicionar</button></div>
      </form>
    </Modal>
  );
}
