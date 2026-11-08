import { useState, type CSSProperties } from "react";
import { Download, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { FONTES, TIPOS_ARQUIVO, variaveisTema, type Marca, type TipoArquivo } from "../../comum/marca.ts";
import { api, urlImagem } from "../api";
import { useSessao } from "../App";
import { Cartao, Titulo } from "../componentes/ui";

const ROTULO_ARQ: Record<TipoArquivo, string> = { logoClaro: "Logo (fundo claro)", logoEscuro: "Logo (fundo escuro)", favicon: "Ícone da aba (favicon)", iconeApp: "Ícone do app (512×512)", abertura: "Tela de abertura do app" };

/** Marca e aparência: cada empresa coloca a sua marca, com pré-visualização ao vivo. Nada disso fica no código. */
export default function MarcaAparencia() {
  const { sessao, marca, setMarca } = useSessao();
  const [m, setM] = useState<Marca>(marca);
  const [escuroPrevia, setEscuroPrevia] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const empresaId = sessao.empresa.id;
  const mudou = JSON.stringify(m) !== JSON.stringify(marca);

  const set = <K extends keyof Marca>(k: K, v: Marca[K]) => setM({ ...m, [k]: v });
  const txt = (rotulo: string, valor: string, onChange: (v: string) => void, dica?: string) => (
    <label>{rotulo}<input value={valor} onChange={(e) => onChange(e.target.value)} />{dica && <small>{dica}</small>}</label>
  );

  async function salvar() {
    setSalvando(true); setMsg(null);
    try { const r = await api.salvarMarca(m); setM(r.marca); setMarca(r.marca); setMsg({ texto: "Marca salva. O painel já está com a nova aparência." }); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setSalvando(false); }
  }
  async function enviar(tipo: TipoArquivo, arq?: File) {
    if (!arq) return;
    try { const r = await api.enviarImagem(tipo, arq); setM({ ...m, arquivos: r.marca.arquivos }); setMarca({ ...marca, arquivos: r.marca.arquivos }); setMsg({ texto: "Imagem enviada." }); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  }
  async function apagar(tipo: TipoArquivo) {
    const r = await api.apagarImagem(tipo);
    setM({ ...m, arquivos: r.marca.arquivos }); setMarca({ ...marca, arquivos: r.marca.arquivos });
  }

  const vars = variaveisTema(m, escuroPrevia) as unknown as CSSProperties;
  const logoPrevia = escuroPrevia ? m.arquivos.logoEscuro || m.arquivos.logoClaro : m.arquivos.logoClaro;

  return (
    <>
      <Titulo titulo="Marca e aparência" sub="Nome, logo, cores, fonte e textos da sua empresa. Vale para o painel, o relatório, a IA e o app.">
        <a className="botao" href="/api/marca/brand.json" download><Download size={16} /> brand.json (para o app)</a>
        <button className="botao primario" onClick={salvar} disabled={salvando || !mudou}><Save size={16} /> {mudou ? "Salvar" : "Salvo"}</button>
      </Titulo>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}

      <div className="marca-grade">
        <div>
          <Cartao titulo="Nomes">
            <div className="form">
              {txt("Nome do produto", m.produto, (v) => set("produto", v), "Aparece no topo, na aba do navegador e no relatório.")}
              {txt("Nome da empresa nos textos", m.nomeExibido, (v) => set("nomeExibido", v))}
              {txt("Nome do assistente de IA", m.assistente.nome, (v) => set("assistente", { ...m.assistente, nome: v }))}
              {txt("Tom do assistente", m.assistente.tom, (v) => set("assistente", { ...m.assistente, tom: v }), "Ex.: direto e cordial; formal; descontraído.")}
              {txt("Saudação", m.textos.saudacao, (v) => set("textos", { ...m.textos, saudacao: v }))}
            </div>
          </Cartao>
          <Cartao titulo="Cores, fonte e tema">
            <div className="form cores">
              {(["primaria", "secundaria", "fundo", "texto"] as const).map((k) => (
                <label key={k}>{{ primaria: "Primária (botões)", secundaria: "Secundária (menu)", fundo: "Fundo", texto: "Texto" }[k]}
                  <span className="cor"><input type="color" value={m.cores[k]} onChange={(e) => set("cores", { ...m.cores, [k]: e.target.value })} /><code>{m.cores[k]}</code></span>
                </label>
              ))}
              <label>Fonte<select value={m.fonte} onChange={(e) => set("fonte", e.target.value)}>{FONTES.map((f) => <option key={f}>{f}</option>)}</select></label>
              <label>Tema padrão<select value={m.tema} onChange={(e) => set("tema", e.target.value as Marca["tema"])}><option value="sistema">Seguir o aparelho</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select></label>
            </div>
          </Cartao>
          <Cartao titulo="Imagens">
            <div className="imagens">
              {TIPOS_ARQUIVO.map((t) => (
                <div key={t} className="imagem">
                  <span>{ROTULO_ARQ[t]}</span>
                  <div className={`miniatura ${t === "logoEscuro" ? "escura" : ""}`}>{m.arquivos[t] ? <img src={urlImagem(empresaId, m.arquivos[t])} alt="" /> : <small>sem imagem</small>}</div>
                  <div className="acoes">
                    <label className="botao"><Upload size={14} /> Enviar<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" onChange={(e) => enviar(t, e.target.files?.[0])} /></label>
                    {m.arquivos[t] && <button className="icone" onClick={() => apagar(t)} aria-label="Remover"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
            </div>
            <p className="sub">PNG, JPG, WEBP, SVG ou ICO, até 2 MB. As imagens são salvas na hora.</p>
          </Cartao>
          <Cartao titulo="Contato, domínio e relatório">
            <div className="form">
              {txt("E-mail de suporte", m.textos.suporteEmail, (v) => set("textos", { ...m.textos, suporteEmail: v }))}
              {txt("Telefone de suporte", m.textos.suporteTelefone, (v) => set("textos", { ...m.textos, suporteTelefone: v }))}
              {txt("Rodapé do relatório", m.textos.rodapeRelatorio, (v) => set("textos", { ...m.textos, rodapeRelatorio: v }))}
              {txt("Domínios próprios (separe por vírgula)", m.dominios.join(", "), (v) => set("dominios", v.split(",").map((x) => x.trim()).filter(Boolean)), "Ex.: painel.suaempresa.com.br. Aponte o DNS para o servidor do painel.")}
              <label className="check"><input type="checkbox" checked={m.mostrarOrigem} onChange={(e) => set("mostrarOrigem", e.target.checked)} /> Mostrar a etiqueta de origem nas corridas</label>
            </div>
          </Cartao>
          <Cartao titulo="App do celular">
            <div className="form">
              {txt("Nome do app", m.app.nome, (v) => set("app", { ...m.app, nome: v }))}
              {txt("Identificador do pacote", m.app.pacote, (v) => set("app", { ...m.app, pacote: v }), "Ex.: br.com.suaempresa.painel (não mude depois de publicar).")}
              {txt("Endereço do painel", m.app.urlPainel, (v) => set("app", { ...m.app, urlPainel: v }), "Ex.: https://painel.suaempresa.com.br")}
            </div>
            <p className="sub">Para gerar o APK, baixe o brand.json e siga docs/MARCA_E_WHITELABEL.md.</p>
          </Cartao>
        </div>

        <div className="previa-marca-col">
          <div className="previa-topo"><strong>Pré-visualização</strong>
            <label className="interruptor"><input type="checkbox" checked={escuroPrevia} onChange={(e) => setEscuroPrevia(e.target.checked)} /> Escuro</label>
          </div>
          <div className="previa-marca" style={{ ...vars, fontFamily: "var(--fonte)" }}>
            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(m.fonte).replace(/%20/g, "+")}:wght@400;600;800&display=swap`} />
            <div className="pm-menu">
              {logoPrevia ? <img src={urlImagem(empresaId, logoPrevia)} alt="" /> : <strong>{m.produto}</strong>}
              <span className="ativo">Consultar corridas</span><span>Painel</span><span>Motoristas</span>
            </div>
            <div className="pm-corpo">
              <small>{m.textos.saudacao}</small>
              <h3>Consultar corridas</h3>
              <div className="pm-kpis"><div><small>Total</small><b>128</b></div><div><small>Finalizadas</small><b>87%</b></div></div>
              <div className="pm-ia"><Sparkles size={14} /> <b>{m.assistente.nome}</b> já está lendo esta consulta.</div>
              <button>Exportar relatório</button>
            </div>
          </div>
          <p className="sub">O relatório exportado usa o mesmo logo, cor primária e fonte.</p>
        </div>
      </div>
    </>
  );
}
