// Faixa de alertas críticos no topo do conteúdo (como a "banner-global" da Machine): mostra o primeiro alerta e,
// se houver mais, o botão "Ver mais N alertas" abre a lista inteira ("Ver menos" recolhe).
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";

export type ItemBanner = { id: string; titulo: ReactNode; descricao?: string; tom: "vermelho" | "amarelo"; acao?: { rotulo: string; para: string } };

export function BannerGlobal({ itens, aoFechar }: { itens: ItemBanner[]; aoFechar?: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  if (!itens.length) return null;
  const mostrados = aberto ? itens : itens.slice(0, 1);
  const extra = itens.length - 1;
  return (
    <section className={`banner-global${!aberto && extra > 0 ? " recolhido" : ""}`} aria-label="Alertas críticos">
      {mostrados.map((i, n) => (
        <div key={i.id} className={`banner-global-item ${i.tom}`} role="alert">
          <AlertTriangle size={18} />
          <div className="banner-global-texto">
            <p className="banner-global-titulo">{i.titulo}</p>
            {i.descricao && <p className="banner-global-desc">{i.descricao}</p>}
            {n === 0 && extra > 0 && <button type="button" className="banner-global-alternar" onClick={() => setAberto(!aberto)}>{aberto ? "Ver menos" : `Ver mais ${extra} ${extra === 1 ? "alerta" : "alertas"}`}</button>}
          </div>
          {i.acao && <Link className="banner-global-acao" to={i.acao.para}>{i.acao.rotulo}</Link>}
          {aoFechar && <button type="button" className="botao-tema" onClick={() => aoFechar(i.id)} aria-label="Dispensar alerta"><X size={14} /></button>}
        </div>
      ))}
    </section>
  );
}
