// Bot & Totem › Totens & Preços: os totens (locais) e a tabela de preços na mesma tela (um depende do outro: cada totem
// tem as próprias categorias e valores). A aba Preços é só do ADMIN. Mesma ordem de campos e textos do sistema de referência.

import { podeCargo } from "../../comum/cargos.ts";
import { useState } from "react";
import { Building2, Copy, Gift, DollarSign, ExternalLink, Lock, MapPin, Pencil, Plus, RefreshCw, Save, Smartphone, Trash2, Upload, X } from "lucide-react";
import { useSessao } from "../App";
import { Cartao, Gaveta, Titulo, useCarregar } from "../componentes/ui";
import { apiCentral, urlArquivo, type LocalTotem } from "./api";
import { Detalhe, Item } from "./SolicitarCorrida";
import PrecosTotem from "./PrecosTotem";
import ZapTotem from "./ZapTotem";
import PremiosAdmin from "./PremiosAdmin";

interface Form {
  id?: string; nome: string; slug: string; cidade: string; uf: string; texto: string; lat: string; lng: string; senha: string;
  modoWhatsapp: "individual" | "compartilhado"; categorias: string[]; pagamentos: string[]; ativo: boolean;
}
const NOVO: Form = { nome: "", slug: "", cidade: "", uf: "", texto: "", lat: "", lng: "", senha: "", modoWhatsapp: "individual", categorias: [], pagamentos: ["Dinheiro", "Pix", "Cartão na maquininha"], ativo: true };
const doLocal = (l: LocalTotem): Form => ({
  id: l.id, nome: l.nome, slug: l.id, cidade: l.cidade, uf: l.uf, texto: l.endereco.texto, lat: l.endereco.lat != null ? String(l.endereco.lat) : "", lng: l.endereco.lng != null ? String(l.endereco.lng) : "",
  senha: "", modoWhatsapp: l.modoWhatsapp, categorias: l.categorias, pagamentos: l.pagamentos, ativo: l.ativo,
});
const slugDe = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
type Aba = "locais" | "precos" | "premios";

/** Quadro de tamanho fixo (18:5), como no totem: a imagem preenche por dentro e as sobras ficam de fora. */
const Previa = ({ src, alt }: { src: string; alt: string }) => (
  <div style={{ aspectRatio: "18 / 5", width: "100%", maxWidth: 448, overflow: "hidden", borderRadius: 16, border: "1px solid var(--borda)" }}>
    <img src={src} alt={alt} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
  </div>
);

export default function LocaisTotem() {
  const { sessao } = useSessao();
  const admin = podeCargo(sessao.usuario.papel, "admin");
  const [aba, setAba] = useState<Aba>("locais");
  return (
    <>
      {admin && (
        <div className="abas" style={{ marginBottom: 14, width: "fit-content" }}>
          <button className={aba === "locais" ? "ativo" : ""} onClick={() => setAba("locais")}><MapPin size={14} /> Totens &amp; Locais</button>
          <button className={aba === "precos" ? "ativo" : ""} onClick={() => setAba("precos")}><DollarSign size={14} /> Preços</button>
          <button className={aba === "premios" ? "ativo" : ""} onClick={() => setAba("premios")}><Gift size={14} /> Jogos de recompensa</button>
        </div>
      )}
      {aba === "locais" || !admin ? <Locais admin={admin} empresaId={sessao.empresa.id} /> : aba === "precos" ? <PrecosTotem /> : <PremiosAdmin />}
    </>
  );
}

function Locais({ admin, empresaId }: { admin: boolean; empresaId: string }) {
  const { dados, erro, recarregar } = useCarregar(() => apiCentral.locais(), []);
  const corridas = useCarregar(() => apiCentral.corridas("totem"), [], 20_000);
  const op = useCarregar(() => apiCentral.opcoes(), []);
  const apk = useCarregar(() => apiCentral.apk(), []);
  const [form, setForm] = useState<Form | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [rodape, setRodape] = useState<File | null>(null);
  const [tirar, setTirar] = useState<{ logo: boolean; rodape: boolean }>({ logo: false, rodape: false });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [recarregando, setRecarregando] = useState<string | null>(null);
  const link = (l: LocalTotem) => `${location.origin}/totem/${empresaId}/${l.id}`;
  const editado = form?.id ? dados?.locais.find((l) => l.id === form.id) : undefined;

  const tentar = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ texto: ok }); recarregar(); return true; } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); return false; }
  };
  const fechar = () => { setForm(null); setLogo(null); setRodape(null); setTirar({ logo: false, rodape: false }); };
  const escolher = (l: LocalTotem | null) => { setMsg(null); setLogo(null); setRodape(null); setTirar({ logo: false, rodape: false }); setForm(l ? doLocal(l) : { ...NOVO }); };
  const escolhaImagem = (f: File | null, set: (f: File | null) => void) => {
    if (f && f.size > 2 * 1024 * 1024) return setMsg({ texto: "A imagem pode ter no máximo 2 MB.", erro: true });
    setMsg(null); set(f);
  };

  const salvar = async () => {
    if (!form) return;
    const n = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : undefined);
    const corpo = {
      nome: form.nome, ...(form.id ? {} : { slug: form.slug || slugDe(form.nome) }), cidade: form.cidade, uf: form.uf,
      endereco: { texto: form.texto, lat: n(form.lat), lng: n(form.lng) }, modoWhatsapp: form.modoWhatsapp,
      categorias: form.categorias, pagamentos: form.pagamentos, ativo: form.ativo, ...(form.senha ? { senha: form.senha } : {}),
    };
    setSalvando(true); setMsg(null);
    let id = form.id;
    try {
      id = (form.id ? await apiCentral.salvarLocal(form.id, corpo) : await apiCentral.novoLocal(corpo)).local.id;
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); setSalvando(false); return; }
    // As imagens vão depois de salvar o local (precisam do endereço do totem). Falha numa imagem não perde o local.
    try {
      if (tirar.logo && !logo) await apiCentral.tirarImagem(id, "logo");
      if (tirar.rodape && !rodape) await apiCentral.tirarImagem(id, "rodape");
      if (logo) await apiCentral.enviarImagem(id, "logo", logo);
      if (rodape) await apiCentral.enviarImagem(id, "rodape", rodape);
    } catch (e) {
      setSalvando(false); fechar(); recarregar();
      return setMsg({ texto: `Local salvo, mas não foi possível salvar a imagem. ${e instanceof Error ? e.message : ""}`.trim(), erro: true });
    }
    setSalvando(false); fechar(); recarregar();
    setMsg({ texto: form.id ? "Local atualizado! A tela do totem atualiza em até 1 minuto, quando estiver livre." : "Local criado!" });
  };
  const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const corridaAberta = corridas.dados?.corridas.find((c) => c.id === aberta) ?? null;
  const previa = (arq: File | null, atual: string, tirou: boolean) => (arq ? URL.createObjectURL(arq) : atual && !tirou ? urlArquivo(empresaId, atual) : "");

  return (
    <>
      <Titulo titulo="Locais e Totens" sub="Cada local gera um link exclusivo para o totem">
        {apk.dados?.versao && <a className="botao" href={apk.dados.versao.url} target="_blank" rel="noreferrer noopener" download title="Baixar o app nativo do totem (APK) para instalar no tablet"><Smartphone size={14} /> Baixar app (v{apk.dados.versao.nome})</a>}
        {admin && !form && <button className="botao primario" onClick={() => escolher(null)}><Plus size={14} /> Novo local</button>}
      </Titulo>
      {erro && <div className="aviso erro">{erro}</div>}
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      {dados && !dados.categorias.length && <div className="aviso">Sem categorias cadastradas: o totem pede sem escolher categoria e sem mostrar preço. Cadastre em Categorias e tarifas.</div>}

      {form && dados && (
        <form className="cartao form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>{form.id ? "Editar local" : "Novo local"}</h3>
            <button type="button" className="botao" onClick={fechar}><X size={14} /> Cancelar</button>
          </div>
          <label>Nome do local
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value, ...(form.id ? {} : { slug: slugDe(e.target.value) }) })} required maxLength={60} placeholder="Ex: Hospital, Leme, Jaboticabal..." autoFocus />
          </label>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub"><Upload size={13} /> Imagem do topo do totem</legend>
            <small>Opcional. Aparece no quadro do topo da tela do passageiro, ocupando a largura toda do quadro, sem cortar. Sem imagem, o totem mostra a logo da empresa.</small>
            <small><b>Tamanho ideal: 1080 × 300 px (proporção 18:5).</b> O quadro do totem tem sempre esse tamanho e a imagem o preenche por dentro; numa imagem de outra proporção (ex.: logo quadrado), o centro aparece e as sobras de cima e de baixo ficam de fora.</small>
            {previa(logo, editado?.logo ?? "", tirar.logo) && <Previa src={previa(logo, editado?.logo ?? "", tirar.logo)} alt="Prévia da imagem do topo do totem" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { escolhaImagem(e.target.files?.[0] ?? null, setLogo); setTirar({ ...tirar, logo: false }); }} />
            {editado?.logo && !logo && !tirar.logo && <button type="button" className="botao" onClick={() => setTirar({ ...tirar, logo: true })}><Trash2 size={14} /> Tirar imagem</button>}
          </fieldset>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub"><Upload size={13} /> Imagem do rodapé do totem</legend>
            <small>Opcional. Aparece num quadro abaixo do formulário, ocupando a largura toda do quadro, sem cortar. Se não enviar, o rodapé fica vazio.</small>
            <small><b>Tamanho ideal: 1080 × 300 px (proporção 18:5).</b></small>
            {previa(rodape, editado?.rodape ?? "", tirar.rodape) && <Previa src={previa(rodape, editado?.rodape ?? "", tirar.rodape)} alt="Prévia do rodapé" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { escolhaImagem(e.target.files?.[0] ?? null, setRodape); setTirar({ ...tirar, rodape: false }); }} />
            {editado?.rodape && !rodape && !tirar.rodape && <button type="button" className="botao" onClick={() => setTirar({ ...tirar, rodape: true })}><Trash2 size={14} /> Tirar imagem</button>}
          </fieldset>

          <label>Slug (URL do totem)
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugDe(e.target.value) })} disabled={!!form.id} placeholder="hospital" maxLength={30} />
            {form.slug && <small>URL do totem: <code>{location.origin}/totem/{empresaId}/{form.slug}</code>{form.id && " (o endereço não muda depois de criado)"}</small>}
          </label>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub">Localização (opcional)</legend>
            <small>Cidade do totem. Usada para organizar os totens.</small>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10 }}>
              <label>Cidade<input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} maxLength={60} /></label>
              <label>UF<input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} /></label>
            </div>
          </fieldset>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub">Endereço de embarque fixo</legend>
            <small>Digite o nome da rua e o número onde este totem está instalado. O passageiro não precisará digitar a origem — apenas o destino.</small>
            <input value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} required maxLength={200} placeholder="Ex: Rua das Flores, 123" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>Latitude (opcional)<input value={form.lat} inputMode="decimal" onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
              <label>Longitude (opcional)<input value={form.lng} inputMode="decimal" onChange={(e) => setForm({ ...form, lng: e.target.value })} /></label>
            </div>
          </fieldset>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub">Categorias no totem (nenhuma marcada = todas as ativas)</legend>
            {!dados.categorias.length && <small className="sub">Nenhuma categoria cadastrada.</small>}
            {dados.categorias.map((c) => (
              <label key={c.nome} className="check"><input type="checkbox" checked={form.categorias.includes(c.nome)} onChange={() => setForm({ ...form, categorias: alternar(form.categorias, c.nome) })} /> {c.nome}</label>
            ))}
            <small>Vale quando o totem não tem tabela própria. Com tabela em Preços, valem as categorias dela.</small>
          </fieldset>
          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub">Formas de pagamento</legend>
            {dados.pagamentos.map((p) => (
              <label key={p} className="check"><input type="checkbox" checked={form.pagamentos.includes(p)} onChange={() => setForm({ ...form, pagamentos: alternar(form.pagamentos, p) })} /> {p}</label>
            ))}
          </fieldset>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub"><Lock size={13} /> Senha para fechar o totem</legend>
            <small>O totem pede esta senha para ser ativado no aparelho e antes de permitir o fechamento. Trocar a senha desativa os aparelhos deste local.</small>
            <input type="password" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={4} placeholder={form.id ? "Deixe em branco para manter a atual" : "Ex: 1234 (mínimo 4)"} />
          </fieldset>

          <fieldset className="cartao" style={{ margin: 0 }}>
            <legend className="sub"><Smartphone size={13} /> Modo de conexão WhatsApp do totem</legend>
            <small><b>Individual:</b> este totem tem seu próprio número (padrão).<br /><b>Compartilhado:</b> usa o mesmo número da empresa (o do Bot de WhatsApp).</small>
            <select value={form.modoWhatsapp} onChange={(e) => setForm({ ...form, modoWhatsapp: e.target.value as Form["modoWhatsapp"] })}>
              <option value="individual">Individual (próprio número)</option>
              <option value="compartilhado">Compartilhado (mesmo número da empresa)</option>
            </select>
          </fieldset>

          <label className="check"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Local ativo</label>
          <button className="botao primario" disabled={salvando}><Save size={14} /> {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Criar local"}</button>
        </form>
      )}

      <div className="grade">
        <Cartao titulo="Locais">
          {dados && !dados.locais.length && !form && (
            <div className="vazio"><Building2 size={28} /><p>Nenhum local cadastrado</p><small>Crie locais para gerar links exclusivos de totem em diferentes pontos da cidade</small></div>
          )}
          <ul className="lista">{dados?.locais.map((l) => (
            <li key={l.id}>
              <strong>{l.nome}</strong> <span className={l.ativo ? "selo ok" : "selo"}>{l.ativo ? "Ativo" : "Inativo"}</span><br />
              <small><code>/{empresaId}/{l.id}</code>{l.cidade && <> · {l.cidade}{l.uf && `/${l.uf}`}</>}</small><br />
              <small>{l.endereco.texto}</small>
              <div className="acoes" style={{ marginTop: 6 }}>
                <button className="botao" title="Copiar link" onClick={() => navigator.clipboard?.writeText(link(l)).then(() => setMsg({ texto: "Link copiado!" }))}><Copy size={14} /> Copiar link</button>
                <a className="botao" href={link(l)} target="_blank" rel="noreferrer" title="Abrir totem"><ExternalLink size={14} /> Abrir</a>
                {admin && <>
                  <button className="botao" disabled={recarregando === l.id} title="Recarregar totem: atualiza a tela em até 1 minuto, quando o totem estiver livre"
                    onClick={async () => {
                      if (!confirm(`Atualizar a tela do totem "${l.nome}"? Ela atualiza em até 1 minuto, quando o totem estiver livre na tela inicial (o aplicativo não fecha).`)) return;
                      setRecarregando(l.id);
                      await tentar(() => apiCentral.recarregarLocal(l.id), `Atualização enviada para "${l.nome}". A tela do totem atualiza em até 1 minuto, quando estiver livre.`);
                      setRecarregando(null);
                    }}><RefreshCw size={14} /> Recarregar totem</button>
                  <button className="botao" onClick={() => escolher(l)}><Pencil size={14} /> Editar</button>
                  <button className="botao" onClick={() => tentar(() => apiCentral.salvarLocal(l.id, { ativo: !l.ativo }), l.ativo ? "Local desativado." : "Local ativado.")}>{l.ativo ? "Desativar" : "Ativar"}</button>
                  <button className="icone" aria-label="Excluir" title="Excluir" onClick={() => confirm(`Excluir o local "${l.nome}"? Os totens dele param de funcionar e as imagens dele são apagadas.`) && tentar(() => apiCentral.apagarLocal(l.id), "Local excluído.")}><Trash2 size={14} /></button>
                </>}
              </div>
              {l.aparelho && (
                <div className="aviso" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span><Lock size={13} /> Dispositivo vinculado <code>{l.aparelho.slice(0, 12)}…</code></span>
                  {admin && <button className="botao" onClick={() => confirm(`Limpar o dispositivo vinculado ao totem "${l.nome}"? Isso permite que um novo monitor seja pareado a este link.`) && tentar(() => apiCentral.limparAparelho(l.id), "Dispositivo liberado! O totem pode ser pareado novamente.")}><Smartphone size={14} /> Limpar Dispositivo</button>}
                </div>
              )}
              {l.modoWhatsapp === "individual" && <ZapTotem id={l.id} admin={admin} />}
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
    </>
  );
}
