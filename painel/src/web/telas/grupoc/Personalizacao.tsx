// Config › Personalização app passageiro (Machine): menu lateral (Geral: nome, cor principal, veículo no mapa; Tela inicial: sua marca,
// estilo da tela, recursos), formulário e a pré-visualização do celular, que muda ao vivo enquanto se edita.

import { useRef, useState } from "react";
import { Bell, CalendarClock, ChevronRight, Clock, Coins, GripVertical, House, Info, LayoutGrid, Lock, Map as MapaIcone, Megaphone, Palette, ReceiptText, Search, Sparkles, Ticket, Type, User, UserRound, Car } from "lucide-react";
import { iconeCarroUrl, type VeiculoMapa } from "../../../comum/icone-carro";
import { Aviso, Cab, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { CartoesVeiculo, corClara, EnvioImagem, GradeCores, Item, MiniEstilo, MiniMarca, PaginaPers, problemaDaImagem, type SecaoMenu } from "./PersonalizacaoPecas";

const RECURSOS: Record<string, { nome: string; desc: string; icone: typeof Search }> = {
  mapa: { nome: "Mapa", desc: "Permite a visualização do mapa", icone: MapaIcone },
  selecao_destino: { nome: "Seleção do destino", desc: "Permite a busca rápida do destino e visualização de endereços recentes", icone: Search },
  aviso_cupons: { nome: "Aviso de cupons disponíveis", desc: "Dê mais visibilidade aos cupons disponíveis para uso", icone: Ticket },
  anuncio: { nome: "Anúncio", desc: "Permite a visualização do(s) anúncio(s) de seus parceiros", icone: Megaphone },
  desafio: { nome: "Desafio", desc: "Permite a visualização do desafio em andamento", icone: Coins },
};
const MARCAS: Array<[string, string]> = [["texto", "Apenas nome"], ["imagem", "Apenas imagem"], ["texto_imagem", "Nome + Imagem"], ["imagem_alongada", "Apenas imagem"]];
const DIMENSOES: Record<string, [number, number]> = { imagem: [52, 52], texto_imagem: [52, 52], imagem_alongada: [184, 52] };
const ESTILOS: Array<[string, string, string]> = [["flutuante", "Flutuante", "Conteúdo flutuante sobre o mapa"], ["neutro", "Neutro", "Conteúdo sobre o fundo branco"], ["marcante", "Marcante", "Conteúdo sobre fundo branco e com destaque da cor principal"]];
import { MENU_ABERTURA, SecaoAberturaPremium } from "./AberturaPremium";
const MENU: SecaoMenu[] = [
  { titulo: "Geral", itens: [{ id: "nome", rotulo: "Nome", icone: <Type size={16} /> }, { id: "cor-principal", rotulo: "Cor principal", icone: <Palette size={16} /> }, { id: "veiculo-no-mapa", rotulo: "Veículo no mapa", icone: <Car size={16} /> }] },
  { titulo: "Tela inicial", itens: [{ id: "sua-marca", rotulo: "Sua marca", icone: <Sparkles size={16} /> }, { id: "estilo-de-tela", rotulo: "Estilo da tela", icone: <LayoutGrid size={16} /> }, { id: "recursos", rotulo: "Recursos", icone: <ReceiptText size={16} /> }] },
];

export function Personalizacao() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/personalizacao"), []);
  const [p, setP] = useState<any>(null), [lido, setLido] = useState<unknown>(null), [salvo, setSalvo] = useState<any>(null); // salvo: o que está gravado (para o Voltar)
  const [erroNome, setErroNome] = useState(false), [enviando, setEnviando] = useState(false);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setSalvo(d.dados); setP(structuredClone(d.dados)); }
  const { msg, salvando, salvar, setMsg } = useSalvar();
  const arrastando = useRef<string | null>(null);
  if (!p) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setP((x: any) => ({ ...x, [k]: v }));
  const flut = p.estiloTela === "flutuante";
  const mover = (alvo: string) => {
    const de = arrastando.current;
    if (!de || de === alvo || (flut && (de === "mapa" || alvo === "mapa"))) return;
    const ordem = [...p.recursos];
    const i = ordem.findIndex((r: any) => r.id === de), j = ordem.findIndex((r: any) => r.id === alvo);
    ordem.splice(j, 0, ordem.splice(i, 1)[0]);
    set("recursos", ordem);
  };
  const enviarImagem = async (f: File | undefined) => {
    if (!f) return;
    const erro = problemaDaImagem(f);
    if (erro) { setMsg({ erro }); return; }
    setEnviando(true); setMsg(null);
    try { const r = await pedirConfig("/personalizacao/imagem", "POST", f); setP((x: any) => ({ ...x, imagemMarca: r.imagemMarca, imagemMarcaUrl: r.imagemMarcaUrl })); }
    catch (e) { setMsg({ erro: (e as Error).message }); } finally { setEnviando(false); }
  };
  const excluirImagem = async () => {
    try { const r = await pedirConfig("/personalizacao/imagem", "DELETE"); setP((x: any) => ({ ...x, imagemMarca: "", imagemMarcaUrl: "", marca: r.marca })); } catch (e) { setMsg({ erro: (e as Error).message }); }
  };
  const gravar = () => {
    if (!p.nome.trim()) { setErroNome(true); document.getElementById("nome")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (p.marca !== "texto" && !p.imagemMarcaUrl) { setMsg({ erro: "Envie uma imagem para salvar as alterações." }); return; }
    setErroNome(false);
    void salvar(async () => { const r = await pedirConfig("/personalizacao", "PUT", p); setSalvo(r); setP(structuredClone(r)); }, "Alterações salvas.");
  };
  const visiveis = p.recursos.filter((r: any) => r.visivel);
  const dim = DIMENSOES[p.marca];
  const rotuloMarca = MARCAS.find(([v]) => v === p.marca)?.[1] ?? "";

  const peca = (id: string) => {
    if (id === "mapa") return (
      <div key={id} className="pe-bloco-mapa">
        <img className="pe-carro c1" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "livre")} alt="" />
        <img className="pe-carro c2" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "ocupado")} alt="" />
        <span className="pe-pino"><User size={12} /></span>
      </div>
    );
    if (id === "selecao_destino") return (
      <div key={id} className="pe-bloco">
        <div className="pe-busca"><span><Search size={12} /> Buscar destino</span><CalendarClock size={14} /></div>
        <div className="pe-endereco"><Clock size={12} /><div><p>Rua Gastão Gonçalves, 100</p><p>Niterói - RJ</p></div></div>
        <div className="pe-endereco"><Clock size={12} /><div><p>Rua Álvares de Azevedo, 334</p><p>Niterói - RJ</p></div></div>
      </div>
    );
    if (id === "aviso_cupons") return <div key={id} className="pe-bloco pe-cupom"><Ticket size={14} /> Você tem 1 cupom disponível</div>;
    if (id === "anuncio") return <div key={id} className="pe-bloco"><div className="pe-anuncio">Seu anúncio aqui</div><div className="pe-pontos"><i className="ativo" /><i /><i /></div></div>;
    if (id === "desafio") return (
      <div key={id} className="pe-bloco pe-desafio">
        <div className="pe-desafio-topo"><span>Concorra Vale compras de R$ 30 ao fazer 10 corridas</span><ChevronRight size={14} /></div>
        <div className="pe-desafio-linha"><span className="pe-barra"><i /></span><small>2 de 10 • até 01/12</small></div>
      </div>
    );
    return null;
  };
  const nomeNaMarca = p.marca !== "imagem" && p.marca !== "imagem_alongada";
  const imagemNaMarca = p.marca !== "texto" && p.imagemMarcaUrl;
  const blocos: string[] = visiveis.map((r: any) => r.id);
  const marcaTopo = (
    <div className="pe-topo">
      <span className={`pe-marca ${p.marca}`}>{imagemNaMarca && <img className={p.marca === "imagem_alongada" ? "larga" : ""} src={p.imagemMarcaUrl} alt="" />}{nomeNaMarca && <b>{p.nome || "Nome exemplo"}</b>}</span>
      <span className="pe-icones"><span className="pe-cupom-n"><Ticket size={12} /><b>1</b></span><span className="pe-sino"><Bell size={14} /></span></span>
    </div>
  );
  const previa = (
    <div className="pe-celular">
      <div className={`pe-tela ${p.estiloTela} ${corClara(p.corPrincipal) ? "contraste-escuro" : ""}`} style={{ ["--pe-cor" as string]: p.corPrincipal, ["--pe-sobre" as string]: corClara(p.corPrincipal) ? "#111827" : "#ffffff" }}>
        {flut ? (<>
          {marcaTopo}
          <div className="pe-corpo">
            {peca("mapa")}
            <div className="pe-folha"><span className="pe-alca" /><p className="pe-ola">Bom dia, Matheus!</p>{blocos.filter((b) => b !== "mapa").map(peca)}</div>
          </div>
        </>) : (<>
          <div className="pe-cabeca">{marcaTopo}<p className="pe-ola">Bom dia, Matheus!</p></div>
          <div className="pe-corpo"><div className="pe-pilha">{blocos.map(peca)}</div></div>
        </>)}
        <div className="pe-rodape"><span className="ativo"><House size={16} />Início</span><span><LayoutGrid size={16} />Painel</span><span><ReceiptText size={16} />Atividade</span><span><UserRound size={16} />Conta</span></div>
      </div>
    </div>
  );

  return (
    <>
      <Cab titulo="Personalização" />
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <PaginaPers secoes={[...MENU, MENU_ABERTURA]} previa={previa}>
        <section className="dm-cartao" id="geral">
          <h2>Geral</h2>
          <Item id="nome" titulo="Nome" desc="Insira o nome que você deseja exibir para os seus clientes.">
            <input value={p.nome} disabled={!admin} maxLength={60} placeholder="Nome exemplo" className={erroNome ? "erro" : ""} onChange={(e) => { set("nome", e.target.value); if (e.target.value.trim()) setErroNome(false); }} />
            {erroNome && <small className="pe-erro">Insira um nome</small>}
          </Item>
          <Item id="cor-principal" titulo="Cor principal" desc="Escolha a cor principal que será refletida em todo aplicativo."><GradeCores valor={p.corPrincipal} onChange={(c) => set("corPrincipal", c)} admin={admin} /></Item>
          <Item id="veiculo-no-mapa" titulo="Veículo no mapa" desc="Escolha qual estilo de veículo representará os motoristas no mapa."><CartoesVeiculo valor={p.veiculoMapa} onChange={(v) => set("veiculoMapa", v)} admin={admin} /></Item>
        </section>

        <section className="dm-cartao" id="tela-inicial">
          <h2>Tela inicial</h2>
          <Item id="sua-marca" titulo="Sua marca" desc="Escolha como a sua marca será exibida na tela inicial do aplicativo.">
            <div className="pe-cartoes" role="radiogroup" aria-label="Sua marca">
              {MARCAS.map(([v, n]) => (
                <button key={v} type="button" role="radio" aria-checked={p.marca === v} disabled={!admin} className={`pe-opcao ${p.marca === v ? "sel" : ""}`} onClick={() => set("marca", v)}><MiniMarca id={v} /><span>{n}</span></button>
              ))}
            </div>
            {dim && <EnvioImagem titulo={rotuloMarca} dimensoes={dim} url={p.imagemMarcaUrl} nome={p.imagemMarca} admin={admin} enviando={enviando} enviar={(f) => void enviarImagem(f)} excluir={() => void excluirImagem()} />}
          </Item>
          <Item id="estilo-de-tela" titulo="Estilo da tela" desc="Escolha como o conteúdo aparecerá na tela inicial do aplicativo.">
            <div className="pe-cartoes" role="radiogroup" aria-label="Estilo da tela">
              {ESTILOS.map(([v, n, d2]) => (
                <button key={v} type="button" role="radio" aria-checked={p.estiloTela === v} disabled={!admin} className={`pe-opcao estilo ${p.estiloTela === v ? "sel" : ""}`} onClick={() => set("estiloTela", v)}>
                  <MiniEstilo id={v} /><strong>{n}</strong><small>{d2}</small>
                </button>
              ))}
            </div>
          </Item>
          <Item id="recursos" titulo="Recursos" desc="Escolha quais recursos quer exibir na tela inicial. Você pode também mudar a ordem em que aparecem na tela, clicando e arrastando os itens abaixo.">
            <ul className="pe-recursos">
              {p.recursos.map((r: any, i: number) => {
                const fixo = r.id === "mapa" && flut, bloq = r.id === "desafio" && !p.desafioLiberado, Ic = RECURSOS[r.id].icone;
                return (
                  <li key={r.id} draggable={admin && !fixo && !bloq} onDragStart={() => { arrastando.current = r.id; }} onDragOver={(e) => e.preventDefault()} onDrop={() => mover(r.id)} className={`${r.visivel ? "" : "oculto"} ${fixo ? "fixo" : ""} ${bloq ? "bloqueado" : ""}`}>
                    <GripVertical size={16} aria-hidden />
                    <span className="pe-num">{r.visivel ? visiveis.findIndex((v: any) => v.id === r.id) + 1 : ""}</span>
                    <Ic size={20} aria-hidden />
                    <div><strong>{RECURSOS[r.id].nome}</strong><small className="bloco">{RECURSOS[r.id].desc}</small>
                      {fixo && <small className="bloco pe-aviso"><Info size={12} /> O mapa não pode ser ocultado ou reordenado quando o estilo de tela selecionado for Flutuante.</small>}
                      {bloq && <small className="bloco pe-nota"><Lock size={12} /> Para desbloquear, crie um desafio em Cadastro &gt; Desafios &gt; Clientes</small>}</div>
                    {bloq ? <Lock size={16} aria-label="Bloqueado" /> : <span className="dm-linha"><small>{r.visivel ? "Visível" : "Oculto"}</small><Interruptor valor={r.visivel} desabilitado={!admin || fixo} rotulo={`${RECURSOS[r.id].nome} visível`} onChange={(v) => set("recursos", p.recursos.map((x: any, j: number) => (j === i ? { ...x, visivel: v } : x)))} /></span>}
                  </li>
                );
              })}
            </ul>
          </Item>
        </section>
        <SecaoAberturaPremium app="passageiro" />
        <div className="dm-salvar">
          <button className="botao" onClick={() => { setP(structuredClone(salvo)); setErroNome(false); }}>Voltar</button>
          {admin && <button className="botao primario" disabled={salvando || enviando} onClick={gravar}>Salvar alterações</button>}
        </div>
        {!admin && <p className="sub">Só o administrador altera a personalização.</p>}
      </PaginaPers>
    </>
  );
}
