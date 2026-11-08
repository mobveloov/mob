// Totem (painel): cadastro dos locais da empresa. Cada local tem endereço fixo de embarque, categorias e formas de
// pagamento que o totem mostra, e senha. Daqui sai o link do totem e o botão de recarregar remoto.

import { useState } from "react";
import { Copy, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSessao } from "../App";
import { Cartao, Gaveta, Titulo, useCarregar } from "../componentes/ui";
import { apiCentral, reais, type LocalTotem } from "./api";
import { Detalhe, Item } from "./SolicitarCorrida";

interface Form { id?: string; nome: string; texto: string; lat: string; lng: string; categorias: string[]; pagamentos: string[]; ativo: boolean; senha: string }
const NOVO: Form = { nome: "", texto: "", lat: "", lng: "", categorias: [], pagamentos: ["Dinheiro", "Pix", "Cartão na maquininha"], ativo: true, senha: "" };
const doLocal = (l: LocalTotem): Form => ({
  id: l.id, nome: l.nome, texto: l.endereco.texto, lat: l.endereco.lat != null ? String(l.endereco.lat) : "", lng: l.endereco.lng != null ? String(l.endereco.lng) : "",
  categorias: l.categorias, pagamentos: l.pagamentos, ativo: l.ativo, senha: "",
});

export default function LocaisTotem() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const { dados, erro, recarregar } = useCarregar(() => apiCentral.locais(), []);
  const corridas = useCarregar(() => apiCentral.corridas("totem"), [], 20_000);
  const op = useCarregar(() => apiCentral.opcoes(), []);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const link = (l: LocalTotem) => `${location.origin}/totem/${sessao.empresa.id}/${l.id}`;

  const tentar = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ texto: ok }); recarregar(); return true; } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); return false; }
  };
  const salvar = async () => {
    if (!form) return;
    const n = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : undefined);
    const corpo = {
      nome: form.nome, endereco: { texto: form.texto, lat: n(form.lat), lng: n(form.lng) },
      categorias: form.categorias, pagamentos: form.pagamentos, ativo: form.ativo, ...(form.senha ? { senha: form.senha } : {}),
    };
    if (await tentar(() => (form.id ? apiCentral.salvarLocal(form.id, corpo) : apiCentral.novoLocal(corpo)), form.id ? "Local salvo. Os totens dele recarregam em até 1 minuto." : "Local criado.")) setForm(null);
  };
  const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const corridaAberta = corridas.dados?.corridas.find((c) => c.id === aberta) ?? null;

  return (
    <>
      <Titulo titulo="Totem" sub="Tela de pedido de corrida com a marca da empresa, para recepções, hotéis e pontos fixos.">
        {admin && <button className="botao primario" onClick={() => { setMsg(null); setForm({ ...NOVO }); }}><Plus size={14} /> Novo local</button>}
      </Titulo>
      {erro && <div className="aviso erro">{erro}</div>}
      {msg && !form && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      {dados && !dados.categorias.length && <div className="aviso">Sem categorias cadastradas: o totem pede sem escolher categoria e sem mostrar preço. Cadastre em Categorias e tarifas.</div>}
      <div className="grade">
        <Cartao titulo="Locais">
          {dados && !dados.locais.length && <p className="vazio">Nenhum local ainda.</p>}
          <ul className="lista">{dados?.locais.map((l) => (
            <li key={l.id}>
              <strong>{l.nome}</strong> <span className={l.ativo ? "selo ok" : "selo"}>{l.ativo ? "Ativo" : "Desligado"}</span><br />
              <small>{l.endereco.texto}</small><br />
              <small><code>{link(l)}</code></small>
              <div className="acoes" style={{ marginTop: 6 }}>
                <button className="botao" onClick={() => navigator.clipboard?.writeText(link(l)).then(() => setMsg({ texto: "Link copiado." }))}><Copy size={14} /> Copiar link</button>
                <a className="botao" href={link(l)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir</a>
                {admin && <>
                  <button className="botao" onClick={() => { setMsg(null); setForm(doLocal(l)); }}><Pencil size={14} /> Editar</button>
                  <button className="botao" title="Os totens deste local recarregam em até 1 minuto, quando estiverem na tela inicial." onClick={() => tentar(() => apiCentral.recarregarLocal(l.id), "Pedido de recarga enviado. O totem recarrega em até 1 minuto.")}><RefreshCw size={14} /> Recarregar totem</button>
                  <button className="icone" aria-label="Remover" onClick={() => confirm(`Remover o local ${l.nome}? Os totens dele param de funcionar.`) && tentar(() => apiCentral.apagarLocal(l.id), "Local removido.")}><Trash2 size={14} /></button>
                </>}
              </div>
            </li>
          ))}</ul>
        </Cartao>
        <Cartao titulo="Corridas do totem (em aberto e últimas 24 h)">
          {corridas.dados && !corridas.dados.corridas.length && <p className="vazio">Nenhuma corrida pedida pelo totem.</p>}
          <ul className="lista">{corridas.dados?.corridas.map((c) => <Item key={c.id} c={c} abrir={() => setAberta(c.id)} />)}</ul>
        </Cartao>
      </div>

      <Gaveta aberta={!!corridaAberta} onFechar={() => setAberta(null)} titulo={corridaAberta ? `Corrida ${corridaAberta.os}` : ""}>
        {corridaAberta && <Detalhe c={corridaAberta} motoristas={op.dados?.motoristas ?? []} mudou={corridas.recarregar} />}
      </Gaveta>

      <Gaveta aberta={!!form} onFechar={() => setForm(null)} titulo={form?.id ? "Editar local" : "Novo local"} larga>
        {form && dados && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            {msg?.erro && <div className="aviso erro">{msg.texto}</div>}
            <label>Nome do local<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required maxLength={60} placeholder="Ex.: Hotel Central - recepção" /></label>
            <label>Endereço fixo de embarque (rua, número, bairro e cidade)<input value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} required maxLength={200} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>Latitude (opcional)<input value={form.lat} inputMode="decimal" onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
              <label>Longitude (opcional)<input value={form.lng} inputMode="decimal" onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
            </div>
            <fieldset className="cartao" style={{ margin: 0 }}>
              <legend className="sub">Categorias no totem (nenhuma marcada = todas as ativas)</legend>
              {!dados.categorias.length && <small className="sub">Nenhuma categoria cadastrada.</small>}
              {dados.categorias.map((c) => (
                <label key={c.nome} className="check"><input type="checkbox" checked={form.categorias.includes(c.nome)} onChange={() => setForm({ ...form, categorias: alternar(form.categorias, c.nome) })} /> {c.nome}{c.preco != null && <small> · a partir de {reais(c.preco)}</small>}</label>
              ))}
            </fieldset>
            <fieldset className="cartao" style={{ margin: 0 }}>
              <legend className="sub">Formas de pagamento</legend>
              {dados.pagamentos.map((p) => (
                <label key={p} className="check"><input type="checkbox" checked={form.pagamentos.includes(p)} onChange={() => setForm({ ...form, pagamentos: alternar(form.pagamentos, p) })} /> {p}</label>
              ))}
            </fieldset>
            <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Local ativo</label>
            <label>{form.id ? "Nova senha do totem (deixe em branco para manter)" : "Senha do totem (mínimo 4)"}
              <input type="password" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={4} />
              <small>Digitada uma vez no aparelho. Trocar a senha desativa todos os aparelhos deste local.</small>
            </label>
            <button className="botao primario">Salvar</button>
          </form>
        )}
      </Gaveta>
    </>
  );
}
