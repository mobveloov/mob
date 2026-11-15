import { useEffect, useState } from "react";
import { Check, Edit3, MapPin, Plus, Trash2, X } from "lucide-react";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { useGestor, useRetorno } from "../crm/comum";
import { crm2, type Cidade } from "./api";

/** CRM › Configurações › Cidades: cidades atendidas, para segmentar campanhas. */
export default function Cidades() {
  const { dados, erro, recarregar } = useCarregar(() => crm2.cidades(), []);
  const [editando, setEditando] = useState<Cidade | null | "nova">(null);
  const { tentar, caixa } = useRetorno();
  const gestor = useGestor();
  const lista = dados?.cidades ?? [];
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <p className="sub">Cidades atendidas para segmentação de campanhas</p>
        {gestor && <button className="botao primario" onClick={() => setEditando("nova")}><Plus size={14} /> Nova Cidade</button>}
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados ? <p className="vazio">Carregando...</p> : !lista.length ? (
        <Cartao><p className="vazio"><MapPin size={16} /> Nenhuma cidade cadastrada. Adicione as cidades atendidas para segmentar suas campanhas.</p></Cartao>
      ) : lista.map((c) => (
        <Cartao key={c.id}>
          <div className="linha-filtro">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="ind-icone"><MapPin size={20} /></span>
              <div>
                <strong>{c.name}</strong>
                <div className="sub">{c.state && <>{c.state} · </>}{c.radius_km}km{c.lat == null && <> · sem centro no mapa</>}</div>
              </div>
            </div>
            {gestor && (
              <div className="acoes">
                <button className="botao" title={c.is_active ? "Desativar" : "Ativar"} onClick={() => tentar(() => crm2.ligarCidade(c.id, !c.is_active)).then(recarregar)}>{c.is_active ? <Check size={14} /> : <X size={14} />} {c.is_active ? "Ativa" : "Desativada"}</button>
                <button className="botao" title="Editar" onClick={() => setEditando(c)}><Edit3 size={14} /></button>
                <button className="icone" title="Excluir" aria-label={`Excluir ${c.name}`} onClick={() => confirm("Excluir esta cidade?") && tentar(() => crm2.apagarCidade(c.id)).then(recarregar)}><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        </Cartao>
      ))}
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando === "nova" ? "Nova Cidade" : "Editar Cidade"}>
        {editando && <FormCidade cidade={editando === "nova" ? null : editando} onFeito={() => { setEditando(null); recarregar(); }} onFechar={() => setEditando(null)} />}
      </Gaveta>
    </div>
  );
}

function FormCidade({ cidade, onFeito, onFechar }: { cidade: Cidade | null; onFeito: () => void; onFechar: () => void }) {
  const [nome, setNome] = useState(cidade?.name ?? "");
  const [uf, setUf] = useState(cidade?.state ?? "");
  const [lat, setLat] = useState(cidade?.lat != null ? String(cidade.lat) : "");
  const [lng, setLng] = useState(cidade?.lng != null ? String(cidade.lng) : "");
  const [raio, setRaio] = useState(String(cidade?.radius_km ?? 15));
  const [achados, setAchados] = useState<Array<{ codigo: string; nome: string; uf: string }>>([]);
  const [salvando, setSalvando] = useState(false);
  const { tentar, caixa } = useRetorno();
  // Sugestões da lista de municípios do IBGE (a mesma da tela Endereços).
  useEffect(() => {
    if (nome.trim().length < 3 || (cidade && nome === cidade.name)) { setAchados([]); return; }
    const t = setTimeout(() => crm2.municipios(nome.trim()).then(setAchados).catch(() => setAchados([])), 350);
    return () => clearTimeout(t);
  }, [nome, cidade]);
  const salvar = async () => {
    setSalvando(true);
    const r = await tentar(() => crm2.salvarCidade(cidade?.id ?? null, { name: nome, state: uf, lat, lng, radius_km: Number(raio) || 15 }));
    setSalvando(false);
    if (r) onFeito();
  };
  return (
    <div className="form">
      {caixa}
      <label>Cidade<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome da cidade" /></label>
      {!!achados.length && (
        <ul className="lista">{achados.slice(0, 6).map((m) => <li key={m.codigo}><button type="button" className="botao" onClick={() => { setNome(m.nome); setUf(m.uf); setAchados([]); }}>{m.nome} - {m.uf}</button></li>)}</ul>
      )}
      <div className="grade" style={{ gridTemplateColumns: "80px 1fr 1fr" }}>
        <label>UF<input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></label>
        <label>Latitude<input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.55" /></label>
        <label>Longitude<input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.63" /></label>
      </div>
      <p className="sub">Sem latitude e longitude, o centro é a média dos embarques das corridas da cidade.</p>
      <label>Raio de Abrangência (km)<input type="number" min={1} max={100} step={1} value={raio} onChange={(e) => setRaio(e.target.value)} /></label>
      <p className="sub">Distância máxima do centro da cidade para incluir destinatários próximos. Padrão: 15km.</p>
      <div className="acoes">
        <button className="botao primario" onClick={salvar} disabled={salvando || !nome.trim()}><Check size={14} /> Salvar</button>
        <button className="botao" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  );
}
