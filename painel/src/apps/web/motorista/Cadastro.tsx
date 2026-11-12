// Cadastro do motorista em 5 passos (dados pessoais, foto do rosto, endereço, veículo e documentos) e os mesmos
// formulários usados depois em "Meu cadastro". Depois do passo 5 fica "Em análise" até a central aprovar.

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck, Building2, CalendarDays, Camera, Car, CircleAlert, Clock3, CreditCard, FileText, Hash, Hourglass, House, IdCard, KeyRound,
  Mail, Map as IconeMapa, MapPin, MapPinned, Palette, Smartphone, UserRound,
} from "lucide-react";
import { api, guardarToken } from "../comum/api";
import { mensagemDeErro } from "../comum/ui";
import { Campo, Carregando, Erro, Info, Pagina, Topo, Vazio, semRota, useBuscar, useImagem } from "./Pecas";
import { diaHora, type Veiculo } from "./tipos";

// ------------------------------------------------------------------ máscaras e listas

const digitos = (s: string) => s.replace(/\D/g, "");
export const mascaraCpf = (s: string) => digitos(s).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
export const mascaraTelefone = (s: string) => {
  const d = digitos(s).slice(0, 11);
  return d.length <= 2 ? d : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};
const mascaraCep = (s: string) => digitos(s).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const GENEROS = ["Masculino", "Feminino", "Outro", "Prefiro não dizer"];
const CORES = ["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Verde", "Amarelo", "Marrom", "Bege", "Vinho", "Laranja", "Dourado", "Outra"];

export interface DadosPessoais { nome: string; cpf: string; telefone: string; email: string; nascimento: string; genero: string; chavePix: string }
export interface Endereco { cep: string; rua: string; numero: string; semNumero: boolean; complemento: string; bairro: string; uf: string; cidade: string }
export interface DadosCadastro { dados: DadosPessoais; endereco: Endereco; foto: string | null; situacao: string; pendencias: string[] }

const DADOS_VAZIOS: DadosPessoais = { nome: "", cpf: "", telefone: "", email: "", nascimento: "", genero: "", chavePix: "" };
const ENDERECO_VAZIO: Endereco = { cep: "", rua: "", numero: "", semNumero: false, complemento: "", bairro: "", uf: "", cidade: "" };

/** Diminui a foto antes de enviar (no máximo 1280 px, JPEG). */
async function reduzir(arq: File, max = 1280): Promise<Blob> {
  try {
    const img = await createImageBitmap(arq);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? arq), "image/jpeg", 0.85));
  } catch { return arq; }
}

function useFormulario<T>(inicial: T) {
  const [v, setV] = useState(inicial);
  useEffect(() => { setV(inicial); }, [inicial]);
  const campo = <K extends keyof T>(k: K) => (valor: T[K]) => setV((a) => ({ ...a, [k]: valor }));
  return [v, campo, setV] as const;
}

function useEnviar() {
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (f: () => Promise<void>, falta = "Ainda não dá para salvar isso pelo app. Fale com a central.") => {
    setErro(""); setOk(""); setOcupado(true);
    try { await f(); } catch (e) { setErro(semRota(e) ? falta : mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return { erro, ok, setOk, ocupado, enviar };
}

// ------------------------------------------------------------------ passo 1: dados pessoais

export function FormDados({ inicial = DADOS_VAZIOS, criar, aoSalvar, botao }: { inicial?: DadosPessoais; criar?: boolean; aoSalvar: () => void; botao: string }) {
  const [d, campo] = useFormulario(inicial);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const { erro, ok, setOk, ocupado, enviar } = useEnviar();
  const valido = d.nome.trim().length >= 3 && digitos(d.telefone).length >= 10 && /\S+@\S+\.\S+/.test(d.email) && (!criar || (digitos(d.cpf).length === 11 && senha.length >= 6));
  const salvar = () => enviar(async () => {
    const corpo = { ...d, cpf: digitos(d.cpf), telefone: digitos(d.telefone) };
    if (criar) {
      if (senha !== senha2) throw new Error("As senhas não são iguais.");
      const r = await api<{ token: string }>("/conta/criar", { corpo: { papel: "motorista", ...corpo, senha } });
      guardarToken(r.token);
    } else { await api("/cadastro/dados", { corpo }); setOk("Dados salvos."); }
    aoSalvar();
  }, criar ? "O cadastro pelo app ainda não está disponível. Fale com a central." : undefined);
  return (
    <form className="formulario" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <Campo rotulo="Nome completo" obrigatorio icone={UserRound}><input autoComplete="name" placeholder="Ex.: João da Silva" value={d.nome} onChange={(e) => campo("nome")(e.target.value)} /></Campo>
      <Campo rotulo="CPF" obrigatorio={criar} icone={IdCard}><input inputMode="numeric" placeholder="000.000.000-00" value={mascaraCpf(d.cpf)} onChange={(e) => campo("cpf")(e.target.value)} disabled={!criar && !!inicial.cpf} /></Campo>
      <Campo rotulo="Telefone" obrigatorio icone={Smartphone}><input inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={mascaraTelefone(d.telefone)} onChange={(e) => campo("telefone")(e.target.value)} /></Campo>
      <Campo rotulo="E-mail" obrigatorio icone={Mail}><input inputMode="email" autoComplete="email" placeholder="seu@email.com" value={d.email} onChange={(e) => campo("email")(e.target.value.trim())} /></Campo>
      <div className="duas">
        <Campo rotulo="Nascimento" icone={CalendarDays}><input type="date" value={d.nascimento} onChange={(e) => campo("nascimento")(e.target.value)} /></Campo>
        <Campo rotulo="Gênero"><select value={d.genero} onChange={(e) => campo("genero")(e.target.value)}><option value="">Selecione</option>{GENEROS.map((g) => <option key={g}>{g}</option>)}</select></Campo>
      </div>
      <Campo rotulo="Chave Pix" icone={Hash} dica="Para receber seus repasses."><input value={d.chavePix} maxLength={120} placeholder="CPF, celular, e-mail ou chave aleatória" onChange={(e) => campo("chavePix")(e.target.value)} /></Campo>
      {criar && (
        <>
          <Campo rotulo="Senha" obrigatorio icone={KeyRound}><input type="password" autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} /></Campo>
          <Campo rotulo="Confirmar senha" obrigatorio icone={KeyRound}><input type="password" autoComplete="new-password" placeholder="Repita sua senha" value={senha2} onChange={(e) => setSenha2(e.target.value)} /></Campo>
        </>
      )}
      <Erro texto={erro} /><Info texto={ok} tipo="ok" />
      <button className="botao-m" disabled={ocupado || !valido} onClick={() => setOk("")}>{botao}</button>
    </form>
  );
}

// ------------------------------------------------------------------ passo 2: foto do rosto

export function FormFoto({ fotoAtual, aoSalvar, botao }: { fotoAtual?: string | null; aoSalvar: () => void; botao: string }) {
  const [previa, setPrevia] = useState("");
  const [enviada, setEnviada] = useState(false);
  const atual = useImagem(fotoAtual);
  const entrada = useRef<HTMLInputElement>(null);
  const { erro, ocupado, enviar } = useEnviar();
  const escolher = (arq: File | undefined) => {
    if (!arq) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)/.test(arq.type) && arq.type) { void enviar(async () => { throw new Error("Escolha uma foto (JPG ou PNG)."); }); return; }
    void enviar(async () => {
      const b = await reduzir(arq);
      if (b.size > 3 * 1024 * 1024) throw new Error("A foto passa de 3 MB. Tire outra.");
      await api("/foto", { bruto: b.type ? b : new Blob([b], { type: "image/jpeg" }) });
      setPrevia(URL.createObjectURL(b)); setEnviada(true);
    }, "O envio da foto ainda não está disponível. Fale com a central.");
  };
  const mostrar = previa || atual;
  return (
    <div className="formulario centro">
      <p className="dica grande">Escolha uma foto clara e de frente.</p>
      <div className="foto-rosto">
        {mostrar ? <img src={mostrar} alt="Sua foto" /> : <UserRound size={90} />}
        <button type="button" className="foto-camera" aria-label="Tirar foto" onClick={() => entrada.current?.click()}><Camera size={20} /></button>
      </div>
      <input ref={entrada} type="file" accept="image/*" capture="user" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
      <Erro texto={erro} />
      {enviada || (mostrar && !previa)
        ? <><button type="button" className="botao-m" onClick={aoSalvar}>{botao}</button><button type="button" className="link-m" onClick={() => entrada.current?.click()}>Trocar foto</button></>
        : <button type="button" className="botao-m" disabled={ocupado} onClick={() => entrada.current?.click()}><Camera size={18} /> {ocupado ? "ENVIANDO…" : "ESCOLHER FOTO"}</button>}
    </div>
  );
}

// ------------------------------------------------------------------ passo 3: endereço

export function FormEndereco({ inicial = ENDERECO_VAZIO, aoSalvar, botao }: { inicial?: Endereco; aoSalvar: () => void; botao: string }) {
  const [d, campo, setD] = useFormulario(inicial);
  const { erro, ok, setOk, ocupado, enviar } = useEnviar();
  const buscarCep = async (cep: string) => {
    try {
      const r = await api<{ rua: string; bairro: string; cidade: string; uf: string }>(`/cep/${cep}`);
      setD((a) => ({ ...a, rua: r.rua || a.rua, bairro: r.bairro || a.bairro, cidade: r.cidade || a.cidade, uf: r.uf || a.uf }));
    } catch { /* sem base de CEP: preenche à mão */ }
  };
  const valido = digitos(d.cep).length === 8 && d.rua.trim() && (d.semNumero || d.numero.trim()) && d.bairro.trim() && d.uf && d.cidade.trim();
  return (
    <form className="formulario" onSubmit={(e) => { e.preventDefault(); void enviar(async () => { await api("/cadastro/endereco", { corpo: { ...d, cep: digitos(d.cep), numero: d.semNumero ? "" : d.numero } }); setOk("Endereço salvo."); aoSalvar(); }); }}>
      <Campo rotulo="CEP" obrigatorio icone={IconeMapa}>
        <input inputMode="numeric" placeholder="00000-000" value={mascaraCep(d.cep)} onChange={(e) => { const c = digitos(e.target.value); campo("cep")(c); if (c.length === 8) void buscarCep(c); }} />
      </Campo>
      <div className="duas larga">
        <Campo rotulo="Endereço" obrigatorio icone={House}><input autoComplete="address-line1" value={d.rua} onChange={(e) => campo("rua")(e.target.value)} /></Campo>
        <Campo rotulo="Número" obrigatorio={!d.semNumero} icone={MapPin}><input inputMode="numeric" value={d.semNumero ? "" : d.numero} disabled={d.semNumero} onChange={(e) => campo("numero")(e.target.value)} /></Campo>
      </div>
      <label className="marcar"><input type="checkbox" checked={d.semNumero} onChange={(e) => campo("semNumero")(e.target.checked)} /> Endereço sem número</label>
      <Campo rotulo="Complemento" icone={MapPinned}><input value={d.complemento} onChange={(e) => campo("complemento")(e.target.value)} /></Campo>
      <Campo rotulo="Bairro" obrigatorio icone={Building2}><input value={d.bairro} onChange={(e) => campo("bairro")(e.target.value)} /></Campo>
      <div className="duas estreita">
        <Campo rotulo="UF" obrigatorio><select value={d.uf} onChange={(e) => campo("uf")(e.target.value)}><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo rotulo="Cidade" obrigatorio icone={MapPin}><input value={d.cidade} onChange={(e) => campo("cidade")(e.target.value)} /></Campo>
      </div>
      <Erro texto={erro} /><Info texto={ok} tipo="ok" />
      <button className="botao-m" disabled={ocupado || !valido}>{botao}</button>
    </form>
  );
}

// ------------------------------------------------------------------ passo 4: veículo

export function FormVeiculo({ inicial, aoSalvar, botao }: { inicial?: Veiculo | null; aoSalvar: () => void; botao: string }) {
  const [d, setD] = useState({ cnh: inicial?.cnh ?? "", validadeCnh: inicial?.validadeCnh ?? "", placa: inicial?.placa ?? "", modelo: inicial?.modelo ?? "", ano: String(inicial?.ano ?? ""), cor: inicial?.cor ?? "" });
  const campo = (k: keyof typeof d) => (v: string) => setD((a) => ({ ...a, [k]: v }));
  const { erro, ocupado, enviar } = useEnviar();
  const placaOk = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(d.placa.toUpperCase());
  const valido = d.cnh.trim().length >= 5 && d.validadeCnh && placaOk && d.modelo.trim() && /^\d{4}$/.test(d.ano) && d.cor;
  return (
    <form className="formulario" onSubmit={(e) => {
      e.preventDefault();
      void enviar(async () => {
        await api(inicial?.id ? `/veiculos/${inicial.id}` : "/veiculos", { corpo: { ...d, placa: d.placa.toUpperCase().replace("-", ""), ano: Number(d.ano) } });
        aoSalvar();
      }, "O cadastro de veículos pelo app ainda não está disponível. Fale com a central.");
    }}>
      <div className="duas">
        <Campo rotulo="CNH" obrigatorio icone={CreditCard}><input inputMode="numeric" value={d.cnh} maxLength={15} onChange={(e) => campo("cnh")(digitos(e.target.value))} /></Campo>
        <Campo rotulo="Validade" obrigatorio icone={CalendarDays}><input type="date" value={d.validadeCnh} onChange={(e) => campo("validadeCnh")(e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Placa" obrigatorio icone={Hash} dica={d.placa && !placaOk ? "Use o padrão ABC-1234 ou ABC1D23." : undefined}>
        <input autoCapitalize="characters" maxLength={8} placeholder="ABC1D23" value={d.placa.toUpperCase()} onChange={(e) => campo("placa")(e.target.value.toUpperCase())} />
      </Campo>
      <Campo rotulo="Modelo" obrigatorio icone={Car}><input placeholder="Ex.: Onix" value={d.modelo} onChange={(e) => campo("modelo")(e.target.value)} /></Campo>
      <div className="duas">
        <Campo rotulo="Ano" obrigatorio icone={CalendarDays}><input inputMode="numeric" maxLength={4} placeholder="2020" value={d.ano} onChange={(e) => campo("ano")(digitos(e.target.value))} /></Campo>
        <Campo rotulo="Cor" obrigatorio icone={Palette}><select value={d.cor} onChange={(e) => campo("cor")(e.target.value)}><option value="">Selecione</option>{CORES.map((c) => <option key={c}>{c}</option>)}</select></Campo>
      </div>
      <Erro texto={erro} />
      <button className="botao-m" disabled={ocupado || !valido}>{botao}</button>
    </form>
  );
}

// ------------------------------------------------------------------ passo 5: documentos

interface DadosDocumentos { tipos: Record<string, string>; documentos: Record<string, { situacao: "Enviado" | "Aprovado" | "Recusado"; motivo: string; em: string }> }
const ACEITOS = ["image/jpeg", "image/png", "application/pdf"];
const SITUACAO: Record<string, [string, string]> = { Enviado: ["Em análise", "espera"], Aprovado: ["Aprovado", "ok"], Recusado: ["Recusado", "ruim"] };

export function FormDocumentos({ aoTerminar, botao }: { aoTerminar?: () => void; botao?: string }) {
  const { dados: d, erro, faltaRota, recarregar } = useBuscar<DadosDocumentos>("/documentos");
  const [enviando, setEnviando] = useState("");
  const [erroEnvio, setErroEnvio] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const tipoAtual = useRef("");
  const escolher = async (arq: File | undefined) => {
    const tipo = tipoAtual.current;
    if (!arq || !tipo) return;
    setErroEnvio("");
    if (!ACEITOS.includes(arq.type) && !arq.type.startsWith("image/")) { setErroEnvio("Envie uma foto (JPG ou PNG) ou um PDF."); return; }
    setEnviando(tipo);
    try {
      const corpo = arq.type.startsWith("image/") ? await reduzir(arq, 1800) : arq;
      if (corpo.size > 5 * 1024 * 1024) throw new Error("O arquivo passa de 5 MB.");
      await api(`/documentos/${tipo}`, { bruto: corpo });
      await recarregar();
    } catch (e) { setErroEnvio(mensagemDeErro(e)); } finally { setEnviando(""); }
  };
  if (faltaRota) return <Vazio icone={FileText} titulo="Documentos" texto="O envio de documentos ainda não está disponível. Fale com a central." />;
  if (!d) return erro ? <Erro texto={erro} /> : <Carregando />;
  const tipos = Object.entries(d.tipos);
  const faltam = tipos.filter(([t]) => !d.documentos[t]).length;
  return (
    <div className="formulario">
      <div><h2 className="titulo-secao">Gerencie sua documentação</h2><p className="dica">Mantenha seus documentos atualizados para continuar rodando.</p></div>
      <input ref={entrada} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} />
      {tipos.map(([tipo, rotulo]) => {
        const doc = d.documentos[tipo];
        const [texto, classe] = doc ? SITUACAO[doc.situacao] : ["Falta enviar", "neutro"];
        return (
          <button key={tipo} type="button" className="cartao-doc" disabled={!!enviando || doc?.situacao === "Aprovado"} onClick={() => { tipoAtual.current = tipo; entrada.current?.click(); }}>
            <FileText size={22} className="doc-icone" />
            <span className="item-textos">
              <strong>{rotulo}</strong>
              <small className={`situacao ${classe}`}>{enviando === tipo ? "Enviando…" : texto}{doc?.em && doc.situacao !== "Aprovado" ? ` · ${diaHora(doc.em)}` : ""}</small>
              {doc?.situacao === "Recusado" && doc.motivo && <small className="situacao ruim">Motivo: {doc.motivo}</small>}
            </span>
            {doc?.situacao === "Aprovado" ? <BadgeCheck size={24} className="cor-ok" /> : doc?.situacao === "Recusado" ? <CircleAlert size={24} className="cor-perigo" /> : doc ? <Clock3 size={22} className="cor-aviso" /> : <Camera size={22} className="cor-marca" />}
          </button>
        );
      })}
      <Erro texto={erroEnvio} />
      {aoTerminar && <button type="button" className="botao-m" onClick={aoTerminar}>{botao}</button>}
      {aoTerminar && faltam > 0 && <p className="dica centro">Faltam {faltam} documento{faltam > 1 ? "s" : ""}. Você pode mandar depois, em Meu cadastro.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ fluxo do cadastro

const PASSOS = ["Dados Pessoais", "Foto do Rosto", "Endereço", "Veículo", "Documentos"];

export function Cadastro({ voltarAoLogin, concluir }: { voltarAoLogin: () => void; concluir: () => void }) {
  const [passo, setPasso] = useState(1);
  const proximo = () => setPasso((p) => p + 1);
  if (passo > 5) return (
    <Pagina>
      <div className="conteudo centro analise">
        <Vazio icone={Hourglass} titulo="Cadastro em análise" texto="Recebemos seus dados. A central vai conferir e avisar você. Até lá, você pode entrar no app, mas ainda não fica online." />
        <button type="button" className="botao-m" onClick={concluir}>IR PARA O INÍCIO</button>
      </div>
    </Pagina>
  );
  return (
    <Pagina>
      <Topo titulo={PASSOS[passo - 1]} contador={`${passo}/5`} voltar={passo === 1 ? voltarAoLogin : () => setPasso(passo - 1)} />
      <div className="conteudo">
        {passo === 1 && <FormDados criar aoSalvar={proximo} botao="CONTINUAR" />}
        {passo === 2 && <FormFoto aoSalvar={proximo} botao="CONTINUAR" />}
        {passo === 3 && <FormEndereco aoSalvar={proximo} botao="CONTINUAR" />}
        {passo === 4 && <FormVeiculo aoSalvar={proximo} botao="CONTINUAR" />}
        {passo === 5 && <FormDocumentos aoTerminar={proximo} botao="CONCLUIR CADASTRO" />}
        {passo > 1 && passo < 5 && <button type="button" className="link-m" onClick={proximo}>Fazer depois</button>}
      </div>
    </Pagina>
  );
}

