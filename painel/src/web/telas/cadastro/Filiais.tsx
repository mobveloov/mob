// Cadastro › Filiais: nome, cidade, endereço, responsável e se está ativa; liga motoristas e operadores a cada filial.
// Servidor: /api/filiais.

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { CampoEndereco } from "../../componentes/CampoEndereco";
import { esquecerCentros } from "../../centro-mapa";
import { Cabecalho, Campo, chamar, Interruptor, Janela, MenuAcoes, Selo, useAviso, Vazio } from "./base";

interface Filial {
  id: string; nome: string; cidade: string; endereco: string; responsavel: string; telefone: string; ativa: boolean; motoristas: number; operadores: number;
  uf: string; lat: number | null; lng: number | null; zoom: number | null; raioKm: number; areaIds: string[];
}
interface Detalhe { filial: Filial; motoristas: Array<{ id: string; nome: string; telefone: string; status: string }>; operadores: Array<{ id: string; nome: string; email: string; papel: string }>; equipeLivre: Array<{ id: string; nome: string; email: string; papel: string }> }

const api = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamar<T>(metodo, caminho, corpo, "/api/filiais");

export default function Filiais() {
  const l = useCarregar(() => api<{ filiais: Filial[] }>("GET", ""), []);
  const [editando, setEditando] = useState<Filial | "nova" | null>(null);
  const [pessoas, setPessoas] = useState<Filial | null>(null);
  const [busca, setBusca] = useState("");
  const { aviso, tentar, setAviso } = useAviso();
  const lista = (l.dados?.filiais ?? []).filter((f) => !busca || `${f.nome} ${f.cidade} ${f.responsavel}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Filiais" sub="Unidades da sua empresa, com motoristas e operadores de cada uma">
        <button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Nova filial</button>
      </Cabecalho>
      <div className="cg-tabela-caixa">
        <div style={{ padding: 12 }}><Campo rotulo="Buscar"><input value={busca} placeholder="Nome, cidade ou responsável" onChange={(e) => setBusca(e.target.value)} /></Campo></div>
        <div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Filial</th><th>Cidade</th><th>Responsável</th><th>Motoristas</th><th>Operadores</th><th>Situação</th><th className="direita">Ações</th></tr></thead>
          <tbody>{lista.map((f) => (
            <tr key={f.id}>
              <td><strong>{f.nome}</strong><small style={{ display: "block" }}>{f.endereco}</small></td>
              <td>{f.cidade || "—"}</td><td>{f.responsavel || "—"}{f.telefone && <small style={{ display: "block" }}>{f.telefone}</small>}</td>
              <td>{f.motoristas}</td><td>{f.operadores}</td>
              <td><Selo tom={f.ativa ? "ok" : "neutro"}>{f.ativa ? "Ativa" : "Inativa"}</Selo></td>
              <td className="direita"><MenuAcoes itens={[
                { rotulo: "Editar", onClick: () => setEditando(f) },
                { rotulo: "Motoristas e operadores", onClick: () => setPessoas(f) },
                { rotulo: "Remover", perigo: true, onClick: () => confirm(`Remover a filial ${f.nome}? Motoristas e operadores ficam sem filial.`) && void tentar(async () => { await api("DELETE", `/${f.id}`); l.recarregar(); }, "Filial removida.") },
              ]} /></td>
            </tr>))}
          </tbody>
        </table></div>
        {l.dados && !lista.length && <Vazio titulo="Nenhuma filial cadastrada." sub="Crie a primeira em Nova filial." />}
      </div>
      {editando && <FormFilial f={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { l.recarregar(); setAviso({ texto: "Filial gravada." }); }} />}
      {pessoas && <Pessoas f={pessoas} onFechar={() => { setPessoas(null); l.recarregar(); }} />}
    </div>
  );
}

function FormFilial({ f, onFechar, onSalvo }: { f: Filial | null; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({
    nome: f?.nome ?? "", cidade: f?.cidade ?? "", uf: f?.uf ?? "", endereco: f?.endereco ?? "", responsavel: f?.responsavel ?? "", telefone: f?.telefone ?? "", ativa: f?.ativa ?? true,
    lat: f?.lat == null ? "" : String(f.lat), lng: f?.lng == null ? "" : String(f.lng), zoom: f?.zoom == null ? "" : String(f.zoom), raioKm: f?.raioKm ? String(f.raioKm) : "", areaIds: f?.areaIds ?? [] as string[],
  });
  const { aviso, tentar } = useAviso();
  // Campos que a pessoa mexeu à mão: a cidade nunca os sobrescreve. Os outros acompanham a cidade escolhida.
  const tocados = useRef(new Set<string>(f ? ["lat", "lng", "zoom", "raioKm", "uf"].filter((k) => (f as unknown as Record<string, unknown>)[k]) : []));
  const [achando, setAchando] = useState("");
  const preencher = async (cidade: string, uf: string, forcar = false) => {
    if (cidade.trim().length < 3) return;
    setAchando("Buscando o centro da cidade...");
    try {
      const g = await api<{ uf: string; lat: number; lng: number; zoom: number; raioKm: number }>("GET", `/geocidade?cidade=${encodeURIComponent(cidade.trim())}&uf=${encodeURIComponent(uf)}`);
      const livre = (k: string) => forcar || !tocados.current.has(k);
      setV((a) => ({ ...a, ...(livre("uf") && g.uf ? { uf: g.uf } : {}), ...(livre("lat") ? { lat: String(g.lat) } : {}), ...(livre("lng") ? { lng: String(g.lng) } : {}), ...(livre("zoom") ? { zoom: String(g.zoom) } : {}), ...(livre("raioKm") ? { raioKm: String(g.raioKm) } : {}) }));
      if (forcar) tocados.current.clear();
      setAchando("");
    } catch (e) { setAchando(e instanceof Error ? e.message : "Não achei essa cidade."); }
  };
  // Filial que já existe sem coordenadas: preenche ao abrir.
  useEffect(() => { if (f && f.cidade && (f.lat == null || f.lng == null)) void preencher(f.cidade, f.uf); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const areas = useCarregar(() => chamar<{ areas: Array<{ id: string; nome: string }> }>("GET", "/areas"), []);
  const salvar = async () => {
    const corpo = { ...v, lat: v.lat.trim(), lng: v.lng.trim(), zoom: v.zoom.trim(), raioKm: v.raioKm.trim() };
    if (await tentar(() => (f ? api("PUT", `/${f.id}`, corpo) : api("POST", "", corpo)))) { esquecerCentros(); onSalvo(); onFechar(); }
  };
  const set = (k: keyof typeof v, x: string | boolean | string[]) => { tocados.current.add(k); setV({ ...v, [k]: x }); };
  return (
    <Janela aberta titulo={f ? "Editar filial" : "Nova filial"} sub="Preencha os dados abaixo" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Nome *"><input value={v.nome} maxLength={80} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <div className="cg-duplo">
          <Campo rotulo="Cidade" dica={achando || "Ao escolher a cidade, o centro, o zoom e o raio são preenchidos sozinhos."}><input value={v.cidade} maxLength={80} onChange={(e) => { tocados.current.delete("cidade"); setV({ ...v, cidade: e.target.value }); }} onBlur={() => void preencher(v.cidade, v.uf)} /></Campo>
          <Campo rotulo="UF"><input value={v.uf} maxLength={2} placeholder="SP" onChange={(e) => set("uf", e.target.value.toUpperCase())} /></Campo>
        </div>
        <CampoEndereco rotulo="Endereço (escolha uma sugestão para marcar no mapa)" valor={{ texto: v.endereco }} onChange={(p) => setV({ ...v, endereco: p.texto.slice(0, 160), ...(p.lat != null && p.lng != null ? (tocados.current.add("lat"), tocados.current.add("lng"), { lat: String(p.lat), lng: String(p.lng) }) : {}) })} />
        <div className="cg-duplo">
          <Campo rotulo="Latitude" dica="Onde o mapa abre para esta filial. Editável."><input value={v.lat} inputMode="decimal" placeholder="automático pela cidade" onChange={(e) => set("lat", e.target.value)} /></Campo>
          <Campo rotulo="Longitude"><input value={v.lng} inputMode="decimal" placeholder="automático pela cidade" onChange={(e) => set("lng", e.target.value)} /></Campo>
        </div>
        <div className="cg-duplo">
          <Campo rotulo="Zoom do mapa" dica="3 a 19. Vazio: o sistema escolhe."><input value={v.zoom} inputMode="numeric" placeholder="automático" onChange={(e) => set("zoom", e.target.value)} /></Campo>
          <Campo rotulo="Raio de cobertura (km)" dica="Círculo em volta do ponto. Vazio: sem círculo."><input value={v.raioKm} inputMode="decimal" placeholder="automático" onChange={(e) => set("raioKm", e.target.value)} /></Campo>
        </div>
        {v.cidade.trim().length >= 3 && <button type="button" className="cg-botao" onClick={() => void preencher(v.cidade, v.uf, true)}>Preencher de novo pela cidade</button>}
        <Campo rotulo="Áreas desenhadas que a filial cobre" dica="De Gestão de áreas > Áreas. Sem escolha, vale a área que contém o ponto da filial.">
          <div style={{ display: "grid", gap: 4 }}>
            {(areas.dados?.areas ?? []).map((a) => <label key={a.id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={v.areaIds.includes(a.id)} onChange={(e) => set("areaIds", e.target.checked ? [...v.areaIds, a.id] : v.areaIds.filter((x) => x !== a.id))} />{a.nome}</label>)}
            {areas.dados && !areas.dados.areas.length && <small>Nenhuma área desenhada ainda.</small>}
          </div>
        </Campo>
        <div className="cg-duplo">
          <Campo rotulo="Responsável"><input value={v.responsavel} maxLength={80} onChange={(e) => set("responsavel", e.target.value)} /></Campo>
          <Campo rotulo="Telefone"><input value={v.telefone} maxLength={20} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        </div>
        <Interruptor ligado={v.ativa} onChange={(x) => set("ativa", x)} rotulo={v.ativa ? "Filial ativa" : "Filial inativa"} />
      </div>
    </Janela>
  );
}

/** Liga e solta motoristas e operadores da filial. */
function Pessoas({ f, onFechar }: { f: Filial; onFechar: () => void }) {
  const d = useCarregar(() => api<Detalhe>("GET", `/${f.id}`), [f.id]);
  const [aba, setAba] = useState<"motoristas" | "operadores">("motoristas");
  const [busca, setBusca] = useState("");
  const { aviso, tentar } = useAviso();
  const motoristas = useCarregar(() => (busca.length >= 2 ? chamar<{ motoristas: Array<{ id: string; nome: string; cpf?: string }> }>("GET", `/motoristas-busca?q=${encodeURIComponent(busca)}`) : Promise.resolve(null)), [busca]);
  const ligar = (tipo: "motoristas" | "operadores", id: string) => void tentar(async () => { await api("POST", `/${f.id}/${tipo}`, { ids: [id] }); d.recarregar(); }, "Ligado à filial.");
  const soltar = (tipo: "motoristas" | "operadores", id: string) => void tentar(async () => { await api("DELETE", `/${f.id}/${tipo}/${id}`); d.recarregar(); }, "Solto da filial.");
  const ligadosM = new Set(d.dados?.motoristas.map((m) => m.id));
  const ligadosO = new Set(d.dados?.operadores.map((o) => o.id));
  const achados = (motoristas.dados?.motoristas ?? []).filter((m) => !ligadosM.has(m.id));
  const livres = (d.dados?.equipeLivre ?? []).filter((u) => !ligadosO.has(u.id));
  return (
    <Janela aberta titulo={f.nome} sub="Motoristas e operadores desta filial" onFechar={onFechar} largura="media" rodape={<button className="cg-botao" onClick={onFechar}>Fechar</button>}>
      {aviso}
      <div className="cg-abas" role="tablist">
        <button role="tab" aria-selected={aba === "motoristas"} className={aba === "motoristas" ? "ativa" : ""} onClick={() => setAba("motoristas")}>Motoristas<b>{d.dados?.motoristas.length ?? 0}</b></button>
        <button role="tab" aria-selected={aba === "operadores"} className={aba === "operadores" ? "ativa" : ""} onClick={() => setAba("operadores")}>Operadores<b>{d.dados?.operadores.length ?? 0}</b></button>
      </div>
      {aba === "motoristas" ? (
        <div style={{ display: "grid", gap: 8 }}>
          {d.dados?.motoristas.map((m) => <div key={m.id} className="cg-pessoa"><div><strong>{m.nome}</strong> <small>{m.telefone} · {m.status}</small></div><button className="cg-botao" onClick={() => soltar("motoristas", m.id)}>Soltar</button></div>)}
          {d.dados && !d.dados.motoristas.length && <Vazio titulo="Nenhum motorista nesta filial." />}
          <Campo rotulo="Ligar motorista" dica="Digite pelo menos 2 letras do nome. Quem estava em outra filial muda para esta."><input value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          {achados.map((m) => <button key={m.id} className="cg-botao" onClick={() => ligar("motoristas", m.id)}>{m.nome} <small className="cg-mono">{m.cpf}</small></button>)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {d.dados?.operadores.map((o) => <div key={o.id} className="cg-pessoa"><div><strong>{o.nome}</strong> <small>{o.email}</small></div><button className="cg-botao" onClick={() => soltar("operadores", o.id)}>Soltar</button></div>)}
          {d.dados && !d.dados.operadores.length && <Vazio titulo="Nenhum operador nesta filial." sub="Operador e Gestor ligados a uma filial só veem as corridas dela." />}
          {livres.length > 0 && <Campo rotulo="Ligar usuário da equipe"><select value="" onChange={(e) => e.target.value && ligar("operadores", e.target.value)}><option value="">Escolha</option>{livres.map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}</select></Campo>}
        </div>
      )}
    </Janela>
  );
}
