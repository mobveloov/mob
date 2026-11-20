// Cadastro › Ruas (regras de via), no formato da Machine: lista de regras à esquerda ("Nova regra" no topo) e, à direita,
// o cartão com o mapa (traçado da via) e os campos Rua, Bairro de exibição e CEP. Leaflet + OpenStreetMap.
// Servidor: /api/areas/ruas (só o administrador grava).

import { useState } from "react";
import { MapPin, ChevronRight, Trash2, Save, Pencil } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar as chamarBase, Janela, useAviso } from "../cadastro/base";
import MapaAreas, { type Ponto } from "../cadastro/MapaAreas";

interface Regra { id: string; nomeExibicao: string; bairro?: string; cep?: string; nomeNoMapa: string; poligono: Ponto[]; ativa: boolean }
const chamar = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamarBase<T>(metodo, caminho, corpo, "/api/areas");

/** Máscara do CEP: 00000-000. */
const mascaraCep = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const dentroDoQuadro = (p: Ponto, poly: Ponto[]) => {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};
/** Duas regras "se cruzam" quando algum ponto de uma cai dentro da outra. */
const seCruzam = (a: Ponto[], b: Ponto[]) => a.some((p) => dentroDoQuadro(p, b)) || b.some((p) => dentroDoQuadro(p, a));

export default function RuasTela() {
  const l = useCarregar(() => chamar<{ regras: Regra[] }>("GET", "/ruas"), []);
  // "nova" = cartão em branco; Regra = vendo/editando uma regra existente.
  const [aberta, setAberta] = useState<Regra | "nova">("nova");
  const { aviso } = useAviso();
  const regras = l.dados?.regras ?? [];
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Ruas" />
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      <div className="cg-ruas">
        <div className="cg-ruas-lista">
          <button type="button" className={`cg-ruas-item ${aberta === "nova" ? "ativa" : ""}`} onClick={() => setAberta("nova")}>
            <span className="cg-ruas-icone"><MapPin size={18} /></span><strong>Nova regra</strong><ChevronRight size={18} />
          </button>
          {regras.map((r) => (
            <button type="button" key={r.id} className={`cg-ruas-item ${aberta !== "nova" && aberta.id === r.id ? "ativa" : ""}`} onClick={() => setAberta(r)}>
              <span className="cg-ruas-icone"><MapPin size={18} /></span>
              <span className="cg-ruas-nome"><strong>{r.nomeExibicao}</strong>{(r.bairro || r.cep) && <small>{[r.bairro, r.cep].filter(Boolean).join(" · ")}</small>}</span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <Cartao key={aberta === "nova" ? "nova" : aberta.id} r={aberta === "nova" ? null : aberta} outras={regras} onVoltar={() => setAberta("nova")} onMudou={() => l.recarregar()} />
      </div>
    </div>
  );
}

function Cartao({ r, outras, onVoltar, onMudou }: { r: Regra | null; outras: Regra[]; onVoltar: () => void; onMudou: () => void }) {
  const [editando, setEditando] = useState(!r);
  const [rua, setRua] = useState(r?.nomeExibicao ?? "");
  const [bairro, setBairro] = useState(r?.bairro ?? "");
  const [cep, setCep] = useState(r?.cep ?? "");
  const [pontos, setPontos] = useState<Ponto[]>(r?.poligono ?? []);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [sobrescrever, setSobrescrever] = useState<Regra[] | null>(null);
  const { aviso, tentar } = useAviso();
  const pronto = rua.trim().length >= 2 && bairro.trim().length >= 2 && cep.replace(/\D/g, "").length === 8 && pontos.length >= 3;
  const gravar = async () => {
    const corpo = { nomeExibicao: rua, bairro, cep, nomeNoMapa: r?.nomeNoMapa ?? "", ativa: r?.ativa ?? true, poligono: pontos };
    if (await tentar(() => (r ? chamar("PUT", `/ruas/${r.id}`, corpo) : chamar("POST", "/ruas", corpo)), "Regra salva.")) { onMudou(); onVoltar(); }
  };
  const salvar = () => {
    const cruzam = outras.filter((o) => o.id !== r?.id && seCruzam(o.poligono, pontos));
    if (cruzam.length) setSobrescrever(cruzam); else void gravar();
  };
  const excluir = async () => {
    if (!r) return;
    setConfirmarExclusao(false);
    if (await tentar(() => chamar("DELETE", `/ruas/${r.id}`), "Regra excluída.")) { onMudou(); onVoltar(); }
  };
  const lendo = !!r && !editando;
  return (
    <section className="cg-ruas-cartao">
      {aviso}
      <header>
        <h2>{!r ? "Criando nova regra" : editando ? "Editando regra" : r.nomeExibicao}</h2>
        {!r && <p>Criar uma regra corrige o nome de exibição de uma via para a própria central, dentro do traçado desenhado no mapa.</p>}
      </header>
      <MapaAreas areas={outras.filter((o) => o.id !== r?.id).map((o) => ({ id: o.id, nome: o.nomeExibicao, poligono: o.poligono, cor: "#3b82f6" }))} desenho={pontos} onDesenho={lendo ? undefined : setPontos} grande />
      {!lendo && (
        <ol className="cg-ruas-passos">
          <li><b>1</b> Clique no mapa para desenhar o traçado da via.</li>
          <li><b>2</b> Arraste um ponto para ajustar; clique com o botão direito para remover.</li>
        </ol>
      )}
      <div className="cg-ruas-campos">
        <Campo rotulo="Rua:"><input value={rua} maxLength={50} placeholder="Digite o nome da rua" disabled={lendo} onChange={(e) => setRua(e.target.value)} /></Campo>
        <Campo rotulo="Bairro de exibição:"><input value={bairro} maxLength={50} placeholder="Digite o bairro de exibição" disabled={lendo} onChange={(e) => setBairro(e.target.value)} /></Campo>
        <Campo rotulo="CEP:"><input value={cep} maxLength={9} inputMode="numeric" placeholder="00000-000" disabled={lendo} onChange={(e) => setCep(mascaraCep(e.target.value))} /></Campo>
      </div>
      <footer className="cg-acoes">
        {!r && <>
          <button className="cg-botao primario" disabled={!pronto} onClick={salvar}>Salvar nova regra</button>
          <button className="cg-botao" onClick={onVoltar}>Desistir</button>
        </>}
        {r && lendo && <button className="cg-botao" title="Editar regra" aria-label="Editar regra" onClick={() => setEditando(true)}><Pencil size={16} /> Editar</button>}
        {r && !lendo && <>
          <button className="cg-botao primario" disabled={!pronto} title="Salvar regra" aria-label="Salvar regra" onClick={salvar}><Save size={16} /> Salvar</button>
          <button className="cg-botao" onClick={onVoltar}>Desistir</button>
          <button className="cg-botao perigo" title="Excluir regra" aria-label="Excluir regra" onClick={() => setConfirmarExclusao(true)}><Trash2 size={16} /></button>
        </>}
      </footer>
      <Janela aberta={confirmarExclusao} titulo="Excluir regra" onFechar={() => setConfirmarExclusao(false)} largura="pequena"
        rodape={<><button className="cg-botao" onClick={() => setConfirmarExclusao(false)}>Cancelar</button><button className="cg-botao perigo" onClick={() => void excluir()}>Excluir</button></>}>
        <p>Excluir a regra de via <strong>{r?.nomeExibicao}</strong>? A rua volta a aparecer com o nome do mapa. Não dá para desfazer.</p>
      </Janela>
      <Janela aberta={!!sobrescrever} titulo="Já existe uma regra neste trecho" onFechar={() => setSobrescrever(null)} largura="pequena"
        rodape={<><button className="cg-botao" onClick={() => setSobrescrever(null)}>Cancelar</button><button className="cg-botao primario" onClick={() => { setSobrescrever(null); void gravar(); }}>Salvar assim mesmo</button></>}>
        <p>Este traçado cruza {sobrescrever && sobrescrever.length > 1 ? "outras regras" : "a regra"} <strong>{sobrescrever?.map((o) => o.nomeExibicao).join(", ")}</strong>. Se você continuar, no trecho em comum vale a regra mais nova.</p>
      </Janela>
    </section>
  );
}
