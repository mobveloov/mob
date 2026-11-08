import { useEffect, useState } from "react";
import { Link2, Plug, PlugZap, Save, Unplug } from "lucide-react";
import { useSessao } from "../App";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiBot, type Conexao, type ConfigBot } from "./api";

const SITUACAO: Record<Conexao["situacao"], { texto: string; tom: string }> = {
  conectado: { texto: "Conectado", tom: "ok" }, aguardando_qr: { texto: "Aguardando leitura do QR", tom: "alerta" },
  desconectado: { texto: "Desconectado", tom: "ruim" }, nao_configurado: { texto: "Não configurado", tom: "" }, erro: { texto: "Erro", tom: "ruim" },
};

/** Conexão do número de WhatsApp da empresa (instância própria) e configuração do bot. */
export function BotConexao() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const cfg = useCarregar(() => apiBot.config(), []);
  const [form, setForm] = useState<ConfigBot & { urlApi: string; token: string }>({ ativo: false, provedor: "simulado", instancia: "", urlApi: "", token: "" });
  const [proprio, setProprio] = useState(false);
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!cfg.dados) return;
    setForm({ ...cfg.dados.config, urlApi: cfg.dados.servidor.urlApi, token: "" });
    setProprio(!cfg.dados.servidor.daPlataforma);
  }, [cfg.dados]);
  const situacao = useCarregar(() => apiBot.situacao(), [cfg.dados], conexao?.situacao === "aguardando_qr" ? 4000 : 30000);
  const atual = conexao?.situacao === "aguardando_qr" && situacao.dados?.situacao !== "conectado" ? conexao : situacao.dados;

  const tentar = async (f: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try { await f(); if (ok) setMsg({ texto: ok }); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setOcupado(false); }
  };
  const salvar = () => tentar(async () => {
    const { token, urlApi, ...resto } = form;
    await apiBot.salvar({ ...resto, urlApi: proprio ? urlApi : "", ...(proprio && token ? { token } : {}) });
    setConexao(null); cfg.recarregar();
  }, "Configuração salva.");

  const s = atual ? SITUACAO[atual.situacao] : null;
  const d = cfg.dados;
  return (
    <>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <div className="grade">
        <Cartao titulo="Número de WhatsApp da empresa">
          <div className="bot-linha" style={{ marginBottom: 10 }}>
            {s && <span className={`selo ${s.tom}`}>{s.texto}</span>}
            {atual?.detalhe && <small className="sub">{atual.detalhe}</small>}
          </div>
          {atual?.qr && atual.situacao !== "conectado" && (
            <div className="bot-qr">
              <img src={atual.qr} alt="QR Code para conectar o WhatsApp" />
              <small>No celular da empresa: WhatsApp › Aparelhos conectados › Conectar aparelho.</small>
              {atual.codigo && <div className="bot-codigo">Código: {atual.codigo}</div>}
            </div>
          )}
          {admin && (
            <div className="bot-linha">
              <button className="botao primario" disabled={ocupado} onClick={() => tentar(async () => { setConexao(await apiBot.conectar()); situacao.recarregar(); })}>
                <PlugZap size={14} /> {atual?.situacao === "conectado" ? "Reaplicar webhook" : "Conectar e mostrar QR"}
              </button>
              {atual?.situacao === "conectado" && (
                <button className="botao" disabled={ocupado} onClick={() => confirm("Desconectar o número do bot?") && tentar(async () => { await apiBot.desconectar(); setConexao(null); situacao.recarregar(); }, "Número desconectado.")}>
                  <Unplug size={14} /> Desconectar
                </button>
              )}
            </div>
          )}
          {d?.webhook && (
            <>
              <p className="sub" style={{ marginTop: 12 }}><Link2 size={13} /> Endereço de entrada (webhook) desta empresa. Ao conectar, o painel já configura no provedor.</p>
              <div className="bot-codigo">{d.webhook}</div>
            </>
          )}
        </Cartao>

        <Cartao titulo="Configuração">
          <form className="form" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <label className="bot-check"><input type="checkbox" checked={form.ativo} disabled={!admin} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Bot ligado (responde os passageiros)</label>
            <label>Provedor
              <select value={form.provedor} disabled={!admin} onChange={(e) => setForm({ ...form, provedor: e.target.value as ConfigBot["provedor"] })}>
                <option value="simulado">Simulado (teste, nada sai de verdade)</option>
                <option value="evolution">WhatsApp de verdade (Evolution API, QR Code)</option>
              </select>
            </label>
            <p className="sub">As corridas nascem no próprio painel (Corridas, canal WhatsApp), com as categorias e tarifas do cadastro.</p>
            {form.provedor === "evolution" && (
              <>
                <label className="bot-check"><input type="checkbox" checked={proprio} disabled={!admin} onChange={(e) => setProprio(e.target.checked)} /> Usar um servidor de WhatsApp próprio da empresa</label>
                {!proprio && (
                  <p className="sub">
                    {d?.servidor.plataformaPronta
                      ? `Servidor da plataforma, com a instância só desta empresa (${form.instancia}). Basta conectar e ler o QR.`
                      : "O servidor de WhatsApp da plataforma ainda não foi configurado. Fale com o suporte da plataforma ou use um servidor próprio."}
                  </p>
                )}
                {proprio && (
                  <>
                    <label>Endereço do servidor<input value={form.urlApi} disabled={!admin} placeholder="https://whatsapp.suaempresa.com.br" onChange={(e) => setForm({ ...form, urlApi: e.target.value })} /></label>
                    <label>Token do servidor{d?.servidor.tokenSalvo && <small> (já salvo; deixe vazio para manter)</small>}
                      <input type="password" autoComplete="off" value={form.token} disabled={!admin} onChange={(e) => setForm({ ...form, token: e.target.value })} />
                    </label>
                    <label>Nome da instância<input value={form.instancia} disabled={!admin} onChange={(e) => setForm({ ...form, instancia: e.target.value })} /></label>
                  </>
                )}
              </>
            )}
            {admin ? <button className="botao primario" disabled={ocupado}><Save size={14} /> Salvar</button> : <p className="sub"><Plug size={13} /> Só o administrador muda a conexão.</p>}
          </form>
        </Cartao>
      </div>
    </>
  );
}
