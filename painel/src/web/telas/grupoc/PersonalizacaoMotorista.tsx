// Config › Personalização app motorista (item nosso, fora da Machine): mesmo jeito da do passageiro. Menu lateral, formulário
// (nome, cor principal, tema, veículo no mapa, logo no topo, estilo da tela, recursos da tela do mapa) e a pré-visualização do
// celular do motorista, que muda ao vivo enquanto se edita.

import { useRef, useState } from "react";
import { Bell, Car, ChevronRight, Eye, Hand, HelpCircle, LayoutGrid, Lock, LocateFixed, Menu as MenuIcone, Moon, Palette, Play, SlidersHorizontal, Sparkles, Sun, TriangleAlert, Type, Wallet, Contrast, Map as MapaIcone } from "lucide-react";
import { iconeCarroUrl, type VeiculoMapa } from "../../../comum/icone-carro";
import { Aviso, Cab, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { CartoesVeiculo, corClara, EnvioImagem, GradeCores, Item, MiniEstilo, PaginaPers, problemaDaImagem, type SecaoMenu } from "./PersonalizacaoPecas";

const TEMAS: Array<[string, string, string]> = [["claro", "Claro", "Fundos claros"], ["escuro", "Escuro", "Fundos escuros, melhor à noite"], ["sistema", "Automático", "Segue o aparelho do motorista"]];
const ESTILOS: Array<[string, string, string]> = [["flutuante", "Flutuante", "Botões flutuantes sobre o mapa"], ["neutro", "Neutro", "Barra do topo na cor do tema"], ["marcante", "Marcante", "Barra do topo na cor principal"]];
const RECURSOS: Record<string, { nome: string; desc: string; fixo?: string }> = {
  saldo: { nome: "Saldo do dia", desc: "Mostra os ganhos de hoje no topo do mapa" },
  notificacoes: { nome: "Notificações", desc: "Sino com os avisos da central" },
  ajuda: { nome: "Botão de ajuda", desc: "Botão de alerta para pedir ajuda à central (também depende de Configurações > Gerais)" },
  tema: { nome: "Botão de aparência", desc: "Deixa o motorista trocar entre claro, escuro e automático" },
  centralizar: { nome: "Botão de centralizar", desc: "Volta o mapa para a posição do motorista" },
  preferencias: { nome: "Preferências de corrida", desc: "Botão que aparece com o motorista online" },
  macaneta: { nome: "Maçaneta", desc: "Atalho que aparece com o motorista online" },
  iniciar: { nome: "Botão Iniciar", desc: "Liga e desliga o recebimento de viagens", fixo: "O botão Iniciar não pode ser ocultado." },
  rodape: { nome: "Rodapé Mapa e Corridas", desc: "Barra de baixo para trocar entre o mapa e as corridas", fixo: "O rodapé não pode ser ocultado." },
};
import { MENU_ABERTURA, SecaoAberturaPremium } from "./AberturaPremium";
import type { ComandosAba } from "./BandeiraAbas";
const MENU: SecaoMenu[] = [
  { titulo: "Geral", itens: [{ id: "nome", rotulo: "Nome", icone: <Type size={16} /> }, { id: "cor-principal", rotulo: "Cor principal", icone: <Palette size={16} /> }, { id: "tema", rotulo: "Tema", icone: <Contrast size={16} /> }, { id: "veiculo-no-mapa", rotulo: "Veículo no mapa", icone: <Car size={16} /> }] },
  { titulo: "Tela do mapa", itens: [{ id: "sua-marca", rotulo: "Logo no topo", icone: <Sparkles size={16} /> }, { id: "estilo-de-tela", rotulo: "Estilo da tela", icone: <LayoutGrid size={16} /> }, { id: "recursos", rotulo: "Recursos", icone: <SlidersHorizontal size={16} /> }] },
];
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "UP";

export function PersonalizacaoMotorista() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/personalizacao-motorista"), []);
  const [p, setP] = useState<any>(null), [lido, setLido] = useState<unknown>(null), [salvo, setSalvo] = useState<any>(null);
  const [erroNome, setErroNome] = useState(false), [enviando, setEnviando] = useState(false), [online, setOnline] = useState(false);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setSalvo(d.dados); setP(structuredClone(d.dados)); }
  const { msg, salvando, salvar, setMsg } = useSalvar();
  const premium = useRef<ComandosAba | null>(null); // Recursos Premium: gravam e voltam junto com a personalização
  if (!p) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v }));
  const rec = (id: string) => !!p.recursos.find((r: any) => r.id === id)?.visivel;
  const enviarImagem = async (f: File | undefined) => {
    if (!f) return;
    const erro = problemaDaImagem(f);
    if (erro) { setMsg({ erro }); return; }
    setEnviando(true); setMsg(null);
    try { const r = await pedirConfig("/personalizacao-motorista/imagem", "POST", f); setP((x: any) => ({ ...x, imagemMarca: r.imagemMarca, imagemMarcaUrl: r.imagemMarcaUrl })); }
    catch (e) { setMsg({ erro: (e as Error).message }); } finally { setEnviando(false); }
  };
  const excluirImagem = async () => {
    try { const r = await pedirConfig("/personalizacao-motorista/imagem", "DELETE"); setP((x: any) => ({ ...x, imagemMarca: "", imagemMarcaUrl: "", marca: r.marca })); } catch (e) { setMsg({ erro: (e as Error).message }); }
  };
  const gravar = () => {
    if (!p.nome.trim()) { setErroNome(true); document.getElementById("nome")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (p.marca === "imagem" && !p.imagemMarcaUrl) { setMsg({ erro: "Envie uma imagem para salvar as alterações." }); return; }
    setErroNome(false);
    void salvar(async () => { const r = await pedirConfig("/personalizacao-motorista", "PUT", p); setSalvo(r); setP(structuredClone(r)); await premium.current?.gravar(); }, "Alterações salvas.");
  };

  const escuro = p.tema !== "claro"; // Automático aparece escuro (o aparelho em modo escuro)
  const sobre = corClara(p.corPrincipal) ? "#111827" : "#ffffff";
  const logo = (
    <span className="pm-logo">{p.marca === "imagem" && p.imagemMarcaUrl ? <img src={p.imagemMarcaUrl} alt="" /> : <b>{iniciais(p.nome)}</b>}</span>
  );
  const previa = (
    <>
      <div className="pm-modo" role="group" aria-label="Estado do motorista">
        <button type="button" className={!online ? "sel" : ""} onClick={() => setOnline(false)}>Offline</button>
        <button type="button" className={online ? "sel" : ""} onClick={() => setOnline(true)}>Online</button>
      </div>
      <div className="pe-celular">
        <div className={`pm-tela ${escuro ? "escuro" : "claro"} ${p.estiloTela}`} style={{ ["--pe-cor" as string]: p.corPrincipal, ["--pe-sobre" as string]: sobre }}>
          <div className="pm-mapa">
            <img className="pe-carro c1" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "livre")} alt="" />
            <img className="pe-carro c2" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "ocupado")} alt="" />
          </div>
          <div className="pm-topo">
            <span className="pm-pilula">{logo}<MenuIcone size={18} /></span>
            {rec("saldo") && <span className="pm-pilula saldo"><Eye size={14} /> <b>R$ 0,00</b> <ChevronRight size={12} /></span>}
            {rec("notificacoes") && <span className="pm-botao"><Bell size={16} /></span>}
          </div>
          {rec("ajuda") && <span className="pm-botao alerta"><TriangleAlert size={18} /></span>}
          <div className="pm-direita">
            {online && rec("preferencias") && <span className="pm-botao"><SlidersHorizontal size={16} /></span>}
            {rec("tema") && <span className="pm-botao">{escuro ? <Moon size={16} /> : <Sun size={16} />}</span>}
            {rec("centralizar") && <span className="pm-botao"><LocateFixed size={16} /></span>}
          </div>
          {online && rec("macaneta") && <span className="pm-maca"><Hand size={14} /> Maçaneta</span>}
          {!online && <span className="pm-iniciar">INICIAR</span>}
          <div className="pm-folha">
            <span className="pe-alca" />
            <p>{online ? "Você está online" : "Toque em INICIAR para receber viagens"}</p>
            {rec("rodape") && <div className="pm-rodape"><span className="ativo"><MapaIcone size={16} />Mapa</span><b>{online ? "Procurando" : "Você está offline"}</b><span><Car size={16} />Corridas</span></div>}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Cab titulo="Personalização app motorista" />
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <PaginaPers secoes={[...MENU, MENU_ABERTURA]} previa={previa}>
        <section className="dm-cartao" id="geral">
          <h2>Geral</h2>
          <Item id="nome" titulo="Nome" desc="Insira o nome que você deseja exibir para os seus motoristas.">
            <input value={p.nome} disabled={!admin} maxLength={60} placeholder="Nome exemplo" className={erroNome ? "erro" : ""} onChange={(e) => { set("nome", e.target.value); if (e.target.value.trim()) setErroNome(false); }} />
            {erroNome && <small className="pe-erro">Insira um nome</small>}
          </Item>
          <Item id="cor-principal" titulo="Cor principal" desc="Escolha a cor principal que será refletida em todo o aplicativo do motorista."><GradeCores valor={p.corPrincipal} onChange={(c) => set("corPrincipal", c)} admin={admin} /></Item>
          <Item id="tema" titulo="Tema" desc="Escolha o tema que o aplicativo usa quando o motorista ainda não escolheu o dele.">
            <div className="pe-cartoes" role="radiogroup" aria-label="Tema">
              {TEMAS.map(([v, n, d2]) => (
                <button key={v} type="button" role="radio" aria-checked={p.tema === v} disabled={!admin} className={`pe-opcao ${p.tema === v ? "sel" : ""}`} onClick={() => set("tema", v)}>
                  <span className={`pm-amostra ${v}`} aria-hidden>{v === "claro" ? <Sun size={18} /> : v === "escuro" ? <Moon size={18} /> : <Contrast size={18} />}</span><strong>{n}</strong><small>{d2}</small>
                </button>
              ))}
            </div>
          </Item>
          <Item id="veiculo-no-mapa" titulo="Veículo no mapa" desc="Escolha qual estilo de veículo representará os motoristas no mapa."><CartoesVeiculo valor={p.veiculoMapa} onChange={(v) => set("veiculoMapa", v)} admin={admin} /></Item>
        </section>

        <section className="dm-cartao" id="tela-do-mapa">
          <h2>Tela do mapa</h2>
          <Item id="sua-marca" titulo="Logo no topo" desc="Escolha como a sua marca aparece no canto superior esquerdo do aplicativo do motorista.">
            <div className="pe-cartoes" role="radiogroup" aria-label="Logo no topo">
              {([["texto", "Apenas nome"], ["imagem", "Apenas imagem"]] as const).map(([v, n]) => (
                <button key={v} type="button" role="radio" aria-checked={p.marca === v} disabled={!admin} className={`pe-opcao ${p.marca === v ? "sel" : ""}`} onClick={() => set("marca", v)}>
                  <span className="pe-marca-mini">{v === "texto" ? <span className="pm-logo"><b>{iniciais(p.nome)}</b></span> : <span className="pe-mini-img" style={{ borderRadius: "50%" }}>●</span>}</span><span>{n}</span>
                </button>
              ))}
            </div>
            {p.marca === "imagem" && <EnvioImagem titulo="Apenas imagem" dimensoes={[52, 52]} url={p.imagemMarcaUrl} nome={p.imagemMarca} admin={admin} enviando={enviando} enviar={(f) => void enviarImagem(f)} excluir={() => void excluirImagem()} />}
          </Item>
          <Item id="estilo-de-tela" titulo="Estilo da tela" desc="Escolha como o topo do mapa aparece no aplicativo do motorista.">
            <div className="pe-cartoes" role="radiogroup" aria-label="Estilo da tela">
              {ESTILOS.map(([v, n, d2]) => (
                <button key={v} type="button" role="radio" aria-checked={p.estiloTela === v} disabled={!admin} className={`pe-opcao estilo ${p.estiloTela === v ? "sel" : ""}`} onClick={() => set("estiloTela", v)}>
                  <MiniEstilo id={v} /><strong>{n}</strong><small>{d2}</small>
                </button>
              ))}
            </div>
          </Item>
          <Item id="recursos" titulo="Recursos" desc="Escolha o que aparece na tela do mapa do aplicativo do motorista.">
            <ul className="pe-recursos">
              {p.recursos.map((r: any, i: number) => {
                const m = RECURSOS[r.id];
                return (
                  <li key={r.id} className={`${r.visivel ? "" : "oculto"} ${m.fixo ? "fixo" : ""}`}>
                    <span className="pe-icone-rec">{r.id === "saldo" ? <Wallet size={20} /> : r.id === "notificacoes" ? <Bell size={20} /> : r.id === "ajuda" ? <HelpCircle size={20} /> : r.id === "tema" ? <Sun size={20} /> : r.id === "centralizar" ? <LocateFixed size={20} /> : r.id === "preferencias" ? <SlidersHorizontal size={20} /> : r.id === "macaneta" ? <Hand size={20} /> : r.id === "iniciar" ? <Play size={20} /> : <MapaIcone size={20} />}</span>
                    <div><strong>{m.nome}</strong><small className="bloco">{m.desc}</small>{m.fixo && <small className="bloco pe-nota"><Lock size={12} /> {m.fixo}</small>}</div>
                    {m.fixo ? <Lock size={16} aria-label="Fixo" /> : <span className="dm-linha"><small>{r.visivel ? "Visível" : "Oculto"}</small><Interruptor valor={r.visivel} desabilitado={!admin} rotulo={`${m.nome} visível`} onChange={(v) => set("recursos", p.recursos.map((x: any, j: number) => (j === i ? { ...x, visivel: v } : x)))} /></span>}
                  </li>
                );
              })}
            </ul>
          </Item>
        </section>
        <SecaoAberturaPremium app="motorista" premium={premium} />
        <div className="dm-salvar">
          <button className="botao" onClick={() => { setP(structuredClone(salvo)); setErroNome(false); premium.current?.desfazer(); }}>Voltar</button>
          {admin && <button className="botao primario" disabled={salvando || enviando} onClick={gravar}>Salvar alterações</button>}
        </div>
        {!admin && <p className="sub">Só o administrador altera a personalização.</p>}
      </PaginaPers>
    </>
  );
}
