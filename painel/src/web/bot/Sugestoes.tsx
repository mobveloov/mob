import { podeCargo } from "../../comum/cargos.ts";
import { useState } from "react";
import { MapPin, Plus, Search, Trash2 } from "lucide-react";
import { useSessao } from "../App";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiBot } from "./api";

/** Sugestões de Endereço: apelidos que o bot troca pelo endereço real (copiado do sistema de referência). */
export function BotSugestoes() {
  const { sessao } = useSessao();
  const admin = podeCargo(sessao.usuario.papel, "admin");
  const [busca, setBusca] = useState("");
  const [apelido, setApelido] = useState("");
  const [local, setLocal] = useState("");
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const lista = useCarregar(() => apiBot.sugestoes(busca.trim()), [busca]);
  const d = lista.dados;
  const colado = /-?\d{1,2}[.,]\d+\s*[,;\s]\s*-?\d{1,3}[.,]\d+/.test(local);

  const adicionar = async () => {
    setOcupado(true);
    try { await apiBot.adicionarSugestao({ nickname: apelido, address: local }); setApelido(""); setLocal(""); setMsg({ texto: "Sugestão adicionada com sucesso!" }); lista.recarregar(); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setOcupado(false); }
  };
  const excluir = async (id: string) => {
    try { await apiBot.excluirSugestao(id); lista.recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };

  return (
    <>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <Cartao titulo={`Sugestões de Endereço${d ? ` (${d.total} cadastradas)` : ""}`}>
        <p className="sub">
          Apelidos que o bot e o totem trocam pelo endereço real. O passageiro digita o apelido (ex.: <em>Espetinho do Gui</em>) e a corrida vai direto para a
          localização cadastrada. No Google Maps, copie os números do lugar (ex.: <em>-21.026138, -48.227547</em>) e cole abaixo; também vale
          <em> Espetinho do Gui : -21.026138, -48.227547</em>. Apelido repetido é recusado.
        </p>
        {admin && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); adicionar(); }}>
            <label>Apelido (como o passageiro fala)<input value={apelido} placeholder="Ex: Espetinho do Gui" onChange={(e) => setApelido(e.target.value)} /></label>
            <label>Localização (cole do Google Maps)
              <input value={local} placeholder="Ex: -21.026138, -48.227547" onChange={(e) => setLocal(e.target.value)} />
            </label>
            <small className="sub">{colado ? "📍 A corrida vai direto para este ponto." : local.trim() ? "Sem localização: será usado como endereço escrito (rua e número)." : "Também aceita o link do Google Maps."}</small>
            <button className="botao primario" disabled={ocupado || !local.trim()}><Plus size={14} /> Adicionar</button>
          </form>
        )}
      </Cartao>
      <Cartao titulo="Procurar sugestão">
        <div className="bot-linha"><Search size={14} /><input style={{ flex: 1 }} value={busca} placeholder="Procurar sugestão pelo apelido (para excluir)..." onChange={(e) => setBusca(e.target.value)} /></div>
        {busca.trim().length >= 2 && !d?.resultados.length && <p className="vazio">Nada encontrado com esse apelido.</p>}
        {d?.resultados.map((s) => (
          <div key={s.id} className="bot-linha" style={{ padding: "6px 0", borderBottom: "1px solid var(--borda)" }}>
            <MapPin size={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{s.nickname}</strong>
              <small className="sub" style={{ display: "block" }}>
                {s.lat != null && s.lng != null ? <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">📍 {s.lat}, {s.lng}</a> : s.address_text}
              </small>
            </div>
            {admin && <button className="botao" title="Excluir" aria-label="Excluir" onClick={() => confirm(`Excluir "${s.nickname}"?`) && excluir(s.id)}><Trash2 size={14} /></button>}
          </div>
        ))}
      </Cartao>
    </>
  );
}
