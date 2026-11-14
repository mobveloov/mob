// Seletor "Central principal e centrais associadas" do topo do painel. Aparece só para quem tem uma rede (principal com associadas).
// Escolher uma central aqui só muda o que as telas de Cobrança mostram (plano, demonstrativo, controle). Não entra no painel da associada.
import { useEffect, useState } from "react";
import { definirFoco, lerFoco, pedirCentrais, type CentralResumo } from "./comum";

export function SeletorCentral({ empresaId, classe = "" }: { empresaId: string; classe?: string }) {
  const [lista, setLista] = useState<CentralResumo[]>([]);
  const [foco, setFoco] = useState("");
  useEffect(() => {
    let vivo = true;
    pedirCentrais<{ atual: string; centrais: CentralResumo[] }>("/seletor").then((r) => {
      if (!vivo) return;
      setLista(r.centrais);
      // foco antigo (de outra empresa ou central desligada) volta para a própria central
      const salvo = lerFoco(), valido = r.centrais.some((c) => c.id === salvo) ? salvo : "";
      if (salvo && !valido) definirFoco("");
      setFoco(valido);
    }).catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, [empresaId]);
  useEffect(() => {
    const f = () => setFoco(lerFoco());
    window.addEventListener("central-foco", f);
    return () => window.removeEventListener("central-foco", f);
  }, []);
  if (lista.length < 2) return null;
  return (
    <label className={`seletor-central ${classe}`} title="Central principal e centrais associadas">
      <span>Central</span>
      <select aria-label="Central principal e centrais associadas" value={foco || lista[0].id} onChange={(e) => { const v = e.target.value === lista[0].id ? "" : e.target.value; setFoco(v); definirFoco(v); }}>
        {lista.map((c) => <option key={c.id} value={c.id}>{c.rotulo}{c.tipo === "principal" ? " (principal)" : ""}</option>)}
      </select>
    </label>
  );
}
