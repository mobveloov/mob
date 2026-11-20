// Janelinha "Atualizações": novidades do painel (texto em src/comum/atualizacoes.ts).
import { useEffect } from "react";
import { X } from "lucide-react";
import { ATUALIZACOES } from "../../comum/atualizacoes.ts";
import "./busca.css";

export function Atualizacoes({ aberta, fechar }: { aberta: boolean; fechar: () => void }) {
  useEffect(() => {
    if (!aberta) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberta, fechar]);
  if (!aberta) return null;
  return (
    <div className="busca-fundo" onMouseDown={fechar}>
      <div className="busca-janela atualizacoes" role="dialog" aria-modal="true" aria-label="Atualizações" onMouseDown={(e) => e.stopPropagation()}>
        <div className="atu-topo"><h2>Atualizações</h2><button onClick={fechar} aria-label="Fechar"><X size={18} /></button></div>
        <ul className="atu-lista">
          {ATUALIZACOES.map((a, i) => <li key={i}><small>{a.data}</small><strong>{a.titulo}</strong><p>{a.texto}</p></li>)}
        </ul>
      </div>
    </div>
  );
}
