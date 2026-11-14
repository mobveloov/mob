// Config › Descontos, no formato da Machine: tabela por forma de pagamento (via site, via aplicativo e desconto máximo por empresa)
// e a tela "Alterando Desconto" (site e aplicativo #1 a #4 de cada forma). O máximo da empresa fica no fim de cada bloco.

import { useState } from "react";
import { Aviso, Cab, Carregando, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const APPS = ["app1", "app2", "app3", "app4"] as const;
// Nomes que a Machine usa na tela de alteração.
const NOME_EDICAO: Record<string, string> = { dinheiro: "Dinheiro", debito: "Débito (máquina)", credito: "Crédito (máquina)", cartao_app: "Cartão no app", pix: "Pix" };
const num = (v: string) => (v === "" ? 0 : Number(v.replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number) => (n ? String(n).replace(".", ",") : "");
const rotulo = (n: number, motoristas: number) => `${n > 0 ? `${String(n).replace(".", ",")}%` : "Nenhum"} (${motoristas} Motoristas)`;

export function DescontosMatriz() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/descontos-matriz"), []);
  const [m, setM] = useState<any>(null), [lido, setLido] = useState<unknown>(null), [editando, setEditando] = useState(false);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setM(structuredClone(d.dados.matriz)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!m || !d.dados) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const formas: Array<{ id: string; nome: string }> = d.dados.formas;
  const ativos: number = d.dados.motoristasAtivos ?? 0;
  const mudar = (f: string, c: string, v: string) => setM({ ...m, [f]: { ...m[f], [c]: num(v) } });
  const gravar = () => salvar(async () => { const r = await pedirConfig("/descontos-matriz", "PUT", { matriz: m }); setLido(r); setM(structuredClone(r.matriz)); setEditando(false); }, "Descontos gravados.");
  const voltar = () => { setM(structuredClone(d.dados.matriz)); setEditando(false); };
  const campo = (f: string, c: string, rot: string) => (
    <label key={c} className="dm-campo"><span>{rot}</span><span className="dm-linha"><input inputMode="decimal" value={txt(m[f][c])} placeholder="0" onChange={(e) => mudar(f, c, e.target.value)} style={{ width: "6rem" }} /><small>%</small></span></label>
  );

  if (editando) {
    return (
      <>
        <Cab titulo="Alterando Desconto" />
        <Aviso erro={msg?.erro} />
        {formas.map((f) => (
          <section key={f.id} className="dm-cartao">
            <h3>{NOME_EDICAO[f.id] ?? f.nome}</h3>
            <h4>Site</h4>
            <div className="dm-grade3">{campo(f.id, "site", "Desconto pelo site")}</div>
            <h4>Aplicativo</h4>
            <div className="dm-grade4">{APPS.map((a) => campo(f.id, a, `Desconto pelo app #${a.slice(3)}`))}</div>
            <h4>Desconto máximo por empresa</h4>
            <div className="dm-grade3">{campo(f.id, "maximo", "Máximo (%)")}</div>
          </section>
        ))}
        <div className="dm-salvar"><button className="botao" onClick={voltar}>Voltar</button><button className="botao primario" disabled={salvando} onClick={gravar}>Gravar</button></div>
      </>
    );
  }
  return (
    <>
      <Cab titulo="Descontos">{admin && <button className="botao primario" onClick={() => setEditando(true)}>Alterar</button>}</Cab>
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Tipo de pagamento</th><th>Via site</th><th>Via aplicativo (1)</th><th>Desconto máximo por empresa</th></tr></thead>
          <tbody>
            {formas.map((f) => (
              <tr key={f.id}>
                <td className="forte">{f.nome}</td>
                <td>{rotulo(m[f.id].site, ativos)}</td>
                <td>{rotulo(m[f.id].app1, ativos)}</td>
                <td>{m[f.id].maximo > 0 ? `${String(m[f.id].maximo).replace(".", ",")}%` : "Nenhum"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub">* As quantidades de motoristas exibidas são calculadas levando em consideração os motoristas ativos.</p>
      {!admin && <p className="sub">Só o administrador altera os descontos.</p>}
    </>
  );
}
