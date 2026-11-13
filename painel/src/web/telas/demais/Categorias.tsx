// Config › Categorias (Tarifas e categorias): lista, filtros e a janela de 4 passos (Básico, Tarifas & Negociação, Dinâmica, Comissão).

import { useRef, useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Aviso, Cab, Campo, Carregando, Interruptor, Modal, dinheiro, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const passos = [["basico", "Básico"], ["tarifas", "Tarifas & Negociação"], ["dinamica", "Dinâmica"], ["comissao", "Comissão"]] as const;
type Passo = (typeof passos)[number][0];
const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));

const VAZIA = {
  id: "", nome: "", descricao: "", taxaBase: 0, precoKm: 0, precoMin: 0, tarifaMinima: 0, taxaCancelamento: null as number | null, comissaoTipo: "Percentual", comissaoValor: 0,
  extra: {
    cidade: "", visivel: true, tipoFisico: "carro", grupo: "Carro", ordem: 1, capacidade: 4, raio: 5000, icone: { modo: "biblioteca", biblioteca: "carro-popular", imagem: "" },
    negociacao: { ativo: false, descontoMaxPax: 20, acrescimoMaxMot: 50 }, modoPrecoKm: "padrao", faixasKm: [] as any[], kmIncluso: 0, tempoToque: 30, paradas: { tipo: "fixo", valor: 0 },
    deslocamento: { ativo: false, minKm: 0, tipo: "fixo", valor: 0, teto: 0, junto: true }, compensacao: { ativo: false, faixas: [] as any[] },
    mostrarGanhoKm: false, permiteAgendamento: true, dinamicas: [] as string[], comissao: { usaFaixas: false, regras: [] as string[] },
  },
};

export function Categorias() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/categorias"), []);
  const [cidade, setCidade] = useState(""), [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [reordenar, setReordenar] = useState(false);
  const arrastando = useRef<string | null>(null);
  const { msg, salvar } = useSalvar();
  const todas: any[] = d.dados?.categorias ?? [];
  const cidades = [...new Set(todas.map((c) => c.extra.cidade).filter(Boolean))] as string[];
  const lista = todas.filter((c) => (!cidade || c.extra.cidade === cidade) && (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())));
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
        {admin && <button className="botao" aria-pressed={reordenar} onClick={() => setReordenar(!reordenar)}>Reordenar categorias</button>}
        {admin && <button className="botao primario" onClick={() => setEdit(structuredClone(VAZIA))}><Plus size={14} /> Criar categoria</button>}
      </Cab>
      <div className="dm-cartao dm-filtros">
        <Campo rotulo="Filtrar por Cidade"><select value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Todas as Cidades</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Buscar Categoria"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: Popular, Comfort..." /></Campo>
      </div>
      <div className="dm-cartao dm-importante">
        <h3>Configurações Importantes</h3>
        <p>Para utilizar <strong>Preço Dinâmico</strong> ou <strong>Regras de Comissão</strong> avançadas, você deve criá-las nos menus específicos antes de cadastrar a categoria.</p>
        <div className="dm-linha"><a className="botao" href="/tarifas-dinamicas">Criar Dinâmicas</a><a className="botao" href="/regras-credito">Criar Regras</a></div>
      </div>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {!d.dados ? <Carregando /> : !lista.length ? <p className="vazio">Nenhuma categoria cadastrada.</p> : (
        <div className="dm-cat-grade">
          {lista.map((c) => (
            <article key={c.id} className="dm-cartao dm-cat" draggable={reordenar && admin} onDragStart={() => { arrastando.current = c.id; }} onDragOver={(e) => reordenar && e.preventDefault()} onDrop={() => void mover(c.id)}>
              <div className="dm-linha dm-entre">
                <div className="dm-linha">{reordenar && <GripVertical size={16} aria-hidden />}{c.extra.icone.modo === "personalizado" && c.extra.icone.imagem ? <img src={c.extra.icone.imagem} alt="" width={40} height={40} /> : <span className="dm-icone-cat" aria-hidden>{c.extra.tipoFisico === "moto" ? "🏍️" : c.extra.tipoFisico === "caminhao" ? "🚚" : "🚗"}</span>}
                  <div><h3>{c.nome}</h3><small>{c.descricao || c.extra.cidade || "—"}</small></div></div>
                <span className={`selo ${c.extra.visivel ? "ok" : "alerta"}`}>{c.extra.visivel ? "Visível" : "Oculta"}</span>
              </div>
              <dl className="dm-dl">
                <div><dt>Taxa base</dt><dd>{dinheiro(c.taxaBase)}</dd></div><div><dt>Km</dt><dd>{dinheiro(c.precoKm)}</dd></div><div><dt>Mín.</dt><dd>{dinheiro(c.tarifaMinima)}</dd></div>
                <div><dt>Comissão</dt><dd>{c.comissaoTipo === "Percentual" ? `${String(c.comissaoValor).replace(".", ",")}%` : dinheiro(c.comissaoValor)}</dd></div>
              </dl>
              <div className="dm-linha"><small>Ordem {c.extra.ordem} · {c.extra.grupo}{c.extra.negociacao.ativo ? " · Negocia" : ""}</small>
                {admin && <span className="dm-linha dm-fim"><button className="icone" aria-label={`Editar ${c.nome}`} onClick={() => setEdit(structuredClone(c))}><Pencil size={14} /></button><button className="icone" aria-label={`Remover ${c.nome}`} onClick={async () => { if (confirm(`Remover a categoria "${c.nome}"?`)) { await salvar(async () => { await pedirConfig(`/categorias/${c.id}`, "DELETE"); d.recarregar(); }, "Categoria removida."); } }}><Trash2 size={14} /></button></span>}</div>
            </article>
          ))}
        </div>
      )}
      {edit && <JanelaCategoria inicial={edit} dinamicas={d.dados?.dinamicas ?? []} regras={d.dados?.regras ?? []} icones={d.dados?.icones ?? []} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); d.recarregar(); }} />}
    </>
  );
}

function JanelaCategoria({ inicial, dinamicas, regras, icones, onFechar, onSalvo }: { inicial: any; dinamicas: any[]; regras: any[]; icones: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [c, setC] = useState<any>(inicial);
  const [passo, setPasso] = useState<Passo>("basico");
  const { msg, salvando, salvar } = useSalvar();
  const ex = c.extra;
  const set = (k: string, v: unknown) => setC({ ...c, [k]: v });
  const setEx = (k: string, v: unknown) => setC({ ...c, extra: { ...ex, [k]: v } });
  const sub = (grupo: string, k: string, v: unknown) => setEx(grupo, { ...ex[grupo], [k]: v });
  const idx = passos.findIndex(([p]) => p === passo);
  const alternar = (campo: "dinamicas", id: string) => setEx(campo, ex[campo].includes(id) ? ex[campo].filter((x: string) => x !== id) : [...ex[campo], id]);
  const enviar = async () => {
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
    <Modal aberto onFechar={onFechar} titulo={c.id ? "Editar Categoria" : "Nova Categoria"} sub="Configuração Completa" larga>
      <div className="dm-abas" role="tablist">{passos.map(([p, n]) => <button key={p} role="tab" aria-selected={passo === p} className={passo === p ? "ativo" : ""} onClick={() => setPasso(p)}>{n}</button>)}</div>
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); if (passo === "comissao") void enviar(); else setPasso(passos[idx + 1][0]); }}>
        {passo === "basico" && (
          <>
            <Interruptor valor={ex.visivel} onChange={(v) => setEx("visivel", v)} rotulo="Visível no App Passageiro?" descricao="Se desligado, a categoria aparece apenas para o administrador." />
            <h3>Informações Principais</h3>
            <div className="dm-grade3">
              <Campo rotulo="Cidade *" dica="Cidade onde esta categoria irá operar."><input value={ex.cidade} onChange={(e) => setEx("cidade", e.target.value)} maxLength={80} required /></Campo>
              <Campo rotulo="Nome da Categoria *" dica="Nome visível para o passageiro."><input value={c.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Popular, Black..." required maxLength={60} /></Campo>
              <Campo rotulo="Descrição Adicional" dica="Pequeno texto explicativo abaixo do nome no app."><input value={c.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex: Carros novos com ar condicionado" maxLength={120} /></Campo>
              <Campo rotulo="Tipo Físico" dica="Ícone do veículo animado no mapa."><select value={ex.tipoFisico} onChange={(e) => setEx("tipoFisico", e.target.value)}><option value="carro">Carro (4 Rodas)</option><option value="moto">Moto (2 Rodas)</option><option value="caminhao">Caminhão / Frete</option></select></Campo>
              <Campo rotulo="Grupo (Aba no App)" dica="Agrupamento nas abas do app passageiro."><select value={ex.grupo} onChange={(e) => setEx("grupo", e.target.value)}><option value="Carro">Grupo: Carros</option><option value="Moto">Grupo: Motos</option></select></Campo>
              <Campo rotulo="Ordem" dica="Posição (1 = topo)."><input type="number" min={1} value={ex.ordem} onChange={(e) => setEx("ordem", Number(e.target.value))} /></Campo>
              <Campo rotulo="Capacidade" dica="Máximo de passageiros."><input type="number" min={1} value={ex.capacidade} onChange={(e) => setEx("capacidade", Number(e.target.value))} /></Campo>
              <Campo rotulo="Raio Busca (m)" dica="Distância para encontrar motoristas."><input type="number" min={100} value={ex.raio} onChange={(e) => setEx("raio", Number(e.target.value))} /></Campo>
            </div>
            <h3>Ícone da Categoria</h3><p className="sub">Defina a imagem que representará esta categoria na tela do passageiro.</p>
            <Campo rotulo="Origem da Imagem"><select value={ex.icone.modo} onChange={(e) => sub("icone", "modo", e.target.value)}><option value="biblioteca">Selecionar da Biblioteca</option><option value="personalizado">Fazer Upload Novo</option></select></Campo>
            {ex.icone.modo === "biblioteca" ? <div className="dm-radios">{icones.map((i) => <label key={i} className="dm-check"><input type="radio" name="icone" checked={ex.icone.biblioteca === i} onChange={() => sub("icone", "biblioteca", i)} /> {i}</label>)}</div> : (
              <div>{ex.icone.imagem && <img src={ex.icone.imagem} alt="Prévia do ícone" width={80} height={80} />}<label className="botao">Adicionar PNG<input type="file" hidden accept="image/png" onChange={(e) => lerPng(e.target.files?.[0])} /></label><p className="sub"><strong>Atenção:</strong> A imagem deve ter fundo transparente e tamanho exato de 360x360 pixels.</p></div>
            )}
          </>
        )}
        {passo === "tarifas" && (
          <>
            <h3>Negociação (Leilão)</h3>
            <Interruptor valor={ex.negociacao.ativo} onChange={(v) => sub("negociacao", "ativo", v)} rotulo="Habilitar negociação" descricao="Habilita a tela onde motorista e passageiro negociam a tarifa final." />
            {ex.negociacao.ativo && <div className="dm-duplo"><Campo rotulo="Desconto Máx. Passageiro (%)"><input type="number" min={0} max={100} value={ex.negociacao.descontoMaxPax} onChange={(e) => sub("negociacao", "descontoMaxPax", Number(e.target.value))} /></Campo><Campo rotulo="Acréscimo Máx. Motorista (%)"><input type="number" min={0} value={ex.negociacao.acrescimoMaxMot} onChange={(e) => sub("negociacao", "acrescimoMaxMot", Number(e.target.value))} /></Campo></div>}
            <h3>Estrutura de Preço</h3>
            <fieldset><legend>Modo de Cobrança / KM</legend><p className="sub">Defina se o valor é único ou se muda de acordo com a distância.</p><div className="dm-radios"><label><input type="radio" name="modo" checked={ex.modoPrecoKm === "padrao"} onChange={() => setEx("modoPrecoKm", "padrao")} /> Padrão</label><label><input type="radio" name="modo" checked={ex.modoPrecoKm === "faixas"} onChange={() => setEx("modoPrecoKm", "faixas")} /> Faixas Avançadas</label></div></fieldset>
            <Campo rotulo="Taxa Base"><input inputMode="decimal" value={txt(c.taxaBase)} placeholder="0.00" onChange={(e) => set("taxaBase", num(e.target.value))} /></Campo>
            {ex.modoPrecoKm === "padrao" ? (
              <div className="dm-grade3"><Campo rotulo="Preço KM (R$)"><input inputMode="decimal" value={txt(c.precoKm)} placeholder="0.00" onChange={(e) => set("precoKm", num(e.target.value))} /></Campo><Campo rotulo="Preço Min."><input inputMode="decimal" value={txt(c.precoMin)} placeholder="0.00" onChange={(e) => set("precoMin", num(e.target.value))} /></Campo><Campo rotulo="Tarifa Mínima"><input inputMode="decimal" value={txt(c.tarifaMinima)} placeholder="0.00" onChange={(e) => set("tarifaMinima", num(e.target.value))} /></Campo></div>
            ) : (
              <div><div className="dm-linha dm-entre"><h4>Tabela Escalonada (Fatiada)</h4><button type="button" className="botao" onClick={() => setEx("faixasKm", [...ex.faixasKm, { de: ex.faixasKm.at(-1)?.ate ?? 0, ate: (ex.faixasKm.at(-1)?.ate ?? 0) + 5, valor: 0 }])}>Adicionar Faixa</button></div>
                {!ex.faixasKm.length ? <p className="sub">Nenhuma faixa configurada. Clique no botão acima.</p> : ex.faixasKm.map((f: any, i: number) => (
                  <div key={i} className="dm-grade4"><Campo rotulo="De (KM)"><input type="number" value={f.de} onChange={(e) => setEx("faixasKm", ex.faixasKm.map((x: any, j: number) => (j === i ? { ...x, de: Number(e.target.value) } : x)))} /></Campo><Campo rotulo="Até (KM)"><input type="number" value={f.ate} onChange={(e) => setEx("faixasKm", ex.faixasKm.map((x: any, j: number) => (j === i ? { ...x, ate: Number(e.target.value) } : x)))} /></Campo><Campo rotulo="Valor / km"><input inputMode="decimal" value={txt(f.valor)} onChange={(e) => setEx("faixasKm", ex.faixasKm.map((x: any, j: number) => (j === i ? { ...x, valor: num(e.target.value) } : x)))} /></Campo><button type="button" className="icone" aria-label="Remover faixa" onClick={() => setEx("faixasKm", ex.faixasKm.filter((_: unknown, j: number) => j !== i))}><Trash2 size={14} /></button></div>
                ))}
                <p className="sub">Regra: O campo "Até" de uma linha deve ser igual ao "De" da próxima.</p>
                <Campo rotulo="Tarifa Mínima"><input inputMode="decimal" value={txt(c.tarifaMinima)} placeholder="0.00" onChange={(e) => set("tarifaMinima", num(e.target.value))} /></Campo></div>
            )}
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
            <fieldset><legend>Permitir Agendamento?</legend><p className="sub">Habilita a função de agendar corridas para o futuro nesta categoria.</p><div className="dm-radios"><label><input type="radio" name="agenda" checked={ex.permiteAgendamento} onChange={() => setEx("permiteAgendamento", true)} /> Sim</label><label><input type="radio" name="agenda" checked={!ex.permiteAgendamento} onChange={() => setEx("permiteAgendamento", false)} /> Não</label></div></fieldset>
          </>
        )}
        {passo === "dinamica" && (
          <>
            <h3>Preço Dinâmico Multi-Fatores</h3>
            <p className="sub">Você pode misturar regras de horário, mapa geolocalizado e alta demanda simultaneamente. Se não houver regras listadas, crie-as no menu Tarifas Dinâmicas.</p>
            {grupoDin("horario", "Por Horário Fixo")}{grupoDin("mapa", "Por Polígono (Mapa)")}{grupoDin("demanda", "Alta Demanda Auto")}
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
          <button type="button" className="botao" onClick={onFechar}>Cancelar</button>
          {passo !== "comissao" ? <button className="botao primario">Avançar</button> : <button className="botao primario" disabled={salvando}>Salvar Categoria</button>}
        </div>
      </form>
    </Modal>
  );
}
