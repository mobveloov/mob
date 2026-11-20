// Config › Personalização app passageiro (Machine): Geral (nome, cor principal em grade de 36 cores, veículo no mapa com ícones),
// Tela inicial (sua marca, estilo da tela, recursos em ordem) e a pré-visualização do celular, que muda ao vivo enquanto se edita.

import { useRef, useState } from "react";
import { Bell, CalendarClock, Check, Clock, Coins, GripVertical, House, ImageIcon, Info, LayoutGrid, Lock, Map as MapaIcone, Megaphone, Palette, Search, Trash2, Type, Upload, User, UserRound, Car, ReceiptText, Ticket, Sparkles, Image as ImagemIcone } from "lucide-react";
import { iconeCarroUrl, ROTULO_VEICULO, VEICULOS_MAPA, type VeiculoMapa } from "../../../comum/icone-carro";
import { Aviso, Cab, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";

// As 36 cores da Machine (a cor principal só se escolhe nesta grade).
const CORES = ["#404857", "#2c2c2c", "#000000", "#13d1fe", "#00c0d9", "#2b7aff", "#3463b4", "#297188", "#0c6094", "#102b5e", "#00b1b3", "#04d7b1",
  "#0ed872", "#8bc34a", "#02a862", "#59835d", "#007068", "#ffc400", "#e8a73a", "#f2c869", "#ff9c1b", "#ff7000", "#e48d4e", "#ff7a64",
  "#ff9294", "#ff6ba9", "#8a7bfc", "#7148cc", "#8b2ec6", "#dc256c", "#ff355a", "#e14f54", "#ce3345", "#bb1d44", "#951329", "#e72f49"];

const RECURSOS: Record<string, { nome: string; desc: string; icone: typeof Search }> = {
  mapa: { nome: "Mapa", desc: "Permite a visualização do mapa", icone: MapaIcone },
  destino: { nome: "Seleção do destino", desc: "Permite a busca rápida do destino e visualização de endereços recentes", icone: Search },
  cupons: { nome: "Aviso de cupons disponíveis", desc: "Dê mais visibilidade aos cupons disponíveis para uso", icone: Ticket },
  anuncio: { nome: "Anúncio", desc: "Permite a visualização do(s) anúncio(s) de seus parceiros", icone: Megaphone },
  desafio: { nome: "Desafio", desc: "Permite a visualização do desafio em andamento", icone: Coins },
};
const MARCAS: Array<[string, string]> = [["texto", "Apenas nome"], ["imagem", "Apenas imagem"], ["texto_imagem", "Nome + Imagem"], ["imagem_alongada", "Apenas imagem"]];
const DIMENSOES: Record<string, [number, number]> = { imagem: [52, 52], texto_imagem: [52, 52], imagem_alongada: [184, 52] };
const ESTILOS: Array<[string, string, string]> = [["flutuante", "Flutuante", "Conteúdo flutuante sobre o mapa"], ["neutro", "Neutro", "Conteúdo sobre o fundo branco"], ["marcante", "Marcante", "Conteúdo sobre fundo branco e com destaque da cor principal"]];
const MAX_IMAGEM = 5 * 1024 * 1024;

const claraDemais = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6; };

/** Miniatura do estilo da tela (desenho simples do que cada estilo mostra). */
function MiniEstilo({ id }: { id: string }) {
  const mapa = <rect x="0" y="0" width="120" height="70" fill="#dbeafe" />;
  return (
    <svg viewBox="0 0 120 70" className="pe-mini" aria-hidden>
      {id === "flutuante" && <>{mapa}<rect x="8" y="30" width="104" height="34" rx="8" fill="#fff" stroke="#cbd5e1" /><rect x="16" y="38" width="60" height="6" rx="3" fill="#cbd5e1" /><rect x="16" y="50" width="40" height="6" rx="3" fill="#e2e8f0" /></>}
      {id === "neutro" && <><rect width="120" height="70" fill="#fff" /><rect x="0" y="0" width="120" height="28" fill="#dbeafe" /><rect x="10" y="36" width="70" height="6" rx="3" fill="#cbd5e1" /><rect x="10" y="48" width="44" height="6" rx="3" fill="#e2e8f0" /></>}
      {id === "marcante" && <><rect width="120" height="70" fill="#fff" /><rect x="0" y="0" width="120" height="26" fill="#1e293b" /><rect x="10" y="34" width="70" height="6" rx="3" fill="#cbd5e1" /><rect x="10" y="46" width="44" height="6" rx="3" fill="#e2e8f0" /></>}
    </svg>
  );
}

function MiniMarca({ id }: { id: string }) {
  const img = <span className="pe-mini-img"><ImageIcon size={18} /></span>;
  return (
    <span className="pe-marca-mini">
      {id === "texto" && <b>Nome</b>}
      {id === "imagem" && img}
      {id === "texto_imagem" && <>{img}<b>Nome</b></>}
      {id === "imagem_alongada" && <span className="pe-mini-img larga"><ImageIcon size={18} /></span>}
    </span>
  );
}

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
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setMsg({ erro: "Envie uma imagem em formato PNG ou JPG." }); return; }
    if (f.size > MAX_IMAGEM) { setMsg({ erro: "Envie uma imagem de no máximo 5 MB." }); return; }
    setEnviando(true); setMsg(null);
    try { const r = await pedirConfig("/personalizacao/imagem", "POST", f); setP((x: any) => ({ ...x, imagemMarca: r.imagemMarca, imagemMarcaUrl: r.imagemMarcaUrl })); }
    catch (e) { setMsg({ erro: (e as Error).message }); } finally { setEnviando(false); }
  };
  const excluirImagem = async () => {
    try { const r = await pedirConfig("/personalizacao/imagem", "DELETE"); setP((x: any) => ({ ...x, imagemMarca: "", imagemMarcaUrl: "", marca: r.marca })); } catch (e) { setMsg({ erro: (e as Error).message }); }
  };
  const gravar = () => {
    if (!p.nome.trim()) { setErroNome(true); document.getElementById("pe-nome")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (p.marca !== "texto" && !p.imagemMarcaUrl) { setMsg({ erro: "Envie uma imagem para salvar as alterações." }); return; }
    setErroNome(false);
    void salvar(async () => { const r = await pedirConfig("/personalizacao", "PUT", p); setSalvo(r); setP(structuredClone(r)); }, "Alterações salvas.");
  };
  const visiveis = p.recursos.filter((r: any) => r.visivel);
  const sobre = claraDemais(p.corPrincipal) ? "#111827" : "#ffffff";
  const dim = DIMENSOES[p.marca];
  const rotuloMarca = MARCAS.find(([v]) => v === p.marca)?.[1] ?? "";
  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const peca = (id: string) => {
    if (id === "mapa") return (
      <div key={id} className="pe-bloco-mapa">
        <img className="pe-carro c1" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "livre")} alt="" />
        <img className="pe-carro c2" src={iconeCarroUrl(p.veiculoMapa as VeiculoMapa, "ocupado")} alt="" />
        <span className="pe-pino"><User size={12} /></span>
      </div>
    );
    if (id === "destino") return (
      <div key={id} className="pe-bloco">
        <div className="pe-busca"><span><Search size={12} /> Buscar destino</span><CalendarClock size={14} /></div>
        <div className="pe-endereco"><Clock size={12} /><div><p>Rua Gastão Gonçalves, 100</p><p>Niterói - RJ</p></div></div>
        <div className="pe-endereco"><Clock size={12} /><div><p>Rua Álvares de Azevedo, 334</p><p>Niterói - RJ</p></div></div>
      </div>
    );
    if (id === "cupons") return <div key={id} className="pe-bloco pe-cupom"><Ticket size={14} /> Você tem 1 cupom disponível</div>;
    if (id === "anuncio") return <div key={id} className="pe-bloco"><div className="pe-anuncio">Seu anúncio aqui</div><div className="pe-pontos"><i className="ativo" /><i /><i /></div></div>;
    return null;
  };
  const nomeNaMarca = p.marca !== "imagem" && p.marca !== "imagem_alongada";
  const imagemNaMarca = p.marca !== "texto" && p.imagemMarcaUrl;
  // Mapa é sempre o primeiro bloco no estilo Flutuante; nos demais, segue a ordem escolhida.
  const blocos = visiveis.map((r: any) => r.id);

  return (
    <>
      <Cab titulo="Personalização" />
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <div className="pe-grade">
        <div className="pe-form">
          <nav className="pe-indice" aria-label="Seções">
            <strong>Geral</strong>
            <button type="button" onClick={() => irPara("pe-nome")}><Type size={14} /> Nome</button>
            <button type="button" onClick={() => irPara("pe-cor")}><Palette size={14} /> Cor principal</button>
            <button type="button" onClick={() => irPara("pe-veiculo")}><Car size={14} /> Veículo no mapa</button>
            <strong>Tela inicial</strong>
            <button type="button" onClick={() => irPara("pe-marca")}><Sparkles size={14} /> Sua marca</button>
            <button type="button" onClick={() => irPara("pe-estilo")}><LayoutGrid size={14} /> Estilo da tela</button>
            <button type="button" onClick={() => irPara("pe-recursos")}><ReceiptText size={14} /> Recursos</button>
          </nav>

          <section className="dm-cartao" id="pe-geral">
            <h2>Geral</h2>
            <div className="pe-item" id="pe-nome">
              <h3>Nome</h3><p className="sub">Insira o nome que você deseja exibir para os seus clientes.</p>
              <input value={p.nome} disabled={!admin} maxLength={60} placeholder="Nome exemplo" className={erroNome ? "erro" : ""} onChange={(e) => { set("nome", e.target.value); if (e.target.value.trim()) setErroNome(false); }} />
              {erroNome && <small className="pe-erro">Insira um nome</small>}
            </div>
            <div className="pe-item" id="pe-cor">
              <h3>Cor principal</h3><p className="sub">Escolha a cor principal que será refletida em todo aplicativo.</p>
              <div className="pe-cores" role="radiogroup" aria-label="Cor principal">
                {CORES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={p.corPrincipal === c} aria-label={c} disabled={!admin} className={`pe-cor ${p.corPrincipal === c ? "sel" : ""}`} style={{ background: c, color: claraDemais(c) ? "#111827" : "#fff" }} onClick={() => set("corPrincipal", c)}>
                    {p.corPrincipal === c && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="pe-item" id="pe-veiculo">
              <h3>Veículo no mapa</h3><p className="sub">Escolha qual estilo de veículo representará os motoristas no mapa.</p>
              <div className="pe-cartoes" role="radiogroup" aria-label="Veículo no mapa">
                {VEICULOS_MAPA.map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={p.veiculoMapa === v} disabled={!admin} className={`pe-opcao ${p.veiculoMapa === v ? "sel" : ""}`} onClick={() => set("veiculoMapa", v)}>
                    <img src={iconeCarroUrl(v, "livre")} alt={ROTULO_VEICULO[v]} width={44} height={44} /><span>{ROTULO_VEICULO[v]}</span>
                  </button>
                ))}
              </div>
              <div className="pe-alerta"><Info size={16} /><div>Caso uma corrida atinja o limite máximo de recálculo da rota até o embarque ou durante a viagem, o ícone Realista será substituído pelo estilo Moderno.<br /><br />A exibição de motoristas ocupados pode ser ativada em Configurações &gt; Gerais. Ao optar pelo ícone Realista, os motoristas aparecerão no mapa, mas sem distinção visual entre livre e ocupado.</div></div>
            </div>
          </section>

          <section className="dm-cartao" id="pe-tela">
            <h2>Tela inicial</h2>
            <div className="pe-item" id="pe-marca">
              <h3>Sua marca</h3><p className="sub">Escolha como a sua marca será exibida na tela inicial do aplicativo.</p>
              <div className="pe-cartoes" role="radiogroup" aria-label="Sua marca">
                {MARCAS.map(([v, n]) => (
                  <button key={v} type="button" role="radio" aria-checked={p.marca === v} disabled={!admin} className={`pe-opcao ${p.marca === v ? "sel" : ""}`} onClick={() => set("marca", v)}><MiniMarca id={v} /><span>{n}</span></button>
                ))}
              </div>
              {dim && (
                <div className="pe-upload">
                  <h3>{rotuloMarca}</h3>
                  <p className="sub">Com dimensões de {dim[0]} x {dim[1]}px, formato PNG ou JPG até 5 MB.</p>
                  {p.imagemMarcaUrl ? (
                    <div className="pe-arquivo">
                      <span className="pe-miniatura"><img src={p.imagemMarcaUrl} alt="Sua marca" /></span>
                      <span className="pe-arquivo-nome">{p.imagemMarca}</span>
                      {admin && <span className="dm-linha">
                        <label className="botao"><Upload size={14} /> Trocar<input type="file" hidden accept="image/png,image/jpeg" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; void enviarImagem(a); }} /></label>
                        <button type="button" className="botao" onClick={() => void excluirImagem()}><Trash2 size={14} /> Excluir</button>
                      </span>}
                    </div>
                  ) : admin ? (
                    <label className="pe-soltar"><ImagemIcone size={20} /> {enviando ? "Enviando..." : "Escolher imagem"}<input type="file" hidden accept="image/png,image/jpeg" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; void enviarImagem(a); }} /></label>
                  ) : <p className="sub">Sem imagem enviada.</p>}
                </div>
              )}
            </div>
            <div className="pe-item" id="pe-estilo">
              <h3>Estilo da tela</h3><p className="sub">Escolha como o conteúdo aparecerá na tela inicial do aplicativo.</p>
              <div className="pe-cartoes" role="radiogroup" aria-label="Estilo da tela">
                {ESTILOS.map(([v, n, d2]) => (
                  <button key={v} type="button" role="radio" aria-checked={p.estiloTela === v} disabled={!admin} className={`pe-opcao estilo ${p.estiloTela === v ? "sel" : ""}`} onClick={() => set("estiloTela", v)}>
                    <MiniEstilo id={v} /><strong>{n}</strong><small>{d2}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="pe-item" id="pe-recursos">
              <h3>Recursos</h3><p className="sub">Escolha quais recursos quer exibir na tela inicial. Você pode também mudar a ordem em que aparecem na tela, clicando e arrastando os itens abaixo.</p>
              <ul className="pe-recursos">
                {p.recursos.map((r: any, i: number) => {
                  const fixo = r.id === "mapa" && flut, bloq = r.id === "desafio", Ic = RECURSOS[r.id].icone;
                  return (
                    <li key={r.id} draggable={admin && !fixo && !bloq} onDragStart={() => { arrastando.current = r.id; }} onDragOver={(e) => e.preventDefault()} onDrop={() => mover(r.id)} className={`${r.visivel ? "" : "oculto"} ${fixo ? "fixo" : ""} ${bloq ? "bloqueado" : ""}`}>
                      <GripVertical size={16} aria-hidden />
                      <span className="pe-num">{r.visivel ? visiveis.findIndex((v: any) => v.id === r.id) + 1 : ""}</span>
                      <Ic size={20} aria-hidden />
                      <div><strong>{RECURSOS[r.id].nome}</strong><small className="bloco">{RECURSOS[r.id].desc}</small>
                        {fixo && <small className="bloco pe-nota"><Info size={12} /> O mapa não pode ser ocultado ou reordenado quando o estilo de tela selecionado for Flutuante.</small>}
                        {bloq && <small className="bloco pe-nota"><Lock size={12} /> Para desbloquear, crie um desafio em Cadastro &gt; Desafios &gt; Clientes</small>}</div>
                      {bloq ? <Lock size={16} aria-label="Bloqueado" /> : <span className="dm-linha"><small>{r.visivel ? "Visível" : "Oculto"}</small><Interruptor valor={r.visivel} desabilitado={!admin || fixo} rotulo={`${RECURSOS[r.id].nome} visível`} onChange={(v) => set("recursos", p.recursos.map((x: any, j: number) => (j === i ? { ...x, visivel: v } : x)))} /></span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
          <div className="dm-salvar">
            <button className="botao" onClick={() => { setP(structuredClone(salvo)); setErroNome(false); }}>Voltar</button>
            {admin && <button className="botao primario" disabled={salvando || enviando} onClick={gravar}>Salvar alterações</button>}
          </div>
          {!admin && <p className="sub">Só o administrador altera a personalização.</p>}
        </div>

        <aside className="pe-previa" aria-label="Pré visualização">
          <h2>Pré visualização</h2>
          <div className="pe-celular">
            <div className={`pe-tela ${p.estiloTela}`} style={{ ["--pe-cor" as string]: p.corPrincipal, ["--pe-sobre" as string]: sobre }}>
              <div className="pe-topo">
                <span className="pe-marca">{imagemNaMarca && <img className={p.marca === "imagem_alongada" ? "larga" : ""} src={p.imagemMarcaUrl} alt="" />}{nomeNaMarca && <b>{p.nome || "Nome exemplo"}</b>}</span>
                <span className="pe-icones"><span className="pe-cupom-n"><Ticket size={12} /><b>1</b></span><span className="pe-sino"><Bell size={14} /></span></span>
              </div>
              <div className="pe-corpo">
                {flut ? (<>
                  {peca("mapa")}
                  <div className="pe-folha"><span className="pe-alca" /><p className="pe-ola">Bom dia, Matheus!</p>{blocos.filter((b: string) => b !== "mapa").map(peca)}</div>
                </>) : (<div className="pe-pilha"><p className="pe-ola">Bom dia, Matheus!</p>{blocos.map(peca)}</div>)}
              </div>
              <div className="pe-rodape"><span className="ativo"><House size={16} />Início</span><span><LayoutGrid size={16} />Painel</span><span><ReceiptText size={16} />Atividade</span><span><UserRound size={16} />Conta</span></div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
