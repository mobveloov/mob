// Config › Integrações: Mercado Pago, Cartão App, Métodos, Financeiro (recargas e saques Pix) e, a mais, Sistemas A/B e chaves de IA.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BandeiraAbas } from "../grupoc/BandeiraAbas";
import { ABAS_FORM } from "../../../comum/bandeira-form.ts";
import { TransacoesFinanceiras } from "./TransacoesFinanceiras";
import { esquecerConfigDoMapa } from "../../../comum/mapa-base.ts";
import IntegracoesSistemas from "../../paginas/Integracoes";
import { Abas, Aviso, Cab, Campo, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

type Aba = "mapas" | "iza" | "nilara" | "saque" | "marketplace" | "transacoes" | "mp" | "app" | "met" | "fin" | "sistemas";
const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const MASCARA = "••••••";

export function Integracoes() {
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("transacoes");
  const d = useCarregar(() => pedirConfig("/pagamentos"), []);
  const [p, setP] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setP(structuredClone(d.dados)); }
  const [ver, setVer] = useState<Record<string, boolean>>({});
  const { msg, salvando, salvar } = useSalvar();
  const sub = (g: string, k: string, v: unknown) => setP({ ...p, [g]: { ...p[g], [k]: v } });
  const gravar = () => salvar(async () => { const r = await pedirConfig("/pagamentos", "PUT", p); setP(r); setLido(r); }, "Configurações salvas.");
  return (
    <>
      <Cab titulo="Integrações" sub="Configure gateways de pagamento e métodos." />
      <Abas abas={[["iza", "Iza"], ["nilara", "Nilara"], ["transacoes", "Transações Financeiras"], ["saque", "Saque Automático"], ["marketplace", "Marketplace de Integradores"], ["mp", "Mercado Pago"], ["app", "Cartão App"], ["met", "Métodos"], ["fin", "Financeiro"], ["mapas", "Mapas"], ["sistemas", "Sistemas e IA"]]} valor={aba} onChange={setAba} />
      {aba === "sistemas" ? <IntegracoesSistemas /> : aba === "mapas" ? <SecaoMapas /> : aba === "saque" ? <BandeiraAbas aba={ABAS_FORM.find((a) => a.id === "saque")!} /> : aba === "iza" || aba === "nilara" || aba === "marketplace" ? <ParceiroExterno aba={aba} /> : aba === "transacoes" ? <TransacoesFinanceiras /> : !p ? (d.erro ? <Aviso erro={d.erro} /> : <Carregando />) : (
        <>
          <Aviso erro={msg?.erro} ok={msg?.ok} />
          {aba === "mp" && (
            <section className="dm-cartao dm-secao"><h2>Credenciais MP</h2><p className="sub">Insira as chaves de produção da sua conta. Elas ficam só no servidor e nunca voltam inteiras para a tela.</p>
              {p.campos.map((c: { chave: string; rotulo: string; secreto: boolean }) => (
                <Campo key={c.chave} rotulo={c.rotulo}>
                  <span className="dm-linha"><input type={c.secreto && !ver[c.chave] ? "password" : "text"} autoComplete="off" disabled={!admin} value={p.credenciais[c.chave] ?? ""} placeholder={c.secreto ? "APP_USR-..." : ""}
                    onFocus={() => c.secreto && p.credenciais[c.chave] === MASCARA && setP({ ...p, credenciais: { ...p.credenciais, [c.chave]: "" } })} onChange={(e) => setP({ ...p, credenciais: { ...p.credenciais, [c.chave]: e.target.value } })} />
                    {c.secreto && <button type="button" className="icone" aria-label={ver[c.chave] ? "Esconder" : "Mostrar"} onClick={() => setVer({ ...ver, [c.chave]: !ver[c.chave] })}>{ver[c.chave] ? <EyeOff size={14} /> : <Eye size={14} />}</button>}</span>
                </Campo>
              ))}
            </section>
          )}
          {aba === "app" && (
            <section className="dm-cartao dm-secao"><h2>Pagamento no App</h2><p className="sub">Configuração de taxas e split.</p>
              <Interruptor valor={p.cartaoApp.ativo} onChange={(v) => sub("cartaoApp", "ativo", v)} rotulo="Módulo Ativo" desabilitado={!admin} />
              <div className="dm-grade3">
                <Campo rotulo="Modelo de Recebimento"><select disabled={!admin} value={p.cartaoApp.modelo} onChange={(e) => sub("cartaoApp", "modelo", e.target.value)}><option value="split">Split (Direto pro Motorista)</option><option value="carteira">Carteira (Cai na Plataforma)</option></select></Campo>
                <Campo rotulo="Quem paga a taxa?"><select disabled={!admin} value={p.cartaoApp.quemPaga} onChange={(e) => sub("cartaoApp", "quemPaga", e.target.value)}><option value="motorista">Motorista (Desconta dele)</option><option value="plataforma">Plataforma (Você assume)</option></select></Campo>
                <Campo rotulo="Taxa Extra (Surcharge)"><span className="dm-linha"><select disabled={!admin} value={p.cartaoApp.taxaExtraTipo} onChange={(e) => sub("cartaoApp", "taxaExtraTipo", e.target.value)}><option value="nenhum">Não cobrar</option><option value="porcentagem">% Porcentagem</option><option value="fixo">R$ Fixo</option></select><input inputMode="decimal" disabled={!admin || p.cartaoApp.taxaExtraTipo === "nenhum"} value={String(p.cartaoApp.taxaExtraValor).replace(".", ",")} onChange={(e) => sub("cartaoApp", "taxaExtraValor", num(e.target.value))} aria-label="Valor da taxa extra" /></span></Campo>
                <Campo rotulo="Comissão Específica"><input inputMode="decimal" disabled={!admin} placeholder="Vazio = Padrão" value={p.cartaoApp.comissaoEspecifica == null ? "" : String(p.cartaoApp.comissaoEspecifica).replace(".", ",")} onChange={(e) => sub("cartaoApp", "comissaoEspecifica", e.target.value === "" ? null : num(e.target.value))} /></Campo>
              </div>
            </section>
          )}
          {aba === "met" && (
            <section className="dm-cartao dm-secao"><h2>Métodos de Pagamento</h2><p className="sub">Quais formas o passageiro pode escolher.</p>
              {Object.keys(p.metodos).map((m) => <Interruptor key={m} valor={p.metodos[m]} onChange={(v) => setP({ ...p, metodos: { ...p.metodos, [m]: v } })} rotulo={m} desabilitado={!admin} />)}
            </section>
          )}
          {aba === "fin" && (
            <>
              <section className="dm-cartao dm-secao"><h3>Recargas Pix</h3>
                <div className="dm-duplo"><div><Interruptor valor={p.recarga.passageiro} onChange={(v) => sub("recarga", "passageiro", v)} rotulo="Passageiro" desabilitado={!admin} /><Campo rotulo="Mínimo"><input inputMode="decimal" disabled={!admin} value={String(p.recarga.minimoPassageiro).replace(".", ",")} onChange={(e) => sub("recarga", "minimoPassageiro", num(e.target.value))} /></Campo></div>
                  <div><Interruptor valor={p.recarga.motorista} onChange={(v) => sub("recarga", "motorista", v)} rotulo="Motorista" desabilitado={!admin} /><Campo rotulo="Mínimo"><input inputMode="decimal" disabled={!admin} value={String(p.recarga.minimoMotorista).replace(".", ",")} onChange={(e) => sub("recarga", "minimoMotorista", num(e.target.value))} /></Campo></div></div></section>
              <section className="dm-cartao dm-secao"><h3>Saques Pix</h3>
                <Interruptor valor={p.saque.ativo} onChange={(v) => sub("saque", "ativo", v)} rotulo="Permitir Saques?" desabilitado={!admin} />
                <div className="dm-duplo"><Campo rotulo="Mínimo"><input inputMode="decimal" disabled={!admin} value={String(p.saque.minimo).replace(".", ",")} onChange={(e) => sub("saque", "minimo", num(e.target.value))} /></Campo><Campo rotulo="Taxa Fixa"><input inputMode="decimal" disabled={!admin} value={String(p.saque.taxaFixa).replace(".", ",")} onChange={(e) => sub("saque", "taxaFixa", num(e.target.value))} /></Campo></div></section>
            </>
          )}
          {admin ? <div className="dm-salvar"><button className="botao primario" disabled={salvando} onClick={gravar}>SALVAR</button></div> : <p className="sub">Só o administrador altera as integrações.</p>}
        </>
      )}
    </>
  );
}

const PARCEIROS = {
  iza: ["Iza", "Assistente de atendimento por conversa. Para ligar, a central precisa de um contrato com o fornecedor e da chave de acesso dele; sem isso a integração fica desativada."],
  nilara: ["Nilara", "Telefonia que esconde o número do passageiro do motorista. Para ligar, a central precisa de um contrato com o fornecedor e da chave de acesso dele; sem isso a integração fica desativada."],
  marketplace: ["Marketplace de Integradores", "Lista de integradores parceiros que podem se conectar à central. Ainda não há integradores cadastrados."],
} as const;
function ParceiroExterno({ aba }: { aba: "iza" | "nilara" | "marketplace" }) {
  const [nome, texto] = PARCEIROS[aba];
  return <section className="dm-cartao dm-secao"><h2>{nome}</h2><p className="sub">Status da integração: <span className="selo">Desativada</span></p><p>{texto}</p></section>;
}

// ------------------------------------------------------------------ Mapas: de onde vêm as imagens dos mapas

interface VisaoMapas { provedor: string; efetivo: string; chave: string; provedores: Array<{ id: string; nome: string; pedeChave: boolean }>; identificacao: string; temContato: boolean; ultimoErro: { em: string; motivo: string } | null }
const DICA_PROVEDOR: Record<string, string> = {
  osm: "Padrão. O servidor da central busca as imagens, guarda cópia e se identifica como a política do OpenStreetMap exige. Só tem mapa claro (no tema escuro a cor é ajustada).",
  carto: "Sem chave. Tem mapa claro e escuro de verdade. Uso básico liberado; para muito volume o CARTO pede contrato.",
  maptiler: "Pede chave da sua conta MapTiler. Claro e escuro.",
  stadia: "Pede chave da sua conta Stadia Maps. Claro e escuro.",
};

function SecaoMapas() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig<VisaoMapas>("/mapas"), []);
  const [v, setV] = useState<VisaoMapas | null>(null), [lido, setLido] = useState<unknown>(null);
  const [provedor, setProvedor] = useState("osm"), [chave, setChave] = useState(""), [ver, setVer] = useState(false);
  const { msg, salvando, salvar } = useSalvar();
  if (d.dados && lido !== d.dados) { setLido(d.dados); setV(d.dados); setProvedor(d.dados.provedor); setChave(d.dados.chave); }
  if (!v) return d.erro ? <Aviso erro={d.erro} /> : <Carregando />;
  const atual = v.provedores.find((p) => p.id === provedor);
  const gravar = () => salvar(async () => { const r = await pedirConfig<VisaoMapas>("/mapas", "PUT", { provedor, chave }); esquecerConfigDoMapa(); setV(r); setProvedor(r.provedor); setChave(r.chave); }, "Mapas salvos. Abra o mapa de novo para ver a mudança.");
  return (
    <section className="dm-cartao dm-secao">
      <h2>Mapas</h2>
      <p className="sub">De onde vêm as imagens dos mapas do painel e dos apps. O navegador nunca fala com o provedor: quem busca é o servidor da central, com cópia em disco e limite de pedidos.</p>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      {v.efetivo !== v.provedor && <Aviso erro={`${v.provedores.find((p) => p.id === v.provedor)?.nome ?? v.provedor} está sem chave: os mapas usam o OpenStreetMap até você salvar a chave.`} />}
      {v.ultimoErro && <Aviso erro={`Último problema com o provedor (${new Date(v.ultimoErro.em).toLocaleString("pt-BR")}): ${v.ultimoErro.motivo}`} />}
      {!v.temContato && <Aviso erro="Falta o e-mail ou site de suporte em Personalização (Marca). O OpenStreetMap exige um contato na identificação; sem isso o servidor dele pode bloquear." />}
      <Campo rotulo="Provedor">
        <select disabled={!admin} value={provedor} onChange={(e) => setProvedor(e.target.value)}>
          {v.provedores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <p className="sub">{DICA_PROVEDOR[provedor]}</p>
      {atual?.pedeChave && (
        <Campo rotulo="Chave do provedor">
          <span className="dm-linha">
            <input type={ver ? "text" : "password"} autoComplete="off" disabled={!admin} value={chave} placeholder="Cole a chave aqui"
              onFocus={() => chave === MASCARA && setChave("")} onChange={(e) => setChave(e.target.value)} />
            <button type="button" className="icone" aria-label={ver ? "Esconder" : "Mostrar"} onClick={() => setVer(!ver)}>{ver ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </span>
          <span className="sub">A chave fica só no servidor e nunca volta para a tela.</span>
        </Campo>
      )}
      <p className="sub">Identificação enviada ao provedor: <code>{v.identificacao}</code></p>
      {admin ? <div className="dm-salvar"><button className="botao primario" disabled={salvando} onClick={gravar}>SALVAR</button></div> : <p className="sub">Só o administrador altera os mapas.</p>}
    </section>
  );
}
