// Solicitar corrida (operador da central). A corrida é própria do painel: embarque digitado ou de um local do totem,
// destino, categoria com preço (tarifa do cadastro), pagamento, passageiro e, se quiser, o motorista já atribuído.
// Ao lado, as corridas em aberto e de hoje: atribuir motorista, avançar o status, finalizar com valor e cancelar.

import { useEffect, useState } from "react";
import { Car, RefreshCw, UserCheck, X } from "lucide-react";
import { Cartao, Gaveta, Titulo, useCarregar } from "../componentes/ui";
import { CampoEndereco, type PontoEscolhido } from "../componentes/CampoEndereco";
import { apiCentral, horaBr, mascaraTelefone, reais, type CorridaLista, type MotoristaOpcao } from "./api";

const VAZIO = { embarque: { texto: "" } as PontoEscolhido, destino: { texto: "" } as PontoEscolhido, semDestino: false, distanciaKm: "", categoria: "", pagamento: "Dinheiro", nome: "", telefone: "", observacao: "", motoristaId: "", cupom: "" };
const TOM: Record<string, string> = { aberta: "info", finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta" };
/** Próximo passo de cada status (mesma ordem de src/corridas). */
const AVANCAR: Record<string, { status: string; rotulo: string } | undefined> = {
  a_caminho: { status: "no_local", rotulo: "Motorista chegou" },
  no_local: { status: "em_andamento", rotulo: "Iniciar viagem" },
};

export default function SolicitarCorrida() {
  const op = useCarregar(() => apiCentral.opcoes(), []);
  const lista = useCarregar(() => apiCentral.corridas(), [], 15_000);
  const [f, setF] = useState(VAZIO);
  const [preco, setPreco] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => { if (!f.categoria && op.dados?.categorias[0]) setF((x) => ({ ...x, categoria: op.dados!.categorias[0].nome })); }, [op.dados, f.categoria]);
  // Preço estimado pela tarifa da categoria (com a distância, se o operador informar).
  useEffect(() => {
    if (!f.categoria) { setPreco(null); return; }
    const km = Number(f.distanciaKm.replace(",", "."));
    const t = setTimeout(() => apiCentral.estimativa(f.categoria, km > 0 ? km : undefined).then((r) => setPreco(r.valor)).catch(() => setPreco(null)), 250);
    return () => clearTimeout(t);
  }, [f.categoria, f.distanciaKm]);

  // Os dois endereços achados no mapa: distância e tempo pela rota.
  useEffect(() => {
    const a = f.embarque, b = f.destino;
    if (f.semDestino || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return;
    fetch(`/api/enderecos/rota?lat1=${a.lat}&lng1=${a.lng}&lat2=${b.lat}&lng2=${b.lng}`, { credentials: "same-origin" })
      .then((r) => r.json()).then((r: { distanciaKm?: number }) => { if (r.distanciaKm != null) setF((x) => ({ ...x, distanciaKm: String(r.distanciaKm).replace(".", ",") })); }).catch(() => {});
  }, [f.embarque, f.destino, f.semDestino]);

  const mudar = (p: Partial<typeof VAZIO>) => { setF({ ...f, ...p }); setMsg(null); };
  const enviar = async () => {
    setEnviando(true); setMsg(null);
    try {
      const km = Number(f.distanciaKm.replace(",", "."));
      const r = await apiCentral.pedir({
        passageiro: { nome: f.nome, telefone: f.telefone }, embarque: f.embarque, destino: f.semDestino ? undefined : f.destino,
        categoria: f.categoria, pagamento: f.pagamento, observacao: f.observacao, distanciaKm: km > 0 ? km : undefined, cupom: f.cupom || undefined,
      });
      let texto = `Corrida ${r.corrida.os} criada para ${f.nome}.`;
      if (f.motoristaId) {
        try { await apiCentral.atribuir(r.corrida.id, f.motoristaId); texto += " Motorista atribuído."; }
        catch (e) { texto += ` Não atribuí o motorista: ${e instanceof Error ? e.message : e}`; }
      }
      setMsg({ texto });
      setF({ ...VAZIO, categoria: f.categoria, pagamento: f.pagamento });
      lista.recarregar();
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setEnviando(false); }
  };

  const motoristas = op.dados?.motoristas ?? [];
  const daCategoria = (m: MotoristaOpcao) => !m.categorias || m.categorias.toLowerCase().split(",").map((x) => x.trim()).includes(f.categoria.toLowerCase());
  const abertas = lista.dados?.corridas.filter((c) => c.grupo === "aberta") ?? [];
  const outras = lista.dados?.corridas.filter((c) => c.grupo !== "aberta") ?? [];
  const corridaAberta = lista.dados?.corridas.find((c) => c.id === aberta) ?? null;

  return (
    <>
      <Titulo titulo="Solicitar corrida" sub="Peça uma corrida pela central, atribua o motorista e acompanhe até o fim." />
      {op.erro && <div className="aviso erro">{op.erro}</div>}
      {op.dados && !op.dados.categorias.length && <div className="aviso">Sem categorias cadastradas: a corrida sai sem preço. Cadastre em Categorias e tarifas.</div>}
      {op.dados && !motoristas.length && <div className="aviso">Nenhum motorista ativo no cadastro de Motoristas.</div>}
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <div className="grade">
        <Cartao titulo="Nova corrida">
          <form className="form" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <label>Nome do passageiro<input value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} required maxLength={80} /></label>
            <label>Telefone com DDD<input value={f.telefone} inputMode="tel" onChange={(e) => mudar({ telefone: mascaraTelefone(e.target.value) })} required /></label>
            {!!op.dados?.locais.length && (
              <label>Embarque em um local do totem<small>Opcional: preenche o endereço.</small>
                <select value="" onChange={(e) => { const l = op.dados!.locais.find((x) => x.id === e.target.value); if (l) mudar({ embarque: { ...l.endereco } }); }}>
                  <option value="">Escolher...</option>{op.dados.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </label>
            )}
            <CampoEndereco rotulo="Embarque (rua, número e bairro)" valor={f.embarque} onChange={(p) => mudar({ embarque: p })} required />
            <label className="check"><input type="checkbox" checked={f.semDestino} onChange={(e) => mudar({ semDestino: e.target.checked })} /> Sem destino (o passageiro informa ao motorista)</label>
            {!f.semDestino && <CampoEndereco rotulo="Destino" valor={f.destino} onChange={(p) => mudar({ destino: p })} required />}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <label>Categoria
                <select value={f.categoria} onChange={(e) => mudar({ categoria: e.target.value })} disabled={!op.dados?.categorias.length}>
                  {op.dados?.categorias.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                </select>
              </label>
              <label>Distância (km)<input value={f.distanciaKm} inputMode="decimal" placeholder="opcional" onChange={(e) => mudar({ distanciaKm: e.target.value })} /></label>
            </div>
            {preco != null && <p className="sub">Preço estimado: <strong>{reais(preco)}</strong>{f.distanciaKm ? "" : " (sem distância: valor mínimo)"}</p>}
            <label>Pagamento<select value={f.pagamento} onChange={(e) => mudar({ pagamento: e.target.value })}>{op.dados?.pagamentos.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
            <label>Cupom<input value={f.cupom} onChange={(e) => mudar({ cupom: e.target.value.toUpperCase() })} maxLength={30} placeholder="opcional" /></label>
            <label>Motorista<small>Opcional: sem motorista, a corrida fica "Procurando motorista".</small>
              <select value={f.motoristaId} onChange={(e) => mudar({ motoristaId: e.target.value })}>
                <option value="">Atribuir depois</option>
                {motoristas.filter(daCategoria).map((m) => <option key={m.id} value={m.id}>{m.nome}{m.placa ? ` · ${m.placa}` : ""}</option>)}
              </select>
            </label>
            <label>Observação para o motorista<input value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} maxLength={200} /></label>
            <button className="botao primario" disabled={enviando}><Car size={14} /> {enviando ? "Pedindo..." : "Pedir corrida"}</button>
          </form>
        </Cartao>
        <Cartao titulo="Corridas em aberto">
          <div className="acoes" style={{ marginBottom: 8 }}><button className="botao" onClick={lista.recarregar}><RefreshCw size={14} /> Atualizar</button></div>
          {lista.erro && <div className="aviso erro">{lista.erro}</div>}
          {lista.dados && !abertas.length && <p className="vazio">Nenhuma corrida em aberto.</p>}
          <ul className="lista">{abertas.map((c) => <Item key={c.id} c={c} abrir={() => setAberta(c.id)} />)}</ul>
          {!!outras.length && <><h2 className="secao">Últimas 24 horas</h2><ul className="lista">{outras.slice(0, 30).map((c) => <Item key={c.id} c={c} abrir={() => setAberta(c.id)} />)}</ul></>}
        </Cartao>
      </div>
      <Gaveta aberta={!!corridaAberta} onFechar={() => setAberta(null)} titulo={corridaAberta ? `Corrida ${corridaAberta.os}` : ""}>
        {corridaAberta && <Detalhe c={corridaAberta} motoristas={motoristas} mudou={lista.recarregar} />}
      </Gaveta>
    </>
  );
}

export function Item({ c, abrir }: { c: CorridaLista; abrir: () => void }) {
  return (
    <li style={{ cursor: "pointer" }} onClick={abrir}>
      <strong>{c.passageiro.nome}</strong> <span className={`selo ${TOM[c.grupo]}`}>{c.statusTexto}</span> <small>OS {c.os} · {horaBr(c.solicitadaEm)}{c.local ? ` · Totem ${c.local}` : c.canal === "painel" ? " · Central" : ""}</small><br />
      <small>{c.embarque} → {c.destino || "sem destino"}{c.categoria ? ` · ${c.categoria}` : ""}{c.motorista ? ` · ${c.motorista}` : ""}{(c.valor ?? c.valorEstimado) != null ? ` · ${reais(c.valor ?? c.valorEstimado)}` : ""}</small>
    </li>
  );
}

/** Ações da central numa corrida: atribuir/trocar motorista, avançar status, finalizar com valor, cancelar. */
export function Detalhe({ c, motoristas, mudou }: { c: CorridaLista; motoristas: MotoristaOpcao[]; mudou: () => void }) {
  const [motoristaId, setMotoristaId] = useState(c.motoristaId ?? "");
  const [valor, setValor] = useState(c.valorEstimado != null ? String(c.valorEstimado).replace(".", ",") : "");
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  useEffect(() => { setMotoristaId(c.motoristaId ?? ""); }, [c.motoristaId]);
  const fazer = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ texto: ok }); mudou(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const aberta = c.grupo === "aberta";
  const antesDeComecar = aberta && c.status !== "em_andamento";
  const prox = AVANCAR[c.status];
  return (
    <div className="form">
      <p><span className={`selo ${TOM[c.grupo]}`}>{c.statusTexto}</span> <small className="sub">{horaBr(c.solicitadaEm)}{c.local ? ` · Totem ${c.local}` : ""}</small></p>
      <ul className="lista">
        <li><small>Passageiro</small><br />{c.passageiro.nome} · {mascaraTelefone(c.passageiro.telefone)}</li>
        <li><small>Embarque</small><br />{c.embarque}</li>
        <li><small>Destino</small><br />{c.destino || "sem destino"}</li>
        <li><small>Categoria e pagamento</small><br />{[c.categoria, c.pagamento].filter(Boolean).join(" · ") || "—"}</li>
        <li><small>Motorista</small><br />{c.motorista ? `${c.motorista}${c.telefoneMotorista ? ` · ${mascaraTelefone(c.telefoneMotorista)}` : ""}` : "ainda sem motorista"}</li>
        <li><small>{c.valor != null ? "Valor" : "Estimativa"}</small><br />{reais(c.valor ?? c.valorEstimado) || "—"}</li>
        {c.motivoCancelamento && <li><small>Motivo do cancelamento</small><br />{c.motivoCancelamento}</li>}
      </ul>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      {antesDeComecar && (
        <label>{c.motoristaId ? "Trocar motorista" : "Atribuir motorista"}
          <div className="acoes">
            <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Escolher...</option>{motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.placa ? ` · ${m.placa}` : ""}</option>)}
            </select>
            <button type="button" className="botao primario" disabled={!motoristaId || motoristaId === c.motoristaId} onClick={() => fazer(() => apiCentral.atribuir(c.id, motoristaId), "Motorista atribuído.")}><UserCheck size={14} /> Atribuir</button>
          </div>
        </label>
      )}
      {prox && <button type="button" className="botao" onClick={() => fazer(() => apiCentral.status(c.id, prox.status), "Status atualizado.")}>{prox.rotulo}</button>}
      {c.status === "a_caminho" && <button type="button" className="botao" onClick={() => fazer(() => apiCentral.status(c.id, "procurando"), "Motorista retirado. Procurando outro.")}>Tirar o motorista</button>}
      {c.status === "procurando" && <button type="button" className="botao" onClick={() => fazer(() => apiCentral.status(c.id, "nao_atendida"), "Marcada como não atendida.")}>Não atendida</button>}
      {c.status === "em_andamento" && (
        <label>Valor final (R$)
          <div className="acoes">
            <input value={valor} inputMode="decimal" onChange={(e) => setValor(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="botao primario" onClick={() => fazer(() => apiCentral.status(c.id, "finalizada", Number(valor.replace(",", "."))), "Corrida finalizada.")}>Finalizar</button>
          </div>
        </label>
      )}
      {aberta && (
        <label>Motivo do cancelamento
          <div className="acoes">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} placeholder="Ex.: passageiro desistiu" style={{ flex: 1 }} />
            <button type="button" className="botao" onClick={() => confirm("Cancelar esta corrida?") && fazer(() => apiCentral.cancelar(c.id, motivo), "Corrida cancelada.")}><X size={14} /> Cancelar</button>
          </div>
        </label>
      )}
    </div>
  );
}
