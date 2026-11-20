// Peças comuns das telas Personalização app passageiro e app motorista: página em 3 colunas (menu lateral com destaque da seção
// que está na tela, formulário e pré-visualização), grade de cores, cartões de escolha, envio da imagem e miniaturas.

import { useEffect, useState, type ReactNode } from "react";
import { Check, ImageIcon, Image as ImagemIcone, Info, Trash2, Upload } from "lucide-react";
import { iconeCarroUrl, ROTULO_VEICULO, VEICULOS_MAPA, type VeiculoMapa } from "../../../comum/icone-carro";

/** As 36 cores da Machine (a cor principal só se escolhe nesta grade). */
export const CORES = ["#404857", "#2c2c2c", "#000000", "#13d1fe", "#00c0d9", "#2b7aff", "#3463b4", "#297188", "#0c6094", "#102b5e", "#00b1b3", "#04d7b1",
  "#0ed872", "#8bc34a", "#02a862", "#59835d", "#007068", "#ffc400", "#e8a73a", "#f2c869", "#ff9c1b", "#ff7000", "#e48d4e", "#ff7a64",
  "#ff9294", "#ff6ba9", "#8a7bfc", "#7148cc", "#8b2ec6", "#dc256c", "#ff355a", "#e14f54", "#ce3345", "#bb1d44", "#951329", "#e72f49"];
export const MAX_IMAGEM = 5 * 1024 * 1024;

/** Cor clara (o texto sobre ela precisa ser escuro): a pré-visualização ganha "contraste escuro", como na Machine. */
export const corClara = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.6; };

export interface ItemMenu { id: string; rotulo: string; icone: ReactNode }
export interface SecaoMenu { titulo: string; itens: ItemMenu[] }

/** Menu lateral: o item da seção que está na tela fica marcado (muda ao rolar). */
function MenuLateral({ secoes }: { secoes: SecaoMenu[] }) {
  const ids = secoes.flatMap((s) => s.itens.map((i) => i.id));
  const [ativo, setAtivo] = useState(ids[0]);
  useEffect(() => {
    const alvos = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!alvos.length || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Map<string, number>();
    const obs = new IntersectionObserver((es) => {
      for (const e of es) { if (e.isIntersecting) visiveis.set(e.target.id, e.boundingClientRect.top); else visiveis.delete(e.target.id); }
      const primeiro = ids.find((id) => visiveis.has(id));
      if (primeiro) setAtivo(primeiro);
    }, { rootMargin: "-80px 0px -55% 0px" });
    alvos.forEach((a) => obs.observe(a));
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="pe-menu" id="pers-menu">
      <nav className="pe-indice" aria-label="Seções">
        {secoes.map((s) => (
          <div key={s.titulo} className="pe-indice-secao">
            <h2>{s.titulo}</h2>
            {s.itens.map((i) => (
              <a key={i.id} href={`#${i.id}`} className={ativo === i.id ? "is-active" : ""} onClick={(e) => { e.preventDefault(); setAtivo(i.id); document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{i.icone}<span>{i.rotulo}</span></a>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function PaginaPers({ secoes, previa, children }: { secoes: SecaoMenu[]; previa: ReactNode; children: ReactNode }) {
  return (
    <div className="pe-layout">
      <MenuLateral secoes={secoes} />
      <div className="pe-form">{children}</div>
      <aside className="pe-previa" aria-label="Pré visualização"><h2>Pré visualização</h2>{previa}</aside>
    </div>
  );
}

export function Item({ id, titulo, desc, children }: { id: string; titulo: string; desc?: string; children: ReactNode }) {
  return <div className="pe-item" id={id}><h3>{titulo}</h3>{desc && <p className="sub">{desc}</p>}{children}</div>;
}

export function GradeCores({ valor, onChange, admin }: { valor: string; onChange: (c: string) => void; admin: boolean }) {
  return (
    <div className="pe-cores" role="radiogroup" aria-label="Cor principal">
      {CORES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={valor === c} aria-label={c} disabled={!admin} className={`pe-cor ${valor === c ? "sel" : ""}`} style={{ background: c, color: corClara(c) ? "#111827" : "#fff" }} onClick={() => onChange(c)}>
          {valor === c && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}

export function CartoesVeiculo({ valor, onChange, admin }: { valor: string; onChange: (v: string) => void; admin: boolean }) {
  return (
    <>
      <div className="pe-cartoes" role="radiogroup" aria-label="Veículo no mapa">
        {VEICULOS_MAPA.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={valor === v} disabled={!admin} className={`pe-opcao ${valor === v ? "sel" : ""}`} onClick={() => onChange(v)}>
            <img src={iconeCarroUrl(v, "livre")} alt={ROTULO_VEICULO[v]} width={44} height={44} /><span>{ROTULO_VEICULO[v]}</span>
          </button>
        ))}
      </div>
      <div className="pe-alerta"><Info size={16} /><div>Caso uma corrida atinja o limite máximo de recálculo da rota até o embarque ou durante a viagem, o ícone Realista será substituído pelo estilo Moderno.<br /><br />A exibição de motoristas ocupados pode ser ativada em Configurações &gt; Gerais. Ao optar pelo ícone Realista, os motoristas aparecerão no mapa, mas sem distinção visual entre livre e ocupado.</div></div>
    </>
  );
}

/** Miniatura do estilo da tela (desenho simples do que cada estilo mostra). */
export function MiniEstilo({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 120 70" className="pe-mini" aria-hidden>
      {id === "flutuante" && <><rect width="120" height="70" fill="#dbeafe" /><rect x="8" y="30" width="104" height="34" rx="8" fill="#fff" stroke="#cbd5e1" /><rect x="16" y="38" width="60" height="6" rx="3" fill="#cbd5e1" /><rect x="16" y="50" width="40" height="6" rx="3" fill="#e2e8f0" /></>}
      {id === "neutro" && <><rect width="120" height="70" fill="#fff" /><rect width="120" height="28" fill="#dbeafe" /><rect x="10" y="36" width="70" height="6" rx="3" fill="#cbd5e1" /><rect x="10" y="48" width="44" height="6" rx="3" fill="#e2e8f0" /></>}
      {id === "marcante" && <><rect width="120" height="70" fill="#fff" /><rect width="120" height="26" fill="#1e293b" /><rect x="10" y="34" width="70" height="6" rx="3" fill="#cbd5e1" /><rect x="10" y="46" width="44" height="6" rx="3" fill="#e2e8f0" /></>}
    </svg>
  );
}

export function MiniMarca({ id }: { id: string }) {
  const img = <span className="pe-mini-img"><ImageIcon size={18} /></span>;
  return (
    <span className="pe-marca-mini">
      {id === "texto" && <b>Nome</b>}
      {id === "imagem" && img}
      {id === "texto_imagem" && <>{img}<b>Nome</b></>}
      {id === "imagem_alongada" && <span className="pe-mini-img larga"><ImageIcon size={18} /></span>}
    </span>
  );
}

/** Envio da imagem da marca: aparece ao escolher um modo com imagem. Vale na hora, como na Machine. */
export function EnvioImagem({ titulo, dimensoes, url, nome, admin, enviando, enviar, excluir }: {
  titulo: string; dimensoes: [number, number]; url: string; nome: string; admin: boolean; enviando: boolean; enviar: (f: File | undefined) => void; excluir: () => void;
}) {
  return (
    <div className="pe-upload">
      <h3>{titulo}</h3>
      <p className="sub">Com dimensões de {dimensoes[0]} x {dimensoes[1]}px, formato PNG ou JPG até 5 MB.</p>
      {url ? (
        <div className="pe-arquivo">
          <span className="pe-miniatura"><img src={url} alt="Sua marca" /></span>
          <span className="pe-arquivo-nome">{nome}</span>
          {admin && <span className="dm-linha">
            <label className="botao"><Upload size={14} /> Trocar<input type="file" hidden accept="image/png,image/jpeg" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; enviar(a); }} /></label>
            <button type="button" className="botao" onClick={excluir}><Trash2 size={14} /> Excluir</button>
          </span>}
        </div>
      ) : admin ? (
        <label className="pe-soltar"><ImagemIcone size={20} /> {enviando ? "Enviando..." : "Escolher imagem"}<input type="file" hidden accept="image/png,image/jpeg" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; enviar(a); }} /></label>
      ) : <p className="sub">Sem imagem enviada.</p>}
    </div>
  );
}

/** Confere o arquivo antes de mandar (PNG ou JPG, até 5 MB). Devolve o texto do erro, ou "" se estiver bom. */
export const problemaDaImagem = (f: File) => (!/^image\/(png|jpeg)$/.test(f.type) ? "Envie uma imagem em formato PNG ou JPG." : f.size > MAX_IMAGEM ? "Envie uma imagem de no máximo 5 MB." : "");
