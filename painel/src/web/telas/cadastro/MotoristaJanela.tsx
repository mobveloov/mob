// Janela do motorista (Alterando Motorista, como na Machine): Geral (dados, documentos, status, configurações, veículos,
// endereço, dados internos e bancários), Financeiro, Documentos, Cerca Eletrônica e Controle de Créditos.
// Servidor: /api/gestao/motoristas/:id (e /cerca, /creditos). Aprovação de documentos: /api/apps-central/documentos.

import { useEffect, useState } from "react";
import { Ghost, X } from "lucide-react";
import { empresaEscolhidaAgora } from "../../api";
import { useAdmin } from "../../crm/comum";
import { Abas, Campo, chamar, dataHoraBr, dinheiro, Interruptor, Janela, Opcoes, Selo, useAviso, Vazio } from "./base";
import MapaAreas from "./MapaAreas";

type ModoTaxa = "padrao" | "personalizado" | "isento";
type ModoSaldo = "padrao" | "desativado" | "personalizado";
interface Financeiro { taxa: { modo: ModoTaxa; tipo: "porcentagem" | "fixo"; valor: number }; saldo: { modo: ModoSaldo; minimo: number }; mensagens: { modo: ModoSaldo; valor: number }; saque: boolean }
type Veiculo = { id: string; modelo: string; cor: string; placa: string; ano: number | null; categoria: string; emUso: boolean } & Record<string, string | number | boolean | null>;
interface Detalhe {
  motorista: Record<string, string | number | boolean | null>;
  indicadoPor: string;
  avaliacao: number | null;
  status: { mudouEm: string | null; logado: boolean; ocupacao: string; impedidoAte: string | null; motivoPunicao: string; ultimaCorrida: string | null; ultimaAtividade: string | null };
  preferencias: { pagamentos: string[]; exigencias: string[]; opcoesPagamento: string[]; opcoesExigencia: Array<{ id: string; nome: string }> };
  financeiro: Financeiro & { temSenha: boolean };
  padrao: { saldoMinimo: number | null; avisoRecarga: number | null };
  cerca: { permissao: string | null; bloqueios: string[] };
  veiculos: Veiculo[];
  documentos: Array<{ tipo: string; nome: string; situacao: string; motivo?: string; em?: string; enviado: boolean }>;
  resumo: { finalizadas: number; versaoApp: string | null; aceitacao: number | null; online: boolean };
  creditos: { saldo: number; minimo: number | null; bloqueado: boolean; consumoAtivo: boolean };
}
interface Creditos {
  situacao: string; nome: string; cpf: string; creditos: Detalhe["creditos"]; config: Financeiro; padrao: Detalhe["padrao"];
  resumo: { inicio: string; fim: string; saldoAnterior: number; adicionados: number; retirados: number; total: number; saldoFinal: number };
  extrato: Array<{ id: string; valor: number; descricao: string; em: string; por: string }>;
}
type Aba = "geral" | "financeiro" | "docs" | "cerca" | "creditos";

const FIN_PADRAO: Financeiro = { taxa: { modo: "padrao", tipo: "porcentagem", valor: 0 }, saldo: { modo: "padrao", minimo: -50 }, mensagens: { modo: "padrao", valor: 0 }, saque: true };
const RELACOES = [["Prioritário", "Motorista prioritário"], ["Secundário", "Motorista secundário"], ["Reserva", "Motorista reserva"]];
/** Situações do cadastro; "Bloqueado" é o "Suspenso" da Machine. */
const SITUACOES: Array<[string, string]> = [["Em análise", "Em análise"], ["Fila de espera", "Fila de espera"], ["Ativo", "Ativo"], ["Inativo", "Inativo"], ["Bloqueado", "Suspenso (bloqueado)"], ["Rejeitado", "Rejeitado"], ["Lixeira", "Deletado (lixeira)"]];
const SEXOS = ["Feminino", "Masculino", "Outros", "Prefiro não responder"];
const CHAVES_PIX = ["CPF", "CNPJ", "E-mail", "Telefone", "Chave aleatória"];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
/** Documentos da pessoa e do veículo (a Machine mostra os quatro primeiros no cadastro e os do veículo em cada veículo). */
const DOCS_PESSOA = ["cnh", "residencia", "antecedentes", "alvara"];
const DOCS_VEICULO = ["crlv", "autonomiaFrente", "autonomiaVerso", "fotoVeiculo"];
const CAMPOS = [
  "cidade", "nome", "cpf", "telefone", "email", "nascimento", "genero", "nivel", "tipoVinculo", "viatura", "cnhNumero", "validadeCnh", "status", "fantasma",
  "endereco", "numero", "semNumero", "complemento", "cep", "uf", "bairro", "referencia", "informacoesAdicionais",
  "tipoChavePix", "chavePix", "obsInterna1", "obsInterna2", "obsInterna3", "bancoCpfTitular", "bancoNomeTitular", "ocupacao", "renda", "bancoNumero", "bancoAgencia", "bancoConta", "bancoContaDv",
] as const;
const BOOLEANOS = ["fantasma", "semNumero"];
const OBRIGATORIOS: Array<[string, string]> = [["nome", "Nome"], ["nascimento", "Nascimento"], ["email", "E-mail"], ["telefone", "Telefone"], ["cpf", "CPF"], ["nivel", "Relação"], ["endereco", "Endereço"], ["cep", "CEP"], ["uf", "UF"], ["cidade", "Cidade"], ["bairro", "Bairro"]];

const texto = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => Number(v.replace(",", "."));
const lista = (v: unknown) => texto(v).split(",").map((x) => x.trim()).filter(Boolean);
const alternar = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

export default function MotoristaJanela({ id, onFechar, onSalvo, cidades, categorias }: { id: string | "novo"; onFechar: () => void; onSalvo: () => void; cidades: string[]; categorias: string[] }) {
  const novo = id === "novo";
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("geral");
  const [det, setDet] = useState<Detalhe | null>(null);
  const [dados, setDados] = useState<Record<string, string | boolean>>({ status: "Em análise", nivel: "Secundário", genero: "Masculino", fantasma: false, semNumero: false });
  const [cats, setCats] = useState<string[]>([]);
  const [pagamentos, setPagamentos] = useState<string[]>([]);
  const [exigencias, setExigencias] = useState<string[]>([]);
  const [fin, setFin] = useState<Financeiro>(FIN_PADRAO);
  const [valorTaxa, setValorTaxa] = useState("");
  const [minimo, setMinimo] = useState("-50");
  const [salvando, setSalvando] = useState(false);
  const { aviso, tentar, setAviso } = useAviso();

  const carregar = async () => {
    const d = await chamar<Detalhe>("GET", `/motoristas/${id}`);
    setDet(d);
    setDados(Object.fromEntries(CAMPOS.map((k) => [k, BOOLEANOS.includes(k) ? d.motorista[k] === true : texto(d.motorista[k])])) as Record<string, string | boolean>);
    setCats(lista(d.motorista.categorias)); setPagamentos(d.preferencias.pagamentos); setExigencias(d.preferencias.exigencias);
    setFin(d.financeiro); setValorTaxa(d.financeiro.taxa.valor ? String(d.financeiro.taxa.valor) : ""); setMinimo(String(d.financeiro.saldo.minimo));
  };
  const [opcoesNovo, setOpcoesNovo] = useState<Pick<Detalhe["preferencias"], "opcoesPagamento" | "opcoesExigencia">>({ opcoesPagamento: ["Dinheiro", "Maquininha de Débito", "Maquininha de Crédito", "Cartão no app", "Pix"], opcoesExigencia: [] });
  useEffect(() => { if (!novo) void tentar(carregar); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => { if (novo) void chamar<{ exigencias: Array<{ id: string; nome: string }> }>("GET", "/exigencias").then((r) => setOpcoesNovo((o) => ({ ...o, opcoesExigencia: r.exigencias }))).catch(() => undefined); }, [novo]);

  const set = (k: string, v: string | boolean) => setDados((d) => ({ ...d, [k]: v }));
  const finalizar = (): Financeiro => ({ ...fin, taxa: { ...fin.taxa, valor: num(valorTaxa || "0") || 0 }, saldo: { ...fin.saldo, minimo: num(minimo) } });
  const opPag = det?.preferencias.opcoesPagamento ?? opcoesNovo.opcoesPagamento;
  const opExi = det?.preferencias.opcoesExigencia ?? opcoesNovo.opcoesExigencia;

  const faltando = () => {
    const f = OBRIGATORIOS.filter(([k]) => !texto(dados[k]).trim()).map(([, r]) => r);
    if (dados.semNumero !== true && !texto(dados.numero).trim()) f.push("Número");
    if (novo && !cats.length) f.push("Categorias");
    return f;
  };

  const salvar = async () => {
    const f = faltando();
    if (f.length) { setAviso({ texto: `Preencha os campos obrigatórios: ${f.join(", ")}.`, erro: true }); return; }
    setSalvando(true);
    const d: Record<string, unknown> = { ...dados, fantasma: dados.fantasma === true, semNumero: dados.semNumero === true, categorias: cats.join(", ") };
    for (const k of ["renda"]) if (d[k] === "") d[k] = null;
    const corpo = { dados: d, financeiro: finalizar(), pagamentos, exigencias };
    const ok = await tentar(() => (novo ? chamar("POST", "/motoristas", corpo) : chamar("PUT", `/motoristas/${id}`, corpo)), "Perfil salvo.");
    setSalvando(false);
    if (ok) { onSalvo(); if (novo) onFechar(); else await carregar(); }
  };

  const excluir = async () => {
    if (!confirm("Excluir este motorista? Ele vai para a lixeira (o histórico de corridas e a carteira continuam).")) return;
    if (await tentar(() => chamar("DELETE", `/motoristas/${id}`), "Motorista enviado para a lixeira.")) { onSalvo(); onFechar(); }
  };

  const abas = [{ id: "geral" as const, rotulo: "Geral" }, { id: "financeiro" as const, rotulo: "Financeiro" }, { id: "docs" as const, rotulo: "Documentos" },
    { id: "cerca" as const, rotulo: "Cerca Eletrônica" }, { id: "creditos" as const, rotulo: "Controle de Créditos" }];
  const nome = texto(dados.nome);
  const st = det?.status;

  return (
    <Janela aberta titulo={novo ? "Novo Motorista" : nome || "Motorista"} sub={novo ? "Criando Motorista" : "Alterando Motorista"} onFechar={onFechar} largura="grande"
      abas={<Abas itens={abas} valor={aba} onChange={setAba} />}
      rodape={<>
        {!novo && <button className="cg-botao perigo" style={{ marginRight: "auto" }} onClick={() => void excluir()}>Excluir</button>}
        <button className="cg-botao" onClick={onFechar}>Voltar</button>
        {(aba === "geral" || aba === "financeiro") && <button className="cg-botao primario" disabled={salvando} onClick={() => void salvar()}>Gravar</button>}
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
          <p style={{ margin: "0 0 6px", color: "var(--cg-suave)" }}>Campos com * são obrigatórios.</p>
          {!novo && det?.indicadoPor && <p style={{ margin: "0 0 6px" }}>Motorista indicado por: <b>{det.indicadoPor}</b></p>}
          <h4 className="cg-secao">Dados Principais</h4>
          <div className="cg-grade">
            <Campo rotulo="Nome *"><input value={nome} placeholder="Nome e sobrenome" onChange={(e) => set("nome", e.target.value)} /></Campo>
            <Campo rotulo="Sexo"><select value={SEXOS.includes(texto(dados.genero)) ? texto(dados.genero) : ""} onChange={(e) => set("genero", e.target.value)}><option value="">Selecione</option>{SEXOS.map((s) => <option key={s}>{s}</option>)}</select></Campo>
            <Campo rotulo="Nascimento *"><input type="date" value={texto(dados.nascimento)} onChange={(e) => set("nascimento", e.target.value)} /></Campo>
            <Campo rotulo="Avaliação"><input readOnly value={det?.avaliacao == null ? "0" : String(det.avaliacao).replace(".", ",")} /></Campo>
            <Campo rotulo="E-mail *"><input type="email" value={texto(dados.email)} placeholder="email@exemplo.com" onChange={(e) => set("email", e.target.value)} /></Campo>
            <Campo rotulo="Telefone * (+55)"><input value={texto(dados.telefone)} placeholder="(11) 96123-4567" onChange={(e) => set("telefone", e.target.value)} /></Campo>
            <Campo rotulo="CPF *"><input value={texto(dados.cpf)} placeholder="000.000.000-00" onChange={(e) => set("cpf", e.target.value)} /></Campo>
            <Campo rotulo="Relação *"><select value={texto(dados.nivel)} onChange={(e) => set("nivel", e.target.value)}><option value="">Selecione</option>{RELACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
            <Campo rotulo="Tipo de vínculo"><select value={texto(dados.tipoVinculo)} onChange={(e) => set("tipoVinculo", e.target.value)}><option value="">Selecione</option><option>Titular</option><option>Auxiliar</option></select></Campo>
            <Campo rotulo="Número da viatura"><input value={texto(dados.viatura)} placeholder="Ex: 1050" onChange={(e) => set("viatura", e.target.value)} /></Campo>
            <Campo rotulo="Número da CNH"><input value={texto(dados.cnhNumero)} onChange={(e) => set("cnhNumero", e.target.value)} /></Campo>
            <Campo rotulo="Validade da CNH"><input type="date" value={texto(dados.validadeCnh)} onChange={(e) => set("validadeCnh", e.target.value)} /></Campo>
          </div>
          {!novo && <><h4 className="cg-secao">Foto do motorista</h4><Documentos motoristaId={id} tipos={["foto"]} lista={det?.documentos ?? []} recarregar={carregar} titulo="Enviar foto" /></>}
          <h4 className="cg-secao">Documentos do motorista</h4>
          <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Envie arquivos jpeg, jpg, pdf ou png com tamanho máximo de 5MB.</p>
          {novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Documentos motoristaId={id} tipos={DOCS_PESSOA} lista={det?.documentos ?? []} recarregar={carregar} />}

          <h4 className="cg-secao">Status</h4>
          <div className="cg-grade">
            <Campo rotulo="Status"><select value={texto(dados.status)} onChange={(e) => set("status", e.target.value)}>{SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
            {!novo && st && <>
              <Campo rotulo="Última mudança de status"><input readOnly value={dataHoraBr(st.mudouEm)} /></Campo>
              <Campo rotulo="Logado"><input readOnly value={st.logado ? "Sim" : "Não"} /></Campo>
              <Campo rotulo="Situação (Livre/Ocupado)"><input readOnly value={st.ocupacao || "--"} /></Campo>
              <Campo rotulo="Motorista impedido até"><input readOnly value={dataHoraBr(st.impedidoAte)} /></Campo>
              <Campo rotulo="Motivo da punição"><input readOnly value={st.motivoPunicao} /></Campo>
              <Campo rotulo="Última corrida"><input readOnly value={dataHoraBr(st.ultimaCorrida)} /></Campo>
              <Campo rotulo="Última atividade"><input readOnly value={dataHoraBr(st.ultimaAtividade)} /></Campo>
            </>}
          </div>
          {!novo && st?.logado && <p><button className="cg-botao" onClick={() => void tentar(async () => { await chamar("POST", `/motoristas/${id}/deslogar`, {}); await carregar(); }, "Motorista deslogado.")}>Deslogar</button></p>}
          <div className="cg-caixa-roxa" style={{ marginTop: 14 }}>
            <div><h5><Ghost size={14} style={{ verticalAlign: "-2px" }} /> Modo Fantasma (Oculto)</h5><p>Oculto no mapa mas recebe corridas normalmente.</p></div>
            <Interruptor ligado={dados.fantasma === true} onChange={(v) => set("fantasma", v)} />
          </div>

          <h4 className="cg-secao">Configurações</h4>
          <Campo rotulo={`Categorias${novo ? " *" : ""}`}><span /></Campo>
          <div className="cg-caixas">{categorias.map((c) => <label key={c}><input type="checkbox" checked={cats.includes(c)} onChange={() => setCats(alternar(cats, c))} />{c}</label>)}</div>
          <Campo rotulo="Aceita pagamento para" dica="Sem nenhuma marcada, o motorista aceita todas as formas."><span /></Campo>
          <div className="cg-caixas">{opPag.map((p) => <label key={p}><input type="checkbox" checked={pagamentos.includes(p)} onChange={() => setPagamentos(alternar(pagamentos, p))} />{p}</label>)}</div>
          <Campo rotulo="Aceita exigência para" dica="Corridas com exigências só vão para motoristas que aceitam todas."><span /></Campo>
          <div className="cg-caixas">{opExi.length ? opExi.map((x) => <label key={x.id}><input type="checkbox" checked={exigencias.includes(x.id)} onChange={() => setExigencias(alternar(exigencias, x.id))} />{x.nome}</label>) : <small style={{ color: "var(--cg-suave)" }}>Nenhuma exigência cadastrada (Config › Gerais do App).</small>}</div>

          <h4 className="cg-secao">Dados do Veículo</h4>
          {novo ? <Vazio titulo="Disponível após o cadastro inicial." sub="Grave o motorista e depois cadastre os veículos." /> : <Veiculos motoristaId={id} lista={det?.veiculos ?? []} docs={det?.documentos ?? []} recarregar={carregar} />}

          <h4 className="cg-secao">Dados Pessoais</h4>
          <div className="cg-grade">
            <Campo rotulo="Endereço *" className="larga"><input value={texto(dados.endereco)} placeholder="Rua, Av..." onChange={(e) => set("endereco", e.target.value)} /></Campo>
            <Campo rotulo={dados.semNumero === true ? "Número" : "Número *"}><input value={dados.semNumero === true ? "S/N" : texto(dados.numero)} disabled={dados.semNumero === true} onChange={(e) => set("numero", e.target.value)} /></Campo>
            <Campo rotulo="Endereço sem número"><Interruptor ligado={dados.semNumero === true} onChange={(v) => set("semNumero", v)} /></Campo>
            <Campo rotulo="Complemento"><input value={texto(dados.complemento)} onChange={(e) => set("complemento", e.target.value)} /></Campo>
            <Campo rotulo="CEP *"><input value={texto(dados.cep)} placeholder="00000-000" onChange={(e) => set("cep", e.target.value)} /></Campo>
            <Campo rotulo="UF *"><select value={texto(dados.uf).toUpperCase()} onChange={(e) => set("uf", e.target.value)}><option value="">Selecione</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo rotulo="Cidade *"><input list="cm-cidades" value={texto(dados.cidade)} onChange={(e) => set("cidade", e.target.value)} /><datalist id="cm-cidades">{cidades.map((c) => <option key={c} value={c} />)}</datalist></Campo>
            <Campo rotulo="Bairro *"><input value={texto(dados.bairro)} onChange={(e) => set("bairro", e.target.value)} /></Campo>
            <Campo rotulo="Referência do endereço" className="larga"><input value={texto(dados.referencia)} onChange={(e) => set("referencia", e.target.value)} /></Campo>
            <Campo rotulo="Informações adicionais" className="larga"><textarea rows={2} value={texto(dados.informacoesAdicionais)} onChange={(e) => set("informacoesAdicionais", e.target.value)} /></Campo>
          </div>

          <h4 className="cg-secao">Dados Internos</h4>
          <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Nos campos a seguir, você pode preencher observações sobre este motorista. Essas observações só podem ser vistas pela central.</p>
          <div className="cg-grade">
            <Campo rotulo="Tipo chave PIX"><select disabled={!admin} value={texto(dados.tipoChavePix)} onChange={(e) => set("tipoChavePix", e.target.value)}><option value="">Selecione</option>{CHAVES_PIX.map((t) => <option key={t}>{t}</option>)}</select></Campo>
            <Campo rotulo="Chave PIX"><input disabled={!admin} value={texto(dados.chavePix)} onChange={(e) => set("chavePix", e.target.value)} /></Campo>
            {[1, 2, 3].map((n) => <Campo key={n} rotulo={`Observação interna ${n}`} className="larga"><textarea rows={2} value={texto(dados[`obsInterna${n}`])} onChange={(e) => set(`obsInterna${n}`, e.target.value)} /></Campo>)}
          </div>

          <h4 className="cg-secao">Dados Bancários (opcionais)</h4>
          {!admin && <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Só o administrador altera os dados bancários e a chave PIX.</p>}
          <div className="cg-grade">
            <Campo rotulo="CPF Titular Conta"><input disabled={!admin} value={texto(dados.bancoCpfTitular)} onChange={(e) => set("bancoCpfTitular", e.target.value)} /></Campo>
            <Campo rotulo="Nome Titular Conta"><input disabled={!admin} value={texto(dados.bancoNomeTitular)} onChange={(e) => set("bancoNomeTitular", e.target.value)} /></Campo>
            <Campo rotulo="Ocupação profissional"><input disabled={!admin} value={texto(dados.ocupacao)} onChange={(e) => set("ocupacao", e.target.value)} /></Campo>
            <Campo rotulo="Renda Mensal"><input disabled={!admin} inputMode="decimal" value={texto(dados.renda)} onChange={(e) => set("renda", e.target.value)} /></Campo>
            <Campo rotulo="Número Banco"><input disabled={!admin} value={texto(dados.bancoNumero)} onChange={(e) => set("bancoNumero", e.target.value)} /></Campo>
            <Campo rotulo="Número Agência"><input disabled={!admin} value={texto(dados.bancoAgencia)} onChange={(e) => set("bancoAgencia", e.target.value)} /></Campo>
            <Campo rotulo="Número Conta"><input disabled={!admin} value={texto(dados.bancoConta)} onChange={(e) => set("bancoConta", e.target.value)} /></Campo>
            <Campo rotulo="Dígito"><input disabled={!admin} value={texto(dados.bancoContaDv)} maxLength={2} onChange={(e) => set("bancoContaDv", e.target.value)} /></Campo>
          </div>
        </>
      )}
      {aba === "financeiro" && (
        <>
          <h4 className="cg-secao">Taxa da Plataforma</h4>
          <p style={{ margin: "0 0 8px", color: "var(--cg-suave)" }}>Como este motorista paga pelo uso do sistema?{!admin && " Só o administrador altera."}</p>
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
      {aba === "docs" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Documentos motoristaId={id} tipos={null} lista={det?.documentos ?? []} recarregar={carregar} avaliar />)}
      {aba === "cerca" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <Cerca motoristaId={id} />)}
      {aba === "creditos" && (novo ? <Vazio titulo="Disponível após o cadastro inicial." /> : <ControleCreditos motoristaId={id} onSalvo={() => void carregar()} />)}
    </Janela>
  );
}

// ---------------------------------------------------------------- veículos

const VEICULO_VAZIO = { modelo: "", cor: "", corHex: "", placa: "", ano: "", anoExercicio: "", ufEmplacamento: "", cidadeEmplacamento: "", renavam: "", validadeLicenciamento: "", veiculoProprio: "Sim", categoria: "" };

function Veiculos({ motoristaId, lista, docs, recarregar }: { motoristaId: string; lista: Veiculo[]; docs: Detalhe["documentos"]; recarregar: () => Promise<void> }) {
  const { aviso, tentar } = useAviso();
  return (
    <>
      {aviso}
      {!lista.length && <Vazio titulo="Nenhum veículo cadastrado." sub="Cadastre abaixo." />}
      {lista.map((v, i) => (
        <div key={v.id} style={{ marginBottom: 14 }}>
          <h5 style={{ margin: "0 0 6px" }}>Veículo {i + 1} {v.emUso ? <Selo tom="ok">Em uso</Selo> : <Selo tom="neutro">Guardado</Selo>}</h5>
          <FormVeiculo inicial={v} rotuloSalvar="Salvar veículo" onSalvar={(f) => tentar(async () => { await chamar("PUT", `/veiculos/${v.id}`, f); await recarregar(); }, "Veículo salvo.")} />
          <div className="cg-acoes" style={{ marginTop: 8 }}>
            <button className="cg-botao" onClick={() => void tentar(async () => { await chamar("POST", `/veiculos/${v.id}/uso`, { emUso: !v.emUso }); await recarregar(); })}>{v.emUso ? "Guardar" : "Usar este"}</button>
            <button className="cg-botao perigo" onClick={() => confirm("Remover este veículo?") && void tentar(async () => { await chamar("DELETE", `/veiculos/${v.id}`); await recarregar(); })}>Remover</button>
          </div>
        </div>
      ))}
      <p style={{ margin: "10px 0 6px", color: "var(--cg-suave)" }}>Documentos do veículo: envie arquivos jpeg, jpg, pdf ou png com tamanho máximo de 5MB.</p>
      <Documentos motoristaId={motoristaId} tipos={DOCS_VEICULO} lista={docs} recarregar={recarregar} />
      <h4 className="cg-secao">Adicionar Veículo</h4>
      <FormVeiculo inicial={VEICULO_VAZIO} limpar rotuloSalvar="Adicionar Veículo" onSalvar={(f) => tentar(async () => { await chamar("POST", "/veiculos", { motoristaId, ...f }); await recarregar(); }, "Veículo salvo.")} />
    </>
  );
}

function FormVeiculo({ inicial, onSalvar, rotuloSalvar, limpar }: { inicial: Record<string, unknown>; onSalvar: (f: Record<string, unknown>) => Promise<boolean>; rotuloSalvar: string; limpar?: boolean }) {
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(VEICULO_VAZIO).map((k) => [k, texto(inicial[k])])));
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const enviar = async () => {
    const corpo: Record<string, unknown> = { ...f, placa: f.placa.toUpperCase(), ano: f.ano ? Number(f.ano) : null, anoExercicio: f.anoExercicio ? Number(f.anoExercicio) : null };
    for (const k of ["corHex", "ufEmplacamento", "cidadeEmplacamento", "renavam", "validadeLicenciamento", "categoria"]) if (!f[k]) corpo[k] = null;
    if (await onSalvar(corpo) && limpar) setF(Object.fromEntries(Object.keys(VEICULO_VAZIO).map((k) => [k, (VEICULO_VAZIO as Record<string, string>)[k]])));
  };
  return (
    <>
      <div className="cg-grade">
        <Campo rotulo="Placa *"><input value={f.placa} placeholder="ABC1D23" onChange={(e) => set("placa", e.target.value.toUpperCase())} /></Campo>
        <Campo rotulo="Modelo *"><input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} /></Campo>
        <Campo rotulo="Ano de fabricação *"><input type="number" value={f.ano} onChange={(e) => set("ano", e.target.value)} /></Campo>
        <Campo rotulo="Ano de exercício"><input type="number" value={f.anoExercicio} onChange={(e) => set("anoExercicio", e.target.value)} /></Campo>
        <Campo rotulo="UF de emplacamento"><select value={f.ufEmplacamento} onChange={(e) => set("ufEmplacamento", e.target.value)}><option value="">Selecione</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo rotulo="Cidade de emplacamento"><input value={f.cidadeEmplacamento} onChange={(e) => set("cidadeEmplacamento", e.target.value)} /></Campo>
        <Campo rotulo="Código RENAVAM"><input inputMode="numeric" value={f.renavam} onChange={(e) => set("renavam", e.target.value)} /></Campo>
        <Campo rotulo="Validade do licenciamento"><input type="date" value={f.validadeLicenciamento} onChange={(e) => set("validadeLicenciamento", e.target.value)} /></Campo>
        <Campo rotulo="Cor"><input value={f.cor} onChange={(e) => set("cor", e.target.value)} /></Campo>
        <Campo rotulo="Código da cor"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.corHex) ? f.corHex : "#ffffff"} onChange={(e) => set("corHex", e.target.value)} /></Campo>
        <Campo rotulo="Veículo próprio"><select value={f.veiculoProprio} onChange={(e) => set("veiculoProprio", e.target.value)}><option>Sim</option><option>Não</option></select></Campo>
      </div>
      <p><button className="cg-botao primario" onClick={() => void enviar()}>{rotuloSalvar}</button></p>
    </>
  );
}

// ---------------------------------------------------------------- documentos

const TOM_DOC: Record<string, "ok" | "ruim" | "alerta" | "neutro"> = { Aprovado: "ok", Recusado: "ruim", Enviado: "alerta", Pendente: "neutro" };

function Documentos({ motoristaId, tipos, lista, recarregar, avaliar: podeAvaliar, titulo }: { motoristaId: string; tipos: string[] | null; lista: Detalhe["documentos"]; recarregar: () => Promise<void>; avaliar?: boolean; titulo?: string }) {
  const { aviso, tentar } = useAviso();
  const mostrar = tipos ? tipos.map((t) => lista.find((d) => d.tipo === t)).filter((d): d is Detalhe["documentos"][number] => !!d) : lista;
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
  const excluir = (tipo: string) => confirm("Excluir este documento?") && void tentar(async () => { await chamar("DELETE", `/motoristas/${motoristaId}/documentos/${tipo}`); await recarregar(); }, "Documento excluído.");
  const avaliar = (tipo: string, aprovado: boolean) => {
    const motivo = aprovado ? "" : prompt("Motivo da rejeição (o motorista vê no app):") ?? "";
    if (!aprovado && !motivo.trim()) return;
    void tentar(async () => { await chamar("POST", `/documentos/${motoristaId}/${tipo}`, { aprovado, motivo }, "/api/apps-central"); await recarregar(); }, aprovado ? "Documento aprovado." : "Documento rejeitado.");
  };
  return (
    <>
      {aviso}
      <div className="cg-docs">{mostrar.map((d) => (
        <div className="cg-doc" key={d.tipo}>
          <header><span>{d.nome}</span><Selo tom={TOM_DOC[d.situacao] ?? "neutro"}>{d.situacao === "Recusado" ? "Rejeitado" : d.situacao === "Enviado" ? "Em análise" : d.situacao}</Selo></header>
          <div className="previa">{!d.enviado ? "(Sem arquivo)" : <a href={`/api/apps-central/documentos/${motoristaId}/${d.tipo}`} target="_blank" rel="noopener noreferrer">Ver arquivo</a>}</div>
          {d.motivo && d.situacao === "Recusado" && <small style={{ color: "var(--cg-ruim)" }}>Motivo: {d.motivo}</small>}
          {d.em && <small style={{ color: "var(--cg-suave)" }}>{dataHoraBr(d.em)}</small>}
          <div className="botoes">
            {podeAvaliar && d.enviado && <><button className="cg-botao" title="Aprovar" onClick={() => avaliar(d.tipo, true)}>Aprovar</button><button className="cg-botao perigo" title="Rejeitar" onClick={() => avaliar(d.tipo, false)}>Rejeitar</button></>}
            <label className="cg-botao" style={{ cursor: "pointer" }}>{titulo ?? (d.enviado ? "Trocar arquivo" : "Enviar arquivo")}<input type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => { enviar(d.tipo, e.target.files?.[0]); e.target.value = ""; }} /></label>
            {d.enviado && <button className="cg-botao perigo" onClick={() => excluir(d.tipo)}>Excluir</button>}
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
