// Peças de tela do app do motorista: topo, avisos de confirmação, telas vazias, campos, chaves, placa Mercosul,
// botão de deslizar, foto, itens de menu e a busca de dados com tratamento das rotas que ainda não existem.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Car, ChevronLeft, ChevronRight, ChevronsRight, MapPin, type LucideIcon } from "lucide-react";
import { api, config, ErroApi, token, urlArquivo } from "../comum/api";
import { mensagemDeErro } from "../comum/ui";
import { iniciais } from "./tipos";

/** A rota ainda não existe neste servidor (o servidor novo está sendo feito ao mesmo tempo). */
export const semRota = (e: unknown) => e instanceof ErroApi && (e.status === 404 || e.status === 405 || e.status === 501);

/** Busca ao abrir a tela. `faltaRota` fica true quando o servidor ainda não tem a rota. */
export function useBuscar<T>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState("");
  const [faltaRota, setFaltaRota] = useState(false);
  const recarregar = useCallback(async () => {
    if (!caminho) return;
    try { setDados(await api<T>(caminho)); setErro(""); setFaltaRota(false); }
    catch (e) { if (semRota(e)) setFaltaRota(true); else setErro(mensagemDeErro(e)); }
  }, [caminho]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, faltaRota, recarregar, setDados };
}

// ------------------------------------------------------------------ estrutura

export function Topo({ titulo, subtitulo, voltar, contador, direita, estilo = "marca" }: { titulo: string; subtitulo?: ReactNode; voltar?: () => void; contador?: string; direita?: ReactNode; estilo?: "marca" | "escuro" | "esquerda" | "plano" }) {
  return (
    <header className={`topo-m ${estilo}`}>
      {voltar ? <button type="button" className="topo-voltar" aria-label="Voltar" onClick={voltar}>{estilo === "esquerda" ? <ArrowLeft size={20} /> : <ChevronLeft size={22} />}</button> : <span className="topo-vazio" />}
      <div className="topo-titulo"><strong>{titulo}</strong>{subtitulo && <small>{subtitulo}</small>}</div>
      {contador ? <span className="topo-contador">{contador}</span> : direita ?? <span className="topo-vazio" />}
    </header>
  );
}

/** Barra de baixo do início e das Corridas: Mapa | situação | Corridas (e o botão PARAR quando está online). */
export function BarraBaixo({ ativa, online, procurando, aoMapa, aoCorridas, children }: { ativa: "mapa" | "corridas"; online: boolean; procurando?: boolean; aoMapa: () => void; aoCorridas: () => void; children?: ReactNode }) {
  return (
    <div className="folha-inicio">
      <span className="puxador" />
      {online ? <div className={`progresso ${procurando === false ? "parado" : ""}`} /> : null}
      <p className="dica-inicio">{online ? "Você está online" : "Toque em INICIAR para receber viagens"}</p>
      <div className="barra-baixo">
        <button type="button" className={ativa === "mapa" ? "ativa" : ""} onClick={aoMapa}><MapPin size={24} fill={ativa === "mapa" ? "currentColor" : "none"} />Mapa</button>
        <div className="estado">{online ? <><i /><i />Procurando…<i /><i /></> : "Você está offline"}</div>
        <button type="button" className={ativa === "corridas" ? "ativa" : ""} onClick={aoCorridas}><Car size={24} />Corridas</button>
      </div>
      {children}
    </div>
  );
}

export function Pagina({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pagina ${className}`}>{children}</div>;
}

export function Secao({ titulo, texto, icone: I, children }: { titulo?: string; texto?: string; icone?: LucideIcon; children: ReactNode }) {
  return (
    <section className="secao">
      {titulo && <div className="secao-topo">{I && <I size={20} className="cor-marca" />}<div><h3>{titulo}</h3>{texto && <p className="dica">{texto}</p>}</div></div>}
      {children}
    </section>
  );
}

export function Vazio({ icone: I, titulo, texto }: { icone: LucideIcon; titulo: string; texto?: string }) {
  return (
    <div className="vazio">
      <span className="vazio-icone"><I size={34} /></span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
    </div>
  );
}

export function Carregando() { return <div className="vazio"><div className="girando" /></div>; }

export function Erro({ texto }: { texto: string }) { return texto ? <div className="aviso aviso-erro" role="alert">{texto}</div> : null; }
export function Info({ texto, tipo = "info" }: { texto: string; tipo?: "info" | "ok" | "erro" }) { return texto ? <div className={`aviso aviso-${tipo}`} role="status">{texto}</div> : null; }

/** Aviso de confirmação: janela central com ícone redondo, título, texto e dois botões. */
export function Dialogo({ icone: I, perigo, titulo, texto, children, cancelar, confirmar, rotulo, ocupado, rotuloCancelar = "Cancelar" }: {
  icone: LucideIcon; perigo?: boolean; titulo: string; texto?: string; children?: ReactNode; cancelar: () => void; confirmar?: () => void; rotulo?: string; ocupado?: boolean; rotuloCancelar?: string;
}) {
  return (
    <div className="fundo-escuro" role="dialog" aria-modal="true" aria-label={titulo} onClick={cancelar}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()}>
        <span className={`dialogo-icone ${perigo ? "perigo" : ""}`}><I size={26} /></span>
        <h2>{titulo}</h2>
        {texto && <p>{texto}</p>}
        {children}
        <div className="dialogo-botoes">
          <button type="button" onClick={cancelar}>{rotuloCancelar}</button>
          {confirmar && <button type="button" className={perigo ? "perigo" : "marca"} disabled={ocupado} onClick={confirmar}>{rotulo}</button>}
        </div>
      </div>
    </div>
  );
}

/** Folha de baixo simples (sobre a tela), com puxador. Toque fora fecha. */
export function Folha({ titulo, fechar, children }: { titulo?: string; fechar: () => void; children: ReactNode }) {
  return (
    <div className="fundo-escuro baixo" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <span className="puxador" />
        {titulo && <h2 className="folha-titulo">{titulo}</h2>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ formulário

export function Campo({ rotulo, obrigatorio, icone: I, children, dica }: { rotulo: string; obrigatorio?: boolean; icone?: LucideIcon; children: ReactNode; dica?: string }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}{obrigatorio && " *"}</span>
      <span className="campo-caixa">{I && <I size={18} className="campo-icone" />}{children}</span>
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export function Chave({ ligado, mudar, titulo, texto, icone: I, desligada }: { ligado: boolean; mudar: (v: boolean) => void; titulo: string; texto?: string; icone?: LucideIcon; desligada?: boolean }) {
  return (
    <div className={`chave-linha ${desligada ? "inativa" : ""}`}>
      {I && <span className="item-icone"><I size={19} /></span>}
      <div className="item-textos"><strong>{titulo}</strong>{texto && <small>{texto}</small>}</div>
      <button type="button" role="switch" aria-checked={ligado} aria-label={titulo} disabled={desligada} className={`chave ${ligado ? "ligada" : ""}`} onClick={() => mudar(!ligado)}><span /></button>
    </div>
  );
}

export function ItemMenu({ icone: I, titulo, texto, aoTocar, selo, perigo, direita }: { icone: LucideIcon; titulo: string; texto?: string; aoTocar: () => void; selo?: string; perigo?: boolean; direita?: ReactNode }) {
  return (
    <button type="button" className={`item ${perigo ? "perigo" : ""}`} onClick={aoTocar}>
      <span className="item-icone"><I size={19} /></span>
      <span className="item-textos"><strong>{titulo}</strong>{texto && <small>{texto}</small>}</span>
      {selo && <span className="selo-mini">{selo}</span>}
      {direita ?? <ChevronRight size={18} className="item-seta" />}
    </button>
  );
}

// ------------------------------------------------------------------ peças visuais

/** Placa no estilo Mercosul: faixa azul com "BRASIL" em cima. */
export function Placa({ placa, pequena }: { placa: string; pequena?: boolean }) {
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const texto = p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : placa.toUpperCase();
  return <span className={`placa ${pequena ? "pequena" : ""}`}><span className="placa-faixa">MERCOSUL</span><span className="placa-texto">{texto || "—"}</span></span>;
}

/** Imagem protegida (só abre com o token): baixa e mostra. */
export function useImagem(caminho: string | null | undefined) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!caminho) { setUrl(""); return; }
    if (/^(https?:|data:|blob:)/.test(caminho) && !caminho.includes("/api/apps/")) { setUrl(caminho); return; }
    let vivo = true, local = "";
    const endereco = caminho.startsWith("/") ? urlArquivo(caminho) : caminho;
    fetch(endereco, { headers: { authorization: `Bearer ${token() ?? ""}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error())))
      .then((b) => { local = URL.createObjectURL(b); if (vivo) setUrl(local); })
      .catch(() => undefined);
    return () => { vivo = false; if (local) URL.revokeObjectURL(local); };
  }, [caminho]);
  return url;
}

export function Avatar({ foto, nome, tamanho = 48, selo }: { foto?: string | null; nome: string; tamanho?: number; selo?: ReactNode }) {
  const url = useImagem(foto);
  return (
    <span className="avatar" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}>
      {url ? <img src={url} alt="" /> : iniciais(nome)}
      {selo}
    </span>
  );
}

/** Botão de deslizar: arraste a bolinha até o fim para confirmar a etapa. Enter/espaço também confirma. */
export function Deslizar({ texto, aoConcluir, ocupado, cor }: { texto: string; aoConcluir: () => void; ocupado?: boolean; cor?: "verde" | "perigo" }) {
  const trilho = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ inicio: number; max: number } | null>(null);
  const [x, setX] = useState(0);
  const [solto, setSolto] = useState(true);
  useEffect(() => { setX(0); }, [texto, ocupado]);
  const max = () => (trilho.current ? trilho.current.clientWidth - 60 : 200);
  return (
    <div ref={trilho} className={`deslizar ${cor ?? ""} ${ocupado ? "ocupado" : ""}`}>
      <span className="deslizar-texto" style={{ opacity: 1 - Math.min(1, x / Math.max(1, max())) * 0.8 }}>{ocupado ? "Aguarde…" : texto}</span>
      <button
        type="button" className="deslizar-bola" aria-label={`${texto} (deslize ou toque Enter)`} disabled={ocupado}
        style={{ transform: `translateX(${x}px)`, transition: solto ? "transform .25s" : "none" }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); arrasto.current = { inicio: e.clientX - x, max: max() }; setSolto(false); }}
        onPointerMove={(e) => { const a = arrasto.current; if (a) setX(Math.min(a.max, Math.max(0, e.clientX - a.inicio))); }}
        onPointerUp={() => {
          const a = arrasto.current; arrasto.current = null; setSolto(true);
          if (a && x >= a.max * 0.85) { setX(a.max); aoConcluir(); } else setX(0);
        }}
        onPointerCancel={() => { arrasto.current = null; setSolto(true); setX(0); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoConcluir(); } }}
      ><ChevronsRight size={22} /></button>
    </div>
  );
}

/** Contatos da empresa: a rota nova /contatos, ou o suporte da marca. */
export interface Contatos { whatsapp: string; telefone: string; site: string; termosUrl: string; privacidadeUrl: string }
export function useContatos(suporte: { telefone: string; email: string }) {
  const { dados } = useBuscar<Partial<Contatos>>("/contatos");
  const tel = suporte.telefone.replace(/\D/g, "");
  return {
    whatsapp: (dados?.whatsapp ?? tel).replace(/\D/g, ""), telefone: (dados?.telefone ?? tel).replace(/\D/g, ""), site: dados?.site ?? "",
    termosUrl: dados?.termosUrl ?? "", privacidadeUrl: dados?.privacidadeUrl ?? "", email: suporte.email,
  };
}
export const linkWhatsapp = (n: string) => `https://wa.me/${n.length <= 11 ? `55${n}` : n}`;

export const empresaAtual = () => config().empresaId;
