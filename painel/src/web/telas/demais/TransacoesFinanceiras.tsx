// Config › Integrações › Transações financeiras: condições, dados bancários, plano, quem recebe, taxa de cartão e Pix (como na Machine).
// Os dados bancários só aparecem e só são editados pelo administrador; conta e CNPJ chegam mascarados.

import { useState } from "react";
import { Aviso, Campo, Carregando, Interruptor, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const MASCARA = "••••••";
const pct = (n: number) => `${String(n).replace(".", ",")}%`;
type Banco = Record<string, string>;
const SITUACAO: Record<string, string> = { pendente: "Pendente", em_analise: "Em análise" };

export function TransacoesFinanceiras() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/integracao-financeira"), []);
  const [f, setF] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setF(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!f) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const banco: Banco = f.banco ?? {};
  const setBanco = (k: string, v: string) => setF({ ...f, banco: { ...banco, [k]: v } });
  const aplicar = (r: any) => { setLido(r); setF(structuredClone(r)); };
  const gravar = () => salvar(async () => aplicar(await pedirConfig("/integracao-financeira", "PUT", { plano: f.plano, quemRecebe: f.quemRecebe, taxaDe: f.taxaDe, pixRecargas: f.pixRecargas, pixPagamentos: f.pixPagamentos, banco: f.banco })), "Integração financeira salva.");
  const atualizar = () => salvar(async () => { await pedirConfig("/integracao-financeira", "PUT", { plano: f.plano, quemRecebe: f.quemRecebe, taxaDe: f.taxaDe, pixRecargas: f.pixRecargas, pixPagamentos: f.pixPagamentos, banco: f.banco }); aplicar(await pedirConfig("/integracao-financeira/atualizar-cadastro", "POST")); }, "Cadastro enviado para conferência.");
  const campoBanco = (k: string, rotulo: string, obrigatorio: boolean, largura?: string, secreto = false) => (
    <Campo rotulo={`${rotulo}${obrigatorio ? " *" : ""}`}>
      <input autoComplete="off" disabled={!admin} style={largura ? { maxWidth: largura } : undefined} value={banco[k] ?? ""}
        onFocus={() => secreto && String(banco[k] ?? "").startsWith(MASCARA) && setBanco(k, "")} onChange={(e) => setBanco(k, e.target.value)} />
    </Campo>
  );
  return (
    <>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao dm-secao"><h2>Condições</h2>
        <h3>Cartão no app</h3>
        {f.planos.map((p: any, i: number) => <p key={p.id} className="sub">Opção {i + 1}: para recebimento no plano {p.nome}, a taxa é de até {pct(p.taxa)} sobre o valor das corridas.</p>)}
        <p className="sub">Você decide para onde o valor das corridas vai: direto para os motoristas, dividido entre a central e os motoristas ou direto para a conta da central. Para o cadastro ser aprovado é preciso escolher um plano, mesmo sem usar o pagamento por cartão agora.</p>
        <h3>Pix</h3>
        <p className="sub">O valor das recargas é transferido diariamente, somando as recargas desde a última transferência. Valor mínimo de R$ {String(f.pixMinimo).replace(".", ",")} por transação.</p>
        {f.taxasPix.map((t: any) => <p key={t.taxa} className="sub">Taxa de {pct(t.taxa)} por transação nos planos {t.planos.join(", ")}.</p>)}
      </section>

      {admin ? (
        <section className="dm-cartao dm-secao"><h2>Dados bancários</h2>
          <p className="sub">Dados da conta do sócio. A conta corrente deve estar associada à conta jurídica cadastrada, ou seja, ter o mesmo CNPJ. Só o administrador vê e altera estes dados; a conta e o CNPJ aparecem mascarados.</p>
          <div className="dm-grade3">
            {campoBanco("banco", "Número do banco", true, "8rem")}{campoBanco("agencia", "Número da agência", true, "10rem")}{campoBanco("agenciaDv", "Dígito verificador da agência", false, "6rem")}
            {campoBanco("conta", "Número da conta", true, undefined, true)}{campoBanco("contaDv", "Dígito verificador da conta", true, "6rem")}
            {campoBanco("correntista", "Nome do correntista", true)}{campoBanco("cnpj", "CNPJ do correntista", true, undefined, true)}
          </div>
        </section>
      ) : <section className="dm-cartao dm-secao"><h2>Dados bancários</h2><p className="sub">{f.bancoPreenchido ? "Dados bancários cadastrados." : "Dados bancários ainda não cadastrados."} Só o administrador vê e altera estes dados.</p></section>}

      <section className="dm-cartao dm-secao"><h2>Configurações de cartão</h2>
        <div className="dm-grade3">
          <Campo rotulo="Plano *"><select disabled={!admin} value={f.plano} onChange={(e) => set("plano", e.target.value)}><option value="">Escolha um plano</option>{f.planos.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
          <Campo rotulo="Quem irá receber? *"><select disabled={!admin} value={f.quemRecebe} onChange={(e) => set("quemRecebe", e.target.value)}><option value="motorista">Motorista</option><option value="central">Central</option><option value="dividido">Dividido</option></select></Campo>
          <Campo rotulo="Cobrar taxa de cartão de: *" dica="Defina quem arca com a taxa do provedor."><select disabled={!admin} value={f.taxaDe} onChange={(e) => set("taxaDe", e.target.value)}><option value="motorista">Motorista (recomendado)</option><option value="central">Central</option></select></Campo>
        </div>
        {f.plano && <p className="sub">Taxa do plano escolhido: até {pct(f.taxa.percentual)} sobre o valor das corridas, paga {f.taxa.pagaPor === "central" ? "pela central" : "pelo motorista"}.</p>}
      </section>

      <section className="dm-cartao dm-secao"><h2>Configurações de Pix</h2>
        <Interruptor valor={f.pixRecargas} onChange={(v) => set("pixRecargas", v)} rotulo="Pix para recargas da carteira" descricao="O valor das recargas é transferido para a conta bancária cadastrada acima." desabilitado={!admin} />
        <Interruptor valor={f.pixPagamentos} onChange={(v) => set("pixPagamentos", v)} rotulo="Pix para pagamentos de corridas" descricao="O valor integral da corrida vai para a conta da central; o motorista recebe na carteira, já descontada a taxa da central." desabilitado={!admin} />
      </section>

      <section className="dm-cartao dm-secao"><h2>Cadastro</h2>
        <p className="sub">Situação: <span className={`selo ${f.cadastro.situacao === "em_analise" ? "ok" : "alerta"}`}>{SITUACAO[f.cadastro.situacao]}</span>{f.cadastro.atualizadoEm && ` · atualizado em ${new Date(f.cadastro.atualizadoEm).toLocaleString("pt-BR")}`}</p>
      </section>

      {admin ? <div className="dm-salvar"><button className="botao" disabled={salvando} onClick={atualizar}>Atualizar cadastro</button><button className="botao primario" disabled={salvando} onClick={gravar}>SALVAR</button></div> : <p className="sub">Só o administrador altera as integrações.</p>}
    </>
  );
}
