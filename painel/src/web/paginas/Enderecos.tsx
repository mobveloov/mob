import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useSessao } from "../App";
import { CampoEndereco, type PontoEscolhido } from "../componentes/CampoEndereco";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";

interface Municipio { codigo: string; nome: string; uf: string }
interface Situacao { cnefe: boolean; osrm: boolean; municipios: Array<Municipio & { pronto: boolean; preparo: string | null; enderecos: number | null }> }

const pedir = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro || `Erro ${r.status}`);
  return j as T;
};

/** Endereços: cidades atendidas na base pública de endereços (CNEFE) e teste da busca. */
export default function Enderecos() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const sit = useCarregar(() => pedir<Situacao>("/api/enderecos/situacao"), []);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Municipio[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<PontoEscolhido>({ texto: "" });

  useEffect(() => {
    if (busca.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => pedir<{ municipios: Municipio[] }>(`/api/enderecos/municipios?q=${encodeURIComponent(busca)}`).then((r) => setAchados(r.municipios)).catch(() => setAchados([])), 250);
    return () => clearTimeout(t);
  }, [busca]);
  // Enquanto alguma cidade prepara, confere de novo a cada 5 s.
  const preparando = sit.dados?.municipios.some((m) => !m.pronto);
  useEffect(() => { if (!preparando) return; const t = setInterval(sit.recarregar, 5000); return () => clearInterval(t); }, [preparando, sit.recarregar]);

  const salvar = async (lista: string[]) => {
    setErro(null);
    try { await pedir("/api/enderecos/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ municipios: lista }) }); sit.recarregar(); setBusca(""); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };
  const atuais = sit.dados?.municipios.map((m) => m.codigo) ?? [];

  return (
    <>
      <Titulo titulo="Endereços" sub="Base pública de endereços do IBGE (CNEFE): sugestões de rua e número, ponto no mapa e distância da corrida." />
      {sit.dados && !sit.dados.cnefe && (
        <div className="aviso">A base de endereços não está ligada neste servidor. Sem ela, o endereço é digitado em texto livre e o preço sai sem distância. Para ligar: variável <code>CNEFE_DIR</code> (veja docs/ENDERECOS.md).</div>
      )}
      {sit.dados && <p className="sub">Distância: {sit.dados.osrm ? "pelas ruas (servidor de rotas ligado)" : "em linha reta × 1,3 (sem servidor de rotas)"}.</p>}
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="grade">
        <Cartao titulo="Cidades atendidas">
          {!atuais.length && <p className="vazio">Nenhuma cidade escolhida.</p>}
          <ul className="lista">
            {sit.dados?.municipios.map((m) => (
              <li key={m.codigo}>
                <strong>{m.nome}/{m.uf}</strong>{" "}
                {m.pronto ? <span className="selo ok">pronta{m.enderecos ? ` · ${m.enderecos.toLocaleString("pt-BR")} endereços` : ""}</span>
                  : m.preparo?.startsWith("erro") ? <span className="selo ruim">{m.preparo}</span>
                  : <span className="selo alerta"><Loader2 size={12} className="gira" /> preparando{m.preparo ? `: ${m.preparo}` : ""}</span>}
                {admin && <button className="icone" aria-label="Tirar" onClick={() => salvar(atuais.filter((c) => c !== m.codigo))}><X size={14} /></button>}
              </li>
            ))}
          </ul>
          {admin && sit.dados?.cnefe && (
            <>
              <label className="form">Adicionar cidade<input value={busca} placeholder="Nome da cidade" onChange={(e) => setBusca(e.target.value)} /></label>
              <ul className="lista">{achados.filter((m) => !atuais.includes(m.codigo)).map((m) => (
                <li key={m.codigo}><button className="botao" onClick={() => salvar([...atuais, m.codigo])}><Plus size={14} /> {m.nome}/{m.uf}</button></li>
              ))}</ul>
              <p className="sub">Na primeira vez, o painel lê o arquivo do estado (pode levar alguns minutos em estados grandes).</p>
            </>
          )}
          <button className="botao" onClick={sit.recarregar}><RefreshCw size={14} /> Atualizar</button>
        </Cartao>
        <Cartao titulo="Testar a busca">
          <div className="form"><CampoEndereco rotulo="Endereço" valor={teste} onChange={setTeste} /></div>
          {teste.lat != null && <p className="sub">Ponto: {teste.lat}, {teste.lng}</p>}
        </Cartao>
      </div>
    </>
  );
}
