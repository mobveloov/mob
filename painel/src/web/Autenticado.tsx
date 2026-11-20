import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ChevronDown, KeyRound, LogOut, Menu, Moon, Newspaper, Search, Sun, X } from "lucide-react";
import { NOME_CARGO, podeCargo } from "../comum/cargos.ts";
import { moduloDaFuncao } from "../comum/modulos.ts";
import { funcoesDoCargo, type Funcao } from "../comum/funcoes.ts";
import { BotaoRecolher, MenuItens } from "./menu/MenuLateral";
import { BuscaGlobal } from "./menu/BuscaGlobal";
import { Atualizacoes } from "./menu/Atualizacoes";
import { urlImagem } from "./api";
import { useSessao } from "./App";
import Painel from "./paginas/Painel";
import ConsultarCorridas from "./paginas/ConsultarCorridas";
import Acompanhamento from "./paginas/Acompanhamento";
import Avaliacoes from "./paginas/Avaliacoes";
import AlterarSenha from "./paginas/AlterarSenha";
import { EmConstrucao } from "./componentes/ui";
import { TELAS_ENTREGUES } from "./telas/registro";
import { FaixaAlerta, Sino } from "./telas/demais/CentralNotificacoes";
import { SeletorCentral } from "./telas/centrais/Seletor";
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
import { AppTotem, LocaisTotem, SolicitarCorrida } from "./totem";
import { CrmPainel } from "./crm";

// Tudo o que só existe depois do login: menu, telas e rotas internas. O App.tsx carrega este arquivo sob demanda
// (import dinâmico), então a tela de entrada não leva nenhum nome de tela nem de rota do painel.
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
  crm: <CrmPainel />,
  bot: <BotWhatsApp />, totem: <LocaisTotem />, "app-totem": <AppTotem />, analise: <Analise />, apps: <AppsCentral />, documentos: <DocumentosMotoristas />,
  enderecos: <Enderecos />, marca: <MarcaAparencia />,
};
const tela = (f: Funcao) => TELAS_ENTREGUES[f.id] ?? PROVISORIAS[f.id] ?? <EmConstrucao titulo={f.nome} sub="Em breve nesta versão do painel." />;

// ------------------------------------------------------------------ menu

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const iniciais = (nome: string) => (nome.trim().charAt(0) || "?").toUpperCase();
const CARGO: Record<string, string> = NOME_CARGO;

/** Foto da empresa (quadrado arredondado com anel dourado); sem foto, a inicial do nome. */
function FotoEmpresa({ classe = "" }: { classe?: string }) {
  const { sessao, marca } = useSessao();
  const arq = marca.arquivos.fotoEmpresa;
  return (
    <span className={`foto-empresa-mini ${classe}`}>
      {arq ? <img src={urlImagem(sessao.empresa.id, arq)} alt="" /> : <b>{iniciais(sessao.empresa.nome)}</b>}
    </span>
  );
}

export default function Layout({ escuro, trocarTema, trocarEmpresa, sair }: { escuro: boolean; trocarTema: () => void; trocarEmpresa: (id: string) => void; sair: () => void }) {
  const { sessao, marca } = useSessao();
  const local = useLocation();
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [recolhido, setRecolhido] = useState(() => ler("menuLateral") === "recolhido");
  const admin = podeCargo(sessao.usuario.papel, "gestor"); // seletor de centrais (cobrança)
  const desligados = new Set(sessao.recursosDesligados ?? []);
  const funcoes = funcoesDoCargo(sessao.usuario.papel).filter((f) => { const m = moduloDaFuncao(f.id); return !m || !desligados.has(m); });
  const nomeUsuario = sessao.usuario.nome || sessao.usuario.email;
  useEffect(() => { window.scrollTo(0, 0); setAberto(false); }, [local.pathname]);
  // Ctrl K (ou Cmd K) abre a busca de telas em qualquer lugar do painel.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setBuscando((b) => !b); } };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const alternarMenu = () => { const novo = !recolhido; gravar("menuLateral", novo ? "recolhido" : "aberto"); setRecolhido(novo); };

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
        <NavLink to="/alterar-senha" className="dropdown-item"><KeyRound size={16} /> Trocar senha</NavLink>
        <div className="separador" />
        <button className="dropdown-item sair" onClick={sair}><LogOut size={16} /> Sair</button>
      </div>
    </div>
  );

  const cabecalhoMenu = (
    <Link to="/" className="ml-cabecalho" title={sessao.empresa.nome}>
      <FotoEmpresa />
      <span className="ml-texto ml-empresa"><strong>{sessao.empresa.nome}</strong><small>Painel Administrativo</small></span>
    </Link>
  );

  return (
    <div className={`app ${recolhido ? "menu-recolhido" : ""}`}>
      {/* Menu lateral fixo (computador) */}
      <aside className="ml-lateral" aria-label="Menu lateral">
        {cabecalhoMenu}
        <div className="ml-rolagem"><MenuItens funcoes={funcoes} assistente={marca.assistente.nome} recolhido={recolhido} /></div>
        <div className="ml-rodape"><BotaoRecolher recolhido={recolhido} alternar={alternarMenu} /></div>
      </aside>

      <div className="coluna">
        {/* Barra do topo (computador): só empresa, tema, sino e perfil */}
        <header className="barra-topo">
          <Link to="/" className="topo-empresa" aria-label={sessao.empresa.nome}><FotoEmpresa classe="pequena" /><strong>{sessao.empresa.nome}</strong></Link>
          <div className="barra-lado">
            <button className="botao-topo" onClick={() => setBuscando(true)} aria-label="Buscar configuração ou tela" title="Buscar configuração ou tela (Ctrl K)"><Search size={16} /><span>Buscar</span><kbd>Ctrl K</kbd></button>
            <button className="botao-topo so-icone" onClick={() => setNovidades(true)} aria-label="Atualizações" title="Atualizações"><Newspaper size={18} /></button>
            {admin && <SeletorCentral key={sessao.empresa.id} empresaId={sessao.empresa.id} />}
            <Sino />
            <button className="botao-tema" onClick={trocarTema} aria-label="Alternar Tema" title="Alternar Tema">{escuro ? <Sun size={18} /> : <Moon size={18} />}</button>
            {usuarioMenu}
          </div>
        </header>

        {/* Barra do celular com hambúrguer */}
        <header className="barra-celular">
          <button className="hamburguer" onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={24} /></button>
          <Link to="/" className="logo-topo" aria-label={sessao.empresa.nome}><FotoEmpresa classe="pequena" /></Link>
          <div className="barra-lado">
            <button className="botao-topo so-icone" onClick={() => setBuscando(true)} aria-label="Buscar configuração ou tela"><Search size={20} /></button>
            <button className="botao-topo so-icone" onClick={() => setNovidades(true)} aria-label="Atualizações"><Newspaper size={20} /></button>
            <Sino />
            <Link to="/alterar-senha" className="avatar" aria-label="Minha conta">{iniciais(nomeUsuario)}</Link>
          </div>
        </header>
        <BuscaGlobal funcoes={funcoes} assistente={marca.assistente.nome} empresa={sessao.empresa} cargo={CARGO[sessao.usuario.papel] ?? sessao.usuario.papel} aberta={buscando} fechar={() => setBuscando(false)} />
        <Atualizacoes aberta={novidades} fechar={() => setNovidades(false)} />
        {aberto && <div className="cortina" onClick={() => setAberto(false)} />}
        <aside className={`lateral ml-lateral-gaveta ${aberto ? "aberta" : ""}`} aria-hidden={!aberto}>
          <div className="lateral-topo">
            {cabecalhoMenu}
            <button onClick={() => setAberto(false)} aria-label="Fechar menu"><X size={22} /></button>
          </div>
          <div className="ml-rolagem">
            <MenuItens funcoes={funcoes} assistente={marca.assistente.nome} aoEscolher={() => setAberto(false)} />
            <div className="lateral-pref">
              <p>Preferências</p>
              {admin && <SeletorCentral key={sessao.empresa.id} empresaId={sessao.empresa.id} classe="lateral" />}
              <button className="mobile-link" onClick={trocarTema}><span>{escuro ? <Sun size={16} /> : <Moon size={16} />} Alternar Tema</span></button>
            </div>
          </div>
          <div className="lateral-rodape"><button onClick={sair}><LogOut size={18} /> Sair</button></div>
        </aside>

        <main className="conteudo">
          <FaixaAlerta />
          <Routes>
            {funcoes.map((f) => <Route key={f.id} path={f.rota} element={tela(f)} />)}
            {funcoes.flatMap((f) => (f.antigas ?? []).map((a) => <Route key={a} path={a} element={<Navigate to={f.rota} replace />} />))}
            <Route path="*" element={<p className="vazio">Página não encontrada.</p>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
