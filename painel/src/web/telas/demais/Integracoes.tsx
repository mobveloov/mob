// Config › Integrações: Mercado Pago, Cartão App, Métodos, Financeiro (recargas e saques Pix) e, a mais, Sistemas A/B e chaves de IA.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import IntegracoesSistemas from "../../paginas/Integracoes";
import { Abas, Aviso, Cab, Campo, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

type Aba = "mp" | "app" | "met" | "fin" | "sistemas";
const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const MASCARA = "••••••";

export function Integracoes() {
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("mp");
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
      <Abas abas={[["mp", "Mercado Pago"], ["app", "Cartão App"], ["met", "Métodos"], ["fin", "Financeiro"], ["sistemas", "Sistemas e IA"]]} valor={aba} onChange={setAba} />
      {aba === "sistemas" ? <IntegracoesSistemas /> : !p ? (d.erro ? <Aviso erro={d.erro} /> : <Carregando />) : (
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
