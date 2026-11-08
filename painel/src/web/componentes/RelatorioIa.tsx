import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Printer, Sparkles } from "lucide-react";
import { baixar, type Relatorio } from "../api";
import { useSessao } from "../App";
import { Gaveta } from "./ui";

/** Relatório pronto (com a análise da IA): ver, baixar, imprimir/PDF e plano de ação. */
export function RelatorioIa({ rel, onFechar, nomeBase, onCsv }: { rel: Relatorio | null; onFechar: () => void; nomeBase: string; onCsv?: () => void }) {
  const { marca } = useSessao();
  const [aba, setAba] = useState<"relatorio" | "plano">("relatorio");
  const frame = useRef<HTMLIFrameElement>(null);
  if (!rel) return null;
  const html = aba === "plano" && rel.planoHtml ? rel.planoHtml : rel.html;
  return (
    <Gaveta aberta onFechar={onFechar} titulo={`Relatório com análise de ${marca.assistente.nome}`} larga>
      {rel.aviso && <div className="aviso">{rel.aviso}</div>}
      <div className="barra-acoes">
        <div className="abas">
          <button className={aba === "relatorio" ? "ativo" : ""} onClick={() => setAba("relatorio")}>Relatório</button>
          <button className={aba === "plano" ? "ativo" : ""} disabled={!rel.planoHtml} onClick={() => setAba("plano")} title={rel.planoHtml ? "" : "O plano sai quando a IA responde"}>Plano de ação</button>
        </div>
        <span className="selo info"><Sparkles size={14} /> {rel.comIa ? `Analisado por ${marca.assistente.nome}` : "Só números, sem texto da IA"} · {rel.total} corridas</span>
        <button className="botao" onClick={() => baixar(`${nomeBase}${aba === "plano" ? "-plano" : ""}.html`, html, "text/html;charset=utf-8")}><Download size={16} /> Baixar</button>
        <button className="botao" onClick={() => frame.current?.contentWindow?.print()}><Printer size={16} /> Imprimir / PDF</button>
        {onCsv && <button className="botao" onClick={onCsv}><FileSpreadsheet size={16} /> Planilha (CSV)</button>}
      </div>
      <iframe ref={frame} className="previa" title="Prévia do relatório" srcDoc={html} sandbox="allow-modals allow-same-origin" />
    </Gaveta>
  );
}
