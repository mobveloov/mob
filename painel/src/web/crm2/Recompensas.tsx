import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Crown, Plus, RefreshCw, Sparkles, Ticket, Trash2, Users } from "lucide-react";
import { Cartao, Gaveta, Kpi, useCarregar } from "../componentes/ui";
import { useGestor, useRetorno } from "../crm/comum";
import { crm2, dinheiroBr } from "./api";

const ORIGEM: Record<string, string> = { manual: "Manual", automatico: "Automático" };
const ORIGEM_GANHO: Record<string, string> = { roleta: "Roleta", raspadinha: "Raspadinha", fidelidade: "Cartão Fidelidade", pontos: "Pontos de Troca" };
const dia = (s: string) => (s ? s.split("-").reverse().join("/") : "");

/** CRM › Recompensas: cupons da central (os mesmos do cadastro de Cupons) com usos e desconto dado. */
export default function Recompensas() {
  const [origem, setOrigem] = useState("all");
  const [novo, setNovo] = useState(false);
  const { dados, erro, recarregar } = useCarregar(() => crm2.recompensas(origem), [origem]);
  const { tentar, caixa } = useRetorno();
  const gestor = useGestor();
  const ir = useNavigate();

  return (
    <div className="pilha">
      <Cartao>
        <div className="linha-filtro">
          <p className="sub" style={{ margin: 0 }}>Indicação de amigos e desafios com prêmio ficam em <strong>Financeiro › Recompensas por indicação</strong>.</p>
          <button className="botao" onClick={() => ir("/indicacoes")}><Crown size={14} /> Abrir Recompensas por indicação</button>
        </div>
      </Cartao>
      <div className="linha-filtro">
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="all">Todas as origens</option><option value="manual">Manual</option><option value="automatico">Automáticos</option>
        </select>
        <div className="acoes">
          <button className="botao" onClick={() => tentar(() => crm2.atualizarUsos(), "Usos atualizados com as corridas.").then(recarregar)}><RefreshCw size={14} /> Atualizar usos</button>
          {gestor && <button className="botao primario" onClick={() => setNovo(true)}><Plus size={14} /> Novo Cupom</button>}
        </div>
      </div>
      {dados && (
        <div className="grade">
          <Kpi rotulo="Gerados" valor={dados.resumo.total} />
          <Kpi rotulo="Usados" valor={dados.resumo.used} tom="ok" />
          <Kpi rotulo="Ativos" valor={dados.resumo.active} tom="info" />
          <Kpi rotulo="Desconto dado (30 dias)" valor={dinheiroBr(dados.desconto30.total)} detalhe={`${dados.desconto30.corridas} corrida(s) com cupom`} />
        </div>
      )}
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && (
        <Cartao>
          <div className="linha-filtro">
            <strong><Sparkles size={14} /> Prêmios ganhos</strong>
            <small className="sub">{dados.ganhosResumo.total} no total · {Object.entries(ORIGEM_GANHO).map(([k, n]) => `${n}: ${dados.ganhosResumo.por[k] ?? 0}`).join(" · ")}</small>
          </div>
          {!dados.ganhos.length ? <p className="vazio">Ninguém ganhou prêmio ainda. Roleta, Raspadinha, Cartão Fidelidade e Pontos de Troca aparecem aqui (configure em Totens &amp; Preços › Jogos de recompensa).</p> : (
            <div className="pilha">
              {dados.ganhos.slice(0, 20).map((g) => (
                <div key={g.id} className="linha-filtro">
                  <span><span className="selo">{ORIGEM_GANHO[g.origem] ?? g.origem}</span> <strong>{g.nome || g.telefone}</strong> ganhou {g.premio}{g.cupom ? <> · cupom <span className="crm2-codigo">{g.cupom}</span></> : null}</span>
                  <small className="sub">{new Date(g.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small>
                </div>
              ))}
            </div>
          )}
        </Cartao>
      )}
      {!dados ? <p className="vazio">Carregando...</p> : !dados.cupons.length ? <Cartao><p className="vazio"><Ticket size={16} /> Nenhum cupom. Crie um aqui.</p></Cartao> : (
        <div className="pilha">
          {dados.cupons.map((c) => (
            <Cartao key={c.id}>
              <div className="linha-filtro">
                <div style={{ minWidth: 0 }}>
                  <div className="topo-linha">
                    <span className="crm2-codigo">{c.code}</span><strong>{c.name}</strong>
                    <span className={`selo ${c.vigente ? "ok" : "alerta"}`}>{c.vigente ? "Ativo" : c.is_active ? "Fora do prazo" : "Desligado"}</span>
                    <span className="selo">{ORIGEM[c.origin] ?? c.origin}</span>
                  </div>
                  <div className="sub" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>{c.discount_type === "percent" ? `${c.discount_value}% de desconto` : `${dinheiroBr(c.discount_value)} de desconto`}</span>
                    <span><Users size={12} /> {c.current_uses} uso(s) · {c.passengers_used} passageiro(s)</span>
                    {c.phone && <span>para {c.phone}</span>}
                    {c.valid_until && <span><Clock size={12} /> até {dia(c.valid_until)}</span>}
                  </div>
                </div>
                {gestor && <button className="icone" title="Remover" aria-label={`Remover ${c.code}`} onClick={() => confirm("Excluir este cupom?") && tentar(() => crm2.apagarCupom(c.id)).then(recarregar)}><Trash2 size={16} /></button>}
              </div>
            </Cartao>
          ))}
        </div>
      )}
      <Gaveta aberta={novo} onFechar={() => setNovo(false)} titulo="Novo cupom">
        {novo && <FormCupom onFeito={() => { setNovo(false); recarregar(); }} onFechar={() => setNovo(false)} />}
      </Gaveta>
    </div>
  );
}

function FormCupom({ onFeito, onFechar }: { onFeito: () => void; onFechar: () => void }) {
  const [f, setF] = useState({ name: "", code: "", discountType: "percentual", discount: "10", usageLimit: "ate_n_vezes_por_passageiro", usesPerUser: "1", validFrom: "", validUntil: "", cidade: "" });
  const [salvando, setSalvando] = useState(false);
  const { tentar, caixa } = useRetorno();
  const mudar = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const gerar = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; mudar({ code: Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join("") }); };
  const salvar = async () => {
    setSalvando(true);
    const r = await tentar(() => crm2.criarCupom({ ...f, discount: Number(f.discount), usesPerUser: Number(f.usesPerUser) || 1 }));
    setSalvando(false);
    if (r) onFeito();
  };
  return (
    <div className="form">
      {caixa}
      <label>Nome (interno)<input value={f.name} onChange={(e) => mudar({ name: e.target.value })} placeholder="Ex: Promoção de aniversário" /></label>
      <label>Código (até 21 caracteres)
        <span style={{ display: "flex", gap: 8 }}>
          <input value={f.code} maxLength={21} onChange={(e) => mudar({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="EX: PROMO10" style={{ fontFamily: "monospace", flex: 1 }} />
          <button type="button" className="botao" onClick={gerar}><Sparkles size={14} /> Gerar</button>
        </span>
      </label>
      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label>Tipo<select value={f.discountType} onChange={(e) => mudar({ discountType: e.target.value })}><option value="percentual">Percentual (%)</option><option value="valor_fixo">Valor fixo (R$)</option></select></label>
        <label>Desconto<input type="number" min="0" value={f.discount} onChange={(e) => mudar({ discount: e.target.value })} /></label>
      </div>
      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label>Limite de uso
          <select value={f.usageLimit} onChange={(e) => mudar({ usageLimit: e.target.value })}>
            <option value="ate_n_vezes_por_passageiro">Até N vezes por passageiro</option><option value="apenas_uma_vez">Apenas uma vez</option><option value="sem_limite">Sem limite</option>
          </select>
        </label>
        {f.usageLimit === "ate_n_vezes_por_passageiro" && <label>Vezes por passageiro<input type="number" min="1" value={f.usesPerUser} onChange={(e) => mudar({ usesPerUser: e.target.value })} /></label>}
      </div>
      <div className="grade" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label>Início<input type="date" value={f.validFrom} onChange={(e) => mudar({ validFrom: e.target.value })} /></label>
        <label>Fim<input type="date" value={f.validUntil} onChange={(e) => mudar({ validUntil: e.target.value })} /></label>
      </div>
      <label>Cidade (vazio = todas)<input value={f.cidade} onChange={(e) => mudar({ cidade: e.target.value })} /></label>
      <div className="acoes">
        <button className="botao primario" onClick={salvar} disabled={salvando || !f.name.trim() || !f.code.trim()}><Check size={14} /> Criar cupom</button>
        <button className="botao" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  );
}
