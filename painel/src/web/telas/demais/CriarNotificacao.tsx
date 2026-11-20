// Comunicação › Notificações app › "Criando Notificação" (formato da Machine): Para agora ou Agendar, conteúdo (título opcional
// de até 40 e mensagem de até 255), destinatário (Clientes App ou Motoristas) e filtros opcionais para segmentar.
// Servidor: POST /api/config/notificacoes (agora) e /api/config/notificacoes/agendar (envio em data e hora marcadas).

import { useEffect, useState } from "react";
import { PlusCircle, X, Clock, CalendarDays } from "lucide-react";
import { Aviso, Cab, Campo, Modal, pedirConfig, useSalvar } from "./comum";
import "./alertas.css";

type Destino = "" | "passageiro" | "motorista";
type FiltroId = "qtd" | "periodo" | "genero" | "categorias" | "status";

const GENEROS: Array<[string, string[]]> = [["Feminino", ["Feminino"]], ["Masculino", ["Masculino"]], ["Outro", ["Outro", "Outros"]], ["Prefiro não dizer", ["Prefiro não dizer", "Prefiro não responder"]]];
const STATUS_MOTORISTA = ["Ativo", "Em análise", "Fila de espera", "Bloqueado", "Rejeitado", "Inativo"];

const agoraLocal = () => { const d = new Date(Date.now() - 3 * 3600_000 + 10 * 60_000); return d.toISOString().slice(0, 16); };

function FiltroLinha({ id, rotulo, ativo, mostra, ligar, desligar, children }: { id: FiltroId; rotulo: string; ativo: FiltroId[]; mostra: (id: FiltroId) => boolean; ligar: (id: FiltroId) => void; desligar: (id: FiltroId) => void; children: React.ReactNode }) {
  if (!mostra(id)) return null;
  return (
    <div className="dm-filtro-sec">
      {ativo.includes(id) ? (
        <>
          <div className="dm-filtro-cab"><strong>{rotulo}</strong><button type="button" className="botao-tema" aria-label={`Remover filtro: ${rotulo}`} onClick={() => desligar(id)}><X size={14} /></button></div>
          <div className="dm-filtro-corpo">{children}</div>
        </>
      ) : (
        <button type="button" className="dm-filtro-add" onClick={() => ligar(id)}><PlusCircle size={18} /> Adicionar filtro por {rotulo}</button>
      )}
    </div>
  );
}

export function CriarNotificacao({ onVoltar, onEnviada }: { onVoltar: () => void; onEnviada?: () => void }) {
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState(agoraLocal);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [destino, setDestino] = useState<Destino>("");
  const [ativos, setAtivos] = useState<FiltroId[]>([]);
  const [corridasMin, setMin] = useState(""), [corridasMax, setMax] = useState("");
  const [cadastroDe, setDe] = useState(""), [cadastroAte, setAte] = useState("");
  const [genero, setGenero] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [todasCategorias, setTodas] = useState<string[]>([]);
  const { msg, salvando, salvar } = useSalvar();
  const [previa, setPrevia] = useState<{ total: number; nomes: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/gestao/cidades", { credentials: "same-origin" }).then((r) => r.json()).then((j) => setTodas(Array.isArray(j?.categorias) ? j.categorias : [])).catch(() => setTodas([]));
  }, []);

  const motorista = destino === "motorista";
  const mostra = (id: FiltroId) => destino !== "" && (id === "categorias" || id === "status" ? motorista : true);
  const alternar = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const ligar = (id: FiltroId) => setAtivos([...ativos, id]);
  const desligar = (id: FiltroId) => {
    setAtivos(ativos.filter((x) => x !== id));
    if (id === "qtd") { setMin(""); setMax(""); } else if (id === "periodo") { setDe(""); setAte(""); } else if (id === "genero") setGenero([]); else if (id === "categorias") setCategorias([]); else setStatus([]);
  };
  const filtros = () => ({
    ...(ativos.includes("qtd") ? { corridasMin, corridasMax } : {}),
    ...(ativos.includes("periodo") ? { cadastroDe, cadastroAte } : {}),
    ...(ativos.includes("genero") && genero.length ? { genero: GENEROS.filter(([n]) => genero.includes(n)).flatMap(([, v]) => v) } : {}),
    ...(motorista && ativos.includes("categorias") && categorias.length ? { categorias } : {}),
    ...(motorista && ativos.includes("status") && status.length ? { status } : {}),
  });
  const pronto = destino !== "" && mensagem.trim().length > 0 && (!agendar || quando.length === 16);

  // Para agora: "Avançar" mostra a confirmação com quem vai receber; só depois envia.
  async function avancar(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto) return;
    if (agendar) return void enviar();
    const r = await salvar(async () => setPrevia(await pedirConfig("/notificacoes/previa", "POST", { papel: destino, segmento: "todos", titulo: titulo.trim(), tituloOpcional: true, mensagem: mensagem.trim(), filtros: filtros() })), "");
    void r;
  }
  async function enviar() {
    if (!pronto) return;
    setPrevia(null);
    const base = { papel: destino, segmento: "todos", titulo: titulo.trim(), tituloOpcional: true, mensagem: mensagem.trim(), filtros: filtros() };
    const r = await salvar(
      () => (agendar ? pedirConfig("/notificacoes/agendar", "POST", { ...base, regra: "unico", data: quando.slice(0, 10), hora: quando.slice(11, 16) }) : pedirConfig("/notificacoes", "POST", base)),
      agendar ? "Notificação agendada." : "Notificação enviada.",
    );
    if (r) { onEnviada?.(); onVoltar(); }
  }

  return (
    <>
      <Cab titulo="Criando Notificação" />
      <form className="dm-form dm-notif-criar" onSubmit={avancar}>
        <div className="dm-cartao">
          <div className="dm-abas" role="group" aria-label="Quando enviar">
            <button type="button" className={!agendar ? "ativa" : ""} aria-pressed={!agendar} onClick={() => setAgendar(false)}><Clock size={15} /> Para agora</button>
            <button type="button" className={agendar ? "ativa" : ""} aria-pressed={agendar} onClick={() => setAgendar(true)}><CalendarDays size={15} /> Agendar</button>
          </div>
          {agendar && (
            <div style={{ marginTop: 12 }}>
              <p className="sub">Por ser uma notificação agendada, a quantidade de usuários selecionados é processada apenas no momento do envio.</p>
              <Campo rotulo="Data e hora de envio *" dica="O envio ocorre no fuso horário da central selecionada."><input type="datetime-local" value={quando} min={agoraLocal().slice(0, 11) + "00:00"} onChange={(e) => setQuando(e.target.value)} required /></Campo>
            </div>
          )}
        </div>

        <h3>Conteúdo da notificação</h3>
        <p className="sub">Campos com * são obrigatórios.</p>
        <div className="dm-cartao">
          <Campo rotulo="Título (Opcional)"><input value={titulo} maxLength={40} onChange={(e) => setTitulo(e.target.value)} /></Campo>
          <small className="sub">{titulo.length} / 40</small>
          <p className="sub">O título da notificação pode substituir o nome do aplicativo em alguns aparelhos. Disponível a partir das versões 24.11 (Passageiro) e 23.7 (Motorista).</p>
        </div>
        <div className="dm-cartao">
          <Campo rotulo="Mensagem *"><textarea rows={3} maxLength={255} value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></Campo>
          <small className="sub">{mensagem.length} / 255</small>
        </div>

        <h3>Destino da notificação</h3>
        <div className="dm-cartao">
          <Campo rotulo="Destinatário *"><select value={destino} onChange={(e) => { setDestino(e.target.value as Destino); setAtivos([]); setGenero([]); setCategorias([]); setStatus([]); }}><option value="">Selecione</option><option value="passageiro">Clientes App</option><option value="motorista">Motoristas</option></select></Campo>
          <div className="dm-filtros-box">
            <h3>Filtros</h3>
            <p className="sub">Use filtros para segmentar a notificação ou envie para todos os destinatários.</p>
            <FiltroLinha ativo={ativos} mostra={mostra} ligar={ligar} desligar={desligar} id="qtd" rotulo="quantidade de corridas finalizadas">
              <div className="dm-duplo"><Campo rotulo="De (corridas)"><input type="number" min={0} value={corridasMin} onChange={(e) => setMin(e.target.value)} /></Campo><Campo rotulo="Até (corridas)"><input type="number" min={0} value={corridasMax} onChange={(e) => setMax(e.target.value)} /></Campo></div>
            </FiltroLinha>
            <FiltroLinha ativo={ativos} mostra={mostra} ligar={ligar} desligar={desligar} id="periodo" rotulo="período de cadastro">
              <div className="dm-duplo"><Campo rotulo="De"><input type="date" value={cadastroDe} onChange={(e) => setDe(e.target.value)} /></Campo><Campo rotulo="Até"><input type="date" value={cadastroAte} onChange={(e) => setAte(e.target.value)} /></Campo></div>
            </FiltroLinha>
            <FiltroLinha ativo={ativos} mostra={mostra} ligar={ligar} desligar={desligar} id="genero" rotulo="gênero">
              <fieldset className="dm-marcas">{GENEROS.map(([n]) => <label key={n} className="dm-check"><input type="checkbox" checked={genero.includes(n)} onChange={() => setGenero(alternar(genero, n))} /> {n}</label>)}</fieldset>
            </FiltroLinha>
            <FiltroLinha ativo={ativos} mostra={mostra} ligar={ligar} desligar={desligar} id="categorias" rotulo="categorias">
              <fieldset className="dm-marcas">{todasCategorias.length ? todasCategorias.map((n) => <label key={n} className="dm-check"><input type="checkbox" checked={categorias.includes(n)} onChange={() => setCategorias(alternar(categorias, n))} /> {n}</label>) : <span className="sub">Nenhuma categoria cadastrada.</span>}</fieldset>
            </FiltroLinha>
            <FiltroLinha ativo={ativos} mostra={mostra} ligar={ligar} desligar={desligar} id="status" rotulo="status">
              <fieldset className="dm-marcas">{STATUS_MOTORISTA.map((n) => <label key={n} className="dm-check"><input type="checkbox" checked={status.includes(n)} onChange={() => setStatus(alternar(status, n))} /> {n}</label>)}</fieldset>
            </FiltroLinha>
            {destino === "" && <p className="sub">Escolha o destinatário para ver os filtros.</p>}
          </div>
        </div>

        <Aviso erro={msg?.erro} ok={msg?.ok} />
        <div className="dm-rodape-modal">
          <button type="button" className="botao" onClick={onVoltar}>Voltar</button>
          <button className="botao primario" disabled={!pronto || salvando}>{agendar ? "Agendar notificação" : "Avançar"}</button>
        </div>
      </form>
      <Modal aberto={!!previa} onFechar={() => setPrevia(null)} titulo="Confirmar envio" sub={previa ? `${previa.total} ${previa.total === 1 ? "destinatário" : "destinatários"}` : ""}>
        {previa && <>
          <p><strong>{titulo.trim() || "Aviso da central"}</strong></p>
          <p style={{ whiteSpace: "pre-wrap" }}>{mensagem}</p>
          {previa.total === 0 ? <p className="sub">Nenhum destinatário neste filtro.</p> : <ul className="dm-transacoes" style={{ maxHeight: 220, overflow: "auto" }}>{previa.nomes.map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}{previa.total > previa.nomes.length && <li className="sub">e mais {previa.total - previa.nomes.length}…</li>}</ul>}
          <div className="dm-rodape-modal"><button type="button" className="botao" onClick={() => setPrevia(null)}>Voltar</button><button type="button" className="botao primario" disabled={salvando || previa.total === 0} onClick={() => void enviar()}>Enviar notificação</button></div>
        </>}
      </Modal>
    </>
  );
}
