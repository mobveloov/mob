// Chamada de corrida: o valor LÍQUIDO (o que o motorista recebe) fica grande no centro, com − e + para a contra-oferta;
// embaixo, menores, o bruto e a taxa da central. "Ganhe R$ x/km" é calculado pelo líquido. Depois: tempo até o
// passageiro, nota e viagens dele, observação, embarque, paradas e destino, pagamento e categoria, e os botões
// Recusar e Aceitar R$ <líquido>. Som e vibração, com aviso insistente a cada 5 s. Também abre pelas abas de Corridas.

import { useEffect, useState } from "react";
import { CalendarClock, Flag, Minus, Plus, Star, UserRound, Users } from "lucide-react";
import { reais } from "../comum/api";
import { ajustes, tocar, tremer } from "./ajustes";
import { Erro } from "./Pecas";
import { diaHora, distanciaTexto, nomePassageiro, notaPassageiro, valorDe, type DadosChamada } from "./tipos";

const PASSO = 1;
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Líquido de um valor proposto: vem da tabela que o servidor mandou (com a comissão do painel: percentual, fixo, faixas ou regra do motorista). */
export function liquidoDe(valor: number, tabela?: DadosChamada["tabelaLiquido"] | null) {
  const l = tabela?.find((x) => Math.abs(x.valor - valor) < 0.005);
  return l ? { bruto: l.bruto, taxa: l.taxa, liquido: l.liquido } : null;
}

export function Chamada({ dados: c, distanciaKm, expira, segundos, tocarSom = true, aceitar, recusar, rotuloRecusar = "Recusar", erro }: {
  dados: DadosChamada; distanciaKm?: number | null; expira?: number; segundos?: number; tocarSom?: boolean;
  aceitar: (valor: number | null, contraoferta: boolean) => Promise<void> | void; recusar: () => void; rotuloRecusar?: string; erro?: string;
}) {
  const base = valorDe(c);                       // valor da corrida antes do cupom (é o que a contra-oferta muda)
  const [valor, setValor] = useState(base);
  const [ocupado, setOcupado] = useState(false);
  const [resta, setResta] = useState(() => (expira ? Math.max(0, Math.round((expira - Date.now()) / 1000)) : 0));
  const total = segundos || resta || 1;

  useEffect(() => {
    if (!expira) return;
    const t = setInterval(() => setResta(Math.max(0, Math.round((expira - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [expira]);

  useEffect(() => {
    if (!tocarSom) return;
    const avisar = () => { tocar(4); tremer([400, 200, 400, 200, 400]); };
    avisar();
    if (!ajustes().insistente) return;
    const t = setInterval(avisar, 5000);
    return () => clearInterval(t);
  }, [tocarSom]);

  const contra = valor != null && base != null && Math.abs(valor - base) >= 0.01;
  // Valor do servidor enquanto não mexeu; ao mexer, a mesma conta feita aqui com a regra de comissão que ele mandou.
  const v = valor == null ? null : liquidoDe(valor, c.tabelaLiquido);
  const bruto = contra || c.valorBruto == null ? v?.bruto ?? null : c.valorBruto;
  const taxa = contra || c.taxaCentral == null ? v?.taxa ?? null : c.taxaCentral;
  const liquido = contra || c.valorLiquido == null ? v?.liquido ?? null : c.valorLiquido;
  const km = c.distanciaViagemKm ?? c.estimativa?.distanciaKm ?? null;
  const porKm = liquido != null && km ? centavos(liquido / km) : c.ganhoPorKm ?? null;
  const nota = notaPassageiro(c);
  // Só dá para propor os valores da tabela do servidor (de R$ 5 a menos até R$ 10 a mais, e nunca abaixo do mínimo da categoria).
  const valores = (c.tabelaLiquido ?? []).map((x) => x.valor);
  const mudar = (d: number) => setValor((x) => {
    if (x == null) return x;
    const novo = centavos(x + d);
    return valores.length && (novo < Math.min(...valores) || novo > Math.max(...valores)) ? x : Math.max(1, novo);
  });
  const confirmar = async () => { setOcupado(true); try { await aceitar(valor, contra); } finally { setOcupado(false); } };

  return (
    <div className="chamada" role="dialog" aria-modal="true" aria-label="Nova chamada de corrida">
      <div className="chamada-cartao">
        <div className="chamada-topo">
          <strong>OFERTA DO PASSAGEIRO</strong>
          {expira ? <span className="chamada-anel" style={{ ["--p" as string]: Math.min(100, (resta / total) * 100) }} aria-label={`${resta} segundos`}><span>{resta}s</span></span> : null}
        </div>

        <div className="chamada-valor">
          {base != null && <button type="button" className="redondo contorno" aria-label="Diminuir valor" disabled={(valor ?? 0) - PASSO < 1} onClick={() => mudar(-PASSO)}><Minus size={20} /></button>}
          <div className="chamada-liquido"><small>VOCÊ RECEBE</small><strong>{reais(liquido)}</strong></div>
          {base != null && <button type="button" className="redondo marca" aria-label="Aumentar valor" onClick={() => mudar(PASSO)}><Plus size={20} /></button>}
        </div>
        {bruto != null && <div className="chamada-bruto">Bruto {reais(bruto)}{taxa ? ` · taxa ${reais(taxa)}` : ""}</div>}
        {porKm != null && <span className="chamada-km">Ganhe {reais(porKm)}/km</span>}
        {contra && <p className="dica centro">Contra-oferta: o passageiro ofereceu {reais(base)}.</p>}
        {c.agendadaPara && <span className="chip aviso" style={{ alignSelf: "center" }}><CalendarClock size={13} /> {diaHora(c.agendadaPara)}</span>}

        <div className="chamada-colunas">
          <div><UserRound size={18} /><strong>{c.minutosAteEmbarque != null ? `${c.minutosAteEmbarque} min` : distanciaKm != null ? distanciaTexto(distanciaKm) : "—"}</strong><small>até você</small></div>
          <div><Star size={18} className="cor-aviso" /><strong>{nota != null ? nota.toFixed(1).replace(".", ",") : "Novo"}</strong><small>avaliação</small></div>
          <div><Users size={18} /><strong>{c.viagens ?? 0}</strong><small>viagens</small></div>
        </div>

        {c.observacao && <div className="chamada-obs">{c.observacao}</div>}

        <div className="trajeto">
          <div className="trajeto-ponto"><span className="bolinha embarque" /><div><small>Embarque · {nomePassageiro(c.passageiro)}</small><strong>{c.embarque.texto}</strong></div></div>
          {(c.paradas ?? []).map((p, i) => <div key={i} className="trajeto-ponto"><span className="bolinha parada" /><div><small>Parada {i + 1}</small><strong>{p.texto}</strong></div></div>)}
          {c.destino && <div className="trajeto-ponto"><span className="bolinha destino" /><div><small>Destino</small><strong>{c.destino.texto}</strong></div>{km != null && <span className="chip"><Flag size={12} /> {distanciaTexto(km)}</span>}</div>}
        </div>

        <div className="chamada-pagamento"><span>{c.pagamento}</span><span>{c.categoria.toUpperCase()}</span></div>
        {(c.opcionais ?? []).length > 0 && <div className="chips">{(c.opcionais ?? []).map((o) => <span key={o} className="chip">{o}</span>)}</div>}
        <Erro texto={erro ?? ""} />
        <div className="chamada-botoes">
          <button type="button" className="chamada-recusar" onClick={recusar}>{rotuloRecusar}</button>
          <button type="button" className="chamada-aceitar" disabled={ocupado || (!!expira && !resta)} onClick={() => void confirmar()}>
            {contra ? `Contra-oferta ${reais(liquido)}` : `Aceitar ${liquido != null ? reais(liquido) : ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
