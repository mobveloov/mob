// Alertas de segurança: pedidos de ajuda (SOS) dos apps do passageiro e do motorista, em tempo real.
// Lista com os abertos e atendidos no topo, mapa da posição, dados da pessoa e da corrida, e os botões Atender, Ligar e Encerrar.
// Histórico dos encerrados logo abaixo. Servidor: /api/apps-central/sos (src/apps/rotas.ts). Atualiza a cada 5 s.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MapPin, Phone, ShieldAlert, UserCheck } from "lucide-react";
import { Aviso, Dado, L, Selo, Vazio, dh, fone, msgErro, pino, useDados, useMapa } from "./comum";
import "./corridas.css";

interface Corrida { os: string; status: string; embarque: string; destino: string; passageiro: string; telefonePassageiro: string; motorista: string; telefoneMotorista: string; categoria: string }
interface Alerta {
  id: string; papel: string; nome: string; telefone: string; lat: number | null; lng: number | null; endereco: string; corridaId: string; os: string; motivo: string;
  em: string; situacao: "aberto" | "atendido" | "encerrado"; atendidoPor: string; atendidoEm: string; encerradoPor: string; encerradoEm: string; observacao: string; notificados: number; corrida: Corrida | null;
}

async function api<T = any>(caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`/api/apps-central${caminho}`, { method: corpo === undefined ? "GET" : "POST", credentials: "same-origin", headers: corpo === undefined ? undefined : { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro ?? `Erro ${r.status}`);
  return j as T;
}

const SELO: Record<string, [string, string]> = { aberto: ["ruim", "Aberto"], atendido: ["alerta", "Atendido"], encerrado: ["ok", "Encerrado"] };
const PAPEL = (p: string) => (p === "motorista" ? "Motorista" : "Passageiro");

function MapaDoAlerta({ a }: { a: Alerta }) {
  const { ref, mapa } = useMapa([a.lat ?? -15.78, a.lng ?? -47.93], 16, a.lat != null);
  const camada = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa || a.lat == null || a.lng == null) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(mapa); camada.current = g;
    L.marker([a.lat, a.lng], { icon: pino("#ef4444", "🆘") }).bindPopup(`<b>${a.nome || PAPEL(a.papel)}</b><br>${a.endereco}`).addTo(g);
    mapa.setView([a.lat, a.lng], Math.max(mapa.getZoom(), 15));
  }, [mapa, a.id, a.lat, a.lng]);
  if (a.lat == null) return <Vazio>O app não mandou a posição deste alerta.</Vazio>;
  return <div ref={ref} style={{ height: 280, borderRadius: 12, overflow: "hidden" }} />;
}

export default function AlertasSeguranca() {
  const { dados, erro, recarregar } = useDados<{ alertas: Alerta[] }>(() => api("/sos?limite=300"), [], 5000);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [fim, setFim] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const todos = dados?.alertas ?? [];
  const pendentes = todos.filter((a) => a.situacao !== "encerrado");
  const historico = todos.filter((a) => a.situacao === "encerrado");
  const sel = todos.find((a) => a.id === escolhido) ?? pendentes[0] ?? historico[0] ?? null;
  useEffect(() => { setObs(""); setFim(false); }, [sel?.id]);

  const agir = async (caminho: string, corpo: unknown = {}) => {
    setOcupado(true); setMsg(null);
    try { await api(caminho, corpo); setFim(false); recarregar(); } catch (e) { setMsg(msgErro(e)); } finally { setOcupado(false); }
  };

  return (
    <div className="oc">
      <div className="oc-topo"><h1><ShieldAlert size={22} style={{ verticalAlign: "-4px" }} /> Alertas de segurança <small>Atualizando automaticamente</small></h1></div>
      <Aviso texto={erro} erro />
      <Aviso texto={msg} erro />
      {!pendentes.length && <div className="oc-card"><Vazio><CheckCircle2 size={20} /> Nenhum alerta em aberto. Quando alguém apertar o botão de pânico no app, ele aparece aqui na hora.</Vazio></div>}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)", alignItems: "start" }} className="sos-grade">
        <div>
          <div className="oc-card">
            <h3>Em aberto ({pendentes.length})</h3>
            {pendentes.map((a) => (
              <button key={a.id} type="button" className="oc-btn" onClick={() => setEscolhido(a.id)}
                style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8, borderColor: sel?.id === a.id ? "var(--oc-ruim)" : undefined, background: a.situacao === "aberto" ? "color-mix(in srgb, var(--oc-ruim) 14%, transparent)" : undefined }}>
                <Selo tom={SELO[a.situacao][0]}>{SELO[a.situacao][1]}</Selo> <b>{a.nome || PAPEL(a.papel)}</b> ({PAPEL(a.papel).toLowerCase()})<br />
                <small>{dh(a.em)}{a.os ? ` · OS ${a.os}` : ""}{a.endereco ? ` · ${a.endereco}` : ""}</small>
              </button>
            ))}
            {!pendentes.length && <p className="suave" style={{ margin: 0 }}>Nada em aberto.</p>}
          </div>
          <div className="oc-card">
            <h3>Histórico ({historico.length})</h3>
            {!historico.length && <p className="suave" style={{ margin: 0 }}>Nenhum alerta encerrado ainda.</p>}
            {historico.slice(0, 50).map((a) => (
              <button key={a.id} type="button" className="oc-btn" onClick={() => setEscolhido(a.id)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel?.id === a.id ? "var(--oc-pri)" : undefined }}>
                <b>{a.nome || PAPEL(a.papel)}</b> · {dh(a.em)}<br /><small>{a.os ? `OS ${a.os} · ` : ""}por {a.encerradoPor || "—"}{a.observacao ? `: ${a.observacao.slice(0, 60)}` : ""}</small>
              </button>
            ))}
          </div>
        </div>

        {sel && (
          <div className="oc-card">
            <h3>Alerta de {dh(sel.em)} <Selo tom={SELO[sel.situacao][0]}>{SELO[sel.situacao][1]}</Selo></h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 12 }}>
              <Dado r="Quem pediu ajuda" v={`${sel.nome || "Sem nome"} (${PAPEL(sel.papel).toLowerCase()})`} />
              <Dado r="Telefone" v={sel.telefone ? fone(sel.telefone) : ""} />
              <Dado r="Local" v={sel.endereco || (sel.lat != null ? `${sel.lat.toFixed(5)}, ${sel.lng?.toFixed(5)}` : "")} />
              <Dado r="Motivo" v={sel.motivo} />
              <Dado r="Motoristas avisados por perto" v={String(sel.notificados)} />
              {sel.atendidoPor && <Dado r="Atendido por" v={`${sel.atendidoPor} (${dh(sel.atendidoEm)})`} />}
              {sel.situacao === "encerrado" && <Dado r="Encerrado por" v={`${sel.encerradoPor} (${dh(sel.encerradoEm)})`} />}
              {sel.observacao && <Dado r="Observação" v={sel.observacao} />}
            </div>
            {sel.corrida && (
              <div style={{ marginBottom: 12 }}>
                <p className="suave" style={{ margin: "0 0 6px" }}>Corrida (OS {sel.corrida.os}, {sel.corrida.status.replace("_", " ")}) · <Link to="/historico">Consultar corridas</Link></p>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                  <Dado r="Passageiro" v={`${sel.corrida.passageiro}${sel.corrida.telefonePassageiro ? ` · ${fone(sel.corrida.telefonePassageiro)}` : ""}`} />
                  <Dado r="Motorista" v={`${sel.corrida.motorista}${sel.corrida.telefoneMotorista ? ` · ${fone(sel.corrida.telefoneMotorista)}` : ""}`} />
                  <Dado r="Embarque" v={sel.corrida.embarque} />
                  <Dado r="Destino" v={sel.corrida.destino} />
                </div>
              </div>
            )}
            <MapaDoAlerta a={sel} />
            {sel.lat != null && <p style={{ margin: "6px 0 12px" }}><a href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`} target="_blank" rel="noreferrer"><MapPin size={13} /> Abrir no Google Maps</a></p>}
            {sel.situacao !== "encerrado" && (
              <>
                <div className="oc-fila" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {sel.situacao === "aberto" && <button className="oc-btn" disabled={ocupado} onClick={() => void agir(`/sos/${sel.id}/atender`)}><UserCheck size={16} /> Atender</button>}
                  {sel.telefone && <a className="oc-btn" href={`tel:${sel.telefone.replace(/[^\d+]/g, "")}`}><Phone size={16} /> Ligar</a>}
                  <button className="oc-btn" onClick={() => setFim(!fim)}><CheckCircle2 size={16} /> Encerrar</button>
                </div>
                {fim && (
                  <div>
                    <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={1000} placeholder="Observação: o que aconteceu e o que foi feito" style={{ width: "100%" }} />
                    <button className="oc-btn" style={{ marginTop: 8 }} disabled={ocupado} onClick={() => void agir(`/sos/${sel.id}/encerrar`, { observacao: obs })}>Confirmar encerramento</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
