import { podeCargo } from "../../comum/cargos.ts";
import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, Plus, RefreshCw, Save, Trash2, Unplug, Wifi, WifiOff } from "lucide-react";
import { useSessao } from "../App";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { apiBot, NOME_PROVEDOR, type Conexao, type ConexaoVista, type DadosConexao, type TipoProvedor } from "./api";

const SITUACAO: Record<Conexao["situacao"], { texto: string; tom: string }> = {
  conectado: { texto: "ONLINE", tom: "ok" }, aguardando_qr: { texto: "AGUARDANDO QR", tom: "alerta" },
  desconectado: { texto: "OFFLINE", tom: "ruim" }, nao_configurado: { texto: "NÃO CONFIGURADO", tom: "" }, erro: { texto: "ERRO", tom: "ruim" },
};

const PROVEDORES: Array<{ valor: TipoProvedor; nome: string }> = [
  { valor: "evolution", nome: "Evolution API (QR Code)" }, { valor: "zapi", nome: "Z-API" }, { valor: "zpro", nome: "Z-Pro" },
  { valor: "meta", nome: "Meta Cloud API" }, { valor: "simulado", nome: "Simulado (teste, nada sai de verdade)" },
];

interface Form { nome: string; provedor: TipoProvedor; instancia: string; proprio: boolean; urlApi: string; token: string; clientToken: string; phoneId: string; wabaId: string; appSecret: string }

const formDe = (c?: ConexaoVista): Form => ({
  nome: c?.nome ?? "", provedor: c?.provedor ?? "evolution", instancia: c?.instancia ?? "",
  proprio: c ? !c.servidor.daPlataforma || c.provedor !== "evolution" : false, urlApi: c?.servidor.urlApi ?? "", token: "", clientToken: "",
  phoneId: c?.servidor.phoneId ?? "", wabaId: c?.servidor.wabaId ?? "", appSecret: "",
});

/** Só o que a pessoa preencheu: segredo vazio mantém o que já está salvo. */
function dadosDe(f: Form, principal: boolean): DadosConexao {
  const d: DadosConexao = { provedor: f.provedor };
  if (!principal) d.nome = f.nome;
  if (f.provedor === "evolution") {
    d.urlApi = f.proprio ? f.urlApi : "";
    if (f.proprio) { d.instancia = f.instancia; if (f.token) d.token = f.token; }
  } else if (f.provedor === "zapi" || f.provedor === "zpro") {
    d.urlApi = f.urlApi; if (f.token) d.token = f.token; if (f.clientToken) d.clientToken = f.clientToken;
  } else if (f.provedor === "meta") {
    d.phoneId = f.phoneId; d.wabaId = f.wabaId; if (f.token) d.token = f.token; if (f.appSecret) d.appSecret = f.appSecret;
  }
  return d;
}

function Campos({ f, set, c, admin, principal }: { f: Form; set: (f: Form) => void; c?: ConexaoVista; admin: boolean; principal: boolean }) {
  const s = c?.servidor;
  return (
    <>
      {!principal && <label>Nome da conexão<input value={f.nome} disabled={!admin} placeholder="Ex.: Atendimento centro" onChange={(e) => set({ ...f, nome: e.target.value })} /></label>}
      <label>Provedor
        <select value={f.provedor} disabled={!admin} onChange={(e) => set({ ...f, provedor: e.target.value as TipoProvedor })}>
          {PROVEDORES.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
        </select>
      </label>
      {f.provedor === "evolution" && (
        <>
          <label className="bot-check"><input type="checkbox" checked={f.proprio} disabled={!admin} onChange={(e) => set({ ...f, proprio: e.target.checked })} /> Usar um servidor de WhatsApp próprio da empresa</label>
          {!f.proprio && (
            <p className="sub">
              {s?.plataformaPronta === false ? "O servidor de WhatsApp da plataforma ainda não foi configurado. Fale com o suporte da plataforma ou use um servidor próprio."
                : `Servidor da plataforma, com a instância só desta empresa${c ? ` (${c.instancia})` : ""}. Basta conectar e ler o QR.`}
            </p>
          )}
          {f.proprio && (
            <>
              <label>Endereço do servidor<input value={f.urlApi} disabled={!admin} placeholder="https://whatsapp.suaempresa.com.br" onChange={(e) => set({ ...f, urlApi: e.target.value })} /></label>
              <label>Token do servidor{s?.tokenSalvo && <small> (já salvo; deixe vazio para manter)</small>}
                <input type="password" autoComplete="off" value={f.token} disabled={!admin} onChange={(e) => set({ ...f, token: e.target.value })} />
              </label>
              <label>Nome da instância<input value={f.instancia} disabled={!admin} placeholder="B-empresa-bot" onChange={(e) => set({ ...f, instancia: e.target.value })} /></label>
            </>
          )}
        </>
      )}
      {(f.provedor === "zapi" || f.provedor === "zpro") && (
        <>
          <label>URL da API<input value={f.urlApi} disabled={!admin} placeholder="https://api.z-api.io/instances/SUA_INSTANCIA" onChange={(e) => set({ ...f, urlApi: e.target.value })} /></label>
          <label>Token / Chave de API{s?.tokenSalvo && <small> (já salvo; deixe vazio para manter)</small>}
            <input type="password" autoComplete="off" value={f.token} disabled={!admin} placeholder="Token de acesso" onChange={(e) => set({ ...f, token: e.target.value })} />
          </label>
          <label>Token de segurança da conta (opcional){s?.clientTokenSalvo && <small> (já salvo; deixe vazio para manter)</small>}
            <input type="password" autoComplete="off" value={f.clientToken} disabled={!admin} onChange={(e) => set({ ...f, clientToken: e.target.value })} />
          </label>
        </>
      )}
      {f.provedor === "meta" && (
        <>
          <label>Phone Number ID<input value={f.phoneId} disabled={!admin} placeholder="123456789012" onChange={(e) => set({ ...f, phoneId: e.target.value })} /></label>
          <label>WhatsApp Business Account ID<input value={f.wabaId} disabled={!admin} placeholder="987654321098" onChange={(e) => set({ ...f, wabaId: e.target.value })} /></label>
          <label>Token / Chave de API{s?.tokenSalvo && <small> (já salvo; deixe vazio para manter)</small>}
            <input type="password" autoComplete="off" value={f.token} disabled={!admin} placeholder="Token de acesso permanente" onChange={(e) => set({ ...f, token: e.target.value })} />
          </label>
          <label>App Secret (chave secreta do app) {s?.appSecretSalvo ? <small>(salvo)</small> : <small>(falta: sem ele as mensagens da Meta são recusadas)</small>}
            <input type="password" autoComplete="off" value={f.appSecret} disabled={!admin} placeholder="Configurações do app › Básico" onChange={(e) => set({ ...f, appSecret: e.target.value })} />
          </label>
        </>
      )}
      {f.provedor === "simulado" && <p className="sub">Nada sai pelo WhatsApp. Use a aba Testar conversa para conversar como passageiro.</p>}
    </>
  );
}

function CartaoConexao({ c, admin, aberto, onAbrir, onMudou, onMsg }: {
  c: ConexaoVista; admin: boolean; aberto: boolean; onAbrir: () => void; onMudou: () => void; onMsg: (m: { texto: string; erro?: boolean }) => void;
}) {
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [f, setF] = useState<Form>(() => formDe(c));
  const [ocupado, setOcupado] = useState(false);
  const situacao = useCarregar(() => apiBot.situacaoDe(c.id), [c.id, c.provedor], conexao?.situacao === "aguardando_qr" ? 4000 : 30000);
  const atual = conexao?.situacao === "aguardando_qr" && situacao.dados?.situacao !== "conectado" ? conexao : situacao.dados;
  const s = atual ? SITUACAO[atual.situacao] : null;
  const online = atual?.situacao === "conectado";

  const tentar = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try { await fn(); if (ok) onMsg({ texto: ok }); } catch (e) { onMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setOcupado(false); }
  };
  const salvar = () => tentar(async () => { await apiBot.salvarConexao(c.id, dadosDe(f, c.principal)); setConexao(null); onMudou(); situacao.recarregar(); }, "Conexão salva.");
  const copiar = (t: string) => { try { void navigator.clipboard.writeText(t); onMsg({ texto: "Copiado." }); } catch { /* navegador sem permissão */ } };

  return (
    <div className="bot-conexao">
      <div className="bot-linha bot-conexao-topo">
        <button className="icone" onClick={onAbrir} aria-label={aberto ? "Recolher" : "Abrir"}>{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        {online ? <Wifi size={20} /> : <WifiOff size={20} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{c.nome}</strong>{" "}
          <span className="selo">{NOME_PROVEDOR[c.provedor]}</span>{" "}
          {s && <span className={`selo ${s.tom}`}>{s.texto}</span>}{" "}
          {!c.ativa && <span className="selo">DESLIGADA</span>}
          {atual?.detalhe && <small className="sub" style={{ display: "block" }}>{atual.detalhe}</small>}
        </div>
        {admin && (
          <div className="bot-linha">
            {c.provedor !== "simulado" && (
              <button className="botao" disabled={ocupado} title="Conectar e configurar o webhook" onClick={() => tentar(async () => { setConexao(await apiBot.conectarDe(c.id)); situacao.recarregar(); })}>
                <RefreshCw size={14} /> {online ? "Reaplicar webhook" : c.provedor === "meta" ? "Conferir" : "Conectar e mostrar QR"}
              </button>
            )}
            {online && c.provedor !== "simulado" && c.provedor !== "meta" && (
              <button className="botao" disabled={ocupado} onClick={() => confirm("Desconectar este número do bot?") && tentar(async () => { await apiBot.desconectarDe(c.id); setConexao(null); situacao.recarregar(); }, "Número desconectado.")}><Unplug size={14} /> Desconectar</button>
            )}
            {!c.principal && (
              <button className="botao" disabled={ocupado} title="Remover conexão" aria-label="Remover conexão"
                onClick={() => confirm(`Remover a conexão "${c.nome}"? As conversas ficam, mas as respostas passam a sair pelo número principal.`) && tentar(async () => { await apiBot.removerConexao(c.id); onMudou(); }, "Conexão removida.")}><Trash2 size={14} /></button>
            )}
          </div>
        )}
      </div>
      {atual?.qr && !online && (
        <div className="bot-qr">
          <img src={atual.qr} alt="QR Code para conectar o WhatsApp" />
          <small>No celular da empresa: WhatsApp › Aparelhos conectados › Conectar aparelho.</small>
          {atual.codigo && <div className="bot-codigo">Código: {atual.codigo}</div>}
        </div>
      )}
      {aberto && (
        <div className="bot-conexao-corpo">
          <form className="form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <Campos f={f} set={setF} c={c} admin={admin} principal={c.principal} />
            {!c.principal && admin && (
              <label className="bot-check"><input type="checkbox" checked={c.ativa} onChange={(e) => tentar(async () => { await apiBot.salvarConexao(c.id, { ativa: e.target.checked }); onMudou(); })} /> Conexão ligada (responde os passageiros)</label>
            )}
            {admin ? <button className="botao primario" disabled={ocupado}><Save size={14} /> Salvar</button> : <p className="sub">Só o administrador muda a conexão.</p>}
          </form>
          {c.webhook && c.provedor !== "simulado" && (
            <>
              <p className="sub" style={{ marginTop: 12 }}><Link2 size={13} /> {c.provedor === "meta" ? "URL de retorno (callback) do webhook" : "Endereço de entrada (webhook) desta conexão. Ao conectar, o painel já configura no provedor."}</p>
              <div className="bot-linha"><div className="bot-codigo" style={{ flex: 1 }}>{c.webhook}</div><button className="botao" type="button" onClick={() => copiar(c.webhook!)}>Copiar</button></div>
            </>
          )}
          {c.provedor === "meta" && c.senhaVerificacao && (
            <>
              <p className="sub" style={{ marginTop: 8 }}>No app da Meta: WhatsApp › Configuração › Webhook › Editar. Cole o endereço e o token de verificação, clique em “Verificar e salvar” e assine o campo <strong>messages</strong>.</p>
              <p className="sub">Token de verificação</p>
              <div className="bot-linha"><div className="bot-codigo" style={{ flex: 1 }}>{c.senhaVerificacao}</div><button className="botao" type="button" onClick={() => copiar(c.senhaVerificacao!)}>Copiar</button></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Conexões do bot: cada uma é um número de WhatsApp da empresa (cada empresa com a própria instância). */
export function BotConexao() {
  const { sessao } = useSessao();
  const admin = podeCargo(sessao.usuario.papel, "admin");
  const lista = useCarregar(() => apiBot.conexoes(), []);
  const [aberto, setAberto] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState<Form>(formDe());
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const d = lista.dados;
  const noLimite = d ? d.conexoes.length >= d.maximo : false;

  const ligar = async (ativo: boolean) => {
    try { await apiBot.salvar({ ativo }); lista.recarregar(); setMsg({ texto: ativo ? "Bot ligado." : "Bot desligado." }); }
    catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const criar = async () => {
    setOcupado(true);
    try {
      const r = await apiBot.criarConexao(dadosDe(novo, false));
      setCriando(false); setNovo(formDe()); lista.recarregar(); setAberto(r.conexao.id);
      setMsg({ texto: "Conexão criada. Clique em “Conectar e mostrar QR” para ligar o número." });
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setOcupado(false); }
  };

  return (
    <>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <Cartao titulo="Conexões do Bot">
        <p className="sub">Cada conexão é um número de WhatsApp exclusivo para o bot atender passageiros. O passageiro é respondido pelo número em que escreveu.</p>
        <div className="bot-linha" style={{ margin: "10px 0" }}>
          <label className="bot-check"><input type="checkbox" checked={d?.ativo ?? false} disabled={!admin || !d} onChange={(e) => ligar(e.target.checked)} /> Bot ligado (responde os passageiros)</label>
          {admin && <button className="botao primario" disabled={noLimite} onClick={() => { setNovo(formDe()); setCriando(true); }}><Plus size={14} /> Conectar Novo Número</button>}
        </div>
        {noLimite && <div className="aviso">Limite de {d!.maximo} conexões por empresa atingido.</div>}
        {d?.conexoes.map((c) => (
          <CartaoConexao key={c.id} c={c} admin={admin} aberto={aberto === c.id} onAbrir={() => setAberto(aberto === c.id ? null : c.id)} onMudou={lista.recarregar} onMsg={setMsg} />
        ))}
        {d && d.conexoes.length === 1 && <p className="sub">Nenhuma conexão extra cadastrada. Conecte outro número para atender por mais de um WhatsApp.</p>}
      </Cartao>

      <Gaveta aberta={criando} onFechar={() => setCriando(false)} titulo="Conectar Novo Número do Bot">
        <form className="form" onSubmit={(e) => { e.preventDefault(); criar(); }}>
          <Campos f={novo} set={setNovo} admin principal={false} />
          <p className="sub">As corridas nascem no próprio painel (Corridas, canal WhatsApp), com as categorias e tarifas do cadastro.</p>
          <button className="botao primario" disabled={ocupado || !novo.nome.trim()}><Plus size={14} /> Criar Conexão</button>
        </form>
      </Gaveta>
    </>
  );
}
