// Painel: "Carteiras, saques e recargas". Saldo de cada passageiro e motorista, extrato, lançamento manual da central
// (ex.: recarga recebida por Pix) e saques pedidos pelos motoristas (a central paga o Pix e marca como pago, ou recusa).
// Servidor: /api/apps-central/carteiras e /saques (src/apps/extras.ts).

import { useState } from "react";
import { useSessao } from "../App";
import { dataHora, dinheiro } from "../api";
import { Avisos, Cartao, Gaveta, Kpi, Titulo, useCarregar } from "../componentes/ui";

interface SaldoLinha { papel: "passageiro" | "motorista"; chave: string; nome: string; saldo: number; lancamentos: number; ultimo: string }
interface Saque { id: string; motoristaId: string; nome: string; valor: number; chavePix: string; situacao: string; motivo: string; em: string; resolvidoEm: string | null; resolvidoPor: string }
interface Lancamento { id: string; valor: number; descricao: string; em: string; por: string }

async function pedir<T>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: corpo === undefined ? "GET" : "POST", headers: corpo === undefined ? undefined : { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro ?? `Erro ${r.status}`);
  return j as T;
}
const SELO: Record<string, string> = { Pendente: "alerta", Pago: "ok", Recusado: "ruim" };

export default function Carteiras() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const d = useCarregar(() => pedir<{ saldos: SaldoLinha[]; saques: Saque[] }>("/api/apps-central/carteiras"), [], 20_000);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<SaldoLinha | null>(null);
  const [novo, setNovo] = useState({ papel: "passageiro", chave: "", valor: "", descricao: "Recarga recebida por Pix" });

  const fazer = async (f: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await f(); setMsg({ texto: ok }); d.recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const pendentes = (d.dados?.saques ?? []).filter((s) => s.situacao === "Pendente");
  const b = busca.trim().toLowerCase();
  const saldos = (d.dados?.saldos ?? []).filter((s) => !b || s.nome.toLowerCase().includes(b) || s.chave.includes(b.replace(/\D/g, "") || "\u0000"));
  const total = (p: string) => (d.dados?.saldos ?? []).filter((s) => s.papel === p).reduce((a, s) => a + s.saldo, 0);

  return (
    <>
      <Titulo titulo="Carteiras, saques e recargas" sub="Saldo dos passageiros e motoristas nos apps, recargas lançadas pela central e saques dos motoristas." />
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <Avisos lista={[d.erro]} />
      <div className="kpis">
        <Kpi rotulo="Saldo dos passageiros" valor={dinheiro(total("passageiro"))} />
        <Kpi rotulo="Saldo dos motoristas" valor={dinheiro(total("motorista"))} />
        <Kpi rotulo="Saques esperando" valor={String(pendentes.length)} detalhe={dinheiro(pendentes.reduce((a, s) => a + s.valor, 0))} tom={pendentes.length ? "alerta" : "ok"} />
      </div>
      <div className="grade">
        <Cartao titulo="Saques dos motoristas">
          {!d.dados?.saques.length ? <p className="vazio">Nenhum saque pedido.</p> : (
            <ul className="lista">{d.dados.saques.slice(0, 60).map((s) => (
              <li key={s.id}>
                <strong>{s.nome || "Motorista"}</strong> · {dinheiro(s.valor)} <span className={`selo ${SELO[s.situacao] ?? "info"}`}>{s.situacao}</span><br />
                <small>Pix: {s.chavePix} · pedido em {dataHora(s.em)}{s.resolvidoEm ? ` · ${s.situacao.toLowerCase()} em ${dataHora(s.resolvidoEm)} por ${s.resolvidoPor}` : ""}{s.motivo ? ` · ${s.motivo}` : ""}</small>
                {admin && s.situacao === "Pendente" && (
                  <div className="linha-acao">
                    <button className="botao primario" onClick={() => confirm(`Já fez o Pix de ${dinheiro(s.valor)} para ${s.chavePix}?`) && fazer(() => pedir(`/api/apps-central/saques/${s.id}/pagar`, {}), "Saque marcado como pago.")}>Já paguei</button>
                    <button className="botao" onClick={() => { const m = prompt("Motivo da recusa (o motorista vê):"); if (m) void fazer(() => pedir(`/api/apps-central/saques/${s.id}/recusar`, { motivo: m }), "Saque recusado. O valor voltou para o saldo do motorista."); }}>Recusar</button>
                  </div>
                )}
              </li>
            ))}</ul>
          )}
        </Cartao>
        {admin && (
          <Cartao titulo="Lançar na carteira">
            <form className="form" onSubmit={(e) => { e.preventDefault(); void fazer(() => pedir("/api/apps-central/carteiras/lancar", { ...novo, valor: Number(novo.valor.replace(/\./g, "").replace(",", ".")) }), "Lançamento feito."); }}>
              <label>De quem<select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}><option value="passageiro">Passageiro (telefone)</option><option value="motorista">Motorista (escolha na lista)</option></select></label>
              {novo.papel === "passageiro"
                ? <label>Telefone do passageiro<input value={novo.chave} inputMode="tel" placeholder="(00) 00000-0000" onChange={(e) => setNovo({ ...novo, chave: e.target.value })} required /></label>
                : <label>Motorista<select value={novo.chave} onChange={(e) => setNovo({ ...novo, chave: e.target.value })} required><option value="">Escolha</option>{(d.dados?.saldos ?? []).filter((s) => s.papel === "motorista").map((s) => <option key={s.chave} value={s.chave}>{s.nome || s.chave}</option>)}</select><small>Aparecem os motoristas que já têm movimento. Os outros entram depois da primeira corrida pelo app.</small></label>}
              <label>Valor<input value={novo.valor} inputMode="decimal" placeholder="Ex.: 50 (crédito) ou -10 (débito)" onChange={(e) => setNovo({ ...novo, valor: e.target.value })} required /></label>
              <label>Descrição<input value={novo.descricao} maxLength={120} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></label>
              <div className="acoes"><button className="botao primario">Lançar</button></div>
            </form>
          </Cartao>
        )}
        <Cartao titulo="Saldos" className="largo">
          <div className="linha-filtro"><input placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          {!saldos.length ? <p className="vazio">Ninguém com movimento na carteira ainda.</p> : (
            <div className="tabela-rola"><table>
              <thead><tr><th>Nome</th><th>Quem</th><th>Telefone / id</th><th className="num">Saldo</th><th className="num">Lançamentos</th><th>Último</th></tr></thead>
              <tbody>{saldos.map((s) => (
                <tr key={`${s.papel}:${s.chave}`} onClick={() => setAberta(s)}>
                  <td className="forte">{s.nome || "—"}</td><td>{s.papel === "motorista" ? "Motorista" : "Passageiro"}</td><td>{s.papel === "passageiro" ? s.chave : "—"}</td>
                  <td className="num">{dinheiro(s.saldo)}</td><td className="num">{s.lancamentos}</td><td>{dataHora(s.ultimo)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Cartao>
      </div>
      {aberta && <Extrato linha={aberta} onFechar={() => setAberta(null)} />}
    </>
  );
}

function Extrato({ linha, onFechar }: { linha: SaldoLinha; onFechar: () => void }) {
  const e = useCarregar(() => pedir<{ saldo: number; extrato: Lancamento[] }>(`/api/apps-central/carteiras/${linha.papel}/${encodeURIComponent(linha.chave)}`), [linha.papel, linha.chave]);
  return (
    <Gaveta aberta onFechar={onFechar} titulo={`Extrato de ${linha.nome || linha.chave}`}>
      <p className="sub">Saldo: <strong>{dinheiro(e.dados?.saldo ?? linha.saldo)}</strong></p>
      <ul className="lista">{(e.dados?.extrato ?? []).map((l) => (
        <li key={l.id}><strong className={l.valor < 0 ? "ruim" : "ok"}>{dinheiro(l.valor)}</strong> · {l.descricao}<br /><small>{dataHora(l.em)} · {l.por}</small></li>
      ))}</ul>
    </Gaveta>
  );
}
