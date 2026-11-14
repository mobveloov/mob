// Config: Regras de Crédito, Tarifas Dinâmicas, Descontos, Regras de Despacho e Transbordos.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DescontosMatriz } from "./DescontosMatriz";
import { Abas, Aviso, Cab, Campo, Carregando, Interruptor, Modal, dinheiro, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ------------------------------------------------------------------ Regras de Crédito

export function RegrasCredito() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/credito"), []);
  const [g, setG] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setG(structuredClone(d.dados)); }
  const [regra, setRegra] = useState<any>(null);
  const { msg, salvando, salvar } = useSalvar();
  if (!g) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setG({ ...g, [k]: v });
  return (
    <>
      <Cab titulo="Financeiro" sub="Gerencie os créditos e regras de comissão.">{admin && <button className="botao primario" onClick={() => setRegra({ nome: "", categoria: g.categorias[0] ?? "", de: 0, ate: 0, tipo: "percentual", valor: 0 })}><Plus size={14} /> Nova Regra</button>}</Cab>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao dm-secao">
        <div className="dm-linha dm-entre"><h3>Parâmetros Gerais</h3>{admin && <button className="botao primario" disabled={salvando} onClick={() => salvar(async () => { const r = await pedirConfig("/credito", "PUT", g); setG({ ...g, ...r }); }, "Alterações salvas.")}>Salvar Alterações</button>}</div>
        <div className="dm-grade3">
          <Campo rotulo="Modelo de Negócio"><select value={g.modelo} disabled={!admin} onChange={(e) => set("modelo", e.target.value)}><option value="regras">Porcentagem / Fixa (Regras)</option><option value="semanal">Cobrança Semanal (Assinatura)</option></select></Campo>
          <Campo rotulo="Saldo Bloqueio (OFF)" dica='Use "-" para permitir negativo.'><input inputMode="decimal" disabled={!admin} value={String(g.saldoBloqueio).replace(".", ",")} onChange={(e) => set("saldoBloqueio", num(e.target.value))} placeholder="0,00" /></Campo>
          <Campo rotulo="Saldo Aviso (Alerta)" dica="Avisa antes de bloquear."><input inputMode="decimal" disabled={!admin} value={String(g.saldoAviso).replace(".", ",")} onChange={(e) => set("saldoAviso", num(e.target.value))} placeholder="0,00" /></Campo>
        </div>
        <Interruptor valor={g.permiteEditarValor} onChange={(v) => set("permiteEditarValor", v)} rotulo="Permitir editar valor?" desabilitado={!admin} />
        <Interruptor valor={g.motoristaVeTaxas} onChange={(v) => set("motoristaVeTaxas", v)} rotulo="Motorista vê taxas?" desabilitado={!admin} />
      </section>
      <section className="dm-cartao dm-secao">
        <div className="dm-linha dm-entre"><h3>Regras de Comissão</h3><span className="selo">{g.regras.length} ativas</span></div>
        {!g.regras.length ? <div className="dm-vazio-pequeno"><h4>Tudo limpo por aqui</h4><p>Crie faixas de valores para cobrar comissões personalizadas dos motoristas.</p></div> : (
          <div className="tabela-rola"><table><thead><tr><th>Regra</th><th>Categoria</th><th>Faixa de valor</th><th>Cobrança</th><th>Ações</th></tr></thead><tbody>
            {g.regras.map((r: any) => (
              <tr key={r.id}><td className="forte">{r.nome}</td><td>{r.categoria || "Todas"}</td><td>{dinheiro(r.de)} a {dinheiro(r.ate)}</td><td>{r.tipo === "percentual" ? `${String(r.valor).replace(".", ",")}%` : dinheiro(r.valor)}</td>
                <td>{admin && <span className="dm-linha"><button className="icone" aria-label={`Editar ${r.nome}`} onClick={() => setRegra({ ...r })}><Pencil size={14} /></button><button className="icone" aria-label={`Remover ${r.nome}`} onClick={async () => { if (confirm(`Remover a regra "${r.nome}"?`)) { await salvar(async () => { setG({ ...g, ...(await pedirConfig(`/credito/regras/${r.id}`, "DELETE")) }); }, "Regra removida."); } }}><Trash2 size={14} /></button></span>}</td></tr>
            ))}</tbody></table></div>
        )}
      </section>
      <Modal aberto={!!regra} onFechar={() => setRegra(null)} titulo={regra?.id ? "Editar Regra" : "Nova Regra"} sub="Configure as taxas.">
        {regra && (
          <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(async () => setG({ ...g, ...(await pedirConfig("/credito/regras", "POST", regra)) }), "Regra salva."); if (r !== undefined) setRegra(null); }}>
            <Campo rotulo="Nome da Regra"><input value={regra.nome} onChange={(e) => setRegra({ ...regra, nome: e.target.value })} placeholder="Ex: Taxa Básica" required maxLength={60} /></Campo>
            <Campo rotulo="Categoria de Veículo"><select value={regra.categoria} onChange={(e) => setRegra({ ...regra, categoria: e.target.value })}><option value="">Todas</option>{g.categorias.map((c: string) => <option key={c}>{c}</option>)}</select></Campo>
            <div className="dm-duplo"><Campo rotulo="De (R$)"><input inputMode="decimal" value={txt(regra.de)} onChange={(e) => setRegra({ ...regra, de: num(e.target.value) })} placeholder="0,00" /></Campo><Campo rotulo="Até (R$)"><input inputMode="decimal" value={txt(regra.ate)} onChange={(e) => setRegra({ ...regra, ate: num(e.target.value) })} placeholder="0,00" /></Campo></div>
            <div className="dm-duplo"><Campo rotulo="Tipo Cobrança"><select value={regra.tipo} onChange={(e) => setRegra({ ...regra, tipo: e.target.value })}><option value="percentual">Porcentagem (%)</option><option value="fixo">Valor Fixo (R$)</option></select></Campo><Campo rotulo="Valor a Descontar"><input inputMode="decimal" value={txt(regra.valor)} onChange={(e) => setRegra({ ...regra, valor: num(e.target.value) })} placeholder="0,00" /></Campo></div>
            <Aviso erro={msg?.erro} />
            <div className="dm-rodape-modal"><button type="button" className="botao" onClick={() => setRegra(null)}>Cancelar</button><button className="botao primario" disabled={salvando}>Salvar Regra</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Descontos

export function Descontos() {
  const [aba, setAba] = useState<"matriz" | "campanhas">("matriz");
  return <><Abas abas={[["matriz", "Por forma de pagamento"], ["campanhas", "Por campanha"]]} valor={aba} onChange={setAba} />{aba === "matriz" ? <DescontosMatriz /> : <DescontosCampanhas />}</>;
}

function DescontosCampanhas() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/descontos"), []);
  const [filtro, setFiltro] = useState("Todos"), [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const { msg, salvar } = useSalvar();
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const todos: any[] = d.dados?.descontos ?? [];
  const estado = (x: any) => (!x.ativo ? "Pausados" : x.fim && x.fim < hoje ? "Vencidos" : "Ativos");
  const lista = todos.filter((x) => (filtro === "Todos" || estado(x) === filtro) && (!busca || x.nome.toLowerCase().includes(busca.toLowerCase())));
  const usos = todos.reduce((s, x) => s + x.usos, 0);
  return (
    <>
      <Cab titulo="Descontos por campanha" sub="Promoções automáticas por categoria, forma de pagamento, dia e horário."><button className="botao" onClick={d.recarregar}>Atualizar</button>{admin && <button className="botao primario" onClick={() => setEdit({ nome: "", tipo: "percentual", valor: 0, teto: 0, minimo: 0, categoria: "", pagamento: "", dias: [], inicio: "", fim: "", horaInicio: "", horaFim: "", limiteTotal: 0, ativo: true })}><Plus size={14} /> Novo Desconto</button>}</Cab>
      <div className="dm-kpis"><div className="dm-kpi"><small>Total de Descontos</small><strong>{todos.length}</strong></div><div className="dm-kpi"><small>Usos Realizados</small><strong>{usos}</strong></div></div>
      <div className="dm-cartao dm-filtros"><div className="dm-pilulas">{["Todos", "Ativos", "Vencidos", "Pausados"].map((f) => <button key={f} className={filtro === f ? "ativo" : ""} onClick={() => setFiltro(f)}>{f}</button>)}</div><input placeholder="Buscar desconto..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar desconto" /></div>
      <Aviso erro={d.erro ?? msg?.erro} />
      <div className="dm-cartao tabela-rola"><table><thead><tr><th>Desconto</th><th>Valor</th><th>Destinatário</th><th>Validade & Regras</th><th>Usos</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {!d.dados ? <tr><td colSpan={7}><Carregando /></td></tr> : !lista.length ? <tr><td colSpan={7} className="vazio">Nenhum desconto cadastrado.</td></tr> : lista.map((x) => (
          <tr key={x.id}><td className="forte">{x.nome}</td><td>{x.tipo === "percentual" ? `${String(x.valor).replace(".", ",")}%` : dinheiro(x.valor)}{x.teto > 0 && <small className="bloco">Teto {dinheiro(x.teto)}</small>}</td>
            <td>{[x.categoria, x.pagamento].filter(Boolean).join(" · ") || "Todos"}</td>
            <td>{x.inicio || x.fim ? `${(x.inicio || "—").split("-").reverse().join("/")} a ${(x.fim || "sem limite").split("-").reverse().join("/")}` : "Sem prazo"}{x.dias.length > 0 && <small className="bloco">{x.dias.map((i: number) => DIAS[i].slice(0, 3)).join(", ")}</small>}{x.minimo > 0 && <small className="bloco">Mín. {dinheiro(x.minimo)}</small>}</td>
            <td>{x.usos}{x.limiteTotal ? ` / ${x.limiteTotal}` : ""}</td><td><span className={`selo ${estado(x) === "Ativos" ? "ok" : "alerta"}`}>{estado(x) === "Ativos" ? "Ativo" : estado(x) === "Vencidos" ? "Vencido" : "Pausado"}</span></td>
            <td>{admin && <span className="dm-linha"><button className="icone" aria-label={`Editar ${x.nome}`} onClick={() => setEdit({ ...x })}><Pencil size={14} /></button><button className="icone" aria-label={`Remover ${x.nome}`} onClick={async () => { if (confirm(`Remover o desconto "${x.nome}"?`)) { await salvar(async () => { await pedirConfig(`/descontos/${x.id}`, "DELETE"); d.recarregar(); }, "Desconto removido."); } }}><Trash2 size={14} /></button></span>}</td></tr>
        ))}</tbody></table></div>
      {edit && <JanelaDesconto inicial={edit} categorias={d.dados?.categorias ?? []} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); d.recarregar(); }} />}
    </>
  );
}

function JanelaDesconto({ inicial, categorias, onFechar, onSalvo }: { inicial: any; categorias: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [x, setX] = useState<any>(inicial);
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setX({ ...x, [k]: v });
  return (
    <Modal aberto onFechar={onFechar} titulo={x.id ? "Alterando Desconto" : "Novo Desconto"} sub="Configure as condições e o público-alvo">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig("/descontos", "POST", x)); if (r) onSalvo(); }}>
        <Campo rotulo="Nome do Desconto *"><input value={x.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Promoção de Boas-Vindas" required maxLength={60} /></Campo>
        <div className="dm-grade3">
          <Campo rotulo="Tipo"><select value={x.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="fixo">R$ Fixo</option><option value="percentual">% Porcentagem</option></select></Campo>
          <Campo rotulo="Valor"><input inputMode="decimal" value={txt(x.valor)} onChange={(e) => set("valor", num(e.target.value))} placeholder="0,00" required /></Campo>
          <Campo rotulo="Teto Máx (R$)"><input inputMode="decimal" value={txt(x.teto)} onChange={(e) => set("teto", num(e.target.value))} placeholder="Opcional" /></Campo>
          <Campo rotulo="Categoria"><select value={x.categoria} onChange={(e) => set("categoria", e.target.value)}><option value="">Todas</option>{categorias.map((c) => <option key={c}>{c}</option>)}</select></Campo>
          <Campo rotulo="Pagamento"><select value={x.pagamento} onChange={(e) => set("pagamento", e.target.value)}><option value="">Todos</option>{["Dinheiro", "Pix", "Cartão na Maquininha", "Saldo da carteira", "Cartão no App"].map((c) => <option key={c}>{c}</option>)}</select></Campo>
          <Campo rotulo="Mínimo Corrida"><input inputMode="decimal" value={txt(x.minimo)} onChange={(e) => set("minimo", num(e.target.value))} placeholder="R$ 0,00" /></Campo>
          <Campo rotulo="Início"><input type="date" value={x.inicio} onChange={(e) => set("inicio", e.target.value)} /></Campo>
          <Campo rotulo="Expiração"><input type="date" value={x.fim} onChange={(e) => set("fim", e.target.value)} /></Campo>
          <Campo rotulo="Limite Total"><input type="number" min={0} value={x.limiteTotal || ""} onChange={(e) => set("limiteTotal", Number(e.target.value))} placeholder="Ilimitado" /></Campo>
          <Campo rotulo="Das (horário)"><input type="time" value={x.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} /></Campo>
          <Campo rotulo="Até (horário)"><input type="time" value={x.horaFim} onChange={(e) => set("horaFim", e.target.value)} /></Campo>
        </div>
        <fieldset><legend>Dias da semana (vazio = todos)</legend><div className="dm-radios">{DIAS.map((n, i) => <label key={n} className="dm-check"><input type="checkbox" checked={x.dias.includes(i)} onChange={(e) => set("dias", e.target.checked ? [...x.dias, i] : x.dias.filter((d: number) => d !== i))} /> {n.slice(0, 3)}</label>)}</div></fieldset>
        <Interruptor valor={x.ativo} onChange={(v) => set("ativo", v)} rotulo="Desconto ativo" />
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>Salvar Desconto</button></div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Regras de Despacho

const METODOS: Array<[string, string, string, string]> = [
  ["primeiro_aceitar", "Rodada Padrão", "Toca para todos os motoristas do grupo (Ex: Prioritários) ao mesmo tempo. Quem aceitar primeiro, leva a corrida.", "Mais Rápido"],
  ["mais_proximo", "Proximidade", "O sistema elege o motorista fisicamente mais perto. Só ele recebe o toque. Se recusar, vai para o 2º mais perto.", "Menor Espera"],
  ["fila_virtual", "Fila Virtual (FIFO)", "Organiza por ordem de chegada. Quem está esperando há mais tempo recebe primeiro. Ideal para rodoviárias.", "Mais Justo"],
];

export function RegrasDespacho() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/despacho"), []);
  const [r, setR] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setR(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!r) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setR({ ...r, [k]: v });
  const n = (k: string, rotulo: string, un?: string, dica?: string) => <Campo rotulo={rotulo} dica={dica}><span className="dm-linha"><input type="number" min={0} disabled={!admin} value={r[k]} onChange={(e) => set(k, Number(e.target.value))} />{un && <small>{un}</small>}</span></Campo>;
  const salvarTudo = () => salvar(async () => setR(await pedirConfig("/despacho", "PUT", r)), "Regras de despacho salvas.");
  return (
    <>
      <Cab titulo="Central de Despacho" sub="Configuração de distribuição">{admin && <button className="botao primario" disabled={salvando} onClick={salvarTudo}>Salvar</button>}</Cab>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao"><h3>Estratégia de Distribuição</h3>
        <div className="dm-metodos" role="radiogroup">{METODOS.map(([id, nome, desc, selo]) => (
          <button key={id} type="button" role="radio" aria-checked={r.metodo === id} disabled={!admin} className={`dm-metodo ${r.metodo === id ? "ativo" : ""}`} onClick={() => set("metodo", id)}><h4>{nome}</h4><p>{desc}</p><span className="selo ok">{selo}</span></button>
        ))}</div></section>
      <section className="dm-cartao"><h3>Parâmetros de Busca</h3><p className="sub">Alcance, Tempo e Motor de Disparo</p>
        <div className="dm-grade3">
          {n("raioMetros", "Raio Inicial (Metros)", "m", "É a distância máxima ao redor do passageiro. Recomendado: 5000 (5km).")}
          {n("tempoTela", "Tempo na Tela (Seg)", "s", "Tempo que a corrida toca para o motorista decidir. Recomendado: 15 a 20 segundos.")}
          {n("limiteMotoristas", "Limite Motoristas (A Mágica)", undefined, "Define como a corrida será distribuída (veja o guia abaixo).")}
        </div>
        <h4>Entenda o impacto do "Limite Motoristas"</h4>
        <div className="dm-duplo">
          <div className="dm-guia"><strong>Limite: 1 a 2 · TOQUE PROXIMIDADE</strong><p>O sistema localiza o motorista fisicamente mais próximo e envia a corrida exclusiva para ele. Se ele recusar (ou o tempo acabar), a corrida pula para o 2º mais perto, e assim por diante. <em>Vantagem:</em> valoriza quem está perto, evita deslocamentos longos e zera a frustração.</p></div>
          <div className="dm-guia"><strong>Limite: 10 a 30 · TOCAR PRA TODOS (Geral)</strong><p>O sistema notifica dezenas de motoristas ao mesmo tempo, ignorando quem está mais perto. É a lei do "dedo mais rápido". <em>Desvantagem:</em> pode gerar muita frustração na base, pois a maioria recebe o aviso de que outro motorista já aceitou.</p></div>
        </div>
      </section>
      <section className="dm-cartao"><h3>Funil de Prioridade (Ciclos)</h3>
        <div className="dm-grade3">
          <div><small>Ciclo 1</small><h4>Motoristas Prioritários</h4><p className="sub">Primeiro grupo a receber o chamado (Ex: Melhores avaliados).</p>{n("prioritarios", "Quantidade")}</div>
          <div><small>Ciclo 2</small><h4>Motoristas Secundários</h4><p className="sub">Segundo grupo, caso ninguém do primeiro aceite a corrida.</p>{n("secundarios", "Quantidade")}</div>
          <div><small>Ciclo 3</small><h4>Reserva (Todos)</h4><p className="sub">Última tentativa, expandindo para todos os motoristas disponíveis.</p>{n("reserva", "Quantidade")}</div>
        </div></section>
      <section className="dm-cartao"><h3>Regras de Fila e Pendência</h3>
        <div className="dm-grade4">
          {n("maxTentativas", "Máx. Tentativas", undefined, "Antes de ir para pendência.")}
          {n("tempoPendencia", "Tempo em Pendência (Min)")}
          <Campo rotulo="Notificar Grupo"><select disabled={!admin} value={r.notificarGrupo} onChange={(e) => set("notificarGrupo", e.target.value)}><option value="prioritario">Apenas Prioritários</option><option value="todos">Todos os Motoristas</option></select></Campo>
          {n("distanciaProxima", "Dist. Aceitar Próxima (m)", undefined, "Para pegar corrida em viagem.")}
        </div>
        <Interruptor valor={r.permitirProxima} onChange={(v) => set("permitirProxima", v)} rotulo="Permitir aceitar próxima corrida?" descricao="Motorista em viagem pode aceitar outra se estiver perto do destino final." desabilitado={!admin} />
        <Interruptor valor={r.permitirTransbordo} onChange={(v) => set("permitirTransbordo", v)} rotulo="Permitir transbordo (motorista de outra cidade)" descricao="Se desligado, só motoristas da cidade da categoria recebem a corrida." desabilitado={!admin} />
      </section>
      {admin && <div className="dm-barra-salvar"><span>Alterações pendentes...</span><button className="botao primario" disabled={salvando} onClick={salvarTudo}>Salvar</button></div>}
    </>
  );
}

// ------------------------------------------------------------------ Transbordos

export function Transbordos() {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ inicio: hoje.slice(0, 8) + "01", fim: hoje, cidade: "" });
  const [ap, setAp] = useState(f);
  const d = useCarregar(() => pedirConfig(`/transbordos?inicio=${ap.inicio}&fim=${ap.fim}&cidade=${encodeURIComponent(ap.cidade)}`), [ap]);
  const itens: any[] = d.dados?.itens ?? [];
  return (
    <>
      <Cab titulo="Transbordos" sub="Corridas fora da base" />
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setAp(f); }}>
        <Campo rotulo="Período"><span className="dm-linha"><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} aria-label="Data inicial" /><input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} aria-label="Data final" /></span></Campo>
        <Campo rotulo="Cidade Motorista"><input value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} placeholder="Todas" /></Campo>
        <button className="botao primario">Filtrar</button>
      </form>
      <Aviso erro={d.erro} />
      {!d.dados ? <Carregando /> : !itens.length ? <div className="dm-cartao dm-vazio-pequeno"><h3>Sem Transbordos</h3><p>Nenhuma corrida foi realizada fora da cidade de origem do motorista neste período.</p></div> : (
        <div className="dm-cartao tabela-rola"><table><thead><tr><th>OS</th><th>Data</th><th>Motorista</th><th>Cidade do motorista</th><th>Cidade da corrida</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>
          {itens.map((i) => <tr key={i.os}><td>{i.os}</td><td>{new Date(i.em).toLocaleString("pt-BR", { timeZone: "UTC" })}</td><td className="forte">{i.motorista}</td><td>{i.cidadeMotorista}</td><td>{i.cidadeCorrida}</td><td>{i.categoria}</td><td className="num">{dinheiro(i.valor)}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}

export { Abas };
