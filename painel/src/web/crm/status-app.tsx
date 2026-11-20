// Situação de cada mensagem do canal "Push do app" no CRM: enviada, entregue no app, lida ou falha, e o push do sistema.
import type { EnvioLog } from "../../crm/registro.ts";

export const ROTULO_APP: Record<string, string> = { enviada: "Enviada", entregue: "Entregue no app", lida: "Lida", falha: "Falha" };
export const classeApp = (e: string) => (e === "lida" || e === "entregue" ? "ok" : e === "falha" ? "ruim" : "alerta");
const ROTULO_PUSH: Record<string, string> = {
  enviado: "Push do sistema enviado ao celular",
  sem_chave: "Push do sistema pendente de chave (a mensagem está na caixa do app)",
  sem_aparelho: "Sem aparelho registrado para o push do sistema (a mensagem está na caixa do app)",
  falha: "Push do sistema falhou (a mensagem está na caixa do app)",
};
const quando = (ms: number | null) => (ms ? new Date(ms).toLocaleString("pt-BR") : "-");

export function StatusApp({ app }: { app?: EnvioLog["app"] }) {
  if (!app) return <p><small className="sub">No app:</small> sem aviso ligado a este envio.</p>;
  return (
    <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 4 }}>
      <p><small className="sub">No app:</small> <span className={`selo ${classeApp(app.estado)}`}>{ROTULO_APP[app.estado] ?? app.estado}</span></p>
      <p><small className="sub">Entregue em:</small> {quando(app.entregueEm)}</p>
      <p><small className="sub">Lida em:</small> {quando(app.lidaEm)}</p>
      <p><small className="sub">Push do sistema:</small> {ROTULO_PUSH[app.push] ?? app.push}{app.erro ? ` (${app.erro})` : ""}</p>
    </div>
  );
}
