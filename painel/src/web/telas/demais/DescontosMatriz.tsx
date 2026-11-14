// Config › Descontos: matriz por forma de pagamento (site e app #1 a #4) e desconto máximo por empresa, como na Machine.

import { useState } from "react";
import { Aviso, Cab, Carregando, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const CANAIS: Array<[string, string]> = [["site", "Site"], ["app1", "App #1"], ["app2", "App #2"], ["app3", "App #3"], ["app4", "App #4"], ["maximo", "Máximo da empresa"]];
const num = (v: string) => (v === "" ? 0 : Number(v.replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number) => (n ? String(n).replace(".", ",") : "");
const rotulo = (n: number) => (n > 0 ? `${String(n).replace(".", ",")}%` : "Nenhum");

export function DescontosMatriz() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/descontos-matriz"), []);
  const [m, setM] = useState<any>(null), [lido, setLido] = useState<unknown>(null), [editando, setEditando] = useState(false);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setM(structuredClone(d.dados.matriz)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!m || !d.dados) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const formas: Array<{ id: string; nome: string }> = d.dados.formas;
  const mudar = (f: string, c: string, v: string) => setM({ ...m, [f]: { ...m[f], [c]: num(v) } });
  const gravar = () => salvar(async () => { const r = await pedirConfig("/descontos-matriz", "PUT", { matriz: m }); setLido(r); setM(structuredClone(r.matriz)); setEditando(false); }, "Descontos gravados.");
  const cancelar = () => { setM(structuredClone(d.dados.matriz)); setEditando(false); };
  return (
    <>
      <Cab titulo="Descontos" sub="Percentual por forma de pagamento, pelo site e pelos aplicativos, com o teto de desconto da empresa.">
        {admin && !editando && <button className="botao primario" onClick={() => setEditando(true)}>Alterar</button>}
      </Cab>
      <Aviso erro={msg?.erro ?? d.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Tipo de pagamento</th>{CANAIS.map(([c, n]) => <th key={c}>{c === "maximo" ? "Desconto máximo por empresa" : `Desconto pelo ${n === "Site" ? "site" : "aplicativo (" + n.slice(5) + ")"}`}</th>)}</tr></thead>
          <tbody>
            {formas.map((f) => (
              <tr key={f.id}>
                <td className="forte">{f.nome}</td>
                {CANAIS.map(([c, n]) => (
                  <td key={c}>{editando
                    ? <span className="dm-linha"><input inputMode="decimal" aria-label={`${f.nome}: ${n}`} value={txt(m[f.id][c])} placeholder="0" onChange={(e) => mudar(f.id, c, e.target.value)} style={{ width: "5.5rem" }} /><small>%</small></span>
                    : rotulo(m[f.id][c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub">Vazio ou zero significa "Nenhum". O desconto de cada canal não pode passar do máximo da empresa quando ele estiver definido. Os descontos por campanha ficam na aba ao lado.</p>
      {editando && <div className="dm-salvar"><button className="botao" onClick={cancelar}>Voltar</button><button className="botao primario" disabled={salvando} onClick={gravar}>Gravar</button></div>}
      {!admin && <p className="sub">Só o administrador altera os descontos.</p>}
    </>
  );
}
