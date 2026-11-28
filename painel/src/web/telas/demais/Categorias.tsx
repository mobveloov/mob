// Config › Categorias (Tarifas e categorias): lista, filtros e a janela de 4 passos (Básico, Tarifas & Negociação, Dinâmica, Comissão).

import { useRef, useState } from "react";
import { ArrowUpDown, Copy, GripVertical, MoreVertical, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { valorDinamica } from "./Dinamica";
import { DetalhesTarifas, JanelaTarifa } from "./EditarTarifa";
import { Aviso, Cab, Campo, Carregando, Interruptor, Modal, dinheiro, pedirConfig, useGestor, useCarregar, useSalvar } from "./comum";

const passos = [["basico", "Categoria"], ["avancado", "Mais opções"], ["tarifas", "Tarifas & Negociação"], ["dinamica", "Dinâmica"], ["comissao", "Comissão"]] as const;
const ICONES: Array<[string, string]> = [["moto", "Moto"], ["taxi", "Táxi"], ["mulher", "Mulher"], ["carro-premium", "Premium"], ["carro-popular", "Comum"], ["entregas", "Entregas"], ["pcd", "PcD"], ["diversos", "Diversos"]];

/** Opção com título, explicação e chave, como nas "Outras configurações" da Machine. */
function Opcao({ titulo, desc, rotulo, valor, onChange, ligado, desligado }: { titulo: string; desc?: string; rotulo?: string; valor: boolean; onChange: (v: boolean) => void; ligado: string; desligado: string }) {
  return <div className="dm-opcao"><h4>{titulo}</h4>{desc && <p className="sub">{desc}</p>}<div className="dm-opcao-chave"><Interruptor valor={valor} onChange={onChange} rotulo={rotulo ?? titulo} /> <span>{valor ? ligado : desligado}</span></div></div>;
}
type Passo = (typeof passos)[number][0];
const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));

const VAZIA = {
  id: "", nome: "", descricao: "", vinculo: { modo: "nenhum", deCategoriaId: "" }, taxaBase: 0, precoKm: 0, precoMin: 0, tarifaMinima: 0, taxaCancelamento: null as number | null, comissaoTipo: "Percentual", comissaoValor: 0,
  extra: {
    cidade: "", visivel: true, tipoFisico: "carro", grupo: "Carro", ordem: 1, capacidade: 4, raio: 5000, icone: { modo: "biblioteca", biblioteca: "carro-popular", imagem: "" },
    negociacao: { ativo: false, descontoMaxPax: 20, acrescimoMaxMot: 50 }, modoPrecoKm: "padrao", faixasKm: [] as any[], kmIncluso: 0, tempoToque: 30, paradas: { tipo: "fixo", valor: 0 },
    deslocamento: { ativo: false, minKm: 0, tipo: "fixo", valor: 0, teto: 0, junto: true }, compensacao: { ativo: false, faixas: [] as any[] },
    mostrarGanhoKm: false, permiteAgendamento: true, dinamicas: [] as string[],
    detalhes: "", ocultarCapacidade: false, macaneta: true, dinamicaAtiva: true, impulsionamentoAuto: false, valorExtraPassageiro: false, segurancaMulheres: false, solicitacoes: "ambas", comissao: { usaFaixas: false, regras: [] as string[] },
  },
};

export function Categorias() {
  const admin = useGestor();
  const d = useCarregar(() => pedirConfig("/categorias"), []);
  const [cidade, setCidade] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [reordenar, setReordenar] = useState(false);
  const [dup, setDup] = useState<{ cat: any; nome: string; comMotoristas: boolean } | null>(null);
  const [abertas, setAbertas] = useState<string[]>([]);
  const [tarifa, setTarifa] = useState<{ cat: any; extra: any } | null>(null);
  const arrastando = useRef<string | null>(null);
  const { msg, salvar, setMsg } = useSalvar();
  const todas: any[] = d.dados?.categorias ?? [];
  const cidades = [...new Set(todas.map((c) => c.extra.cidade).filter(Boolean))] as string[];
  const lista = todas.filter((c) => (!cidade || c.extra.cidade === cidade));
  const mover = async (alvoId: string) => {
    const de = arrastando.current;
    if (!de || de === alvoId) return;
    const ordem = [...todas.map((c) => c.id)];
    ordem.splice(ordem.indexOf(alvoId), 0, ordem.splice(ordem.indexOf(de), 1)[0]);
    await salvar(async () => { for (const [i, id] of ordem.entries()) { const c = todas.find((x) => x.id === id); if (c.extra.ordem !== i + 1) await pedirConfig(`/categorias/${id}`, "PUT", { ...c, extra: { ...c.extra, ordem: i + 1 } }); } d.recarregar(); }, "Ordem salva.");
  };
  return (
    <>
      <Cab titulo="Tarifas e categorias">
        {admin && <button className="botao" aria-pressed={reordenar} onClick={() => setReordenar(!reordenar)}><ArrowUpDown size={14} /> Reordenar categorias</button>}
        {admin && <button className="botao primario" onClick={() => { const n = structuredClone(VAZIA); n.extra.ordem = todas.length + 1; n.extra.ocultarCapacidade = true; setEdit(n); }}><Plus size={14} /> Criar categoria</button>}
      </Cab>
      {cidades.length > 1 && <div className="dm-cartao dm-filtros"><Campo rotulo="Cidade"><select value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Todas as cidades</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo></div>}
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {!d.dados ? <Carregando /> : !lista.length ? <p className="vazio">Nenhuma categoria cadastrada.</p> : (
        <div className="dm-cat-lista">
          {lista.map((c, i) => (
            <article key={c.id} className="dm-cat-linha" draggable={reordenar && admin} onDragStart={() => { arrastando.current = c.id; }} onDragOver={(e) => reordenar && e.preventDefault()} onDrop={() => void mover(c.id)}>
              <div className="dm-cat-topo">
                <span className="dm-cat-num">{reordenar ? <GripVertical size={16} aria-hidden /> : i + 1}</span>
                <div className="dm-cat-nome">
                  {c.extra.visivel && <small className="dm-cat-app"><Smartphone size={12} aria-hidden /> Disponível no aplicativo</small>}
                  <strong>{c.nome}</strong>
                  <span>{c.descricao || "—"}</span>
                </div>
                {admin && (
                  <details className="dm-menu-pontos">
                    <summary aria-label={`Mais opções de ${c.nome}`}><MoreVertical size={16} /></summary>
                    <div className="dm-menu-pontos-lista">
                      <button onClick={() => setEdit(structuredClone(c))}><Pencil size={14} /> Configurações</button>
                      <button onClick={() => setDup({ cat: c, nome: "", comMotoristas: false })}><Copy size={14} /> Duplicar</button>
                      <button onClick={async () => { if (confirm(`Remover a categoria "${c.nome}"?`)) { await salvar(async () => { await pedirConfig(`/categorias/${c.id}`, "DELETE"); d.recarregar(); }, "Categoria removida."); } }}><Trash2 size={14} /> Excluir categoria</button>
                    </div>
                  </details>
                )}
                <button className="botao" aria-expanded={abertas.includes(c.id)} onClick={() => setAbertas(abertas.includes(c.id) ? abertas.filter((x) => x !== c.id) : [...abertas, c.id])}>Tarifa {abertas.includes(c.id) ? "▴" : "▾"}</button>
              </div>
              {abertas.includes(c.id) && <DetalhesTarifas cat={c} admin={admin} onEditar={(e) => setTarifa({ cat: c, extra: e })} onExtra={() => setTarifa({ cat: c, extra: "nova" })}
                onRemover={async (e) => { if (confirm(`Remover a tarifa extra "${e.nome}"?`)) await salvar(async () => { await pedirConfig(`/categorias/${c.id}/tarifas-extras/${e.id}`, "DELETE"); d.recarregar(); }, "Tarifa extra removida."); }}
                onAtivar={(e, v) => salvar(async () => { await pedirConfig(`/categorias/${c.id}/tarifas-extras/${e.id}`, "PUT", { ...e, ativa: v }); d.recarregar(); }, v ? "Tarifa extra ligada." : "Tarifa extra desligada.")} />}
            </article>
          ))}
        </div>
      )}
      {dup && (
        <Modal aberto onFechar={() => setDup(null)} titulo="Duplicar categoria" sub={`Cópia de ${dup.cat.nome}`}>
          <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); await salvar(async () => { await pedirConfig(`/categorias/${dup.cat.id}/duplicar`, "POST", { nome: dup.nome, comMotoristas: dup.comMotoristas }); setDup(null); d.recarregar(); }, "Categoria duplicada."); }}>
            <Campo rotulo="Nome da nova categoria *"><input value={dup.nome} maxLength={21} required onChange={(e) => setDup({ ...dup, nome: e.target.value })} /></Campo>
            <label className="dm-check"><input type="checkbox" checked={dup.comMotoristas} onChange={(e) => setDup({ ...dup, comMotoristas: e.target.checked })} /> Copiar também os motoristas vinculados</label>
            <p className="sub">As tarifas (padrão e extras) e as configurações são copiadas.</p>
            <div className="dm-rodape-modal"><button type="button" className="botao" onClick={() => setDup(null)}>Voltar</button><button className="botao primario">Duplicar</button></div>
          </form>
        </Modal>
      )}
      {tarifa && <JanelaTarifa cat={tarifa.cat} extra={tarifa.extra} onFechar={() => setTarifa(null)} onSalvo={() => { setTarifa(null); d.recarregar(); setMsg({ ok: tarifa.extra === "nova" ? "Tarifa extra gravada." : "Tarifa gravada." }); }} />}
      {edit && <JanelaCategoria inicial={edit} automacoes={d.dados?.automacoes ?? []} outras={todas} dinamicas={d.dados?.dinamicas ?? []} regras={d.dados?.regras ?? []} icones={d.dados?.icones ?? []} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); d.recarregar(); setMsg({ ok: "Categoria gravada." }); }} />}
    </>
  );
}

function JanelaCategoria({ inicial, outras, automacoes, dinamicas, regras, icones, onFechar, onSalvo }: { inicial: any; outras: any[]; automacoes: any[]; dinamicas: any[]; regras: any[]; icones: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [c, setC] = useState<any>(inicial);
  const [passo, setPasso] = useState<Passo>("basico");
  const { msg, salvando, salvar } = useSalvar();
  const ex = c.extra;
  const set = (k: string, v: unknown) => setC({ ...c, [k]: v });
  const setEx = (k: string, v: unknown) => setC({ ...c, extra: { ...ex, [k]: v } });
  const sub = (grupo: string, k: string, v: unknown) => setEx(grupo, { ...ex[grupo], [k]: v });
  const alternar = (campo: "dinamicas", id: string) => setEx(campo, ex[campo].includes(id) ? ex[campo].filter((x: string) => x !== id) : [...ex[campo], id]);
  const enviar = async () => {
    if (!c.nome.trim() || c.nome.trim().length < 2) { setPasso("basico"); alert("Informe o nome da categoria."); return; }
    if (!c.id && c.vinculo?.modo === "copiar" && !c.vinculo.deCategoriaId) { setPasso("basico"); alert("Escolha a categoria de onde copiar os motoristas."); return; }
    const r = await salvar(() => pedirConfig(c.id ? `/categorias/${c.id}` : "/categorias", c.id ? "PUT" : "POST", c));
    if (r) onSalvo();
  };
  const lerPng = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "image/png" || f.size > 150_000) { alert("Envie um PNG de até 150 KB, com fundo transparente e 360x360 pixels."); return; }
    const l = new FileReader();
    l.onload = () => setEx("icone", { ...ex.icone, modo: "personalizado", imagem: String(l.result) });
    l.readAsDataURL(f);
  };
  const grupoDin = (tipo: string, titulo: string) => {
    const l = dinamicas.filter((r) => r.tipo === tipo);
    return <div><h4>{titulo}</h4>{!l.length ? <p className="sub">Nenhuma regra criada.</p> : l.map((r) => <label key={r.id} className="dm-check"><input type="checkbox" checked={ex.dinamicas.includes(r.id)} onChange={() => alternar("dinamicas", r.id)} /> {r.nome} <small>{r.cobranca === "percentual" ? `${r.valor}%` : dinheiro(r.valor)}</small></label>)}</div>;
  };
  return (
    <Modal cheia aberto onFechar={onFechar} titulo={c.id ? "Editar categoria" : "Criar categoria"} sub="Categorias" larga>
      <div className="dm-abas" role="tablist">{passos.map(([p, n]) => <button key={p} role="tab" aria-selected={passo === p} className={passo === p ? "ativo" : ""} onClick={() => setPasso(p)}>{n}</button>)}</div>
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        {passo === "basico" && (
          <>
            <h3>Personalizar</h3>
            <p className="sub">Defina nome e descrição para a categoria. Os detalhes adicionais estão disponíveis apenas a partir da versão 16.0 no Android e 14.0 no iOS.</p>
            <div className="dm-duplo">
              <Campo rotulo="Nome *"><input value={c.nome} onChange={(e) => set("nome", e.target.value)} required maxLength={21} /></Campo>
              <Campo rotulo="Descrição *"><input value={c.descricao} onChange={(e) => set("descricao", e.target.value)} required maxLength={32} /></Campo>
            </div>
            <Campo rotulo="Detalhes adicionais" dica={`${ex.detalhes.length}/140`}><textarea value={ex.detalhes} maxLength={140} rows={2} onChange={(e) => setEx("detalhes", e.target.value)} /></Campo>
            <Campo rotulo="Ordem da categoria" dica="Defina a ordem da categoria."><select value={ex.ordem} onChange={(e) => setEx("ordem", Number(e.target.value))}>{Array.from({ length: Math.max(outras.length + (c.id ? 0 : 1), ex.ordem, 1) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></Campo>
            <Campo rotulo="Ícone da categoria" dica="Defina um ícone para representar essa categoria. As cores mudam de acordo com a cor utilizada no aplicativo.">
              <select value={ex.icone.modo === "personalizado" ? "personalizado" : ex.icone.biblioteca} onChange={(e) => { const v = e.target.value; setEx("icone", v === "personalizado" ? { ...ex.icone, modo: "personalizado" } : { ...ex.icone, modo: "biblioteca", biblioteca: v }); }}>
                {!ICONES.some(([k]) => k === ex.icone.biblioteca) && ex.icone.modo !== "personalizado" && <option value={ex.icone.biblioteca}>Selecione</option>}
                {ICONES.filter(([k]) => icones.includes(k) || k === ex.icone.biblioteca).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                <option value="personalizado">Personalizado</option>
              </select>
            </Campo>
            {ex.icone.modo === "personalizado" && <div>{ex.icone.imagem && <img src={ex.icone.imagem} alt="Prévia do ícone" width={80} height={80} />}<label className="botao">Adicionar PNG<input type="file" hidden accept="image/png" onChange={(e) => lerPng(e.target.files?.[0])} /></label><p className="sub"><strong>Atenção:</strong> a imagem deve ter fundo transparente e tamanho exato de 360x360 pixels.</p></div>}
            <Campo rotulo="Capacidade de pessoas no veículo" dica="Defina a quantidade máxima de pessoas no veículo para essa categoria."><input type="number" min={1} max={99} disabled={ex.ocultarCapacidade} value={ex.capacidade} onChange={(e) => setEx("capacidade", Number(e.target.value))} /></Campo>
            <label className="dm-check"><input type="checkbox" checked={ex.ocultarCapacidade} onChange={(e) => setEx("ocultarCapacidade", e.target.checked)} /> Não exibir capacidade de pessoas</label>
            <h3>Outras configurações</h3>
            <Opcao titulo="Exibir categoria" desc="Exibir categoria no aplicativo passageiro" valor={ex.visivel} onChange={(v) => setEx("visivel", v)} ligado="Categoria exibida no aplicativo" desligado="Categoria oculta no aplicativo" />
            <Opcao titulo="Maçaneta" desc="Permitir que o motorista abra corridas maçaneta nessa categoria." valor={ex.macaneta} onChange={(v) => setEx("macaneta", v)} ligado="Ativado" desligado="Desativado" />
            <Opcao titulo="Tarifas dinâmicas" desc="Utilizar tarifas dinâmicas nessa categoria" valor={ex.dinamicaAtiva} onChange={(v) => setEx("dinamicaAtiva", v)} ligado="Dinâmica ativada" desligado="Dinâmica desativada" />
            <Opcao titulo="Impulsionamento automático do valor da corrida" desc="Quando a distância entre o passageiro e os motoristas disponíveis indicar baixa chance de aceite, o valor da corrida nessa categoria é aumentado automaticamente para aumentar as chances de a corrida ser aceita." rotulo="Impulsionar automaticamente o valor quando houver baixa chance de aceite" valor={ex.impulsionamentoAuto} onChange={(v) => setEx("impulsionamentoAuto", v)} ligado="Ativado" desligado="Desativado" />
            <Opcao titulo="Valor extra adicionado pelo passageiro" desc="Essa configuração só será aplicada se a categoria permitir solicitações imediatas. Configuração disponível apenas a partir da versão 23.13 no app passageiro." rotulo="Permitir que o passageiro adicione um valor extra na corrida para aumentar as chances de ser atendido" valor={ex.valorExtraPassageiro} onChange={(v) => setEx("valorExtraPassageiro", v)} ligado="Ativado" desligado="Desativado" />
            <Opcao titulo="Segurança para mulheres" desc="Essa restrição só será aplicada se o gênero foi informado no cadastro. Configuração disponível apenas a partir da versão 16.7 no Android e 14.6 no iOS." rotulo="Exibir apenas para passageiras mulheres" valor={ex.segurancaMulheres} onChange={(v) => setEx("segurancaMulheres", v)} ligado="Exibir apenas para passageiras mulheres" desligado="Categoria exibida para todos" />
            <Opcao titulo="Negocia" desc="Essa configuração só será aplicada se a categoria permitir solicitações imediatas. Configuração disponível apenas a partir da versão 28.4 no app passageiro." rotulo="Permitir que o passageiro negocie o preço da corrida" valor={ex.negociacao.ativo} onChange={(v) => sub("negociacao", "ativo", v)} ligado="Ativado" desligado="Desativado" />
            <fieldset><legend>Preferências de solicitação da categoria</legend>
              <div className="dm-radios dm-radios-col">
                {([["ambas", "Permitir solicitações imediatas e agendamentos", "Permite que as solicitações para esta categoria sejam imediatas ou agendadas no aplicativo passageiro."], ["imediatas", "Permitir apenas solicitações imediatas", "Permite que as solicitações para esta categoria sejam apenas imediatas no aplicativo passageiro."], ["agendadas", "Permitir apenas agendamentos", "Permite que as solicitações para esta categoria sejam apenas agendadas no aplicativo passageiro."]] as const).map(([v, t, d]) => <label key={v}><input type="radio" name="solicitacoes" checked={ex.solicitacoes === v} onChange={() => setEx("solicitacoes", v)} /> <span><strong>{t}</strong><small className="bloco">{d}</small></span></label>)}
              </div></fieldset>
            {!c.id && (
              <>
              <h3>Gestão</h3>
              <fieldset><legend>Vinculação de motoristas</legend>
                <div className="dm-radios dm-radios-col">
                  {([["nenhum", "Não vincular agora", "A categoria será criada sem motoristas. O vínculo pode ser feito manualmente depois."], ["todos", "Vincular todos os motoristas", "Todos os motoristas da operação passarão a atender esta categoria, incluindo os inativos e bloqueados."], ["copiar", "Copiar motoristas de outra categoria", "Copia a lista de motoristas de uma categoria existente. Eles atenderão ambas as categorias."]] as const).map(([v, t, d]) => <label key={v}><input type="radio" name="vinculo" checked={c.vinculo?.modo === v} onChange={() => set("vinculo", { ...c.vinculo, modo: v })} /> <span><strong>{t}</strong><small className="bloco">{d}</small></span></label>)}
                </div>
                {c.vinculo?.modo === "copiar" && <select aria-label="Categoria de origem" value={c.vinculo.deCategoriaId} onChange={(e) => set("vinculo", { ...c.vinculo, deCategoriaId: e.target.value })}><option value="">Escolha a categoria</option>{outras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select>}
              </fieldset>
              </>
            )}
          </>
        )}
        {passo === "avancado" && (
          <>
            <p className="sub">Opções extras de categoria do painel.</p>
            <div className="dm-grade3">
              <Campo rotulo="Cidade" dica="Cidade onde esta categoria irá operar."><input value={ex.cidade} onChange={(e) => setEx("cidade", e.target.value)} maxLength={80} /></Campo>
              <Campo rotulo="Tipo Físico" dica="Ícone do veículo animado no mapa."><select value={ex.tipoFisico} onChange={(e) => setEx("tipoFisico", e.target.value)}><option value="carro">Carro (4 Rodas)</option><option value="moto">Moto (2 Rodas)</option><option value="caminhao">Caminhão / Frete</option></select></Campo>
              <Campo rotulo="Grupo (Aba no App)" dica="Agrupamento nas abas do app passageiro."><select value={ex.grupo} onChange={(e) => setEx("grupo", e.target.value)}><option value="Carro">Grupo: Carros</option><option value="Moto">Grupo: Motos</option></select></Campo>
              <Campo rotulo="Raio Busca (m)" dica="Distância para encontrar motoristas."><input type="number" min={100} value={ex.raio} onChange={(e) => setEx("raio", Number(e.target.value))} /></Campo>
            </div>
          </>
        )}
        {passo === "tarifas" && (
          <>
            <h3>Negociação (Leilão)</h3>
            <Interruptor valor={ex.negociacao.ativo} onChange={(v) => sub("negociacao", "ativo", v)} rotulo="Habilitar negociação" descricao="Habilita a tela onde motorista e passageiro negociam a tarifa final." />
            {ex.negociacao.ativo && <div className="dm-duplo"><Campo rotulo="Desconto Máx. Passageiro (%)"><input type="number" min={0} max={100} value={ex.negociacao.descontoMaxPax} onChange={(e) => sub("negociacao", "descontoMaxPax", Number(e.target.value))} /></Campo><Campo rotulo="Acréscimo Máx. Motorista (%)"><input type="number" min={0} value={ex.negociacao.acrescimoMaxMot} onChange={(e) => sub("negociacao", "acrescimoMaxMot", Number(e.target.value))} /></Campo></div>}
            <h3>Estrutura de Preço</h3>
            <p className="sub">Valores iniciais da tarifa. O método de cálculo (tabela de KM, bairro, hora parada) e as tarifas extras ficam em <strong>Tarifa › Editar tarifa</strong>, na lista de categorias.</p>
            <Campo rotulo="Taxa Base"><input inputMode="decimal" value={txt(c.taxaBase)} placeholder="0.00" onChange={(e) => set("taxaBase", num(e.target.value))} /></Campo>
              <div className="dm-grade3"><Campo rotulo="Preço KM (R$)"><input inputMode="decimal" value={txt(c.precoKm)} placeholder="0.00" onChange={(e) => set("precoKm", num(e.target.value))} /></Campo><Campo rotulo="Preço Min."><input inputMode="decimal" value={txt(c.precoMin)} placeholder="0.00" onChange={(e) => set("precoMin", num(e.target.value))} /></Campo><Campo rotulo="Tarifa Mínima"><input inputMode="decimal" value={txt(c.tarifaMinima)} placeholder="0.00" onChange={(e) => set("tarifaMinima", num(e.target.value))} /></Campo></div>
            <h3>Taxas e Regras Extras</h3>
            <div className="dm-grade3">
              <Campo rotulo="Taxa Cancelamento"><input inputMode="decimal" value={txt(c.taxaCancelamento)} placeholder="0.00" onChange={(e) => set("taxaCancelamento", e.target.value === "" ? null : num(e.target.value))} /></Campo>
              <Campo rotulo="KM Incluso (Livre)"><input inputMode="decimal" value={txt(ex.kmIncluso)} placeholder="0.00" onChange={(e) => setEx("kmIncluso", num(e.target.value))} /></Campo>
              <Campo rotulo="Tempo de Toque (s)"><input type="number" min={5} value={ex.tempoToque} onChange={(e) => setEx("tempoToque", Number(e.target.value))} /></Campo>
            </div>
            <fieldset><legend>Cobrança de Paradas no Trajeto</legend><div className="dm-radios"><label><input type="radio" name="par" checked={ex.paradas.tipo === "fixo"} onChange={() => sub("paradas", "tipo", "fixo")} /> Fixo</label><label><input type="radio" name="par" checked={ex.paradas.tipo === "rota_total"} onChange={() => sub("paradas", "tipo", "rota_total")} /> Recalcular Rota Total</label></div>
              {ex.paradas.tipo === "fixo" && <input inputMode="decimal" aria-label="Valor por parada" placeholder="Valor R$ (Se Fixo)" value={txt(ex.paradas.valor)} onChange={(e) => sub("paradas", "valor", num(e.target.value))} />}</fieldset>
            <h3>Bônus de Deslocamento</h3>
            <Interruptor valor={ex.deslocamento.ativo} onChange={(v) => sub("deslocamento", "ativo", v)} rotulo="Pagar motorista pela distância até o passageiro" />
            {ex.deslocamento.ativo && (
              <>
                <div className="dm-grade4"><Campo rotulo="A partir de (KM)"><input type="number" min={0} value={ex.deslocamento.minKm} onChange={(e) => sub("deslocamento", "minKm", Number(e.target.value))} /></Campo>
                  <Campo rotulo="Tipo de Bônus"><select value={ex.deslocamento.tipo} onChange={(e) => sub("deslocamento", "tipo", e.target.value)}><option value="fixo">Valor Fixo (R$)</option><option value="por_km">Por KM Rodado (R$)</option></select></Campo>
                  <Campo rotulo="Valor Pago (R$)"><input inputMode="decimal" value={txt(ex.deslocamento.valor)} placeholder="0,00" onChange={(e) => sub("deslocamento", "valor", num(e.target.value))} /></Campo>
                  <Campo rotulo="Teto Máx. (R$)"><input inputMode="decimal" value={txt(ex.deslocamento.teto)} placeholder="0,00" onChange={(e) => sub("deslocamento", "teto", num(e.target.value))} /></Campo></div>
                <fieldset><legend>Juntar no Preço da Corrida?</legend><p className="sub">Se "Não", mostra uma Tag Verde separada para o motorista.</p><div className="dm-radios"><label><input type="radio" name="junto" checked={ex.deslocamento.junto} onChange={() => sub("deslocamento", "junto", true)} /> Sim</label><label><input type="radio" name="junto" checked={!ex.deslocamento.junto} onChange={() => sub("deslocamento", "junto", false)} /> Não, Tag Separada</label></div></fieldset>
              </>
            )}
            <h3>Bônus Compensação de Corrida</h3>
            <Interruptor valor={ex.compensacao.ativo} onChange={(v) => sub("compensacao", "ativo", v)} rotulo="Completa o ganho do motorista até um valor mínimo estipulado" />
            {ex.compensacao.ativo && (
              <div>
                {ex.compensacao.faixas.map((f: any, i: number) => (
                  <div key={i} className="dm-grade4">
                    {(["de", "ate", "valor"] as const).map((k) => <Campo key={k} rotulo={k === "de" ? "De (R$)" : k === "ate" ? "Até (R$)" : "Valor"}><input inputMode="decimal" value={txt(f[k])} onChange={(e) => sub("compensacao", "faixas", ex.compensacao.faixas.map((x: any, j: number) => (j === i ? { ...x, [k]: num(e.target.value) } : x)))} /></Campo>)}
                    <Campo rotulo="Modo"><select value={f.modo} onChange={(e) => sub("compensacao", "faixas", ex.compensacao.faixas.map((x: any, j: number) => (j === i ? { ...x, modo: e.target.value } : x)))}><option value="diferenca">Diferença (Alvo)</option><option value="fixo">Fixo (Extra)</option></select></Campo>
                  </div>
                ))}
                <button type="button" className="botao" onClick={() => sub("compensacao", "faixas", [...ex.compensacao.faixas, { de: 0, ate: 10, modo: "diferenca", valor: 10 }])}>Adicionar Faixa de Bônus</button>
                <p className="sub"><strong>Como Funciona:</strong> crie faixas baseadas no ganho real da corrida para o motorista. <strong>Diferença (Alvo):</strong> o sistema paga o que faltar para atingir o valor definido (faixa 5 a 10, alvo 10: ganhou R$ 7, paga + R$ 3). <strong>Fixo (Extra):</strong> soma um valor fixo, independente de quanto faltava.</p>
              </div>
            )}
            <Interruptor valor={ex.mostrarGanhoKm} onChange={(v) => setEx("mostrarGanhoKm", v)} rotulo="Transparência: Ganho por KM" descricao="Mostrar na tela de chamada o valor exato que o motorista ganha por KM?" />
            
          </>
        )}
        {passo === "dinamica" && (
          <>
            <h3>Preço Dinâmico Multi-Fatores</h3>
            <p className="sub">Você pode misturar regras de horário, mapa geolocalizado e alta demanda simultaneamente. Se não houver regras listadas, crie-as no menu Tarifas Dinâmicas.</p>
            {grupoDin("horario", "Por Horário Fixo")}{grupoDin("mapa", "Por Polígono (Mapa)")}{grupoDin("demanda", "Alta Demanda Auto")}
            <div><h4>Áreas automáticas (Automações)</h4>{!automacoes.length ? <p className="sub">Nenhuma automação criada. Crie em Tarifas dinâmicas › Automações.</p> : automacoes.map((a) => <label key={a.id} className="dm-check"><input type="checkbox" checked={ex.dinamicas.includes(a.id)} onChange={() => alternar("dinamicas", a.id)} /> {a.nome} <small>{valorDinamica(a)} · {a.minPedidos} pedidos em {a.janelaMin} min</small></label>)}</div>
          </>
        )}
        {passo === "comissao" && (
          <>
            <h3>Comissão da central</h3>
            <fieldset><legend>Regras por Faixa</legend><p className="sub">Usar faixas de cobrança baseadas no valor final da corrida?</p>
              <div className="dm-radios"><label><input type="radio" name="faixa" checked={ex.comissao.usaFaixas} onChange={() => sub("comissao", "usaFaixas", true)} /> Sim, Usar Faixas</label><label><input type="radio" name="faixa" checked={!ex.comissao.usaFaixas} onChange={() => sub("comissao", "usaFaixas", false)} /> Não, Cobrança Fixa</label></div></fieldset>
            {!ex.comissao.usaFaixas ? (
              <div className="dm-duplo">
                <Campo rotulo="Tipo Comissão" dica="Como a taxa será cobrada do motorista."><select value={c.comissaoTipo} onChange={(e) => set("comissaoTipo", e.target.value)}><option value="Percentual">Percentual (%)</option><option value="Valor fixo">Valor fixo (R$)</option></select></Campo>
                <Campo rotulo="Comissão da central (valor)" dica="Valor fixo ou porcentagem padrão. Nunca passa do valor da corrida."><input inputMode="decimal" value={txt(c.comissaoValor)} placeholder="0.00" onChange={(e) => set("comissaoValor", num(e.target.value))} /></Campo>
              </div>
            ) : (
              <div><h4>Selecione as Regras Ativas:</h4>{!regras.length ? <p className="sub">Nenhuma regra criada. Crie em Regras de Crédito.</p> : regras.map((r) => <label key={r.id} className="dm-check"><input type="checkbox" checked={ex.comissao.regras.includes(r.id)} onChange={() => sub("comissao", "regras", ex.comissao.regras.includes(r.id) ? ex.comissao.regras.filter((x: string) => x !== r.id) : [...ex.comissao.regras, r.id])} /> {r.nome} <small>{dinheiro(r.de)} a {dinheiro(r.ate)} · {r.tipo === "percentual" ? `${r.valor}%` : dinheiro(r.valor)}</small></label>)}</div>
            )}
          </>
        )}
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal">
          <button type="button" className="botao" onClick={onFechar}>Voltar</button>
          <button className="botao primario" disabled={salvando}>{c.id ? "Salvar" : "Criar"}</button>
        </div>
      </form>
    </Modal>
  );
}
