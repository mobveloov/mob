// Configurações > Carteiras de crédito (igual à Machine): "Para motoristas" (saldo mínimo, mensagens de recarga, movimentações do app,
// Pix, Presencial, Telefone, repasse da taxa de cancelamento) e "Para passageiros" (recarga pelo app). Servidor: /api/config/carteiras-credito.

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Aviso, Cab, Carregando, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const txt = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", "."));

function SimNao({ nome, valor, onChange, desabilitado }: { nome: string; valor: boolean; onChange: (v: boolean) => void; desabilitado: boolean }) {
  return (
    <div className="dm-linha" role="radiogroup" aria-label={nome}>
      {([[false, "Não"], [true, "Sim"]] as const).map(([v, r]) => (
        <label key={r} className="dm-linha"><input type="radio" name={nome} checked={valor === v} disabled={desabilitado} onChange={() => onChange(v)} /> {r}</label>
      ))}
    </div>
  );
}
const Caixa = ({ valor, onChange, rotulo, desabilitado }: { valor: boolean; onChange: (v: boolean) => void; rotulo: string; desabilitado: boolean }) => (
  <label className="dm-linha"><input type="checkbox" checked={valor} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)} /> {rotulo}</label>
);
const Dica = ({ children }: { children: ReactNode }) => <p className="dm-dica"><Info size={14} aria-hidden /> {children}</p>;

export function ConfigCarteirasCredito() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/carteiras-credito"), []);
  const [g, setG] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  const { msg, salvando, salvar } = useSalvar();
  if (d.dados && lido !== d.dados) { setLido(d.dados); setG({ ...structuredClone(d.dados), t: { saldoMinimo: txt(d.dados.motorista.saldoMinimo), aviso: txt(d.dados.motorista.mensagemRecargaValor), minimo: txt(d.dados.motorista.minimoRecargaPix) } }); }
  if (!g) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const m = g.motorista, off = !admin;
  const setM = (k: string, v: unknown) => setG({ ...g, motorista: { ...m, [k]: v } });
  const setT = (k: string, v: string) => setG({ ...g, t: { ...g.t, [k]: v } });
  const enviar = () => salvar(async () => {
    const r = await pedirConfig("/carteiras-credito", "PUT", {
      motorista: { ...m, saldoMinimo: g.t.saldoMinimo, mensagemRecargaValor: g.t.aviso, minimoRecargaPix: g.t.minimo }, passageiro: g.passageiro,
    });
    setLido(r); setG({ ...r, t: { saldoMinimo: txt(r.motorista.saldoMinimo), aviso: txt(r.motorista.mensagemRecargaValor), minimo: txt(r.motorista.minimoRecargaPix) } });
  }, "Configuração salva.");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <Cab titulo="Carteiras de crédito" sub="Regras de crédito dos motoristas e recarga dos passageiros." />
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao dm-secao">
        <h3>Para motoristas</h3>
        <Dica>Se quiser, você pode definir exceções alterando as configurações de crédito de um motorista específico.</Dica>
        <h4>Personalizações</h4>
        <div className="dm-secao">
          <strong>Ativar saldo mínimo</strong>
          <p>Evite que motoristas atuem com o saldo negativo definindo um limite mínimo de créditos. Assim, quando um motorista não possuir os créditos suficientes, ele para de receber corridas até que faça uma recarga.</p>
          <SimNao nome="Ativar saldo mínimo" valor={m.saldoMinimoAtivo} onChange={(v) => setM("saldoMinimoAtivo", v)} desabilitado={off} />
          <label className="dm-campo"><span>O saldo mínimo de créditos para receber corridas é de:</span><span className="dm-linha">R$ <input inputMode="decimal" aria-label="Saldo mínimo" disabled={off || !m.saldoMinimoAtivo} value={g.t.saldoMinimo} onChange={(e) => setT("saldoMinimo", e.target.value)} placeholder="-10,00" /></span></label>
        </div>
        <div className="dm-secao">
          <strong>Ativar mensagens de recarga</strong>
          <p>Enviar uma mensagem no aplicativo dos motoristas solicitando recarga de créditos.</p>
          <SimNao nome="Ativar mensagens de recarga" valor={m.mensagemRecargaAtiva} onChange={(v) => setM("mensagemRecargaAtiva", v)} desabilitado={off} />
          <label className="dm-campo"><span>Enviar mensagem quando a carteira de créditos do motorista atingir:</span><span className="dm-linha">R$ <input inputMode="decimal" aria-label="Valor da mensagem de recarga" disabled={off || !m.mensagemRecargaAtiva} value={g.t.aviso} onChange={(e) => setT("aviso", e.target.value)} placeholder="5,00" /></span></label>
        </div>
        <h4>Movimentações disponíveis no aplicativo</h4>
        <div className="dm-secao">
          <strong>Entrada e saída de créditos</strong>
          <p>Selecione os tipos de movimentação de créditos que você deseja disponibilizar na carteira do motorista</p>
          <Caixa rotulo="Recarga" valor={m.recarga} onChange={(v) => setM("recarga", v)} desabilitado={off} />
          <Caixa rotulo="Saque" valor={m.saque} onChange={(v) => setM("saque", v)} desabilitado={off} />
          <strong>Métodos disponíveis para recarga e/ou saque:</strong>
          <Caixa rotulo="PIX" valor={m.pix} onChange={(v) => setM("pix", v)} desabilitado={off} />
          <Dica>O valor das recargas é transferido diariamente, somando todas as recargas recebidas desde a última transferência. O horário da transferência pode variar.</Dica>
          <p>Para ativar a recarga automática via Pix, é necessário ter cadastro na integração de transações financeiras. <a href="/transacao-pix">Faça o cadastro na integração.</a> Para centrais associadas é necessário que a central principal realize o cadastro.</p>
          {m.pix && <label className="dm-campo"><span>Valor mínimo para recarga</span><span className="dm-linha">R$ <input inputMode="decimal" aria-label="Valor mínimo para recarga" disabled={off} value={g.t.minimo} onChange={(e) => setT("minimo", e.target.value)} placeholder="20,00" /></span></label>}
          <Caixa rotulo="Saque automático via PIX" valor={m.saqueAutomaticoPix} onChange={(v) => setM("saqueAutomaticoPix", v)} desabilitado={off} />
          <p>Para ativar o saque automático via Pix, é necessário ter cadastro na integração com o banco de sua escolha. <a href="/integracoes">Faça o cadastro na integração.</a></p>
          <Caixa rotulo="Presencial" valor={m.presencial} onChange={(v) => setM("presencial", v)} desabilitado={off} />
          <Caixa rotulo="Telefone para o motorista realizar a recarga ou o saque" valor={m.telefoneAtivo} onChange={(v) => setM("telefoneAtivo", v)} desabilitado={off} />
          {m.telefoneAtivo && <label className="dm-campo"><span>Telefone</span><input type="tel" aria-label="Telefone para recarga ou saque" disabled={off} maxLength={30} value={m.telefone} onChange={(e) => setM("telefone", e.target.value)} placeholder="(00) 00000-0000" /></label>}
        </div>
        <Caixa rotulo="Repasse imediato da taxa de cancelamento" valor={m.repasseTaxaCancelamento} onChange={(v) => setM("repasseTaxaCancelamento", v)} desabilitado={off} />
        <p>O motorista recebe no ato, independentemente da forma de pagamento. Pendências do passageiro serão cobradas na corrida seguinte.</p>
      </section>
      <section className="dm-cartao dm-secao">
        <h3>Para passageiros</h3>
        <strong>Permitir recarga de créditos pelo passageiro via app</strong>
        <p>Quando ativada, essa configuração permite que os passageiros recarreguem sua carteira de créditos através do app, utilizando o método de pagamento via Pix.</p>
        <SimNao nome="Permitir recarga de créditos pelo passageiro via app" valor={g.passageiro.recargaApp} onChange={(v) => setG({ ...g, passageiro: { ...g.passageiro, recargaApp: v } })} desabilitado={off} />
      </section>
      <div className="dm-linha">{admin && <button className="botao primario" disabled={salvando}>Salvar</button>}</div>
    </form>
  );
}
