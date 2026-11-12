import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ChevronDown, KeyRound, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { FUNCOES, GRUPOS, type Funcao, type Grupo } from "../comum/funcoes.ts";
import { MARCA_PADRAO, variaveisTema, type Marca } from "../comum/marca.ts";
import { api, ErroApi, escolherEmpresa, urlImagem, type Sessao } from "./api";
import Entrar from "./paginas/Entrar";
import Painel from "./paginas/Painel";
import ConsultarCorridas from "./paginas/ConsultarCorridas";
import Acompanhamento from "./paginas/Acompanhamento";
import Avaliacoes from "./paginas/Avaliacoes";
import AlterarSenha from "./paginas/AlterarSenha";
import { EmConstrucao } from "./componentes/ui";
import { TELAS_ENTREGUES } from "./telas/registro";
import TelaCadastro from "./cadastros/TelaCadastro";
import Financeiro from "./paginas/Financeiro";
import Analise from "./paginas/Analise";
import MarcaAparencia from "./paginas/MarcaAparencia";
import Integracoes from "./paginas/Integracoes";
import Usuarios from "./paginas/Usuarios";
import Enderecos from "./paginas/Enderecos";
import AppsCentral from "./apps/AppsCentral";
import Carteiras from "./apps/Carteiras";
import DocumentosMotoristas from "./apps/DocumentosMotoristas";
import { BotWhatsApp, ConversasWhatsApp } from "./bot";
import { LocaisTotem, SolicitarCorrida } from "./totem";
import { CrmCampanhas, CrmJornadas, CrmPublico } from "./crm";

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
  // Escuro por padrão (como na referência); só fica claro se a pessoa ou a marca escolherem.
  return m.tema !== "claro";
}

export default function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);
  const [estado, setEstado] = useState<"carregando" | "entrar" | "configurar" | "pronto" | "erro">("carregando");
  const [escuro, setEscuro] = useState(true);
  const [empresaPublica, setEmpresaPublica] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const s = await api.sessao();
      setSessao(s); setMarca(s.marca); setEstado("pronto");
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        try {
          const p = await api.marcaPublica();
          setMarca(p.marca); setEmpresaPublica(p.empresaId); setEscuro(usaEscuro(p.marca)); aplicarMarca(p.marca, p.empresaId, usaEscuro(p.marca));
          setEstado(p.precisaConfigurar ? "configurar" : "entrar");
        } catch { setEstado("erro"); }
      } else setEstado("erro");
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (sessao) { const e = usaEscuro(marca); setEscuro(e); aplicarMarca(marca, sessao.empresa.id, e); } }, [marca, sessao]);

  if (estado === "carregando") return <div className="vazio">Carregando...</div>;
  if (estado === "erro") return <div className="aviso erro" style={{ margin: 20 }}>Não consegui falar com o servidor do painel. Rode <code>npm run dev</code> e recarregue a página.</div>;
  if (estado !== "pronto" || !sessao) {
    // Logo da empresa na tela de entrada (a versão escura no tema escuro, se houver).
    const arqLogo = escuro ? marca.arquivos.logoEscuro || marca.arquivos.logoClaro : marca.arquivos.logoClaro || marca.arquivos.logoEscuro;
    const logo = empresaPublica && arqLogo ? urlImagem(empresaPublica, arqLogo) : "";
    return <Entrar marca={marca} logo={logo} primeiroAcesso={estado === "configurar"} onEntrou={carregar} />;
  }

  const trocarTema = () => { const novo = !escuro; gravar("tema", novo ? "escuro" : "claro"); setEscuro(novo); aplicarMarca(marca, sessao.empresa.id, novo); };
  const trocarEmpresa = (id: string) => { escolherEmpresa(id); gravar("empresa", id); carregar(); };

  return (
    <SessaoCtx.Provider value={{ sessao, marca, setMarca, recarregar: carregar }}>
      <Layout escuro={escuro} trocarTema={trocarTema} trocarEmpresa={trocarEmpresa} sair={async () => { await api.sair(); location.reload(); }} />
    </SessaoCtx.Provider>
  );
}

// ------------------------------------------------------------------ telas por id do menu
// Telas provisórias: apontam para a tela nossa mais parecida que já existe. As frentes entregam as telas
// novas em src/web/telas/<grupo>/index.tsx (TELAS_CADASTRO, TELAS_CORRIDAS, TELAS_DEMAIS); o que chegar
// por lá passa na frente (ver src/web/telas/registro.ts). O que não tiver tela mostra "Em construção".
const cad = (id: string) => <TelaCadastro key={id} id={id} />;
const PROVISORIAS: Record<string, JSX.Element> = {
  painel: <Painel />, "alterar-senha": <AlterarSenha />,
  motoristas: cad("motoristas"), passageiros: cad("clientes"), veiculos: cad("veiculos"), equipe: <Usuarios />,
  cupons: cad("cupons"), empresas: cad("conveniadas"), areas: cad("areas"), punicoes: cad("punicoes"), desafios: cad("desafios"),
  solicitar: <SolicitarCorrida />, monitoramento: <Acompanhamento />, historico: <ConsultarCorridas />, ocorrencias: cad("ocorrencias"),
  programadas: <ConsultarCorridas key="programadas" programadas />, objetos: cad("objetos"),
  carteiras: <Carteiras />, relatorios: <Financeiro />, conversas: <ConversasWhatsApp />, notificacoes: cad("notificacoes"),
  categorias: cad("categorias"), integracoes: <Integracoes />, avaliacoes: <Avaliacoes />,
  // Telas próprias (grupo "Mais")
  "crm-publico": <CrmPublico />, "crm-campanhas": <CrmCampanhas />, "crm-jornadas": <CrmJornadas />,
  bot: <BotWhatsApp />, totem: <LocaisTotem />, analise: <Analise />, apps: <AppsCentral />, documentos: <DocumentosMotoristas />,
  enderecos: <Enderecos />, marca: <MarcaAparencia />,
};
const tela = (f: Funcao) => TELAS_ENTREGUES[f.id] ?? PROVISORIAS[f.id] ?? <EmConstrucao titulo={f.nome} sub="Em breve nesta versão do painel." />;

// ------------------------------------------------------------------ menu

const rotuloFuncao = (f: Funcao, assistente: string) => (f.id === "analise" ? `Análise com ${assistente}` : f.nome);
const iniciais = (nome: string) => (nome.trim().charAt(0) || "?").toUpperCase();
const CARGO: Record<string, string> = { plataforma: "Plataforma", admin: "Gestor", operador: "Operador" };

/** Itens de um grupo, separados por seção (títulos pequenos no menu suspenso). */
function porSecao(itens: Funcao[]) {
  const m = new Map<string, Funcao[]>();
  for (const f of itens) { const k = f.secao ?? ""; m.set(k, [...(m.get(k) ?? []), f]); }
  return [...m.entries()];
}

function Layout({ escuro, trocarTema, trocarEmpresa, sair }: { escuro: boolean; trocarTema: () => void; trocarEmpresa: (id: string) => void; sair: () => void }) {
  const { sessao, marca } = useSessao();
  const local = useLocation();
  const [aberto, setAberto] = useState(false);
  const [grupoMobile, setGrupoMobile] = useState<Grupo | null>(null);
  const [fechado, setFechado] = useState<string | null>(null);
  const admin = sessao.usuario.papel !== "operador";
  const logoArq = escuro ? marca.arquivos.logoEscuro || marca.arquivos.logoClaro : marca.arquivos.logoClaro || marca.arquivos.logoEscuro;
  const logo = logoArq ? <img src={urlImagem(sessao.empresa.id, logoArq)} alt={marca.produto} /> : <span className="logo-texto">{marca.produto}</span>;
  const funcoes = FUNCOES.filter((f) => admin || !f.soAdmin);
  const grupos = GRUPOS.map((g) => ({ g, itens: funcoes.filter((f) => f.grupo === g) })).filter((x) => x.itens.length);
  const nomeUsuario = sessao.usuario.nome || sessao.usuario.email;
  const ativoGrupo = (itens: Funcao[]) => itens.some((f) => (f.rota === "/" ? local.pathname === "/" : local.pathname === f.rota || local.pathname.startsWith(`${f.rota}/`)));
  useEffect(() => { window.scrollTo(0, 0); setAberto(false); }, [local.pathname]);

  const linkItem = (f: Funcao) => (
    <NavLink key={f.id} to={f.rota} end className={({ isActive }) => `dropdown-item ${isActive ? "ativo" : ""}`} onClick={() => setFechado(f.grupo)}>
      <span>{rotuloFuncao(f, marca.assistente.nome)}</span>{f.novo && <span className="etiqueta-novo">NOVO</span>}
    </NavLink>
  );

  const usuarioMenu = (
    <div className="nav-grupo usuario">
      <button className="usuario-botao" aria-haspopup="menu">
        <span className="avatar">{iniciais(nomeUsuario)}</span>
        <span className="usuario-nome"><strong>{nomeUsuario}</strong><small>{CARGO[sessao.usuario.papel]}</small></span>
        <ChevronDown size={14} className="seta" />
      </button>
      <div className="nav-dropdown direita">
        <div className="usuario-topo"><small>Conectado como</small><strong>{sessao.usuario.email}</strong></div>
        {sessao.empresas && (
          <label className="usuario-empresa">Empresa
            <select value={sessao.empresa.id} onChange={(e) => trocarEmpresa(e.target.value)}>{sessao.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
          </label>
        )}
        <NavLink to="/alterar-senha" className="dropdown-item"><KeyRound size={16} /> Alterar Senha</NavLink>
        <div className="separador" />
        <button className="dropdown-item sair" onClick={sair}><LogOut size={16} /> Sair do Sistema</button>
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Menu do topo (computador) */}
      <header className="barra-topo">
        <div className="barra-centro">
          <Link to="/" className="logo-topo" aria-label={marca.produto}>{logo}</Link>
          <span className="divisor-v" />
          <nav className="nav-itens" aria-label="Menu principal">
            {grupos.map(({ g, itens }) => {
              if (itens.length === 1 && g !== "Mais") {
                const f = itens[0];
                return <NavLink key={g} to={f.rota} end className={({ isActive }) => `nav-link ${isActive ? "ativo" : ""}`}>{f.nome}</NavLink>;
              }
              return (
                <div key={g} className={`nav-grupo ${fechado === g ? "fechar" : ""}`} onMouseLeave={() => setFechado(null)}>
                  <button className={`nav-link ${ativoGrupo(itens) ? "ativo" : ""}`} aria-haspopup="menu">{g}<ChevronDown size={13} className="seta" /></button>
                  <div className="nav-dropdown">
                    {porSecao(itens).map(([secao, lista]) => (
                      <div key={secao}>{secao && <div className="dropdown-header">{secao}</div>}{lista.map(linkItem)}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
        <div className="barra-lado">
          <button className="botao-tema" onClick={trocarTema} aria-label="Alternar Tema" title="Alternar Tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
          {usuarioMenu}
        </div>
      </header>

      {/* Barra do celular com hambúrguer */}
      <header className="barra-celular">
        <button className="hamburguer" onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={24} /></button>
        <Link to="/" className="logo-topo" aria-label={marca.produto}>{logo}</Link>
        <Link to="/alterar-senha" className="avatar" aria-label="Minha conta">{iniciais(nomeUsuario)}</Link>
      </header>
      {aberto && <div className="cortina" onClick={() => setAberto(false)} />}
      <aside className={`lateral ${aberto ? "aberta" : ""}`} aria-hidden={!aberto}>
        <div className="lateral-topo"><strong>{marca.produto}</strong><button onClick={() => setAberto(false)} aria-label="Fechar menu"><X size={22} /></button></div>
        <nav>
          {grupos.map(({ g, itens }) => {
            if (itens.length === 1 && g !== "Mais") {
              return <NavLink key={g} to={itens[0].rota} end className={({ isActive }) => `mobile-link ${isActive ? "ativo" : ""}`}><span>{itens[0].nome}</span></NavLink>;
            }
            const abre = grupoMobile === g;
            return (
              <div key={g}>
                <button className="mobile-link" onClick={() => setGrupoMobile(abre ? null : g)} aria-expanded={abre}><span>{g}</span><ChevronDown size={16} className={abre ? "girar" : ""} /></button>
                {abre && (
                  <div className="mobile-sub">
                    {porSecao(itens).map(([secao, lista]) => (
                      <div key={secao}>
                        {secao && <div className="mobile-secao">{secao}</div>}
                        {lista.map((f) => <NavLink key={f.id} to={f.rota} end className={({ isActive }) => `mobile-sublink ${isActive ? "ativo" : ""}`}>{rotuloFuncao(f, marca.assistente.nome)}</NavLink>)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="lateral-pref">
            <p>Preferências</p>
            <NavLink to="/alterar-senha" className={({ isActive }) => `mobile-link ${isActive ? "ativo" : ""}`}><span><KeyRound size={16} /> Alterar Senha</span></NavLink>
            <button className="mobile-link" onClick={trocarTema}><span>{escuro ? <Sun size={16} /> : <Moon size={16} />} Alternar Tema</span></button>
          </div>
        </nav>
        <div className="lateral-rodape"><button onClick={sair}><LogOut size={18} /> Sair do Sistema</button></div>
      </aside>

      <main className="conteudo">
        <Routes>
          {funcoes.map((f) => <Route key={f.id} path={f.rota} element={tela(f)} />)}
          {funcoes.flatMap((f) => (f.antigas ?? []).map((a) => <Route key={a} path={a} element={<Navigate to={f.rota} replace />} />))}
          <Route path="*" element={<p className="vazio">Página não encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
