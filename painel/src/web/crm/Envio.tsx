import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Save, XCircle } from "lucide-react";
import { Cartao, Kpi, useCarregar } from "../componentes/ui";
import { crm, quandoReal, type Config, type ConfigEnvio } from "./api";
import { Selo, useAdmin, useRetorno } from "./comum";

/** Envio: ritmo do WhatsApp (lote, pausa, limite), número da empresa e fila. */
export default function Envio() {
  const cfg = useCarregar(() => crm.config(), []);
  const fila = useCarregar(() => crm.fila(), [], 5_000);
  const caixa = useCarregar(() => crm.simulado(), [], 5_000);
  const admin = useAdmin();
  const r = useRetorno();
  const [c, setC] = useState<ConfigEnvio | null>(null);
  const [wa, setWa] = useState<Config["whatsapp"]>({ url: "", instancia: "", token: "" });
  useEffect(() => { if (cfg.dados) { setC(cfg.dados.config); setWa(cfg.dados.whatsapp); } }, [cfg.dados]);
  if (!c || !cfg.dados) return <>{cfg.erro && <div className="aviso erro">{cfg.erro}</div>}</>;
  const n = (k: keyof ConfigEnvio) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  const salvar = () => r.tentar(() => crm.salvarConfig({ config: c, whatsapp: c.provedor === "evolution" ? wa : undefined }), "Configuração de envio salva.").then(() => cfg.recarregar());
  const f = fila.dados;
  return (
    <>
      {r.caixa}
      {f && (
        <div className="kpis">
          <Kpi rotulo="Na fila" valor={f.pendentes} tom="info" />
          <Kpi rotulo="Enviadas" valor={f.enviados} tom="ok" />
          <Kpi rotulo="Falhas" valor={f.falhas} tom={f.falhas ? "ruim" : undefined} />
          <Kpi rotulo="Lote atual" valor={`${f.loteAtual} de ${cfg.dados.config.lote || "∞"}`} detalhe={f.emPausaAte ? `Em pausa até ${quandoReal(f.emPausaAte)}` : "Enviando normalmente"} tom={f.emPausaAte ? "alerta" : undefined} />
        </div>
      )}
      <div className="grade">
        <Cartao titulo="Número de WhatsApp da empresa">
          <p className={cfg.dados.pendencias.length ? "txt-ruim" : "txt-ok"}>
            {cfg.dados.pendencias.length ? <XCircle size={16} /> : <CheckCircle2 size={16} />} {cfg.dados.config.provedor === "simulado" ? "Modo de teste: nada sai de verdade." : cfg.dados.pendencias.length ? "Falta configurar" : "Pronto para enviar"}
          </p>
          {cfg.dados.pendencias.length > 0 && <ul className="dicas">{cfg.dados.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="form">
            <label>Como enviar
              <select value={c.provedor} disabled={!admin} onChange={(e) => setC({ ...c, provedor: e.target.value as ConfigEnvio["provedor"] })}>
                <option value="simulado">Simulado (teste, não manda nada)</option>
                <option value="evolution">Evolution API (instância da sua empresa)</option>
              </select>
            </label>
            {c.provedor === "evolution" && (
              <>
                <label>URL da sua instância<input value={wa.url} disabled={!admin} placeholder="https://..." onChange={(e) => setWa({ ...wa, url: e.target.value })} /></label>
                <label>Nome da instância<input value={wa.instancia} disabled={!admin} onChange={(e) => setWa({ ...wa, instancia: e.target.value })} /></label>
                <label>Token da instância<input type="password" autoComplete="off" disabled={!admin} value={wa.token} onFocus={() => wa.token === "••••••" && setWa({ ...wa, token: "" })} onChange={(e) => setWa({ ...wa, token: e.target.value })} /><small>Fica só no servidor. Conecte o número lendo o QR code na sua instância.</small></label>
              </>
            )}
          </div>
        </Cartao>
        <Cartao titulo="Ritmo do envio">
          <div className="form">
            <label>Mensagens por lote<input type="number" min={0} max={500} value={c.lote} disabled={!admin} onChange={n("lote")} /><small>Depois de cada lote o envio para. 0 = sem lote (só o limite por minuto).</small></label>
            <label>Pausa entre lotes: mínimo (min)<input type="number" min={0} max={240} value={c.pausaMinMin} disabled={!admin} onChange={n("pausaMinMin")} /></label>
            <label>Pausa entre lotes: máximo (min)<input type="number" min={0} max={240} value={c.pausaMaxMin} disabled={!admin} onChange={n("pausaMaxMin")} /><small>A pausa é sorteada entre o mínimo e o máximo.</small></label>
            <label>Limite por minuto<input type="number" min={1} max={120} value={c.limitePorMinuto} disabled={!admin} onChange={n("limitePorMinuto")} /><small>O intervalo entre mensagens varia um pouco, para não parecer robô.</small></label>
            <label>Dias de corridas para montar o público<input type="number" min={7} max={365} value={c.diasHistorico} disabled={!admin} onChange={n("diasHistorico")} /></label>
          </div>
          {admin && <div className="acoes"><button className="botao primario" onClick={salvar}><Save size={14} /> Salvar</button></div>}
          <p className="sub">Mensagem que cai na pausa continua na fila e sai no próximo lote (não conta como falha).</p>
        </Cartao>
      </div>
      <div className="grade">
        <Cartao titulo="Fila de envio">
          {admin && <div className="acoes"><button className="botao" onClick={() => r.tentar(() => crm.processar(), "Fila conferida.").then(() => fila.recarregar())}><RefreshCw size={14} /> Enviar agora o que puder</button></div>}
          {!f?.ultimos.length ? <p className="vazio">Fila vazia.</p> : (
            <ul className="lista">{f.ultimos.map((i) => <li key={i.id}><Selo estado={i.estado} /> <strong>{i.nome || "—"}</strong> <small>{i.telefone} · {i.origem.tipo === "jornada" ? "jornada" : "campanha"} · {quandoReal(i.quando)}{i.erro ? ` · ${i.erro}` : ""}</small></li>)}</ul>
          )}
        </Cartao>
        {cfg.dados.config.provedor === "simulado" && (
          <Cartao titulo="Caixa de saída simulada">
            <p className="sub">O que teria saído pelo WhatsApp (só na memória do servidor; some ao reiniciar).</p>
            {!caixa.dados?.mensagens.length ? <p className="vazio">Nada enviado ainda.</p> : (
              <ul className="lista">{caixa.dados.mensagens.slice(0, 20).map((m, i) => <li key={i}><small>{m.telefone} · {quandoReal(m.em)}</small><div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div></li>)}</ul>
            )}
          </Cartao>
        )}
      </div>
    </>
  );
}
