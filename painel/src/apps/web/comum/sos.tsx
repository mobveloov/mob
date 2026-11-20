// SOS nos apps (passageiro e motorista). Contrato do servidor em docs/SOS.md.
//  - enviarSos(): grava o alerta na central (POST /sos, ou /corridas/:id/sos dentro da corrida);
//  - <CartaoMeuSos />: "Alerta enviado" e depois "Atendido" / "Encerrado", pela consulta GET /sos/meu e pelo evento sos_estado;
//  - <EmergenciaPerto />: só no motorista; mostra na tela cheia o alerta de alguém por perto (evento sos, consulta GET /sos/proximos).
import { useEffect, useState } from "react";
import { api, tocarAlerta, vibrar } from "./api";

export interface MeuSos { id: string; situacao: "aberto" | "atendido" | "encerrado"; em: string; atendidoPor: string; observacao: string; avisouMotoristas?: number }
export interface SosPerto { id: string; nome: string; lat: number | null; lng: number | null; endereco: string; em: string; distanciaKm: number | null; texto: string }

// ------------------------------------------------------------------ o meu alerta

let meu: MeuSos[] = [];
const dispensados = new Set<string>();
const ouvintes = new Set<() => void>();
const avisar = () => { for (const f of ouvintes) f(); };

export async function atualizarMeuSos() {
  try { meu = (await api<{ alertas: MeuSos[] }>("/sos/meu")).alertas; avisar(); } catch { /* sem rede: tenta no próximo ciclo */ }
}

/** Abre o alerta na central. Dentro da corrida, passe o id dela. Lança erro com a mensagem do servidor. */
export async function enviarSos(corridaId: string | null, posicao: { lat: number; lng: number } | null | undefined) {
  const corpo = { ...(posicao ? { lat: posicao.lat, lng: posicao.lng } : {}) };
  const r = await api<{ alerta: MeuSos }>(corridaId ? `/corridas/${corridaId}/sos` : "/sos", { corpo });
  dispensados.delete(r.alerta.id);
  meu = [r.alerta, ...meu.filter((x) => x.id !== r.alerta.id)];
  avisar();
  return r.alerta;
}

/** Chamar quando chegar o evento sos_estado do tempo real. */
export const aoMudarSos = () => void atualizarMeuSos();

export function CartaoMeuSos() {
  const [, forca] = useState(0);
  useEffect(() => { const f = () => forca((n) => n + 1); ouvintes.add(f); void atualizarMeuSos(); return () => { ouvintes.delete(f); }; }, []);
  const a = meu.find((x) => !dispensados.has(x.id) && (x.situacao !== "encerrado" || Date.now() - 3 * 3_600_000 - Date.parse(x.em) < 6 * 3_600_000 /* a hora do servidor é a de Brasília gravada como UTC */));
  const ativo = !!a && a.situacao !== "encerrado";
  // Enquanto o alerta está de pé, pergunta à central a cada 6 s (o evento em tempo real costuma chegar antes).
  useEffect(() => { if (!ativo) return; const t = setInterval(() => void atualizarMeuSos(), 6000); return () => clearInterval(t); }, [ativo]);
  if (!a) return null;
  const titulo = a.situacao === "aberto" ? "Alerta enviado" : a.situacao === "atendido" ? "A central está cuidando de você" : "Alerta encerrado";
  const texto = a.situacao === "aberto" ? "A central recebeu o seu pedido de ajuda e já foi avisada. Se for grave, ligue 190."
    : a.situacao === "atendido" ? `${a.atendidoPor ? `${a.atendidoPor} assumiu` : "Alguém assumiu"} o seu alerta. Mantenha o telefone por perto. Se for grave, ligue 190.`
      : `A central encerrou o alerta${a.observacao ? `: ${a.observacao}` : "."}`;
  const cor = a.situacao === "encerrado" ? "#16a34a" : a.situacao === "atendido" ? "#d97706" : "#dc2626";
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 9000, background: "#fff", color: "#1f2937", border: `2px solid ${cor}`, borderRadius: 16, padding: "12px 14px", boxShadow: "0 8px 30px #0006", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: cor, marginTop: 5, flex: "none" }} />
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        <b style={{ fontSize: 15 }}>{titulo}</b>
        <div>{texto}</div>
        {a.situacao === "aberto" && !!a.avisouMotoristas && <div style={{ color: "#6b7280" }}>{a.avisouMotoristas === 1 ? "1 motorista por perto também foi avisado." : `${a.avisouMotoristas} motoristas por perto também foram avisados.`}</div>}
        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>Situação: {a.situacao === "aberto" ? "recebido pela central" : a.situacao === "atendido" ? "atendido" : "encerrado"}</div>
      </div>
      <button type="button" onClick={() => { dispensados.add(a.id); avisar(); }} aria-label="Fechar aviso" style={{ border: 0, background: "transparent", fontSize: 22, lineHeight: 1, color: "#6b7280", cursor: "pointer" }}>×</button>
    </div>
  );
}

// ------------------------------------------------------------------ emergência perto (motorista)

let perto: SosPerto[] = [];
const vistos = new Set<string>();
const ouvintesPerto = new Set<() => void>();
const avisarPerto = () => { for (const f of ouvintesPerto) f(); };
function mudouPerto(lista: SosPerto[]) {
  const novos = lista.filter((x) => !vistos.has(x.id));
  for (const n of novos) vistos.add(n.id);
  perto = lista;
  if (novos.length) { try { tocarAlerta(4); vibrar([500, 200, 500, 200, 500]); } catch { /* sem som */ } }
  avisarPerto();
}

/** Evento "sos" do tempo real: alguém perto pediu ajuda. */
export function aoChegarSos(d: SosPerto) { mudouPerto([d, ...perto.filter((x) => x.id !== d.id)]); }
/** Evento "sos_fim": a central encerrou. */
export function aoFimDoSos(d: { id: string }) { mudouPerto(perto.filter((x) => x.id !== d.id)); }

export function EmergenciaPerto({ ativo }: { ativo: boolean }) {
  const [, forca] = useState(0);
  const [fechados, setFechados] = useState<string[]>([]);
  useEffect(() => { const f = () => forca((n) => n + 1); ouvintesPerto.add(f); return () => { ouvintesPerto.delete(f); }; }, []);
  // Consulta de reserva (push e tempo real podem falhar): a cada 20 s enquanto o motorista está online.
  useEffect(() => {
    if (!ativo) return;
    const ler = () => void api<{ alertas: SosPerto[] }>("/sos/proximos").then((r) => mudouPerto(r.alertas)).catch(() => undefined);
    ler(); const t = setInterval(ler, 20_000);
    return () => clearInterval(t);
  }, [ativo]);
  const a = perto.find((x) => !fechados.includes(x.id));
  if (!a) return null;
  return (
    <div role="alertdialog" aria-label="Emergência perto de você" style={{ position: "fixed", inset: 0, zIndex: 9500, background: "#b91c1c", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "24px 20px", gap: 14 }}>
      <div style={{ fontSize: 52, lineHeight: 1 }}>🆘</div>
      <h2 style={{ margin: 0, fontSize: 26 }}>Emergência perto de você</h2>
      <p style={{ margin: 0, fontSize: 18, lineHeight: 1.4, maxWidth: 420 }}>{a.texto}</p>
      {a.lat != null && a.lng != null && <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>Posição: {a.lat.toFixed(5)}, {a.lng.toFixed(5)}</p>}
      <p style={{ margin: 0, opacity: 0.9, fontSize: 14, maxWidth: 420 }}>Se puder ajudar com segurança, vá até lá. Em risco, chame a polícia: 190.</p>
      {a.lat != null && a.lng != null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" style={{ background: "#fff", color: "#b91c1c", fontWeight: 800, padding: "14px 22px", borderRadius: 14, textDecoration: "none", minWidth: 220 }}>Ver no mapa</a>}
      <a href="tel:190" style={{ color: "#fff", fontWeight: 800, textDecoration: "underline" }}>Ligar 190</a>
      <button type="button" onClick={() => setFechados((f) => [...f, a.id])} style={{ background: "transparent", color: "#fff", border: "2px solid #fff", borderRadius: 14, padding: "12px 22px", fontWeight: 800, fontSize: 16, cursor: "pointer", minWidth: 220 }}>Entendi</button>
    </div>
  );
}
