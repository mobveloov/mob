// Chamada de corrida: som e vibração (com aviso insistente a cada 5 s), valor com contra-oferta (− e +),
// embarque, paradas e destino, categoria, pagamento e a nota do passageiro. Recusar e Aceitar.
// Também abre pelas abas de Corridas (Disp. e Prog.), para pegar uma corrida aberta.

import { useEffect, useState } from "react";
import { CalendarClock, ChevronRight, Flag, Minus, Navigation, Plus, Star, UserRound } from "lucide-react";
import { reais } from "../comum/api";
import { ajustes, tocar, tremer } from "./ajustes";
import { Erro } from "./Pecas";
import { diaHora, distanciaTexto, nomePassageiro, notaPassageiro, valorDe, type DadosChamada } from "./tipos";

const PASSO = 1;

export function Chamada({ dados: c, distanciaKm, expira, segundos, tocarSom = true, aceitar, recusar, rotuloRecusar = "Recusar", erro }: {
  dados: DadosChamada; distanciaKm?: number | null; expira?: number; segundos?: number; tocarSom?: boolean;
  aceitar: (valor: number | null, contraoferta: boolean) => Promise<void> | void; recusar: () => void; rotuloRecusar?: string; erro?: string;
}) {
  const base = valorDe(c);
  const [valor, setValor] = useState(base);
  const [ocupado, setOcupado] = useState(false);
  const [resta, setResta] = useState(() => (expira ? Math.max(0, Math.round((expira - Date.now()) / 1000)) : 0));
  const total = segundos || resta || 1;

  useEffect(() => {
    if (!expira) return;
    const t = setInterval(() => setResta(Math.max(0, Math.round((expira - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [expira]);

  // Som e vibração ao chegar; com o aviso insistente, repete a cada 5 s até aceitar ou recusar.
  useEffect(() => {
    if (!tocarSom) return;
    const avisar = () => { tocar(4); tremer([400, 200, 400, 200, 400]); };
    avisar();
    if (!ajustes().insistente) return;
    const t = setInterval(avisar, 5000);
    return () => clearInterval(t);
  }, [tocarSom]);

  const contra = valor != null && base != null && Math.abs(valor - base) >= 0.01;
  const nota = notaPassageiro(c);
  const confirmar = async () => { setOcupado(true); try { await aceitar(valor, contra); } finally { setOcupado(false); } };

  return (
    <div className="chamada" role="dialog" aria-modal="true" aria-label="Nova chamada de corrida">
      <button type="button" className="chamada-recusar" onClick={recusar}>{rotuloRecusar}</button>
      <div className="chamada-cartao">
        {expira ? <div className="chamada-tempo" aria-label={`${resta} segundos`}><span style={{ width: `${Math.min(100, (resta / total) * 100)}%` }} /></div> : null}
        <div className="chamada-valor">
          {base != null && <button type="button" className="redondo contorno" aria-label="Diminuir valor" disabled={(valor ?? 0) - PASSO < 1} onClick={() => setValor((v) => Math.round(((v ?? 0) - PASSO) * 100) / 100)}><Minus size={20} /></button>}
          <strong>{reais(valor)}</strong>
          {base != null && <button type="button" className="redondo marca" aria-label="Aumentar valor" onClick={() => setValor((v) => Math.round(((v ?? 0) + PASSO) * 100) / 100)}><Plus size={20} /></button>}
        </div>
        <div className="chips centro">
          {nota != null && <span className="chip ok"><Star size={13} fill="currentColor" /> {nota.toFixed(1).replace(".", ",")}</span>}
          {distanciaKm != null && <span className="chip"><Navigation size={13} /> {distanciaTexto(distanciaKm)} até o embarque</span>}
          {c.agendadaPara && <span className="chip aviso"><CalendarClock size={13} /> {diaHora(c.agendadaPara)}</span>}
        </div>
        {contra && <p className="dica centro">Contra-oferta: o passageiro ofereceu {reais(base)}.</p>}
        <div className="trajeto">
          <div className="trajeto-ponto"><UserRound size={16} /><div><small>Embarque · {nomePassageiro(c.passageiro)}</small><strong>{c.embarque.texto}</strong></div></div>
          {(c.paradas ?? []).map((p, i) => <div key={i} className="trajeto-ponto"><span className="bolinha parada" /><div><small>Parada {i + 1}</small><strong>{p.texto}</strong></div></div>)}
          {c.destino && <div className="trajeto-ponto"><Flag size={16} /><div><small>Destino{c.estimativa?.distanciaKm != null ? ` · ${distanciaTexto(c.estimativa.distanciaKm)}` : ""}</small><strong>{c.destino.texto}</strong></div></div>}
        </div>
        <div className="chips centro">
          <span className="chip">{c.categoria.toUpperCase()}</span>
          <span className="chip">{c.pagamento}</span>
          {(c.opcionais ?? []).map((o) => <span key={o} className="chip">{o}</span>)}
        </div>
        {c.observacao && <p className="dica centro">Obs.: {c.observacao}</p>}
        <Erro texto={erro ?? ""} />
        <button type="button" className="botao-m grande dividido" disabled={ocupado || (!!expira && !resta)} onClick={() => void confirmar()}>
          <span>{contra ? `CONTRA-OFERTA ${reais(valor)}` : `ACEITAR ${base != null ? reais(valor) : ""}`.trim()}</span><ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
