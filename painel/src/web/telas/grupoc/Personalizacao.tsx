// Config › Personalização app passageiro (Machine): Geral (nome, cor principal, veículo no mapa), Tela inicial (sua marca, estilo da tela,
// recursos em ordem) e a pré-visualização do aplicativo ao lado.

import { useRef, useState } from "react";
import { GripVertical, Lock, Trash2, Upload } from "lucide-react";
import { Aviso, Cab, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";

const RECURSOS: Record<string, { nome: string; desc: string }> = {
  mapa: { nome: "Mapa", desc: "Permite a visualização do mapa" },
  destino: { nome: "Seleção do destino", desc: "Permite a busca rápida do destino e visualização de endereços recentes" },
  cupons: { nome: "Aviso de cupons disponíveis", desc: "Dê mais visibilidade aos cupons disponíveis para uso" },
  anuncio: { nome: "Anúncio", desc: "Permite a visualização do(s) anúncio(s) de seus parceiros" },
  desafio: { nome: "Desafio", desc: "Permite a visualização do desafio em andamento" },
};
const VEICULOS: Array<[string, string]> = [["realista", "Realista"], ["moderno", "Moderno"], ["classico", "Clássico"]];
const MARCAS: Array<[string, string]> = [["nome", "Apenas nome"], ["imagem", "Apenas imagem"], ["nome_imagem", "Nome + Imagem"]];
const ESTILOS: Array<[string, string, string]> = [["flutuante", "Flutuante", "Conteúdo flutuante sobre o mapa"], ["neutro", "Neutro", "Conteúdo sobre o fundo branco"], ["marcante", "Marcante", "Conteúdo sobre fundo branco e com destaque da cor principal"]];

export function Personalizacao() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/personalizacao"), []);
  const [p, setP] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setP(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  const arrastando = useRef<string | null>(null);
  if (!p) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setP({ ...p, [k]: v });
  const flut = p.estiloTela === "flutuante";
  const mover = (alvo: string) => {
    const de = arrastando.current;
    if (!de || de === alvo || (flut && (de === "mapa" || alvo === "mapa"))) return;
    const ordem = [...p.recursos];
    const i = ordem.findIndex((r: any) => r.id === de), j = ordem.findIndex((r: any) => r.id === alvo);
    ordem.splice(j, 0, ordem.splice(i, 1)[0]);
    set("recursos", ordem);
  };
  const lerImagem = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type) || f.size > 500_000) { alert("Envie uma imagem PNG ou JPG de até 500 KB (184 x 52 px)."); return; }
    const l = new FileReader();
    l.onload = () => set("imagemMarca", String(l.result));
    l.readAsDataURL(f);
  };
  const gravar = () => salvar(async () => { const r = await pedirConfig("/personalizacao", "PUT", p); setLido(r); setP(structuredClone(r)); }, "Alterações salvas.");
  const visiveis = p.recursos.filter((r: any) => r.visivel);
  return (
    <>
      <Cab titulo="Personalização" />
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <div className="pe-grade">
        <div className="pe-form">
          <section className="dm-cartao" id="pe-geral">
            <h3>Geral</h3>
            <label className="dm-campo"><span>Nome</span><input value={p.nome} disabled={!admin} maxLength={40} placeholder="Insira um nome" onChange={(e) => set("nome", e.target.value)} /><small>Insira o nome que você deseja exibir para os seus clientes.</small></label>
            <label className="dm-campo"><span>Cor principal</span><span className="dm-linha"><input type="color" disabled={!admin} value={p.corPrincipal} onChange={(e) => set("corPrincipal", e.target.value)} aria-label="Cor principal" /><code>{p.corPrincipal}</code></span><small>Escolha a cor principal que será refletida em todo aplicativo.</small></label>
            <fieldset><legend>Veículo no mapa</legend>
              <p className="sub">Escolha qual estilo de veículo representará os motoristas no mapa.</p>
              <div className="dm-radios">{VEICULOS.map(([v, n]) => <label key={v} className="dm-check"><input type="radio" name="veiculo" disabled={!admin} checked={p.veiculoMapa === v} onChange={() => set("veiculoMapa", v)} /> {n}</label>)}</div>
              <p className="sub">Caso uma corrida atinja o limite máximo de recálculo da rota até o embarque ou durante a viagem, o ícone Realista será substituído pelo estilo Moderno. A exibição de motoristas ocupados pode ser ativada em Configurações &gt; Gerais. Ao optar pelo ícone Realista, os motoristas aparecerão no mapa, mas sem distinção visual entre livre e ocupado.</p>
            </fieldset>
          </section>
          <section className="dm-cartao" id="pe-tela">
            <h3>Tela inicial</h3>
            <fieldset><legend>Sua marca</legend>
              <p className="sub">Escolha como a sua marca será exibida na tela inicial do aplicativo.</p>
              <div className="dm-radios">{MARCAS.map(([v, n]) => <label key={v} className="dm-check"><input type="radio" name="marca" disabled={!admin} checked={p.marca === v} onChange={() => set("marca", v)} /> {n}</label>)}</div>
              {p.marca !== "nome" && (
                <div>
                  <p className="sub">Apenas imagem. Com dimensões de 184 x 52px, formato PNG ou JPG até 500 KB.</p>
                  {p.imagemMarca && <img src={p.imagemMarca} alt="Sua marca" style={{ maxWidth: 184, maxHeight: 52, display: "block", marginBottom: 6 }} />}
                  {admin && <span className="dm-linha"><label className="botao"><Upload size={14} /> {p.imagemMarca ? "Trocar" : "Enviar imagem"}<input type="file" hidden accept="image/png,image/jpeg" onChange={(e) => lerImagem(e.target.files?.[0])} /></label>{p.imagemMarca && <button type="button" className="botao" onClick={() => set("imagemMarca", "")}><Trash2 size={14} /> Excluir</button>}</span>}
                </div>
              )}
            </fieldset>
            <fieldset><legend>Estilo da tela</legend>
              <p className="sub">Escolha como o conteúdo aparecerá na tela inicial do aplicativo.</p>
              <div className="dm-radios dm-radios-col">{ESTILOS.map(([v, n, d2]) => <label key={v}><input type="radio" name="estilo" disabled={!admin} checked={p.estiloTela === v} onChange={() => set("estiloTela", v)} /> <span><strong>{n}</strong><small className="bloco">{d2}</small></span></label>)}</div>
            </fieldset>
            <fieldset><legend>Recursos</legend>
              <p className="sub">Escolha quais recursos quer exibir na tela inicial. Você pode também mudar a ordem em que aparecem na tela, clicando e arrastando os itens abaixo.</p>
              <ul className="pe-recursos">
                {p.recursos.map((r: any, i: number) => {
                  const fixo = r.id === "mapa" && flut, bloq = r.id === "desafio";
                  return (
                    <li key={r.id} draggable={admin && !fixo && !bloq} onDragStart={() => { arrastando.current = r.id; }} onDragOver={(e) => e.preventDefault()} onDrop={() => mover(r.id)} className={r.visivel ? "" : "oculto"}>
                      <GripVertical size={16} aria-hidden />
                      <span className="pe-num">{r.visivel ? visiveis.findIndex((v: any) => v.id === r.id) + 1 : ""}</span>
                      <div><strong>{RECURSOS[r.id].nome}</strong><small className="bloco">{RECURSOS[r.id].desc}</small>
                        {fixo && <small className="bloco">O mapa não pode ser ocultado ou reordenado quando o estilo de tela selecionado for Flutuante.</small>}
                        {bloq && <small className="bloco"><Lock size={12} /> Para desbloquear, crie um desafio em Cadastro &gt; Desafios &gt; Clientes</small>}</div>
                      <span className="dm-linha"><small>{r.visivel ? "Visível" : "Oculto"}</small><Interruptor valor={r.visivel} desabilitado={!admin || fixo || bloq} rotulo={`${RECURSOS[r.id].nome} visível`} onChange={(v) => set("recursos", p.recursos.map((x: any, j: number) => (j === i ? { ...x, visivel: v } : x)))} /></span>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </section>
          <div className="dm-salvar">
            <button className="botao" onClick={() => { setP(structuredClone(d.dados)); }}>Voltar</button>
            {admin && <button className="botao primario" disabled={salvando} onClick={gravar}>Salvar alterações</button>}
          </div>
          {!admin && <p className="sub">Só o administrador altera a personalização.</p>}
        </div>
        <aside className="pe-previa" aria-label="Pré visualização">
          <h3>Pré visualização</h3>
          <div className="pe-celular" style={{ ["--pe-cor" as string]: p.corPrincipal }}>
            <div className={`pe-tela ${p.estiloTela}`}>
              <div className="pe-topo">
                <span className="pe-marca">{p.marca !== "nome" && p.imagemMarca ? <img src={p.imagemMarca} alt="" /> : null}{p.marca !== "imagem" ? <b>{p.nome || "Sua marca"}</b> : null}</span>
                <span>●</span>
              </div>
              {visiveis.map((r: any) => r.id === "mapa" ? <div key={r.id} className="pe-mapa">Mapa</div>
                : r.id === "destino" ? <div key={r.id} className="pe-bloco"><p>Bom dia, Matheus!</p><div className="pe-busca">Buscar destino</div><small>Rua Gastão Gonçalves, 100 · Niterói - RJ</small><small>Rua Álvares de Azevedo, 334 · Niterói - RJ</small></div>
                : r.id === "cupons" ? <div key={r.id} className="pe-bloco">Você tem cupons disponíveis</div>
                : r.id === "anuncio" ? <div key={r.id} className="pe-bloco pe-anuncio">Seu anúncio aqui</div> : null)}
              <div className="pe-rodape"><span>Início</span><span>Painel</span><span>Atividade</span><span>Conta</span></div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
