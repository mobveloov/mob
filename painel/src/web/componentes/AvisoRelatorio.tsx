// Aviso de relatório pronto, como o da Machine: faixa verde fixa embaixo da tela com
// "Relatório gerado com sucesso! / O arquivo está pronto para download", botão "Baixar relatório" e fechar (X).
// Enquanto gera, a faixa fica azul: "Gerando relatório...".
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";

type Estado = { fase: "gerando" } | { fase: "pronto"; blob: Blob; nome: string } | null;

function salvarArquivo(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** `gerar(buscar, nome)`: busca o arquivo (função que devolve o Blob) e mostra o aviso; o download só sai no botão. */
export function useAvisoRelatorio() {
  const [estado, setEstado] = useState<Estado>(null);
  const gerar = async (buscar: () => Promise<Blob>, nome: string) => {
    setEstado({ fase: "gerando" });
    try { setEstado({ fase: "pronto", blob: await buscar(), nome }); } catch (e) { setEstado(null); throw e; }
  };
  const aviso = estado && (
    <div className={`drop-notificacao ${estado.fase === "pronto" ? "sucesso" : "gerando"}`} role="status" aria-live="polite">
      <span className="drop-icone">{estado.fase === "pronto" ? <Check size={26} /> : <Loader2 size={26} className="girando" />}</span>
      <div className="drop-texto">
        <h1>{estado.fase === "pronto" ? "Relatório gerado com sucesso!" : "Gerando relatório..."}</h1>
        {estado.fase === "pronto" && <p>O arquivo está pronto para download</p>}
      </div>
      <div className="drop-botoes">
        {estado.fase === "pronto" && <button type="button" className="drop-baixar" onClick={() => salvarArquivo(estado.blob, estado.nome)}>Baixar relatório</button>}
        <button type="button" className="drop-fechar" aria-label="Fechar" onClick={() => setEstado(null)}><X size={20} /></button>
      </div>
    </div>
  );
  return { gerar, aviso };
}
