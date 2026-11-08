import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { LogOut, Moon, Sparkles, Sun } from "lucide-react";
import { FUNCOES, GRUPOS } from "../comum/funcoes.ts";
import { MARCA_PADRAO, variaveisTema, type Marca } from "../comum/marca.ts";
import { api, ErroApi, escolherEmpresa, urlImagem, type Sessao } from "./api";
import Entrar from "./paginas/Entrar";
import Painel from "./paginas/Painel";
import ConsultarCorridas from "./paginas/ConsultarCorridas";
import Acompanhamento from "./paginas/Acompanhamento";
import Motoristas from "./paginas/Motoristas";
import Avaliacoes from "./paginas/Avaliacoes";
import TelaCadastro from "./cadastros/TelaCadastro";
import { CADASTROS } from "../comum/cadastros.ts";
import Financeiro from "./paginas/Financeiro";
import Estatisticas from "./paginas/Estatisticas";
import Analise from "./paginas/Analise";
import MarcaAparencia from "./paginas/MarcaAparencia";
import Integracoes from "./paginas/Integracoes";
import Usuarios from "./paginas/Usuarios";

interface Ctx { sessao: Sessao; marca: Marca; setMarca: (m: Marca) => void; recarregar: () => void }
const SessaoCtx = createContext<Ctx>(null as unknown as Ctx);
export const useSessao = () => useContext(SessaoCtx);

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

// Usuário da plataforma: volta para a última empresa escolhida (o servidor ignora isso para os outros papéis).
escolherEmpresa(ler("empresa") ?? "");

/** Aplica a marca no documento: variáveis CSS, fonte, título e favicon. */
export function aplicarMarca(m: Marca, empresaId: string | null, escuro: boolean) {
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(variaveisTema(m, escuro))) raiz.style.setProperty(k, v);
  raiz.dataset.theme = escuro ? "dark" : "light";
  document.title = m.produto;
  const idFonte = "fonte-marca";
  let link = document.getElementById(idFonte) as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = idFonte; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(m.fonte).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
  const fav = document.getElementById("favicon") as HTMLLinkElement | null;
  if (fav) fav.href = empresaId && m.arquivos.favicon ? urlImagem(empresaId, m.arquivos.favicon) : "data:,";
  const man = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (man && empresaId) man.href = `/manifest.webmanifest?empresa=${empresaId}`;
}

function usaEscuro(m: Marca): boolean {
  const escolha = ler("tema");
  if (escolha === "escuro") return true;
  if (escolha === "claro") return false;
  if (m.tema === "escuro") return true;
  if (m.tema === "claro") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);
  const [estado, setEstado] = useState<"carregando" | "entrar" | "configurar" | "pronto" | "erro">("carregando");
  const [escuro, setEscuro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const s = await api.sessao();
      setSessao(s); setMarca(s.marca); setEstado("pronto");
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        try {
          const p = await api.marcaPublica();
          setMarca(p.marca); aplicarMarca(p.marca, p.empresaId, usaEscuro(p.marca));
          setEstado(p.precisaConfigurar ? "configurar" : "entrar");
        } catch { setEstado("erro"); }
      } else setEstado("erro");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (sessao) { const e = usaEscuro(marca); setEscuro(e); aplicarMarca(marca, sessao.empresa.id, e); } }, [marca, sessao]);

  if (estado === "carregando") return <div className="vazio">Carregando...</div>;
  if (estado === "erro") return <div className="aviso erro" style={{ margin: 20 }}>Não consegui falar com o servidor do painel. Rode <code>npm run dev</code> e recarregue a página.</div>;
  if (estado !== "pronto" || !sessao) return <Entrar marca={marca} primeiroAcesso={estado === "configurar"} onEntrou={carregar} />;

  const trocarTema = () => { const novo = !escuro; gravar("tema", novo ? "escuro" : "claro"); setEscuro(novo); aplicarMarca(marca, sessao.empresa.id, novo); };
  const trocarEmpresa = (id: string) => { escolherEmpresa(id); gravar("empresa", id); carregar(); };

  return (
    <SessaoCtx.Provider value={{ sessao, marca, setMarca, recarregar: carregar }}>
      <Layout escuro={escuro} trocarTema={trocarTema} trocarEmpresa={trocarEmpresa} sair={async () => { await api.sair(); location.reload(); }} />
    </SessaoCtx.Provider>
  );
}

const PAGINAS: Record<string, JSX.Element> = {
  painel: <Painel />, corridas: <ConsultarCorridas />, acompanhamento: <Acompanhamento />, programadas: <ConsultarCorridas key="programadas" programadas />,
  producao: <Motoristas />, nps: <Avaliacoes />, financeiro: <Financeiro />, estatisticas: <Estatisticas />, analise: <Analise />,
  // Cadastros (motoristas, passageiros, veículos, conveniadas, categorias, cupons, áreas, punições, ocorrências, objetos, desafios)
  ...Object.fromEntries(CADASTROS.map((c) => [c.funcao, <TelaCadastro key={c.id} id={c.id} />])),
  marca: <MarcaAparencia />, integracoes: <Integracoes />, usuarios: <Usuarios />,
};
const SO_ADMIN = new Set(["marca", "integracoes", "usuarios"]);

function Layout({ escuro, trocarTema, trocarEmpresa, sair }: { escuro: boolean; trocarTema: () => void; trocarEmpresa: (id: string) => void; sair: () => void }) {
  const { sessao, marca } = useSessao();
  const local = useLocation();
  const admin = sessao.usuario.papel !== "operador";
  const logo = escuro ? marca.arquivos.logoEscuro || marca.arquivos.logoClaro : marca.arquivos.logoClaro;
  // Só entra no menu o que já funciona. O que ainda falta fica listado em docs/ANALISE_PAINEIS.md.
  const funcoes = FUNCOES.filter((f) => (f.situacao === "pronto" || f.situacao === "parcial") && (admin || !SO_ADMIN.has(f.id)));
  useEffect(() => { window.scrollTo(0, 0); }, [local.pathname]);
  return (
    <div className="app">
      <aside className="menu">
        <div className="marca">
          {logo ? <img src={urlImagem(sessao.empresa.id, logo)} alt={marca.produto} /> : <span className="marca-nome">{marca.produto}</span>}
        </div>
        <nav>
          {GRUPOS.map((g) => {
            const itens = funcoes.filter((f) => f.grupo === g);
            if (!itens.length) return null;
            return (
              <div key={g} className="grupo">
                <span className="grupo-nome">{g}</span>
                {itens.map((f) => (
                  <NavLink key={f.id} to={f.rota} end={f.rota === "/"} className={({ isActive }) => (isActive ? "ativo" : "")}>
                    <span>{f.id === "analise" ? `Análise com ${marca.assistente.nome}` : f.nome}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <main>
        <header className="topo">
          <span className="saudacao">{marca.textos.saudacao}</span>
          {sessao.empresas && (
            <label className="fonte">
              <span>Empresa</span>
              <select value={sessao.empresa.id} onChange={(e) => trocarEmpresa(e.target.value)}>
                {sessao.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
          )}
          <span className="selo info" title="Assistente de análise de corridas"><Sparkles size={14} /> {marca.assistente.nome}</span>
          <button className="icone" onClick={trocarTema} aria-label="Alternar tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icone" onClick={sair} aria-label="Sair" title={`Sair (${sessao.usuario.email})`}><LogOut size={18} /></button>
        </header>
        <Routes>
          {funcoes.filter((f) => PAGINAS[f.id]).map((f) => <Route key={f.id} path={f.rota} element={PAGINAS[f.id]} />)}
          <Route path="*" element={<p className="vazio">Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
