// Totens & Preços › Preços: tabela de preços independente por totem e categoria (taxa base, por km, por minuto, corrida
// mínima, tempo de espera, ordem), com o multiplicador de demanda (surge) e "Copiar para todos os totens".

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, MapPin, Plus, Save, Trash2, Car } from "lucide-react";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";
import { apiCentral, type CategoriaLocal, type CategoriaTotem } from "./api";
import PrecosCidade from "./PrecosCidade";

interface FormCat { nome: string; descricao: string; taxaBase: string; porKm: string; porMin: string; minima: string; espera: string; ordem: string; ativa: boolean }
const paraForm = (c: CategoriaLocal): FormCat => ({
  nome: c.nome, descricao: c.descricao, taxaBase: String(c.taxaBase), porKm: String(c.porKm), porMin: String(c.porMin), minima: String(c.minima),
  espera: String(c.espera), ordem: String(c.ordem), ativa: c.ativa,
});
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const doForm = (f: FormCat): CategoriaLocal => ({ nome: f.nome.trim(), descricao: f.descricao.trim(), taxaBase: num(f.taxaBase), porKm: num(f.porKm), porMin: num(f.porMin), minima: num(f.minima), espera: Math.round(num(f.espera)) || 5, ordem: Math.round(num(f.ordem)), ativa: f.ativa });

/** Primeira tabela de um totem: uma linha por categoria da empresa (ou as três de sempre, se ainda não há nenhuma). */
function padrao(cats: CategoriaTotem[]): FormCat[] {
  if (cats.length) return cats.map((c, i) => ({ nome: c.nome, descricao: c.descricao, taxaBase: String(c.preco ?? 5), porKm: "2.50", porMin: "0.50", minima: String(c.preco ?? 8), espera: "5", ordem: String(i), ativa: true }));
  return [
    { nome: "Econômico", descricao: "Veículo compacto, melhor preço", taxaBase: "5.00", porKm: "2.50", porMin: "0.50", minima: "8.00", espera: "5", ordem: "0", ativa: true },
    { nome: "Conforto", descricao: "Veículo espaçoso, mais conforto", taxaBase: "7.00", porKm: "3.50", porMin: "0.70", minima: "12.00", espera: "7", ordem: "1", ativa: true },
    { nome: "Executivo", descricao: "Veículo premium, alto padrão", taxaBase: "10.00", porKm: "5.00", porMin: "1.00", minima: "20.00", espera: "10", ordem: "2", ativa: true },
  ];
}

export default function PrecosTotem() {
  const [sub, setSub] = useState<"categorias" | "cidades">("categorias");
  return (
    <>
      <div className="abas" style={{ marginBottom: 14, width: "fit-content" }}>
        <button className={sub === "categorias" ? "ativo" : ""} onClick={() => setSub("categorias")}>Categorias por totem</button>
        <button className={sub === "cidades" ? "ativo" : ""} onClick={() => setSub("cidades")}>Preços por cidade</button>
      </div>
      {sub === "cidades" ? <PrecosCidade /> : <CategoriasPorTotem />}
    </>
  );
}

function CategoriasPorTotem() {
  const { dados, erro: erroLista, recarregar } = useCarregar(() => apiCentral.locais(), []);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [forms, setForms] = useState<FormCat[]>([]);
  const [surge, setSurge] = useState("1.00");
  const [salvando, setSalvando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const locais = dados?.locais ?? [];
  const local = locais.find((l) => l.id === escolhido) ?? null;

  useEffect(() => { if (!escolhido && locais[0]) setEscolhido(locais[0].id); }, [locais, escolhido]);
  // Trocou de totem: carrega a tabela dele (os outros totens não são tocados).
  useEffect(() => {
    if (!local || !dados) return;
    setForms(local.tabela.length ? local.tabela.map(paraForm) : padrao(dados.categorias));
    setSurge(String(local.surge ?? 1)); setMsg(null);
  }, [local?.id, local?.versao, dados?.categorias.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (i: number, campo: keyof FormCat, v: string | boolean) => setForms((f) => f.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));
  const gravar = async (copiarPara?: "todos") => {
    if (!local) return;
    if (!forms.length) return setMsg({ texto: "Adicione pelo menos uma categoria", erro: true });
    const alvo = copiarPara ? setCopiando : setSalvando;
    alvo(true); setMsg(null);
    try {
      await apiCentral.salvarPrecos(local.id, { tabela: forms.map(doForm), surge: num(surge) || 1, copiarPara });
      setMsg({ texto: copiarPara ? "Categorias copiadas para todos os outros totens!" : `Preços de ${local.nome} salvos com sucesso!` });
      recarregar();
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { alvo(false); }
  };

  if (!dados) return <div className="vazio"><Loader2 className="gira" /></div>;

  return (
    <>
      <Titulo titulo="Tabela de preços" sub="Defina preços independentes por totem e categoria" />
      {erroLista && <div className="aviso erro">{erroLista}</div>}
      {!locais.length ? (
        <Cartao>
          <div className="vazio"><MapPin size={28} /><p><b>Nenhum totem cadastrado</b></p><small>Crie pelo menos um totem na aba "Totens &amp; Locais" para configurar preços por categoria.</small></div>
        </Cartao>
      ) : (
        <>
          <Cartao titulo="Editando categorias do totem:">
            <div className="acoes">
              {locais.map((l) => <button key={l.id} className={`botao ${l.id === escolhido ? "primario" : ""}`} onClick={() => setEscolhido(l.id)}><MapPin size={14} /> {l.nome}</button>)}
            </div>
            {local && <small>As alterações abaixo afetam apenas o totem <b>{local.nome}</b>. Os outros totens não são modificados.{!local.tabela.length && " Este totem ainda usa as categorias e tarifas da empresa: ao salvar, passa a usar esta tabela."}</small>}
          </Cartao>

          <form className="form" onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
            <Cartao>
              <label>Multiplicador de demanda (surge)
                <input type="number" step="0.01" min="0.5" max="10" value={surge} onChange={(e) => setSurge(e.target.value)} style={{ maxWidth: 140 }} />
                <small>Aplicado sobre todas as categorias. 1.0 = preço normal.</small>
              </label>
            </Cartao>

            {forms.map((f, i) => (
              <Cartao key={i} titulo={`Categoria ${i + 1}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span><Car size={15} /> <b>{f.nome || "Nova categoria"}</b></span>
                  <button type="button" className="icone" aria-label="Remover categoria" onClick={() => setForms((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                  <label>Nome
                    <input list="categorias-da-empresa" value={f.nome} onChange={(e) => mudar(i, "nome", e.target.value)} required maxLength={60} />
                  </label>
                  <label>Descrição<input value={f.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} maxLength={120} /></label>
                  <label>Taxa base (R$)<input type="number" step="0.01" min="0" value={f.taxaBase} onChange={(e) => mudar(i, "taxaBase", e.target.value)} /></label>
                  <label>Por km (R$)<input type="number" step="0.01" min="0" value={f.porKm} onChange={(e) => mudar(i, "porKm", e.target.value)} /></label>
                  <label>Por min (R$)<input type="number" step="0.01" min="0" value={f.porMin} onChange={(e) => mudar(i, "porMin", e.target.value)} /></label>
                  <label>Corrida mínima (R$)<input type="number" step="0.01" min="0" value={f.minima} onChange={(e) => mudar(i, "minima", e.target.value)} /></label>
                  <label>Tempo espera (min)<input type="number" min="0" max="240" value={f.espera} onChange={(e) => mudar(i, "espera", e.target.value)} /></label>
                  <label>Ordem<input type="number" value={f.ordem} onChange={(e) => mudar(i, "ordem", e.target.value)} /></label>
                </div>
                <label className="check"><input type="checkbox" checked={f.ativa} onChange={(e) => mudar(i, "ativa", e.target.checked)} /> Categoria ativa (visível para passageiros)</label>
              </Cartao>
            ))}
            <datalist id="categorias-da-empresa">{dados.categorias.map((c: CategoriaTotem) => <option key={c.nome} value={c.nome} />)}</datalist>

            <button type="button" className="botao" onClick={() => setForms((x) => [...x, { nome: "", descricao: "", taxaBase: "5.00", porKm: "2.50", porMin: "0.50", minima: "8.00", espera: "5", ordem: String(x.length), ativa: true }])}>
              <Plus size={16} /> Adicionar categoria a {local?.nome ?? "totem"}
            </button>
            <small>O nome da categoria precisa existir em Categorias e tarifas (é com ela que a corrida é aberta). O preço sai da tabela do totem: taxa base + km + minutos, nunca abaixo da corrida mínima, vezes o multiplicador. Sem destino com endereço no mapa, vale a corrida mínima.</small>

            {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.erro ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />} {msg.texto}</div>}
            <div className="acoes">
              <button className="botao primario" disabled={salvando || copiando}>{salvando ? <Loader2 size={14} className="gira" /> : <Save size={14} />} {salvando ? "Salvando..." : `Salvar categorias de ${local?.nome ?? "totem"}`}</button>
              {locais.length > 1 && (
                <button type="button" className="botao" disabled={salvando || copiando}
                  onClick={() => confirm(`Substituir as categorias de ${locais.length - 1} outro(s) totem(ns) pelas deste? As categorias atuais deles serão apagadas.`) && void gravar("todos")}>
                  {copiando ? <Loader2 size={14} className="gira" /> : <Copy size={14} />} {copiando ? "Copiando..." : "Copiar para todos os totens"}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </>
  );
}
