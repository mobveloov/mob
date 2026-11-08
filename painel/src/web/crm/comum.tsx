// Peças comuns das telas do CRM: editor de regras (segmento) com contagem ao vivo e mensagens de retorno.

import { useEffect, useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { useSessao } from "../App";
import { crm, erroTexto, type Lista, type Opcao, type Regras } from "./api";

export const VARIAVEIS_TEXTO = ["primeiro_nome", "nome", "cidade", "cupom", "empresa", "dias_sem_corrida", "corridas"];
export const ROTULO_ESTADO: Record<string, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: "Rascunho", classe: "" }, agendada: { rotulo: "Agendada", classe: "info" }, enviando: { rotulo: "Enviando", classe: "info" },
  pausada: { rotulo: "Pausada", classe: "alerta" }, concluida: { rotulo: "Concluída", classe: "ok" }, cancelada: { rotulo: "Cancelada", classe: "ruim" },
  pendente: { rotulo: "Na fila", classe: "info" }, enviado: { rotulo: "Enviada", classe: "ok" }, falha: { rotulo: "Falhou", classe: "ruim" }, cancelado: { rotulo: "Cancelada", classe: "" },
};

export function Selo({ estado }: { estado: string }) {
  const e = ROTULO_ESTADO[estado] ?? { rotulo: estado, classe: "" };
  return <span className={`selo ${e.classe}`}>{e.rotulo}</span>;
}

/** É admin (ou plataforma)? Operador não dispara nem configura o envio. */
export const useAdmin = () => useSessao().sessao.usuario.papel !== "operador";

/** Mensagem de retorno de uma ação (ok ou erro). */
export function useRetorno() {
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const tentar = async <T,>(f: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    try {
      const r = await f();
      if (ok) setMsg({ texto: typeof ok === "function" ? ok(r) : ok });
      return r;
    } catch (e) { setMsg({ texto: erroTexto(e), erro: true }); return undefined; }
  };
  const caixa: ReactNode = msg ? <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div> : null;
  return { tentar, caixa, setMsg };
}

/** Chips de escolha múltipla. */
function Escolhas({ opcoes, valor, onChange, vazio }: { opcoes: Opcao[]; valor: string[] | undefined; onChange: (v: string[]) => void; vazio: string }) {
  const sel = new Set(valor ?? []);
  if (!opcoes.length) return <small className="sub">{vazio}</small>;
  return (
    <div className="periodo">
      {opcoes.slice(0, 20).map((o) => (
        <button key={o.valor} type="button" className={sel.has(o.valor) ? "chip ativo" : "chip"} onClick={() => { const n = new Set(sel); if (n.has(o.valor)) n.delete(o.valor); else n.add(o.valor); onChange([...n]); }}>
          {o.valor} <small>({o.total})</small>
        </button>
      ))}
    </div>
  );
}

const num = (v: string) => (v === "" ? undefined : Math.max(0, Math.floor(Number(v)) || 0));

/**
 * Regras do segmento: tipo, cidade, inatividade, nº de corridas, categoria, canal e lista.
 * Mostra quantas pessoas recebem (com telefone e sem "não quero receber") antes de salvar.
 */
export function EditorRegras({ regras, onChange, opcoes, listas, semTipo }: {
  regras: Regras; onChange: (r: Regras) => void;
  opcoes?: { cidades: Opcao[]; categorias: Opcao[]; canais: Opcao[] }; listas?: Array<Lista & { total: number }>; semTipo?: boolean;
}) {
  const [op, setOp] = useState(opcoes);
  const [conta, setConta] = useState<{ total: number; destinatarios: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const r = regras;
  const mudar = (p: Partial<Regras>) => onChange({ ...r, ...p });
  // Opções e contagem do público (busca de novo quando as regras mudam).
  useEffect(() => { if (opcoes) setOp(opcoes); }, [opcoes]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      if (!opcoes) crm.publico({ tipo: r.tipo }).then((p) => vivo && setOp(p.opcoes)).catch(() => {});
      crm.contar(r).then((c) => { if (vivo) { setConta(c); setErro(null); } }).catch((e) => vivo && setErro(erroTexto(e)));
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(r)]);
  const listasDoTipo = (listas ?? []).filter((l) => l.regras.tipo === r.tipo);
  return (
    <div className="form">
      {!semTipo && (
        <div className="abas" role="tablist">
          <button type="button" className={r.tipo === "passageiro" ? "ativo" : ""} onClick={() => onChange({ tipo: "passageiro" })}>Passageiros</button>
          <button type="button" className={r.tipo === "motorista" ? "ativo" : ""} onClick={() => onChange({ tipo: "motorista" })}>Motoristas</button>
        </div>
      )}
      <label>Cidade<Escolhas opcoes={op?.cidades ?? []} valor={r.cidades} onChange={(v) => mudar({ cidades: v })} vazio="Nenhuma cidade no público ainda." /></label>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <label>Sem corrida há pelo menos (dias)<input type="number" min={0} value={r.inativoMinDias ?? ""} onChange={(e) => mudar({ inativoMinDias: num(e.target.value) })} /></label>
        <label>Sem corrida há no máximo (dias)<input type="number" min={0} value={r.inativoMaxDias ?? ""} onChange={(e) => mudar({ inativoMaxDias: num(e.target.value) })} /></label>
        <label>Corridas (mínimo)<input type="number" min={0} value={r.corridasMin ?? ""} onChange={(e) => mudar({ corridasMin: num(e.target.value) })} /></label>
        <label>Corridas (máximo)<input type="number" min={0} value={r.corridasMax ?? ""} onChange={(e) => mudar({ corridasMax: num(e.target.value) })} /></label>
      </div>
      <label>Categoria<Escolhas opcoes={op?.categorias ?? []} valor={r.categorias} onChange={(v) => mudar({ categorias: v })} vazio="Sem categorias nas corridas." /></label>
      <label>Canal do pedido<Escolhas opcoes={op?.canais ?? []} valor={r.canais} onChange={(v) => mudar({ canais: v })} vazio="Sem canais nas corridas." /></label>
      {listas && (
        <label>Só quem está na lista
          <select value={r.listaId ?? ""} onChange={(e) => mudar({ listaId: e.target.value || undefined })}>
            <option value="">Todas as pessoas</option>
            {listasDoTipo.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.total})</option>)}
          </select>
        </label>
      )}
      <div className="aviso" style={{ background: "var(--info-bg)", color: "var(--info)", marginBottom: 0 }} aria-live="polite">
        <Users size={14} /> {erro ? erro : conta ? <><strong>{conta.destinatarios}</strong> {conta.destinatarios === 1 ? "pessoa recebe" : "pessoas recebem"} ({conta.total} no segmento; quem não tem telefone, está bloqueado ou pediu para sair fica de fora)</> : "Contando..."}
      </div>
    </div>
  );
}

/** Botões que inserem uma variável no texto. */
export function Variaveis({ onInserir }: { onInserir: (v: string) => void }) {
  return (
    <div className="periodo">
      {VARIAVEIS_TEXTO.map((v) => <button key={v} type="button" className="chip" onClick={() => onInserir(`{${v}}`)}>{`{${v}}`}</button>)}
    </div>
  );
}
