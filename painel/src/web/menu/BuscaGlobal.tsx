// Busca global (Ctrl K): "Buscar configuração ou tela". Filtra todas as telas do menu lateral, mostra o caminho
// "Grupo > Entrada > Seção" (cada aba de uma entrada é um resultado, que abre na aba certa); acha também os nomes antigos das telas.
// ↑ ↓ navegam, Enter abre, Esc fecha.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { itensParaBusca } from "../../comum/menu-lateral.ts";
import type { Funcao } from "../../comum/funcoes.ts";
import "./busca.css";

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function BuscaGlobal({ funcoes, assistente, empresa, cargo, aberta, fechar }: {
  funcoes: Funcao[]; assistente: string; empresa: { id: string; nome: string }; cargo: string; aberta: boolean; fechar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [sel, setSel] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const ir = useNavigate();
  const todos = useMemo(() => itensParaBusca(funcoes, assistente), [funcoes, assistente]);
  const achados = useMemo(() => {
    const q = sem(texto.trim());
    if (!q) return todos;
    const partes = q.split(/\s+/);
    // Quem tem a frase inteira no nome vem primeiro; depois quem tem todas as palavras no nome; por fim as do caminho.
    const nota = (i: { nome: string; tambem: string }) => (sem(i.nome).includes(q) ? 0 : sem(i.tambem).includes(q) ? 1 : partes.every((p) => sem(i.nome).includes(p)) ? 2 : 3);
    // Acha o nome novo (aba e entrada, no caminho) e o nome antigo da tela (campo `tambem`).
    return todos.filter((i) => partes.every((p) => sem(`${i.nome} ${i.caminho} ${i.tambem}`).includes(p))).map((i, n) => ({ i, n, k: nota(i) })).sort((a, b) => a.k - b.k || a.n - b.n).map((x) => x.i);
  }, [todos, texto]);

  useEffect(() => { if (aberta) { setTexto(""); setSel(0); setTimeout(() => campo.current?.focus(), 0); } }, [aberta]);
  useEffect(() => { setSel(0); }, [texto]);
  useEffect(() => { lista.current?.querySelector(".busca-sel")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  if (!aberta) return null;

  const abrir = (i: number) => { const x = achados[i]; if (x) { ir(x.rota); fechar(); } };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); fechar(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(achados.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); abrir(sel); }
  };

  return (
    <div className="busca-fundo" onMouseDown={fechar}>
      <div className="busca-janela" role="dialog" aria-modal="true" aria-label="Buscar configuração ou tela" onMouseDown={(e) => e.stopPropagation()} onKeyDown={tecla}>
        <div className="busca-campo">
          <Search size={18} />
          <input ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar configuração ou tela" aria-label="Buscar configuração ou tela" />
          <kbd>Esc</kbd>
        </div>
        <ul ref={lista} className="busca-lista" role="listbox">
          {achados.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === sel} className={n === sel ? "busca-sel" : ""} onMouseEnter={() => setSel(n)} onClick={() => abrir(n)}>
              <strong>{i.nome}</strong><small>{i.caminho}</small>
            </li>
          ))}
          {!achados.length && <li className="busca-vazio">Nada encontrado para essa busca.</li>}
        </ul>
        <p className="busca-rodape"><span>Buscando em {empresa.nome} · {empresa.id} · cargo {cargo}</span><span>↑ ↓ navegar · Enter abrir</span></p>
      </div>
    </div>
  );
}
