// Caixa de avisos da central, igual nos dois apps (passageiro e motorista). Contrato em docs/PUSH_APPS.md.
// - Mostra tudo o que a central mandou (painel, CRM, jornadas, gatilhos), com lido / não lido.
// - Com o app aberto, busca a lista a cada 20 s (consulta curta) e na hora em que o tempo real avisa ("aviso").
// - Abrir um aviso marca como lido; "Marcar todas como lidas" zera o contador.

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { mensagemDeErro } from "./ui";

export interface AvisoApp { id: string; titulo: string; texto: string; estado: "enviada" | "entregue" | "lida"; em: number }

const eventoAviso = "app-aviso", eventoLido = "app-aviso-lido";
/** Chamado pelo tempo real do app quando chega um evento "aviso". */
export const avisarNovoAviso = (d: unknown) => window.dispatchEvent(new CustomEvent(eventoAviso, { detail: d }));

/** Quantos avisos ainda não foram lidos (para o sino). Atualiza sozinho e quando chega aviso em tempo real. */
export function useNaoLidos(): { naoLidos: number; atualizar: () => void } {
  const [n, setN] = useState(0);
  const atualizar = useCallback(() => { void api<{ naoLidos: number }>("/avisos/contagem").then((r) => setN(r.naoLidos)).catch(() => undefined); }, []);
  useEffect(() => {
    atualizar();
    const t = setInterval(() => { if (document.visibilityState === "visible") atualizar(); }, 30_000);
    window.addEventListener(eventoAviso, atualizar);
    window.addEventListener(eventoLido, atualizar);
    return () => { clearInterval(t); window.removeEventListener(eventoAviso, atualizar); window.removeEventListener(eventoLido, atualizar); };
  }, [atualizar]);
  return { naoLidos: n, atualizar };
}

const quando = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** `classeCartao`: classe do cartão de cada app ("cartao-m" no motorista, "cartao" no passageiro). */
export function ListaDeAvisos({ classeCartao, vazio }: { classeCartao: string; vazio: React.ReactNode }) {
  const [lista, setLista] = useState<AvisoApp[] | null>(null);
  const [erro, setErro] = useState("");
  const buscar = useCallback(() => {
    void api<{ avisos: AvisoApp[] }>("/avisos").then((r) => { setLista(r.avisos); setErro(""); }).catch((e) => { setErro(mensagemDeErro(e)); setLista((l) => l ?? []); });
  }, []);
  useEffect(() => {
    buscar();
    const t = setInterval(() => { if (document.visibilityState === "visible") buscar(); }, 20_000);
    window.addEventListener(eventoAviso, buscar);
    return () => { clearInterval(t); window.removeEventListener(eventoAviso, buscar); };
  }, [buscar]);

  const marcar = async (corpo: { ids?: string[]; todos?: boolean }) => {
    try { await api("/avisos/lidos", { corpo }); } catch { /* tenta de novo na próxima abertura */ }
    setLista((l) => l && l.map((a) => (corpo.todos || corpo.ids?.includes(a.id) ? { ...a, estado: "lida" } : a)));
    window.dispatchEvent(new Event(eventoLido)); // o sino atualiza o número
  };

  if (!lista) return <div className="vazio"><div className="girando" /></div>;
  const naoLidos = lista.filter((a) => a.estado !== "lida").length;
  return (
    <div className="pilha-avisos" style={{ display: "grid", gap: 10 }}>
      {erro && <p className="dica" role="alert">{erro}</p>}
      {!lista.length ? vazio : (
        <>
          {naoLidos > 0 && <button type="button" className="botao-link" style={{ justifySelf: "end" }} onClick={() => void marcar({ todos: true })}>Marcar todas como lidas ({naoLidos})</button>}
          {lista.map((a) => {
            const nova = a.estado !== "lida";
            return (
              <div key={a.id} className={classeCartao} role="button" tabIndex={0} aria-label={`${nova ? "Não lida: " : ""}${a.titulo}`}
                onClick={() => { if (nova) void marcar({ ids: [a.id] }); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && nova) void marcar({ ids: [a.id] }); }}
                style={{ cursor: nova ? "pointer" : "default", borderLeft: nova ? "4px solid var(--m-destaque, var(--cor-destaque, #2563eb))" : undefined, opacity: nova ? 1 : 0.78 }}>
                <strong>{nova && <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "currentColor", marginRight: 6 }} />}{a.titulo}</strong>
                <small className="dica" style={{ display: "block" }}>{quando(a.em)}{nova ? " · não lida" : " · lida"}</small>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{a.texto}</p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
