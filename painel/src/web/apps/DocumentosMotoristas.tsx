// Painel: "Documentos dos motoristas". Fotos e PDFs enviados pelo app do motorista (CNH, documento do veículo, foto do
// rosto, comprovante de residência). A central abre, aprova ou recusa com motivo (o motorista vê o motivo no app).
// Servidor: /api/apps-central/documentos (src/apps/extras.ts).

import { useState } from "react";
import { dataHora } from "../api";
import { Avisos, Cartao, Titulo, useCarregar } from "../componentes/ui";

interface Doc { situacao: "Enviado" | "Aprovado" | "Recusado"; motivo: string; em: string; mime: string }
interface Linha { motoristaId: string; nome: string; telefone: string; documentos: Record<string, Doc> }

async function pedir<T>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: corpo === undefined ? "GET" : "POST", headers: corpo === undefined ? undefined : { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro ?? `Erro ${r.status}`);
  return j as T;
}
const SELO: Record<string, string> = { Enviado: "alerta", Aprovado: "ok", Recusado: "ruim" };

export default function DocumentosMotoristas() {
  const d = useCarregar(() => pedir<{ tipos: Record<string, string>; motoristas: Linha[] }>("/api/apps-central/documentos"), [], 30_000);
  const [so, setSo] = useState<"todos" | "esperando">("esperando");
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const avaliar = async (m: Linha, tipo: string, aprovado: boolean) => {
    const motivo = aprovado ? "" : prompt("Motivo da recusa (o motorista vê no app):") ?? "";
    if (!aprovado && !motivo.trim()) return;
    setMsg(null);
    try { await pedir(`/api/apps-central/documentos/${m.motoristaId}/${tipo}`, { aprovado, motivo }); setMsg({ texto: aprovado ? "Documento aprovado." : "Documento recusado." }); d.recarregar(); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const tipos = d.dados?.tipos ?? {};
  const lista = (d.dados?.motoristas ?? []).filter((m) => so === "todos" || Object.values(m.documentos).some((x) => x.situacao === "Enviado"));

  return (
    <>
      <Titulo titulo="Documentos dos motoristas" sub="Fotos e PDFs enviados pelo app do motorista. Abra, confira e aprove ou recuse com o motivo." />
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <Avisos lista={[d.erro]} />
      <Cartao>
        <div className="linha-filtro">
          <select value={so} onChange={(e) => setSo(e.target.value as "todos" | "esperando")} aria-label="Mostrar">
            <option value="esperando">Esperando conferência</option><option value="todos">Todos</option>
          </select>
          <span className="sub">{lista.length} motorista(s)</span>
        </div>
      </Cartao>
      {!lista.length ? <Cartao><p className="vazio">{so === "esperando" ? "Nenhum documento esperando conferência." : "Nenhum motorista enviou documentos ainda."}</p></Cartao> : lista.map((m) => (
        <Cartao key={m.motoristaId} titulo={`${m.nome || "Motorista"}${m.telefone ? ` · ${m.telefone}` : ""}`}>
          <ul className="lista">{Object.entries(tipos).map(([tipo, rotulo]) => {
            const doc = m.documentos[tipo];
            return (
              <li key={tipo}>
                <strong>{rotulo}</strong> {doc ? <span className={`selo ${SELO[doc.situacao]}`}>{doc.situacao}</span> : <span className="selo info">Não enviado</span>}
                {doc && <><br /><small>Enviado em {dataHora(doc.em)}{doc.motivo ? ` · Motivo: ${doc.motivo}` : ""}</small>
                  <div className="linha-acao">
                    <a className="botao" href={`/api/apps-central/documentos/${m.motoristaId}/${tipo}`} target="_blank" rel="noopener noreferrer">Abrir</a>
                    {doc.situacao !== "Aprovado" && <button className="botao primario" onClick={() => void avaliar(m, tipo, true)}>Aprovar</button>}
                    {doc.situacao !== "Recusado" && <button className="botao" onClick={() => void avaliar(m, tipo, false)}>Recusar</button>}
                  </div></>}
              </li>
            );
          })}</ul>
        </Cartao>
      ))}
    </>
  );
}
