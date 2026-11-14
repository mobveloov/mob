// Corridas › Alteração de dados da OS (Machine): "Qual OS deseja alterar?", número da OS e o botão Alterar, que abre a edição da OS.
// OS paga pelo app ou pela carteira de créditos do cliente não pode ser alterada.

import { useState } from "react";
import { Aviso, Cab } from "../demais/comum";
import { JanelaCorrida } from "../corridas/JanelaCorrida";
import { msgErro, op } from "../corridas/comum";

export function AlterarOS() {
  const [os, setOs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  async function alterar(e: React.FormEvent) {
    e.preventDefault(); setErro(null);
    const n = os.replace(/\D/g, "");
    if (!n) { setErro("Informe o número da OS."); return; }
    setBuscando(true);
    try {
      const r = await op<{ corrida: { id: string; pagamento: string } }>(`/corridas/${encodeURIComponent(n)}`);
      if (/cart[ãa]o no app|carteira/i.test(r.corrida.pagamento ?? "")) { setErro("OS's com pagamento via app ou \"Carteira de créditos do cliente\" não podem ser alteradas."); return; }
      setAberta(r.corrida.id);
    } catch (x) { setErro(msgErro(x)); } finally { setBuscando(false); }
  }
  return (
    <>
      <Cab titulo="Alteração de dados da OS" />
      <form className="dm-cartao dm-form" onSubmit={alterar}>
        <h3>Qual OS deseja alterar?</h3>
        <label className="dm-campo"><span>Nº OS</span><input inputMode="numeric" value={os} onChange={(e) => setOs(e.target.value)} maxLength={12} /></label>
        <Aviso erro={erro} />
        <div className="dm-salvar"><button className="botao primario" disabled={buscando}>Alterar</button></div>
        <p className="sub">OS's com pagamento via app ou "Carteira de créditos do cliente" não podem ser alteradas.</p>
      </form>
      {aberta && <JanelaCorrida id={aberta} editarDireto onFechar={() => setAberta(null)} />}
    </>
  );
}
