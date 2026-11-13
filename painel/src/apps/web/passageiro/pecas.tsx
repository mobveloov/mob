// Peças de tela do app do passageiro: topo, folha de baixo arrastável, janela de confirmação, tela vazia,
// campo com ícone, foto com o token, placa Mercosul, estrelas, preço com − e +.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Minus, Plus, Star, UserRound } from "lucide-react";
import { reais } from "../comum/api";
import { placaBonita, urlDaFoto } from "./apoio";

export function Aviso({ texto, tipo = "erro" }: { texto: string; tipo?: "erro" | "ok" | "info" }) {
  return texto ? <div className={`aviso aviso-${tipo}`} role="alert">{texto}</div> : null;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <div className="carregando"><div className="girando" /><p>{texto}</p></div>;
}

/** Topo na cor da marca, com voltar, título e subtítulo. */
export function Topo({ titulo, sub, voltar, direita, centro = false }: { titulo: string; sub?: string; voltar?: () => void; direita?: ReactNode; centro?: boolean }) {
  return (
    <header className={`topo-marca ${centro ? "centro" : ""}`}>
      {voltar ? <button className="icone-botao" onClick={voltar} aria-label="Voltar"><ChevronLeft size={26} /></button> : <span className="icone-vazio" />}
      <div className="topo-titulo"><strong>{titulo}</strong>{sub && <small>{sub}</small>}</div>
      {direita ?? <span className="icone-vazio" />}
    </header>
  );
}

/** Topo claro, com título grande (Suas viagens, Sua carteira). */
export function TituloGrande({ titulo, voltar }: { titulo: string; voltar?: () => void }) {
  return (
    <div className="titulo-grande">
      {voltar && <button className="icone-botao escuro" onClick={voltar} aria-label="Voltar"><ChevronLeft size={26} /></button>}
      <h1>{titulo}</h1>
    </div>
  );
}

/**
 * Folha de baixo, com puxador. Arrastar para cima abre, para baixo recolhe. Com `fixa`, não recolhe.
 * O conteúdo fica em `children`; o que fica sempre visível (mesmo recolhida) vai em `resumo`.
 */
export function FolhaBaixo({ children, resumo, aberta: inicial = true, fixa = false, className = "", aoMudarAltura }: {
  children?: ReactNode; resumo?: ReactNode; aberta?: boolean; fixa?: boolean; className?: string; aoMudarAltura?: (px: number) => void;
}) {
  const [aberta, setAberta] = useState(inicial);
  const [arraste, setArraste] = useState(0);
  const inicio = useRef<number | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const mudou = useRef(aoMudarAltura);
  mudou.current = aoMudarAltura;
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mudou.current?.(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const soltar = () => {
    if (inicio.current == null) return;
    if (!fixa && arraste > 50) setAberta(false);
    else if (arraste < -30) setAberta(true);
    inicio.current = null; setArraste(0);
  };
  return (
    <div ref={caixa} className={`folha ${aberta ? "aberta" : "recolhida"} ${className}`} style={arraste > 0 ? { transform: `translateY(${arraste}px)` } : undefined}>
      <div className="puxador-area" role="button" tabIndex={0} aria-label={aberta ? "Recolher" : "Abrir"}
        onPointerDown={(e) => { inicio.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (inicio.current != null) setArraste(e.clientY - inicio.current); }}
        onPointerUp={() => { if (Math.abs(arraste) < 6 && !fixa) setAberta((a) => !a); soltar(); }}
        onPointerCancel={soltar}
        onKeyDown={(e) => { if (e.key === "Enter" && !fixa) setAberta((a) => !a); }}>
        <span className="puxador" />
      </div>
      {resumo}
      {aberta && children}
    </div>
  );
}

/** Folha que sobe por cima da tela (com fundo escuro). Fecha ao tocar fora. */
export function FolhaModal({ children, fechar, titulo }: { children: ReactNode; fechar: () => void; titulo?: string }) {
  return (
    <div className="modal-fundo baixo" onClick={fechar}>
      <div className="folha-modal" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <span className="puxador" />
        {titulo && <h2 className="folha-titulo">{titulo}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Janela central de confirmação: ícone redondo, título, texto e dois botões. */
export function Dialogo({ icone, titulo, texto, acao, aoConfirmar, fechar, perigo = false, children, ocupado = false }: {
  icone?: ReactNode; titulo: string; texto?: string; acao: string; aoConfirmar: () => void; fechar: () => void; perigo?: boolean; children?: ReactNode; ocupado?: boolean;
}) {
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="dialogo" role="alertdialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        {icone && <div className={`dialogo-icone ${perigo ? "perigo" : ""}`}>{icone}</div>}
        <h2>{titulo}</h2>
        {texto && <p>{texto}</p>}
        {children}
        <div className="dialogo-botoes">
          <button className="botao contorno" onClick={fechar}>Cancelar</button>
          <button className={`botao ${perigo ? "vermelho" : ""}`} disabled={ocupado} onClick={aoConfirmar}>{acao}</button>
        </div>
      </div>
    </div>
  );
}

/** Tela vazia: ícone grande e cinza, título e uma frase. */
export function Vazio({ icone, titulo, texto }: { icone: ReactNode; titulo: string; texto?: string }) {
  return (
    <div className="vazio">
      <div className="vazio-icone">{icone}</div>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
    </div>
  );
}

/** Campo com rótulo acima e ícone à esquerda. */
export function Campo({ rotulo, icone, obrigatorio, children, direita, travado }: { rotulo: string; icone?: ReactNode; obrigatorio?: boolean; children: ReactNode; direita?: ReactNode; travado?: boolean }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}{obrigatorio && <i className="asterisco"> *</i>}</span>
      <span className={`campo-caixa ${travado ? "travado" : ""}`}>{icone && <span className="campo-icone">{icone}</span>}{children}{direita}</span>
    </label>
  );
}

/** Foto de perfil (baixada com o token). Sem foto, mostra o boneco. */
export function Avatar({ foto, tamanho = 48, nome = "" }: { foto?: string | null; tamanho?: number; nome?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl("");
    if (!foto) return;
    let vivo = true;
    urlDaFoto(foto).then((u) => { if (vivo) setUrl(u); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [foto]);
  return (
    <span className="avatar" style={{ width: tamanho, height: tamanho }}>
      {url ? <img src={url} alt={nome ? `Foto de ${nome}` : "Foto"} /> : <UserRound size={tamanho * 0.55} />}
    </span>
  );
}

/** Placa no estilo Mercosul: faixa azul "BRASIL" em cima. */
export function Placa({ placa }: { placa: string }) {
  if (!placa) return null;
  return <span className="placa" aria-label={`Placa ${placa}`}><span className="placa-faixa">BRASIL</span><span className="placa-numero">{placaBonita(placa)}</span></span>;
}

export function Estrelas({ valor, aoEscolher, tamanho = 38 }: { valor: number; aoEscolher?: (n: number) => void; tamanho?: number }) {
  return (
    <div className="estrelas" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} className={n <= valor ? "acesa" : ""} onClick={() => aoEscolher?.(n)} disabled={!aoEscolher}>
          <Star size={tamanho} fill="currentColor" strokeWidth={1} />
        </button>
      ))}
    </div>
  );
}

export function Nota({ nota }: { nota?: number | null }) {
  return <span className="nota"><Star size={13} fill="currentColor" strokeWidth={0} /> {nota != null ? nota.toFixed(nota % 1 ? 2 : 1).replace(".", ",") : "Novo"}</span>;
}

/** Preço com − e +. */
export function PrecoAjustavel({ valor, mudar, min, max, passo, grande = false }: { valor: number; mudar: (v: number) => void; min: number; max: number; passo: number; grande?: boolean }) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return (
    <span className={`preco-ajuste ${grande ? "grande" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="redondo menos" aria-label="Diminuir o valor" disabled={valor - passo < min - 0.001} onClick={() => mudar(r(Math.max(min, valor - passo)))}><Minus size={grande ? 22 : 14} strokeWidth={3} /></button>
      <strong>{grande ? <><small>R$</small> {valor.toFixed(2).replace(".", ",")}</> : reais(valor)}</strong>
      <button type="button" className="redondo mais" aria-label="Aumentar o valor" disabled={valor + passo > max + 0.001} onClick={() => mudar(r(Math.min(max, valor + passo)))}><Plus size={grande ? 22 : 14} strokeWidth={3} /></button>
    </span>
  );
}

/** Abas em pílula (Todas, Finalizadas…), com rolagem para o lado. */
export function Pilulas<T extends string>({ itens, atual, mudar }: { itens: Array<[T, ReactNode]>; atual: T | null; mudar: (v: T) => void }) {
  return <div className="pilulas">{itens.map(([id, nome]) => <button key={id} className={atual === id ? "ativa" : ""} onClick={() => mudar(id)}>{nome}</button>)}</div>;
}
