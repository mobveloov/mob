// Página cheia para cadastros longos (motorista, passageiro, empresa, cupom...): ocupa o painel inteiro no lugar da lista,
// com cabeçalho "Voltar + título" e rodapé de botões (Gravar/Cancelar) fixos. O botão Voltar do navegador também fecha.
// A lista de baixo continua montada (só fica escondida), então filtros e página não se perdem.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import "./pagina-cheia.css";

let contador = 0;

export function PaginaCheia({ titulo, sub, onFechar, children, rodape, abas, escopo = "cg" }: {
  titulo: string; sub?: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode; abas?: ReactNode; escopo?: "cg" | "dm";
}) {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const id = useRef(`pc${++contador}`);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main.conteudo") ?? document.body;
    main.classList.add("pc-ativa");
    setAlvo(main);
    window.scrollTo(0, 0);
    // Uma entrada no histórico: o Voltar do navegador fecha a página em vez de sair da tela.
    const eu = id.current;
    try { history.pushState({ ...(history.state ?? {}), pc: eu }, ""); } catch { /* sem histórico */ }
    const voltou = () => fechar.current();
    window.addEventListener("popstate", voltou);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".cg-fundo, .dm-fundo")) fechar.current(); };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("popstate", voltou);
      window.removeEventListener("keydown", esc);
      main.classList.remove("pc-ativa");
      if (history.state?.pc === eu) { try { history.back(); } catch { /* nada */ } }
    };
  }, []);

  if (!alvo) return null;
  const classe = escopo === "cg" ? "cg-janela cg-pagina-cheia" : "dm-modal dm-pagina-cheia";
  return createPortal(
    <section className={`pc-pagina ${classe}`} aria-label={titulo}>
      <header className="pc-topo">
        <button className="pc-voltar" onClick={() => fechar.current()} aria-label="Voltar"><ArrowLeft size={18} /><span>Voltar</span></button>
        <div className="pc-titulo"><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
      </header>
      {abas && <div className="pc-abas">{abas}</div>}
      <div className="pc-corpo">{children}</div>
      {rodape && <footer className="pc-rodape">{rodape}</footer>}
    </section>,
    alvo,
  );
}
