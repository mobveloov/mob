// Janela do motorista: Geral, Veículos, Financeiro, Documentos, Cerca Eletrônica e Controle de Créditos.
// Servidor: /api/gestao/motoristas/:id (e /cerca, /creditos). Documentos: /api/apps-central/documentos.

import { useEffect, useState } from "react";
import { Ghost, X } from "lucide-react";
import { empresaEscolhidaAgora } from "../../api";
import { Abas, Campo, chamar, dataHoraBr, dinheiro, Interruptor, Janela, Opcoes, Selo, useAviso, Vazio } from "./base";
import MapaAreas from "./MapaAreas";

type ModoTaxa = "padrao" | "personalizado" | "isento";
type ModoSaldo = "padrao" | "desativado" | "personalizado";
interface Financeiro { taxa: { modo: ModoTaxa; tipo: "porcentagem" | "fixo"; valor: number }; saldo: { modo: ModoSaldo; minimo: number }; mensagens: { modo: ModoSaldo; valor: number }; saque: boolean }
interface Detalhe {
  motorista: Record<string, string | number | boolean | null>;
  financeiro: Financeiro & { temSenha: boolean };
  padrao: { saldoMinimo: number | null; avisoRecarga: number | null };
  cerca: { permissao: string | null; bloqueios: string[] };
  veiculos: Array<{ id: string; modelo: string; cor: string; placa: string; ano: number | null; categoria: string; emUso: boolean }>;
  documentos: Array<{ tipo: string; nome: string; situacao: string; motivo?: string; em?: string }>;
  resumo: { finalizadas: number; versaoApp: string | null; aceitacao: number | null; online: boolean };
  creditos: { saldo: number; minimo: number | null; bloqueado: boolean; consumoAtivo: boolean };
}
interface Creditos {
  situacao: string; nome: string; cpf: string; creditos: Detalhe["creditos"]; config: Financeiro; padrao: Detalhe["padrao"];
  resumo: { inicio: string; fim: string; saldoAnterior: number; adicionados: number; retirados: number; total: number; saldoFinal: number };
  extrato: Array<{ id: string; valor: number; descricao: string; em: string; por: string }>;
}
type Aba = "geral" | "veiculos" | "financeiro" | "docs" | "cerca" | "creditos";

const FIN_PADRAO: Financeiro = { taxa: { modo: "padrao", tipo: "porcentagem", valor: 0 }, saldo: { modo: "padrao", minimo: -50 }, mensagens: { modo: "padrao", valor: 0 }, saque: true };
const NIVEIS = [["Prioritário", "Alta (Prioritário)"], ["Secundário", "Média (Secundário)"], ["Reserva", "Baixa (Reserva)"]];
const SITUACOES = ["Ativo", "Em análise", "Fila de espera", "Bloqueado", "Rejeitado", "Inativo", "Lixeira"];
const CAMPOS = ["cidade", "nome", "cpf", "telefone", "email", "nascimento", "genero", "nivel", "endereco", "numero", "cep", "bairro", "chavePix", "viatura", "cnhNumero", "validadeCnh", "status", "fantasma"] as const;

const texto = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => Number(v.replace(",", "."));

export default function MotoristaJanela({ id, onFechar, onSalvo, cidades }: { id: string | "novo"; onFechar: () => void; onSalvo: () => void; cidades: string[]; categorias: string[] }) {
  const novo = id === "novo";
  const [aba, setAba] = useState<Aba>("geral");
  const [det, setDet] = useState<Detalhe | null>(null);
  const [dados, setDados] = useState<Record<string, string | boolean>>({ status: "Em análise", nivel: "Secundário", genero: "Masculino", fantasma: false });
  const [fin, setFin] = useState<Financeiro>(FIN_PADRAO);
  const [valorTaxa, setValorTaxa] = useState("");
  const [minimo, setMinimo] = useState("-50");
  const [salvando, setSalvando] = useState(false);
  const { aviso, tentar } = useAviso();

  const carregar = async () => {
    const d = await chamar<Detalhe>("GET", `/motoristas/${id}`);
    setDet(d);
    setDados(Object.fromEntries(CAMPOS.map((k) => [k, k === "fantasma" ? d.motorista[k] === true : texto(d.motorista[k])])) as Record<string, string | boolean>);
    setFin(d.financeiro); setValorTaxa(d.financeiro.taxa.valor ? String(d.financeiro.taxa.valor) : ""); setMinimo(String(d.financeiro.saldo.minimo));
  };
  useEffect(() => { if (!novo) void tentar(carregar); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const set = (k: string, v: string | boolean) => setDados({ ...dados, [k]: v });
  const finalizar = (): Financeiro => ({ ...fin, taxa: { ...fin.taxa, valor: num(valorTaxa || "0") || 0 }, saldo: { ...fin.saldo, minimo: num(minimo) } });

  const salvar = async () => {
    setSalvando(true);
    const corpo = { dados: { ...dados, fantasma: dados.fantasma === true }, financeiro: finalizar() };
    const ok = await tentar(() => (novo ? chamar("POST", "/motoristas", corpo) : chamar("PUT", `/motoristas/${id}`, corpo)), "Perfil salvo.");
    setSalvando(false);
    if (ok) { onSalvo(); if (novo) onFechar(); else await carregar(); }
  };

  const abas = [{ id: "geral" as const, rotulo: "Geral" }, { id: "veiculos" as const, rotulo: "Veículos" }, { id: "financeiro" as const, rotulo: "Financeiro" }, { id: "docs" as const, rotulo: "Documentos" },
    { id: "cerca" as const, rotulo: "Cerca Eletrônica" }, { id: "creditos" as const, rotulo: "Controle de Créditos" }];
  const nome = texto(dados.nome);

  return (
    <Janela aberta titulo={novo ? "Novo Motorista" : nome || "Motorista"} sub="Gestão de Perfil & Permissões" onFechar={onFechar} largura="grande"
      abas={<Abas itens={abas} valor={aba} onChange={setAba} />}
      rodape={<>
        <button className="cg-botao" onClick={onFechar}>Cancelar</button>
        {(aba === "geral" || aba === "financeiro") && <button className="cg-botao primario" disabled={salvando} onClick={() => void salvar()}>Salvar Perfil</button>}
      </>}>
      {aviso}
      {aba === "geral" && (
        <>
          {!novo && det && (
            <div className="cg-grade" style={{ marginBottom: 12 }}>
              <div className="cg-kpi"><span>Versão do aplicativo</span><strong style={{ fontSize: 18 }}>{det.resumo.versaoApp ?? "Indisponível"}</strong></div>
              <div className="cg-kpi"><span>Taxa de aceitação (últimas 100 ofertas)</span><strong style={{ fontSize: 18 }}>{det.resumo.aceitacao == null ? "--" : `${det.resumo.aceitacao}%`}</strong></div>
              <div className="cg-kpi"><span>Total de corridas finalizadas</span><strong style={{ fontSize: 18 }}>{det.resumo.finalizadas}</strong></div>
            </div>
          )}
          <h4 className="cg-secao">Dados Principais</h4>
          <div className="cg-grade">
            <Campo rotulo="Cidade *"><select value={texto(dados.cidade)} onChange={(e) => set("cidade", e.target.value)}><option value="">Selecione...</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
            <Campo rotulo="Nome Completo *"><input value={nome} placeholder="Nome e sobrenome" onChange={(e) => set("nome", e.target.value)} /></Campo>
            <Campo rotulo="CPF *"><input value={texto(dados.cpf)} placeholder="000.000.000-00" onChange={(e) => set("cpf", e.target.value)} /></Campo>
            <Campo rotulo="Telefone *"><input value={texto(dados.telefone)} placeholder="(00) 00000-0000" onChange={(e) => set("telefone", e.target.value)} /></Campo>
            <Campo rotulo="E-mail *"><input type="email" value={texto(dados.email)} placeholder="email@exemplo.com" onChange={(e) => set("email", e.target.value)} /></Campo>
            <Campo rotulo="Nascimento"><input type="date" value={texto(dados.nascimento)} onChange={(e) => set("nascimento", e.target.value)} /></Campo>
            <Campo rotulo="Sexo"><select value={texto(dados.genero)} onChange={(e) => set("genero", e.target.value)}><option>Masculino</option><option>Feminino</option></select></Campo>
            <Campo rotulo="Prioridade de Toque"><select value={texto(dados.nivel)} onChange={(e) => set("nivel", e.target.value)}>{NIVEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
          </div>
          <h4 className="cg-secao">Localização &amp; PIX</h4>
          <div className="cg-grade">
            <Campo rotulo="Endereço" className="larga"><input value={texto(dados.endereco)} placeholder="Rua, Av..." onChange={(e) => set("endereco", e.target.value)} /></Campo>
            <Campo rotulo="Nº"><input value={texto(dados.numero)} onChange={(e) => set("numero", e.target.value)} /></Campo>
            <Campo rotulo="CEP"><input value={texto(dados.cep)} onChange={(e) => set("cep", e.target.value)} /></Campo>
            <Campo rotulo="Bairro"><input value={texto(dados.bairro)} onChange={(e) => set("bairro", e.target.value)} /></Campo>
            <Campo rotulo="Chave PIX"><input value={texto(dados.chavePix)} onChange={(e) => set("chavePix", e.target.value)} /></Campo>
          </div>
          <h4 className="cg-secao">Dados Complementares</h4>
          <div className="cg-grade">
            <Campo rotulo="Nº Viatura"><input value={texto(dados.viatura)} placeholder="Ex: 1050" onChange={(e) => set("viatura", e.target.value)} /></Campo>
            <Campo rotulo="CNH Nº"><input value={texto(dados.cnhNumero)} onChange={(e) => set("cnhNumero", e.target.value)} /></Campo>
            <Campo rotulo="CNH Validade"><input type="date" value={texto(dados.validadeCnh)} onChange={(e) => set("validadeCnh", e.target.value)} /></Campo>
            <Campo rotulo="Status do Cadastro"><select value={texto(dados.status)} onChange={(e) => set("status", e.target.value)}>{SITUACOES.map((s) => <option key={s}>{s}</option>)}</select></Campo>
          </div>
          <div className="cg-caixa-roxa" style={{ marginTop: 14 }}>
            <div><h5><Ghost size={14} style={{ verticalAlign: "-2px" }} /> Modo Fantasma (Oculto)</h5><p>Oculto no mapa mas recebe corridas normalmente.</p></div>
            <Interruptor ligado={dados.fantasma === true} onChange={(v) => set("fantasma", v)} />
          </div>
        </>
      )}
      {aba === "veiculos" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Veiculos motoristaId={id} lista={det?.veiculos ?? []} recarregar={carregar} />)}
      {aba === "financeiro" && (
        <>
          <h4 className="cg-secao">Taxa da Plataforma</h4>
          <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Como este motorista paga pelo uso do sistema?</p>
          <Opcoes nome="taxa" valor={fin.taxa.modo} onChange={(modo) => setFin({ ...fin, taxa: { ...fin.taxa, modo } })} itens={[
            { id: "padrao", titulo: "Padrão", sub: "Regra configurada na cidade" }, { id: "personalizado", titulo: "Personalizado", sub: "Define taxa exclusiva" }, { id: "isento", titulo: "Isento", sub: "Não paga nenhuma taxa" }]} />
          {fin.taxa.modo === "personalizado" && (
            <div className="cg-grade" style={{ marginTop: 12 }}>
              <Campo rotulo="Modelo de Cobrança"><select value={fin.taxa.tipo} onChange={(e) => setFin({ ...fin, taxa: { ...fin.taxa, tipo: e.target.value as "porcentagem" | "fixo" } })}><option value="porcentagem">Porcentagem por Corrida (%)</option><option value="fixo">Valor Fixo por Corrida (R$)</option></select></Campo>
              <Campo rotulo={fin.taxa.tipo === "porcentagem" ? "Valor (%)" : "Valor (R$)"}><input inputMode="decimal" value={valorTaxa} placeholder="0.00" onChange={(e) => setValorTaxa(e.target.value)} /></Campo>
            </div>
          )}
          <h4 className="cg-secao">Limite de Bloqueio</h4>
          <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Quando bloquear automaticamente por dívida?</p>
          <Opcoes nome="saldo" valor={fin.saldo.modo === "personalizado" ? "personalizado" : "padrao"} onChange={(modo) => setFin({ ...fin, saldo: { ...fin.saldo, modo } })} itens={[
            { id: "padrao", titulo: "Padrão da Cidade", sub: "Seguir a configuração global" }, { id: "personalizado", titulo: "Limite Exclusivo", sub: "Definir valor individual" }]} />
          {fin.saldo.modo === "personalizado" && (
            <div style={{ marginTop: 12, maxWidth: 320 }}>
              <Campo rotulo="Bloquear se saldo for menor que (R$)" dica="Use negativos para permitir dívida. Ex: -50.00"><input inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} /></Campo>
            </div>
          )}
        </>
      )}
      {aba === "docs" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Documentos motoristaId={id} lista={det?.documentos ?? []} recarregar={carregar} />)}
      {aba === "cerca" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Cerca motoristaId={id} />)}
      {aba === "creditos" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <ControleCreditos motoristaId={id} onSalvo={() => void carregar()} />)}
    </Janela>
  );
}

// ---------------------------------------------------------------- veículos

function Veiculos({ motoristaId, lista, recarregar }: { motoristaId: string; lista: Detalhe["veiculos"]; recarregar: () => Promise<void> }) {
  const [f, setF] = useState({ modelo: "", cor: "", placa: "", ano: "", categoria: "" });
  const { aviso, tentar } = useAviso();
  return (
    <>
      {aviso}
      <h4 className="cg-secao">Veículos &amp; Categorias</h4>
      {!lista.length ? <Vazio titulo="Nenhum veículo cadastrado." sub="Cadastre abaixo." /> : (
        <div className="cg-cartoes">{lista.map((v) => (
          <div className="cg-cartao" key={v.id}>
            <h4>{[v.modelo, v.cor].filter(Boolean).join(" ")}</h4>
            <span className="cg-mono">{v.placa}{v.ano ? ` · ${v.ano}` : ""}{v.categoria ? ` · ${v.categoria}` : ""}</span>
            <div>{v.emUso ? <Selo tom="ok">Em uso</Selo> : <Selo tom="neutro">Guardado</Selo>}</div>
            <div className="cg-acoes">
              <button className="cg-botao" onClick={() => void tentar(async () => { await chamar("POST", `/veiculos/${v.id}/uso`, { emUso: !v.emUso }); await recarregar(); })}>{v.emUso ? "Guardar" : "Usar este"}</button>
              <button className="cg-botao perigo" onClick={() => confirm("Remover este veículo?") && void tentar(async () => { await chamar("DELETE", `/veiculos/${v.id}`); await recarregar(); })}>Remover</button>
            </div>
          </div>))}
        </div>
      )}
      <h4 className="cg-secao">Novo veículo</h4>
      <div className="cg-grade">
        <Campo rotulo="Modelo do Veículo"><input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></Campo>
        <Campo rotulo="Cor Predominante"><input value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} /></Campo>
        <Campo rotulo="Placa (Mercosul/Antiga)"><input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="Ano Fabricação"><input type="number" value={f.ano} onChange={(e) => setF({ ...f, ano: e.target.value })} /></Campo>
      </div>
      <p><button className="cg-botao primario" onClick={() => void tentar(async () => { await chamar("POST", "/veiculos", { motoristaId, ...f, ano: f.ano ? Number(f.ano) : null }); setF({ modelo: "", cor: "", placa: "", ano: "", categoria: "" }); await recarregar(); }, "Veículo salvo.")}>Salvar Veículo</button></p>
    </>
  );
}

// ---------------------------------------------------------------- documentos

const TOM_DOC: Record<string, "ok" | "ruim" | "alerta" | "neutro"> = { Aprovado: "ok", Recusado: "ruim", Enviado: "alerta", Pendente: "neutro" };

function Documentos({ motoristaId, lista, recarregar }: { motoristaId: string; lista: Detalhe["documentos"]; recarregar: () => Promise<void> }) {
  const { aviso, tentar } = useAviso();
  const enviar = (tipo: string, arq: File | undefined) => {
    if (!arq) return;
    void tentar(async () => {
      const headers: Record<string, string> = { "Content-Type": arq.type };
      const emp = empresaEscolhidaAgora(); if (emp) headers["X-Empresa"] = emp;
      const r = await fetch(`/api/gestao/motoristas/${motoristaId}/documentos/${tipo}`, { method: "POST", headers, body: arq, credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não foi possível enviar.");
      await recarregar();
    }, "Documento enviado.");
  };
  const avaliar = (tipo: string, aprovado: boolean) => {
    const motivo = aprovado ? "" : prompt("Motivo da rejeição (o motorista vê no app):") ?? "";
    if (!aprovado && !motivo.trim()) return;
    void tentar(async () => { await chamar("POST", `/documentos/${motoristaId}/${tipo}`, { aprovado, motivo }, "/api/apps-central"); await recarregar(); }, aprovado ? "Documento aprovado." : "Documento rejeitado.");
  };
  return (
    <>
      {aviso}
      <h4 className="cg-secao">Fotos dos Documentos</h4>
      <p style={{ margin: "0 0 10px", color: "var(--cg-suave)" }}>Documentação obrigatória do motorista</p>
      <div className="cg-docs">{lista.map((d) => (
        <div className="cg-doc" key={d.tipo}>
          <header><span>{d.nome}</span><Selo tom={TOM_DOC[d.situacao] ?? "neutro"}>{d.situacao === "Recusado" ? "Rejeitado" : d.situacao === "Enviado" ? "Em análise" : d.situacao}</Selo></header>
          <div className="previa">{d.situacao === "Pendente" ? "Vazio" : <a href={`/api/apps-central/documentos/${motoristaId}/${d.tipo}`} target="_blank" rel="noopener noreferrer">Ver arquivo</a>}</div>
          {d.motivo && d.situacao === "Recusado" && <small style={{ color: "var(--cg-ruim)" }}>Motivo: {d.motivo}</small>}
          {d.em && <small style={{ color: "var(--cg-suave)" }}>{dataHoraBr(d.em)}</small>}
          <div className="botoes">
            {d.situacao !== "Pendente" && <><button className="cg-botao" title="Aprovar" onClick={() => avaliar(d.tipo, true)}>Aprovar</button><button className="cg-botao perigo" title="Rejeitar" onClick={() => avaliar(d.tipo, false)}>Rejeitar</button></>}
            <label className="cg-botao" style={{ cursor: "pointer" }}>{d.situacao === "Pendente" ? "Enviar" : "Trocar"}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => { enviar(d.tipo, e.target.files?.[0]); e.target.value = ""; }} /></label>
          </div>
        </div>))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- cerca eletrônica

function Cerca({ motoristaId }: { motoristaId: string }) {
  const d = useCercaDados(motoristaId);
  const { aviso, tentar } = useAviso();
  if (!d.dados) return <Vazio titulo="Carregando..." />;
  const { areas } = d.dados;
  const { permissao, bloqueios } = d.cerca;
  const livres = areas.filter((a) => !bloqueios.includes(a.id));
  const mostrar = [
    ...areas.filter((a) => a.id === permissao).map((a) => ({ ...a, cor: "#22c55e" })),
    ...areas.filter((a) => bloqueios.includes(a.id)).map((a) => ({ ...a, cor: "#ef4444" })),
  ];
  return (
    <>
      {aviso}
      <h4 className="cg-secao">Área de permissão</h4>
      <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>É a área na qual o motorista poderá receber corridas. Quando preenchida, o motorista apenas irá receber corridas que partem de dentro dela.</p>
      <Campo rotulo="Restringir corridas apenas na área:">
        <select value={permissao ?? ""} onChange={(e) => d.setCerca({ ...d.cerca, permissao: e.target.value || null })}><option value="">Selecione</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
      </Campo>
      <h4 className="cg-secao">Áreas de bloqueio</h4>
      <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>São áreas que impedem o motorista de receber corridas enquanto ele estiver dentro. Ao entrar nessa área o aplicativo receberá um aviso de que ele está numa área de bloqueio.</p>
      <label className="cg-campo"><span>Lista de áreas de bloqueio:</span></label>
      {bloqueios.map((b) => (
        <div key={b} className="cg-duplo" style={{ marginBottom: 6 }}>
          <select value={b} onChange={(e) => d.setCerca({ ...d.cerca, bloqueios: bloqueios.map((x) => (x === b ? e.target.value : x)) })}>{areas.map((a) => <option key={a.id} value={a.id} disabled={a.id !== b && bloqueios.includes(a.id)}>{a.nome}</option>)}</select>
          <button className="cg-icone" aria-label="Remover área" style={{ flex: "0 0 34px" }} onClick={() => d.setCerca({ ...d.cerca, bloqueios: bloqueios.filter((x) => x !== b) })}><X size={16} /></button>
        </div>
      ))}
      <p><button className="cg-botao" disabled={!livres.length} onClick={() => d.setCerca({ ...d.cerca, bloqueios: [...bloqueios, livres[0].id] })}>+ Adicionar área de bloqueio</button></p>
      {!areas.length && <p style={{ color: "var(--cg-suave)" }}>Nenhuma área cadastrada. Crie em Cadastro › Áreas.</p>}
      <MapaAreas areas={mostrar} />
      <p><button className="cg-botao primario" onClick={() => void tentar(() => chamar("PUT", `/motoristas/${motoristaId}/cerca`, d.cerca), "Cerca eletrônica gravada. O despacho já respeita.")}>Gravar</button></p>
    </>
  );
}

function useCercaDados(motoristaId: string) {
  const [dados, setDados] = useState<{ areas: Array<{ id: string; nome: string; poligono: Array<[number, number]> }> } | null>(null);
  const [cerca, setCerca] = useState<{ permissao: string | null; bloqueios: string[] }>({ permissao: null, bloqueios: [] });
  useEffect(() => {
    void chamar<{ cerca: typeof cerca; areas: NonNullable<typeof dados>["areas"] }>("GET", `/motoristas/${motoristaId}/cerca`).then((r) => { setDados({ areas: r.areas }); setCerca(r.cerca); });
  }, [motoristaId]);
  return { dados, cerca, setCerca };
}

// ---------------------------------------------------------------- controle de créditos

const PERIODOS: Array<[string, string, number]> = [["hoje", "Hoje", 0], ["ontem", "Ontem", 1], ["7", "Últimos 7 dias", 6], ["30", "Últimos 30 dias", 29]];
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function ControleCreditos({ motoristaId, onSalvo }: { motoristaId: string; onSalvo: () => void }) {
  const [per, setPer] = useState("hoje");
  const [dados, setDados] = useState<Creditos | null>(null);
  const [cfg, setCfg] = useState<Financeiro>(FIN_PADRAO);
  const [v, setV] = useState({ taxa: "", minimo: "", recarga: "" });
  const [extrato, setExtrato] = useState(false);
  const [lanc, setLanc] = useState<null | { sinal: 1 | -1; valor: string; descricao: string }>(null);
  const { aviso, tentar } = useAviso();

  const carregar = async (p = per, manterConfig = false) => {
    const [, , dias] = PERIODOS.find((x) => x[0] === p) ?? PERIODOS[0];
    const fim = p === "ontem" ? iso(new Date(Date.now() - 86_400_000)) : iso(new Date());
    const inicio = iso(new Date(Date.now() - dias * 86_400_000));
    const r = await chamar<Creditos>("GET", `/motoristas/${motoristaId}/creditos?inicio=${inicio}&fim=${fim}`);
    setDados(r);
    if (!manterConfig) { setCfg(r.config); setV({ taxa: r.config.taxa.valor ? String(r.config.taxa.valor) : "", minimo: String(r.config.saldo.minimo), recarga: r.config.mensagens.valor ? String(r.config.mensagens.valor) : "" }); }
  };
  useEffect(() => { void tentar(() => carregar(per, !!dados)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [per]);
  if (!dados) return <Vazio titulo="Carregando..." />;
  const s = dados.resumo;

  const gravar = () => tentar(async () => {
    await chamar("PUT", `/motoristas/${motoristaId}/creditos`, {
      taxa: { ...cfg.taxa, valor: num(v.taxa || "0") || 0 }, saldo: { ...cfg.saldo, minimo: num(v.minimo || "0") },
      mensagens: { ...cfg.mensagens, valor: num(v.recarga || "0") || 0 }, saque: cfg.saque,
    });
    await carregar(per); onSalvo();
  }, "Controle de créditos gravado.");

  const lancar = () => tentar(async () => {
    if (!lanc) return;
    const valor = num(lanc.valor) * lanc.sinal;
    await chamar("POST", `/motoristas/${motoristaId}/creditos/lancar`, { valor, descricao: lanc.descricao });
    setLanc(null); await carregar(per, true); onSalvo();
  }, "Lançamento feito.");

  return (
    <>
      {aviso}
      <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Situação cadastral: <b style={{ color: "var(--cg-txt)" }}>{dados.situacao}</b></p>
      <div className="cg-carteira">
        <div>
          <strong>{dados.nome}</strong><div className="cg-mono">{dados.cpf}</div>
          <Selo tom={dados.creditos.consumoAtivo ? "ok" : "neutro"}>{dados.creditos.consumoAtivo ? "Consumo de créditos ativado" : "Consumo de créditos desativado"}</Selo>
        </div>
        <div><small style={{ color: "var(--cg-suave)" }}>Créditos disponíveis</small><div className={`saldo ${dados.creditos.saldo < 0 ? "neg" : ""}`}>{dinheiro(dados.creditos.saldo)}</div></div>
        <div className="botoes">
          <button className="cg-botao" onClick={() => setLanc({ sinal: 1, valor: "", descricao: "" })}>+ Adicionar</button>
          <button className="cg-botao" onClick={() => setLanc({ sinal: -1, valor: "", descricao: "" })}>Retirar</button>
          <button className="cg-botao" onClick={() => setExtrato(!extrato)}>Extrato</button>
        </div>
      </div>
      {extrato && (dados.extrato.length ? <div className="cg-rolagem" style={{ marginBottom: 12 }}><table className="cg-tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Por</th><th className="direita">Valor</th></tr></thead>
        <tbody>{dados.extrato.map((x) => <tr key={x.id}><td>{dataHoraBr(x.em)}</td><td>{x.descricao}</td><td>{x.por}</td><td className="direita" style={{ color: x.valor < 0 ? "var(--cg-ruim)" : "var(--cg-ok)" }}>{dinheiro(x.valor)}</td></tr>)}</tbody></table></div> : <Vazio titulo="Sem lançamentos." />)}

      <h4 className="cg-secao">Resumo</h4>
      <Campo rotulo="Período"><select value={per} onChange={(e) => setPer(e.target.value)}>{PERIODOS.map(([id, r]) => <option key={id} value={id}>{r}</option>)}</select></Campo>
      <div style={{ marginTop: 8 }}>
        {[["Saldo anterior", s.saldoAnterior], ["Adicionados", s.adicionados], ["Retirados", s.retirados], ["Total do período", s.total], ["Saldo ao final do período", s.saldoFinal]].map(([r, n]) => <div className="cg-resumo-linha" key={r as string}><span>{r}</span><strong>{dinheiro(n as number)}</strong></div>)}
      </div>

      <h4 className="cg-secao">Taxa da central</h4>
      <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Você pode configurar uma taxa exclusiva para esse motorista ou fazê-lo seguir o padrão determinado pela central.</p>
      <Opcoes nome="c-taxa" valor={cfg.taxa.modo} onChange={(modo) => setCfg({ ...cfg, taxa: { ...cfg.taxa, modo } })} itens={[
        { id: "padrao", titulo: "Seguir o padrão da bandeira" }, { id: "personalizado", titulo: "Personalizar para este motorista" }, { id: "isento", titulo: "Desativar para este motorista" }]} />
      {cfg.taxa.modo === "personalizado" && (
        <div className="cg-grade" style={{ marginTop: 10 }}>
          <Campo rotulo="Modelo de cobrança"><select value={cfg.taxa.tipo} onChange={(e) => setCfg({ ...cfg, taxa: { ...cfg.taxa, tipo: e.target.value as "porcentagem" | "fixo" } })}><option value="porcentagem">Porcentagem por corrida (%)</option><option value="fixo">Valor fixo por corrida (R$)</option></select></Campo>
          <Campo rotulo="Valor da Taxa"><input inputMode="decimal" value={v.taxa} placeholder="0,00" onChange={(e) => setV({ ...v, taxa: e.target.value })} /></Campo>
        </div>
      )}

      <h4 className="cg-secao">Personalizações</h4>
      <Campo rotulo="Ativar saldo mínimo" dica="Configure o limite de saldo para que, quando o motorista não possuir créditos suficientes, ele pare de receber corridas." className=""><span /></Campo>
      <Opcoes nome="c-saldo" valor={cfg.saldo.modo} onChange={(modo) => setCfg({ ...cfg, saldo: { ...cfg.saldo, modo } })} itens={[
        { id: "padrao", titulo: "Seguir o padrão da bandeira", sub: dados.padrao.saldoMinimo == null ? "Padrão: sem bloqueio por saldo" : `Padrão: ${dinheiro(dados.padrao.saldoMinimo)}` }, { id: "desativado", titulo: "Desativar para este motorista" }, { id: "personalizado", titulo: "Ativar e personalizar para este motorista" }]} />
      {cfg.saldo.modo === "personalizado" && <div style={{ marginTop: 10, maxWidth: 360 }}><Campo rotulo="O saldo mínimo de créditos para receber corridas é de (R$):"><input inputMode="decimal" value={v.minimo} placeholder="0,00" onChange={(e) => setV({ ...v, minimo: e.target.value })} /></Campo></div>}
      <div style={{ height: 14 }} />
      <Campo rotulo="Ativar mensagens de recarga" dica="Enviar uma mensagem no aplicativo do motorista solicitando recarga de créditos."><span /></Campo>
      <Opcoes nome="c-msg" valor={cfg.mensagens.modo} onChange={(modo) => setCfg({ ...cfg, mensagens: { ...cfg.mensagens, modo } })} itens={[
        { id: "padrao", titulo: "Seguir o padrão da bandeira" }, { id: "desativado", titulo: "Desativar para este motorista" }, { id: "personalizado", titulo: "Ativar e personalizar para este motorista" }]} />
      {cfg.mensagens.modo === "personalizado" && <div style={{ marginTop: 10, maxWidth: 360 }}><Campo rotulo="Enviar mensagem quando a carteira de créditos do motorista atingir (R$):"><input inputMode="decimal" value={v.recarga} placeholder="0,00" onChange={(e) => setV({ ...v, recarga: e.target.value })} /></Campo></div>}

      <h4 className="cg-secao">Saques</h4>
      <Campo rotulo="Permissão de saques" dica="Configure se o motorista tem autonomia para solicitar o resgate do saldo disponível em sua carteira."><span /></Campo>
      <Opcoes nome="c-saque" valor={cfg.saque ? "sim" : "nao"} onChange={(x) => setCfg({ ...cfg, saque: x === "sim" })} itens={[{ id: "nao", titulo: "Desativar para este motorista" }, { id: "sim", titulo: "Ativar para este motorista" }]} />
      <p style={{ marginTop: 16 }}><button className="cg-botao primario" onClick={() => void gravar()}>Gravar</button></p>

      {lanc && (
        <Janela aberta titulo={lanc.sinal > 0 ? "Adicionar créditos" : "Retirar créditos"} sub={dados.nome} onFechar={() => setLanc(null)} largura="pequena"
          rodape={<button className="cg-botao primario cheio" disabled={!(num(lanc.valor) > 0)} onClick={() => void lancar()}>Confirmar</button>}>
          <Campo rotulo="Valor (R$)"><input inputMode="decimal" autoFocus value={lanc.valor} onChange={(e) => setLanc({ ...lanc, valor: e.target.value })} /></Campo>
          <div style={{ height: 10 }} />
          <Campo rotulo="Descrição"><input value={lanc.descricao} placeholder={lanc.sinal > 0 ? "Crédito da central" : "Débito da central"} onChange={(e) => setLanc({ ...lanc, descricao: e.target.value })} /></Campo>
        </Janela>
      )}
    </>
  );
}
