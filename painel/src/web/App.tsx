import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { MARCA_PADRAO, imagemDaEmpresa, variaveisTema, type Marca } from "../comum/marca.ts";
import { api, ErroApi, escolherEmpresa, urlImagem, versaoDaImagem, type Sessao } from "./api";
import Entrar from "./paginas/Entrar";
import { useSecurityShield } from "./useSecurityShield";
import { definirEmpresaDoMapa } from "../comum/mapa-base.ts";

interface Ctx { sessao: Sessao; marca: Marca; setMarca: (m: Marca) => void; recarregar: () => void }
const SessaoCtx = createContext<Ctx>(null as unknown as Ctx);
export const useSessao = () => useContext(SessaoCtx);

// O painel inteiro (menu, telas, rotas) só é baixado depois do login válido.
const Layout = lazy(() => import("./Autenticado"));

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

// Usuário da plataforma: volta para a última empresa escolhida (o servidor ignora isso para os outros papéis).
escolherEmpresa(ler("empresa") ?? "");

/** Aplica a marca no documento: variáveis CSS, fonte, título e favicon. */
export function aplicarMarca(m: Marca, empresaId: string | null, escuro: boolean) {
  if (empresaId) definirEmpresaDoMapa(empresaId);
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(variaveisTema(m, escuro))) raiz.style.setProperty(k, v);
  raiz.dataset.theme = escuro ? "dark" : "light";
  document.title = m.produto;
  const idFonte = "fonte-marca";
  let link = document.getElementById(idFonte) as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = idFonte; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(m.fonte).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
  // Ícone da aba e manifest seguem a imagem da empresa; ao trocar, o link é recriado para o navegador não usar o antigo.
  const img = empresaId ? imagemDaEmpresa(m.arquivos) : "";
  const href = img && empresaId ? urlImagem(empresaId, img) : "data:,";
  const antigo = document.getElementById("favicon") as HTMLLinkElement | null;
  if (!antigo || antigo.getAttribute("href") !== href) {
    const novo = document.createElement("link");
    novo.rel = "icon"; novo.id = "favicon"; novo.href = href;
    if (antigo) antigo.replaceWith(novo); else document.head.appendChild(novo);
  }
  const man = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (man && empresaId) man.href = `/manifest.webmanifest?empresa=${empresaId}&v=${encodeURIComponent(versaoDaImagem(img))}`;
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
  useSecurityShield(marca.dominios ?? []); // só em produção; os domínios vêm da marca da empresa

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

  const trocarTema = () => {
    const novo = !escuro, raiz = document.documentElement;
    raiz.classList.add("trocando-tema"); // sem animação na troca: evita o piscar
    gravar("tema", novo ? "escuro" : "claro"); setEscuro(novo); aplicarMarca(marca, sessao.empresa.id, novo);
    requestAnimationFrame(() => requestAnimationFrame(() => raiz.classList.remove("trocando-tema")));
  };
  const trocarEmpresa = (id: string) => { escolherEmpresa(id); gravar("empresa", id); carregar(); };

  return (
    <SessaoCtx.Provider value={{ sessao, marca, setMarca, recarregar: carregar }}>
      <Suspense fallback={<div className="vazio">Carregando...</div>}>
      <Layout escuro={escuro} trocarTema={trocarTema} trocarEmpresa={trocarEmpresa} sair={async () => { await api.sair(); location.reload(); }} />
      </Suspense>
    </SessaoCtx.Provider>
  );
}
