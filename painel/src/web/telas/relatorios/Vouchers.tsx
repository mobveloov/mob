// Vouchers: Faixas de Vouchers (listar e criar) e Entrega de voucher.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Cab, Campo, Carregando, dinheiro, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { pedirRel } from "./comum";

const VAZIO = { empresa: "", serie: "", inicial: "", final: "" };

export function FaixasVouchers() {
  const admin = useAdmin();
  const [criando, setCriando] = useState(false);
  const [f, setF] = useState(VAZIO), [aplicado, setAplicado] = useState(VAZIO);
  const [n, setN] = useState({ empresa: "", serie: "", inicial: "", final: "" });
  const qs = new URLSearchParams(aplicado).toString();
  const d = useCarregar(() => pedirRel<any>(`/vouchers/faixas?${qs}`), [qs]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;

  if (criando) {
    return (
      <>
        <Cab titulo="Criando Faixa de Vouchers" sub="Campos com * são obrigatórios." />
        <Aviso erro={msg?.erro} />
        <form className="dm-cartao dm-filtros" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(async () => { await pedirRel("/vouchers/faixas", "POST", n); return true; }); if (r) { setCriando(false); setN({ empresa: "", serie: "", inicial: "", final: "" }); d.recarregar(); } }}>
          <Campo rotulo="Empresa *"><select required value={n.empresa} onChange={(e) => setN({ ...n, empresa: e.target.value })}><option value="">Selecione</option>{x?.empresas.map((e: string) => <option key={e}>{e}</option>)}</select></Campo>
          <Campo rotulo="Série"><input value={n.serie} maxLength={20} onChange={(e) => setN({ ...n, serie: e.target.value })} /></Campo>
          <Campo rotulo="Número inicial *"><input required inputMode="numeric" pattern="\d+" value={n.inicial} onChange={(e) => setN({ ...n, inicial: e.target.value })} /></Campo>
          <Campo rotulo="Número final *"><input required inputMode="numeric" pattern="\d+" value={n.final} onChange={(e) => setN({ ...n, final: e.target.value })} /></Campo>
          <button type="button" className="botao" onClick={() => setCriando(false)}>Voltar</button>
          <button className="botao primario">Criar</button>
        </form>
      </>
    );
  }
  return (
    <>
      <Cab titulo="Faixas de Vouchers" sub="Forma de pagamento de corridas corporativas. Nela, o funcionário de uma empresa entrega ao motorista um vale, que ao final de determinado período fatura com a empresa e recebe os ganhos.">
        {admin && <button className="botao primario" onClick={() => setCriando(true)}><Plus size={14} /> Criar Faixa de Vouchers</button>}
      </Cab>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setAplicado(f); }}>
        <Campo rotulo="Empresa"><select value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}><option value="">Selecione</option>{x?.empresas.map((e: string) => <option key={e}>{e}</option>)}</select></Campo>
        <Campo rotulo="Série"><input value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} /></Campo>
        <Campo rotulo="Número inicial"><input inputMode="numeric" value={f.inicial} onChange={(e) => setF({ ...f, inicial: e.target.value })} /></Campo>
        <Campo rotulo="Número final"><input inputMode="numeric" value={f.final} onChange={(e) => setF({ ...f, final: e.target.value })} /></Campo>
        <button className="botao primario">Filtrar</button>
        <button type="button" className="botao" onClick={() => { setF(VAZIO); setAplicado(VAZIO); }}>Limpar filtros</button>
      </form>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Empresa</th><th>Série</th><th>Número inicial</th><th>Número final</th><th /></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={5}><Carregando /></td></tr> : !x.faixas.length ? <tr><td colSpan={5} className="vazio">Nenhum resultado encontrado.</td></tr> : x.faixas.map((r: any) => (
              <tr key={r.id}><td>{r.conveniada}</td><td>{r.serie}</td><td>{r.inicial}</td><td>{r.final}</td>
                <td>{admin && <button className="icone" aria-label="Apagar faixa" onClick={() => confirm("Apagar esta faixa de vouchers?") && salvar(async () => { await pedirRel(`/vouchers/faixas/${r.id}`, "DELETE"); d.recarregar(); }, "Faixa apagada.")}><Trash2 size={15} /></button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function EntregaVoucher() {
  const [f, setF] = useState({ motorista: "", osCompradas: "" });
  const [pedido, setPedido] = useState<typeof f | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const qs = pedido ? new URLSearchParams(pedido).toString() : "";
  const d = useCarregar(() => (pedido ? pedirRel<any>(`/vouchers/entrega?${qs}`) : Promise.resolve(null)), [qs, pedido === null]);
  const { msg, salvar } = useSalvar();
  const itens: any[] = d.dados?.itens ?? [];
  const todas = itens.length > 0 && marcadas.length === itens.length;

  return (
    <>
      <Cab titulo="Entrega de voucher" />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setMarcadas([]); setPedido(f); }}>
        <Campo rotulo="VTR/Nome"><input value={f.motorista} maxLength={80} onChange={(e) => setF({ ...f, motorista: e.target.value })} /></Campo>
        <Campo rotulo="OS Compradas"><textarea rows={2} value={f.osCompradas} placeholder="Números das OS, separados por espaço ou vírgula" onChange={(e) => setF({ ...f, osCompradas: e.target.value })} /></Campo>
        <button className="botao primario">Obter OS Pendentes</button>
        <button type="button" className="botao" onClick={() => { setF({ motorista: "", osCompradas: "" }); setPedido(null); setMarcadas([]); }}>Limpar filtros</button>
      </form>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th><input type="checkbox" aria-label="Selecionar todas" checked={todas} onChange={() => setMarcadas(todas ? [] : itens.map((i) => i.id))} /></th><th>Nº OS</th><th>Voucher</th><th>Motorista</th><th>Passageiro</th><th>Origem</th><th>Destino</th><th>Valor</th></tr></thead>
          <tbody>
            {!pedido ? <tr><td colSpan={8} className="vazio">Clique em Obter OS Pendentes.</td></tr> : !d.dados ? <tr><td colSpan={8}><Carregando /></td></tr> : !itens.length ? <tr><td colSpan={8} className="vazio">Nenhum resultado encontrado.</td></tr> : itens.map((i) => (
              <tr key={i.id}>
                <td><input type="checkbox" aria-label={`Selecionar OS ${i.os}`} checked={marcadas.includes(i.id)} onChange={() => setMarcadas(marcadas.includes(i.id) ? marcadas.filter((m) => m !== i.id) : [...marcadas, i.id])} /></td>
                <td>{i.os}</td><td>{i.voucher}</td><td>{i.motorista}</td><td>{i.passageiro}</td><td>{i.origem}</td><td>{i.destino}</td><td className="num">{i.valor == null ? "" : dinheiro(i.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dm-rodape-modal"><button className="botao primario" disabled={!marcadas.length} onClick={() => salvar(async () => { await pedirRel("/vouchers/entrega", "POST", { ids: marcadas }); setMarcadas([]); d.recarregar(); }, "Entrega registrada.")}>Registrar Entrega</button></div>
      </div>
    </>
  );
}
