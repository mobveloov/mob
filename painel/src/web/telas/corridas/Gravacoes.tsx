// Corridas › Gravações: o que os motoristas gravaram durante as corridas (áudio, ou vídeo se a empresa liberar).
// Só o administrador vê. Cada vez que alguém abre uma gravação, o servidor registra quem foi (aparece no fim do cartão).
// Servidor: /api/apps-central/gravacoes (lista), /gravacoes/:corrida/completa (toca ou baixa), /gravacoes/:corrida/guardar.
import { useState } from "react";
import { Download, Pin, PinOff } from "lucide-react";
import { Aviso, Janela, Selo, Vazio, dhAno, msgErro, useDados } from "./comum";
import { useAdmin } from "./pagamentos-comum";
import "./corridas.css";

const BASE = "/api/apps-central/gravacoes";
interface Gravacao {
  corridaId: string; os: string; motoristaId: string; motorista: string; passageiro: string; embarque: string; solicitadaEm: string;
  guardar: boolean; segundos: number; bytes: number; partes: Array<{ n: number; tipo: string; em: string }>; consentimento: { em: string; video: boolean };
  acessos: Array<{ em: string; por: string }>;
}
interface Resposta { gravacoes: Gravacao[]; config: { ativa: boolean; obrigatoria: boolean; video: boolean; dias: number } }

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(caminho, { method: corpo === undefined ? "GET" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro || `Erro ${r.status}`);
  return j as T;
}
const duracao = (s: number) => `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`;
const tamanho = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const idDaCorrida = (id: string) => id.replace(/^propria:/, "");

/** Player + baixar + guardar de UMA gravação. */
export function CartaoGravacao({ g, onMudou }: { g: Gravacao; onMudou: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false); // só pede o arquivo (e registra o acesso) quando a pessoa aperta Ouvir
  const url = `${BASE}/${encodeURIComponent(g.corridaId)}/completa`;
  const video = g.consentimento.video || g.partes[0]?.tipo.startsWith("video");
  const guardar = async () => { setErro(null); try { await pedir(`${BASE}/${encodeURIComponent(g.corridaId)}/guardar`, { guardar: !g.guardar }); onMudou(); } catch (e) { setErro(msgErro(e)); } };
  return (
    <div className="oc-card" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <strong>OS {g.os}</strong>
        <span className="suave">{dhAno(g.solicitadaEm || g.consentimento.em)}</span>
        <span>Motorista: <b>{g.motorista || "—"}</b></span>
        <span>Passageiro: <b>{g.passageiro || "—"}</b></span>
        <span>{duracao(g.segundos)} · {tamanho(g.bytes)}</span>
        {video && <Selo tom="info">Vídeo</Selo>}
        {g.guardar && <Selo tom="ok">Guardada</Selo>}
      </div>
      {aberto
        ? (video ? <video controls autoPlay src={url} style={{ maxWidth: "100%", maxHeight: 320 }} /> : <audio controls autoPlay src={url} style={{ width: "100%" }} />)
        : <div><button className="oc-btn ok" onClick={() => setAberto(true)}>Ouvir gravação</button></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="oc-btn" href={`${url}?baixar=1`} download><Download size={14} /> Baixar</a>
        <button className="oc-btn" onClick={() => void guardar()}>{g.guardar ? <><PinOff size={14} /> Soltar (apagar no prazo)</> : <><Pin size={14} /> Guardar sem prazo</>}</button>
      </div>
      <Aviso texto={erro} erro />
      {g.acessos.length > 0 && <small className="suave">Aberta {g.acessos.length}x. Última: {dhAno(g.acessos.at(-1)!.em)} por {g.acessos.at(-1)!.por}</small>}
    </div>
  );
}

/** Tela do menu: Corridas › Gravações. */
export default function Gravacoes() {
  const admin = useAdmin();
  const [busca, setBusca] = useState("");
  const { dados, erro, carregando, recarregar } = useDados<Resposta>(() => pedir<Resposta>(BASE), []);
  if (!admin) return <div className="oc"><p className="oc-vazio">Só o administrador pode ver as gravações.</p></div>;
  const b = busca.trim().toLowerCase();
  const lista = (dados?.gravacoes ?? []).filter((g) => !b || `${g.os} ${g.motorista} ${g.passageiro}`.toLowerCase().includes(b));
  return (
    <div className="oc">
      <div className="oc-topo"><div><h1>Gravações das corridas</h1><p className="suave" style={{ margin: "2px 0 0" }}>Áudio gravado pelo app do motorista durante a corrida. Cada abertura fica registrada.</p></div></div>
      <Aviso texto={erro} erro />
      {dados && !dados.config.ativa && <Aviso texto="A gravação está desligada em Configurações › Gerais › Regras do motorista." erro />}
      {dados?.config.ativa && <p className="suave">Guardadas por {dados.config.dias} dias; as marcadas com “Guardar” e as de corrida com SOS não são apagadas. Gravação {dados.config.obrigatoria ? "obrigatória" : "opcional para o motorista"}.</p>}
      <div className="oc-card oc-fila"><input style={{ maxWidth: 320 }} placeholder="Buscar por OS, motorista ou passageiro" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar gravação" /></div>
      {carregando && !dados && <p className="oc-vazio">Carregando...</p>}
      {dados && !lista.length && <Vazio>Nenhuma gravação ainda. Elas aparecem aqui quando o motorista grava uma corrida.</Vazio>}
      <div style={{ display: "grid", gap: 10 }}>{lista.map((g) => <CartaoGravacao key={g.corridaId} g={g} onMudou={recarregar} />)}</div>
    </div>
  );
}

/** Janela aberta de dentro do detalhe da corrida. */
export function JanelaGravacoes({ corridaId, os, onFechar }: { corridaId: string; os: string; onFechar: () => void }) {
  const { dados, erro, carregando, recarregar } = useDados<Resposta>(() => pedir<Resposta>(`${BASE}?corrida=${encodeURIComponent(idDaCorrida(corridaId))}`), [corridaId]);
  return (
    <Janela onFechar={onFechar} titulo={`Gravação da OS ${os}`} tamanho="larga" nivel="alto">
      <Aviso texto={erro} erro />
      {carregando && !dados && <p className="oc-vazio">Carregando...</p>}
      {dados && !dados.gravacoes.length && <p className="oc-vazio">Esta corrida não tem gravação. O motorista pode ter gravação desligada, ou a corrida ainda não começou a gravar.</p>}
      {dados?.gravacoes.map((g) => <CartaoGravacao key={g.corridaId} g={g} onMudou={recarregar} />)}
    </Janela>
  );
}
