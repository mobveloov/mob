// Depois da corrida: nota com comentário, favoritar ou bloquear o motorista, objeto esquecido e reclamação.

import { useEffect, useState } from "react";
import { api, reais } from "../comum/api";
import { Aviso, Cartao, Estrelas, mensagemDeErro } from "../comum/ui";
import type { Corrida, Perfil } from "./apoio";

const ASSUNTOS = ["Cobrança", "Comportamento", "Atraso", "Rota", "Veículo", "Outro"] as const;

/** Favorito do motorista (lido do perfil). Devolve o estado e a função para trocar. */
export function useFavorito(corrida: Corrida | null) {
  const [estado, setEstado] = useState<{ favorito: boolean; bloqueado: boolean } | null>(null);
  const mid = corrida?.motoristaId ?? null;
  useEffect(() => {
    if (!mid) { setEstado(null); return; }
    void api<Perfil>("/perfil").then((p) => setEstado({ favorito: !!p.favoritos?.includes(mid), bloqueado: !!p.bloqueados?.includes(mid) })).catch(() => setEstado({ favorito: false, bloqueado: false }));
  }, [mid]);
  const mudar = async (lista: "favorito" | "bloquear", ligar: boolean) => {
    if (!corrida) return;
    setEstado(await api<{ favorito: boolean; bloqueado: boolean }>(`/corridas/${corrida.id}/${lista}`, { corpo: { ligar } }));
  };
  return { estado, mudar };
}

export function OpcoesDaCorrida({ corrida, soReclamar = false }: { corrida: Corrida; soReclamar?: boolean }) {
  const { estado, mudar } = useFavorito(soReclamar ? null : corrida);
  const [aberto, setAberto] = useState<"" | "objeto" | "reclamar">("");
  const [descricao, setDescricao] = useState("");
  const [assunto, setAssunto] = useState<(typeof ASSUNTOS)[number]>("Cobrança");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const fazer = async (fn: () => Promise<unknown>, sucesso: string) => {
    setErro(""); setOk(""); setOcupado(true);
    try { await fn(); setOk(sucesso); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const abrir = (q: "objeto" | "reclamar") => { setAberto(aberto === q ? "" : q); setDescricao(""); setErro(""); setOk(""); };
  const enviar = () => fazer(async () => {
    if (aberto === "objeto") await api(`/corridas/${corrida.id}/objeto`, { corpo: { descricao } });
    else await api(`/corridas/${corrida.id}/ocorrencia`, { corpo: { assunto, descricao } });
    setAberto(""); setDescricao("");
  }, aberto === "objeto" ? "Pronto. A central vai procurar o objeto e te avisar." : "Recebemos sua reclamação. A central vai analisar e responder.");

  return (
    <Cartao>
      <h2>Precisa de algo?</h2>
      <div className="acoes">
        {!soReclamar && corrida.motoristaId && estado && (
          <>
            <button className="botao secundario" disabled={ocupado} onClick={() => void fazer(() => mudar("favorito", !estado.favorito), estado.favorito ? "Motorista tirado dos favoritos." : "Motorista nos seus favoritos.")}>
              {estado.favorito ? "★ Tirar dos favoritos" : "☆ Favoritar motorista"}
            </button>
            <button className="botao secundario" disabled={ocupado} onClick={() => {
              if (!estado.bloqueado && !confirm("Não receber mais corridas com este motorista?")) return;
              void fazer(() => mudar("bloquear", !estado.bloqueado), estado.bloqueado ? "Motorista liberado de novo." : "Combinado. Você não vai mais receber este motorista.");
            }}>{estado.bloqueado ? "Liberar motorista" : "Não quero mais este motorista"}</button>
          </>
        )}
        {!soReclamar && <button className="botao secundario" onClick={() => abrir("objeto")}>Esqueci um objeto</button>}
        <button className="botao secundario" onClick={() => abrir("reclamar")}>Reclamar / contestar valor</button>
      </div>
      {aberto && (
        <form className="cartao" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          {aberto === "reclamar" && (
            <label>Assunto
              <select value={assunto} onChange={(e) => setAssunto(e.target.value as (typeof ASSUNTOS)[number])}>{ASSUNTOS.map((a) => <option key={a}>{a}</option>)}</select>
            </label>
          )}
          <label>{aberto === "objeto" ? "O que você esqueceu?" : "Conte o que aconteceu"}
            <textarea value={descricao} maxLength={aberto === "objeto" ? 200 : 1000} placeholder={aberto === "objeto" ? "Ex.: celular preto no banco de trás" : `Ex.: o valor cobrado (${reais(corrida.valor)}) ficou diferente do combinado`} onChange={(e) => setDescricao(e.target.value)} />
          </label>
          <div className="linha">
            <button type="button" className="botao secundario" onClick={() => setAberto("")}>Voltar</button>
            <button className="botao" disabled={ocupado || descricao.trim().length < (aberto === "objeto" ? 3 : 5)}>Enviar</button>
          </div>
        </form>
      )}
      <Aviso texto={ok} tipo="ok" />
      <Aviso texto={erro} />
    </Cartao>
  );
}

export function Avaliar({ corrida, fechar }: { corrida: Corrida; fechar: () => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [enviada, setEnviada] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setErro(""); setOcupado(true);
    try { await api(`/corridas/${corrida.id}/avaliar`, { corpo: { nota, comentario: comentario.trim() || undefined } }); setEnviada(true); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  if (enviada) {
    return (
      <div className="tela">
        <h1>Obrigado pela nota!</h1>
        <OpcoesDaCorrida corrida={corrida} />
        <button className="botao" onClick={fechar}>Fechar</button>
      </div>
    );
  }
  return (
    <div className="tela centro">
      <h1>Corrida finalizada</h1>
      <p className="numero-grande">{reais(corrida.valor)}</p>
      <p>Como foi a viagem com {corrida.motorista?.nome ?? "o motorista"}?</p>
      <Estrelas valor={nota} aoEscolher={setNota} />
      <label style={{ width: "100%", textAlign: "left" }}>Comentário (se quiser)
        <textarea value={comentario} maxLength={500} placeholder="Conte como foi" onChange={(e) => setComentario(e.target.value)} />
      </label>
      <Aviso texto={erro} />
      <div className="linha" style={{ width: "100%" }}>
        <button className="botao secundario" onClick={fechar}>Agora não</button>
        <button className="botao" disabled={!nota || ocupado} onClick={() => void enviar()}>Enviar nota</button>
      </div>
    </div>
  );
}
