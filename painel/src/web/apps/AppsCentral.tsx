// Painel: "Apps e SOS". Motoristas online pelo app (posição, livre ou em corrida) e alertas de SOS dos apps.
// Servidor: /api/apps-central (src/apps/rotas.ts). Atualiza sozinho a cada 10 s.

import { useState } from "react";
import { Avisos, Cartao, Titulo, useCarregar } from "../componentes/ui";

interface MotoristaOnline { id: string; nome: string; placa: string; lat: number; lng: number; atualizadoEm: string; situacao: string }
interface Alerta { id: string; os: string; papel: string; nome: string; telefone: string; lat: number | null; lng: number | null; em: string; resolvido: boolean; resolvidoPor: string }

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro ?? `Erro ${r.status}`);
  return j as T;
}
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function AppsCentral() {
  const mot = useCarregar(() => pedir<{ motoristas: MotoristaOnline[] }>("/api/apps-central/motoristas"), [], 10_000);
  const al = useCarregar(() => pedir<{ alertas: Alerta[] }>("/api/apps-central/alertas"), [], 10_000);
  const [erro, setErro] = useState("");
  const abertos = (al.dados?.alertas ?? []).filter((a) => !a.resolvido);

  const resolver = async (id: string) => {
    try { await pedir(`/api/apps-central/alertas/${id}/resolver`, { method: "POST" }); al.recarregar(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
      <Titulo titulo="Apps e SOS" sub="Motoristas online pelo app do motorista e pedidos de ajuda dos dois apps." />
      <Avisos lista={[mot.erro, al.erro, erro]} />
      <Cartao titulo={`Alertas de SOS em aberto (${abertos.length})`}>
        {!abertos.length ? <p className="vazio">Nenhum alerta em aberto.</p> : (
          <div className="tabela-rola"><table>
            <thead><tr><th>Quando</th><th>OS</th><th>Quem</th><th>Telefone</th><th>Local</th><th /></tr></thead>
            <tbody>{abertos.map((a) => (
              <tr key={a.id}>
                <td>{quando(a.em)}</td><td>{a.os}</td><td>{a.nome} ({a.papel})</td>
                <td><a href={`tel:${a.telefone}`}>{a.telefone}</a></td>
                <td>{a.lat != null && a.lng != null ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : "—"}</td>
                <td><button className="botao" onClick={() => void resolver(a.id)}>Resolvido</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Cartao>
      <Cartao titulo={`Motoristas online (${mot.dados?.motoristas.length ?? 0})`}>
        {!mot.dados?.motoristas.length ? <p className="vazio">Nenhum motorista online no app agora.</p> : (
          <div className="tabela-rola"><table>
            <thead><tr><th>Motorista</th><th>Placa</th><th>Situação</th><th>Posição</th><th>Atualizado</th></tr></thead>
            <tbody>{mot.dados.motoristas.map((m) => (
              <tr key={m.id}><td>{m.nome}</td><td>{m.placa}</td><td>{m.situacao}</td><td>{m.lat.toFixed(5)}, {m.lng.toFixed(5)}</td><td>{quando(m.atualizadoEm)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Cartao>
    </>
  );
}
