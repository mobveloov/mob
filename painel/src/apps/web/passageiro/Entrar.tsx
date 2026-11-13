// Entrada do passageiro: login por telefone ou e-mail com senha, "Esqueci a senha" (código pelo WhatsApp),
// escolha da cidade e "Crie sua conta" (com foto). Se o servidor ainda não tiver as rotas de conta, entra pelo
// código no celular, como antes.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Camera, ChevronLeft, CircleHelp, Contact, Eye, EyeOff, Image as Imagem, Lock, Mail, MessageCircle, Search, ShieldCheck, Smartphone, UserRound, Users } from "lucide-react";
import { api, guardarToken, urlArquivo } from "../comum/api";
import { mensagemDeErro, ServidorTeste, type MarcaApp } from "../comum/ui";
import { apiOu, linkWhatsapp, prepararFoto, rotaFaltando } from "./apoio";
import { Aviso, Campo, Carregando, FolhaModal } from "./pecas";

const PAPEL = "passageiro";
export const GENEROS = ["Masculino", "Feminino", "Outro", "Prefiro não dizer"];
const soNumeros = (s: string) => s.replace(/\D/g, "");
const ehEmail = (s: string) => s.includes("@");
const ehTelefone = (s: string) => !ehEmail(s) && soNumeros(s).length >= 10 && soNumeros(s).length <= 13;

export function mascaraTelefone(v: string) {
  const n = soNumeros(v).slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : "";
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function Logo({ marca }: { marca: MarcaApp }) {
  const src = urlArquivo(marca.logoEscuro || marca.logoClaro || marca.icone);
  return src ? <img className="login-logo" src={src} alt={marca.nome} /> : <div className="login-logo-texto">{marca.nome}</div>;
}

type Passo = "login" | "senha" | "esqueci" | "codigo" | "cidade" | "criar";
interface Cidade { id: string; nome: string; uf: string }

export function Entrar({ marca, aoEntrar }: { marca: MarcaApp; aoEntrar: () => void }) {
  const [passo, setPasso] = useState<Passo>("login");
  const [ajuda, setAjuda] = useState(false);
  const [login, setLogin] = useState("");
  const [mascarado, setMascarado] = useState("");
  const [cidade, setCidade] = useState<Cidade | null>(null);
  /** Sem as rotas novas: o nome digitado no cadastro, para salvar depois de entrar pelo código. */
  const [nomeDepois, setNomeDepois] = useState("");
  const whatsapp = linkWhatsapp(marca.suporte.telefone, "Olá! Preciso de ajuda com o app.");

  const entrou = (t: string) => { guardarToken(t); aoEntrar(); };

  if (passo === "cidade") return <EscolherCidade voltar={() => setPasso("login")} escolher={(c) => { setCidade(c); setPasso("criar"); }} />;
  if (passo === "criar") {
    return <CriarConta login={login} cidade={cidade} whatsapp={whatsapp} voltar={() => setPasso("login")} entrou={entrou}
      semRota={(nome, telefone) => { setNomeDepois(nome); setLogin(telefone); setPasso("codigo"); }} />;
  }

  return (
    <div className="login">
      <div className="login-topo">
        {whatsapp
          ? <a className="pilula-ajuda" href={whatsapp} target="_blank" rel="noreferrer"><CircleHelp size={16} /> Ajuda</a>
          : <button type="button" className="pilula-ajuda" onClick={() => setAjuda(!ajuda)}><CircleHelp size={16} /> Ajuda</button>}
        <Logo marca={marca} />
      </div>
      <div className="login-cartao">
        {ajuda && <Aviso texto={`Precisa de ajuda? Fale com a central da ${marca.nome}.`} />}
        {passo === "login" && <PassoLogin login={login} setLogin={setLogin} seguir={(r) => {
          setMascarado(r.mascarado || login);
          if (r.semRota) setPasso("codigo");
          else if (!r.existe) setPasso("cidade");
          else if (r.temSenha) setPasso("senha");
          else setPasso("esqueci");
        }} />}
        {passo === "senha" && <PassoSenha login={login} mascarado={mascarado} voltar={() => setPasso("login")} esqueci={() => setPasso("esqueci")} entrou={entrou} />}
        {passo === "esqueci" && <PassoEsqueci login={login} mascarado={mascarado} voltar={() => setPasso("login")} entrou={entrou} />}
        {passo === "codigo" && <PassoCodigo telefone={login} nome={nomeDepois} voltar={() => setPasso("login")} entrou={entrou} />}
      </div>
      <div className="login-onda" aria-hidden="true" />
      <p className="login-rodape">Ao continuar, você concorda com os <b>Termos de Uso</b> e a <b>Privacidade</b>.</p>
      <ServidorTeste />
    </div>
  );
}

function PassoLogin({ login, setLogin, seguir }: { login: string; setLogin: (s: string) => void; seguir: (r: { existe: boolean; temSenha: boolean; mascarado: string; semRota?: boolean }) => void }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const valido = ehEmail(login) ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim()) : ehTelefone(login);
  const continuar = async () => {
    setErro(""); setOcupado(true);
    const valor = ehEmail(login) ? login.trim().toLowerCase() : soNumeros(login);
    try {
      seguir(await api<{ existe: boolean; temSenha: boolean; mascarado: string }>("/conta/existe", { corpo: { papel: PAPEL, login: valor } }));
    } catch (e) {
      if (!rotaFaltando(e)) setErro(mensagemDeErro(e));
      else if (ehTelefone(login)) seguir({ existe: true, temSenha: false, mascarado: login, semRota: true });
      else setErro("Por enquanto, entre com o número do seu celular.");
    } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void continuar(); }}>
      <h1>Login</h1>
      <p className="suave">Insira seus dados para continuar</p>
      <span className="campo-caixa"><span className="campo-icone"><Mail size={20} /></span>
        <input aria-label="Telefone ou e-mail" placeholder="Telefone ou e-mail" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
      </span>
      <Aviso texto={erro} />
      <button className="botao largo" disabled={ocupado || !valido}>{ocupado ? "AGUARDE…" : "CONTINUAR"}</button>
    </form>
  );
}

function CampoSenha({ valor, mudar, placeholder = "Sua senha", rotulo }: { valor: string; mudar: (s: string) => void; placeholder?: string; rotulo?: string }) {
  const [ver, setVer] = useState(false);
  const caixa = (
    <span className="campo-caixa"><span className="campo-icone"><Lock size={20} /></span>
      <input type={ver ? "text" : "password"} aria-label={rotulo ?? placeholder} placeholder={placeholder} autoComplete="current-password" value={valor} onChange={(e) => mudar(e.target.value)} />
      <button type="button" className="icone-botao escuro pequeno" aria-label={ver ? "Esconder a senha" : "Mostrar a senha"} onClick={() => setVer(!ver)}>{ver ? <EyeOff size={20} /> : <Eye size={20} />}</button>
    </span>
  );
  return rotulo ? <label className="campo"><span className="campo-rotulo">{rotulo}</span>{caixa}</label> : caixa;
}

function Etiqueta({ texto, voltar }: { texto: string; voltar: () => void }) {
  return <button type="button" className="etiqueta-login" onClick={voltar} aria-label="Trocar o login"><UserRound size={16} /> {texto} <small>trocar</small></button>;
}

function PassoSenha({ login, mascarado, voltar, esqueci, entrou }: { login: string; mascarado: string; voltar: () => void; esqueci: () => void; entrou: (t: string) => void }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const entrar = async () => {
    setErro(""); setOcupado(true);
    try { entrou((await api<{ token: string }>("/conta/entrar", { corpo: { papel: PAPEL, login: ehEmail(login) ? login.trim().toLowerCase() : soNumeros(login), senha } })).token); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void entrar(); }}>
      <Etiqueta texto={mascarado} voltar={voltar} />
      <CampoSenha valor={senha} mudar={setSenha} rotulo="Sua senha" />
      <button type="button" className="link direita" onClick={esqueci}>Esqueci a senha</button>
      <Aviso texto={erro} />
      <button className="botao largo" disabled={ocupado || senha.length < 1}>{ocupado ? "ENTRANDO…" : "ENTRAR"}</button>
    </form>
  );
}

function PassoEsqueci({ login, mascarado, voltar, entrou }: { login: string; mascarado: string; voltar: () => void; entrou: (t: string) => void }) {
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [info, setInfo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const valor = ehEmail(login) ? login.trim().toLowerCase() : soNumeros(login);
  const pedir = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ codigoTeste?: string }>("/conta/esqueci", { corpo: { papel: PAPEL, login: valor } });
      setInfo("Mandamos um código pelo WhatsApp.");
      if (r.codigoTeste) setCodigo(r.codigoTeste);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  useEffect(() => { void pedir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async () => {
    setErro(""); setOcupado(true);
    try { entrou((await api<{ token: string }>("/conta/nova-senha", { corpo: { papel: PAPEL, login: valor, codigo, senha } })).token); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
      <Etiqueta texto={mascarado} voltar={voltar} />
      <h2>Criar nova senha</h2>
      <Aviso texto={info} tipo="info" />
      <span className="campo-caixa"><span className="campo-icone"><MessageCircle size={20} /></span>
        <input aria-label="Código" placeholder="Código de 6 números" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(soNumeros(e.target.value))} />
      </span>
      <CampoSenha valor={senha} mudar={setSenha} placeholder="Nova senha (mínimo 6)" />
      <button type="button" className="link direita" disabled={ocupado} onClick={() => void pedir()}>Mandar o código de novo</button>
      <Aviso texto={erro} />
      <button className="botao largo" disabled={ocupado || codigo.length !== 6 || senha.length < 6}>ENTRAR</button>
    </form>
  );
}

/** Plano B (servidor sem as rotas de conta): código de 6 números pelo celular. */
function PassoCodigo({ telefone, nome, voltar, entrou }: { telefone: string; nome: string; voltar: () => void; entrou: (t: string) => void }) {
  const [codigo, setCodigo] = useState("");
  const [info, setInfo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const pedir = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ enviado: boolean; codigoTeste?: string }>("/entrar/codigo", { corpo: { papel: PAPEL, telefone: soNumeros(telefone) } });
      setInfo(r.enviado ? "Mandamos um código pelo WhatsApp." : "Pedimos o código. Se não chegar, fale com a central.");
      if (r.codigoTeste) setCodigo(r.codigoTeste);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  useEffect(() => { void pedir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmar = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ token: string }>("/entrar", { corpo: { papel: PAPEL, telefone: soNumeros(telefone), codigo } });
      guardarToken(r.token);
      if (nome) await api("/eu", { corpo: { nome } }).catch(() => undefined);
      entrou(r.token);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
      <Etiqueta texto={mascaraTelefone(telefone)} voltar={voltar} />
      <h2>Código de acesso</h2>
      <Aviso texto={info} tipo="info" />
      <span className="campo-caixa"><span className="campo-icone"><MessageCircle size={20} /></span>
        <input aria-label="Código" placeholder="Código de 6 números" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(soNumeros(e.target.value))} />
      </span>
      <Aviso texto={erro} />
      <button className="botao largo" disabled={ocupado || codigo.length !== 6}>ENTRAR</button>
    </form>
  );
}

// ------------------------------------------------------------------ cidade

function EscolherCidade({ voltar, escolher }: { voltar: () => void; escolher: (c: Cidade | null) => void }) {
  const [cidades, setCidades] = useState<Cidade[] | null>(null);
  const [busca, setBusca] = useState("");
  const [marcada, setMarcada] = useState<Cidade | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    void apiOu<{ cidades: Cidade[] }>("/cidades", { cidades: [] }).then((r) => {
      // Sem cidades (ou sem a rota): pula a tela.
      if (!r.cidades.length) escolher(null); else setCidades(r.cidades);
    }).catch(() => escolher(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = useMemo(() => (cidades ?? []).filter((c) => normal(`${c.nome} ${c.uf}`).includes(normal(busca))), [cidades, busca]);
  if (!cidades) return <Carregando />;
  return (
    <div className="tela-cheia clara">
      <header className="topo-claro"><button className="icone-botao escuro" onClick={voltar} aria-label="Voltar"><ArrowLeft size={24} /></button><strong>Cidade</strong><span className="icone-vazio" /></header>
      <div className="cidade-cabeca">
        <h2>Em qual cidade vai utilizar o app?</h2>
        <span className="campo-caixa contorno"><span className="campo-icone cinza"><Search size={20} /></span><input aria-label="Pesquisar" placeholder="Pesquisar" value={busca} onChange={(e) => setBusca(e.target.value)} /></span>
      </div>
      <ul className="lista-cidades">
        {lista.map((c) => (
          <li key={c.id}><button className={marcada?.id === c.id ? "marcada" : ""} onClick={() => setMarcada(c)}>{c.nome} - {c.uf}<span className="radio" /></button></li>
        ))}
        {!lista.length && <li className="suave centro">Nenhuma cidade com esse nome.</li>}
      </ul>
      <div className="rodape-fixo"><button className="botao largo" disabled={!marcada} onClick={() => setConfirmar(true)}>Continuar</button></div>
      {confirmar && marcada && (
        <FolhaModal fechar={() => setConfirmar(false)}>
          <div className="centro coluna">
            <div className="icone-redondo cor"><Building2 size={26} /></div>
            <h2>Cidade selecionada</h2>
            <span className="selo-cidade">{marcada.nome} - {marcada.uf}</span>
            <p className="suave">Essa é a cidade onde você vai utilizar o app. Está correto?</p>
            <button className="botao largo" onClick={() => escolher(marcada)}>Sim, avançar!</button>
            <button className="botao contorno largo" onClick={() => setConfirmar(false)}>Trocar cidade</button>
          </div>
        </FolhaModal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ crie sua conta

export function EscolherFoto({ fechar, escolher }: { fechar: () => void; escolher: (f: File) => void }) {
  const camera = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  const pegar = (l: FileList | null) => { if (l?.[0]) { escolher(l[0]); fechar(); } };
  return (
    <FolhaModal fechar={fechar} titulo="Foto de perfil">
      <div className="menu-lista">
        <button onClick={() => camera.current?.click()}><span className="icone-redondo claro"><Camera size={20} /></span>Tirar foto</button>
        <button onClick={() => galeria.current?.click()}><span className="icone-redondo claro"><Imagem size={20} /></span>Escolher da galeria</button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={(e) => pegar(e.target.files)} />
      <input ref={galeria} type="file" accept="image/*" hidden onChange={(e) => pegar(e.target.files)} />
    </FolhaModal>
  );
}

function CriarConta({ login, cidade, whatsapp, voltar, entrou, semRota }: {
  login: string; cidade: Cidade | null; whatsapp: string; voltar: () => void; entrou: (t: string) => void; semRota: (nome: string, telefone: string) => void;
}) {
  const [foto, setFoto] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState("");
  const [escolhendo, setEscolhendo] = useState(false);
  const [nome, setNome] = useState("");
  const [genero, setGenero] = useState("");
  const [telefone, setTelefone] = useState(ehEmail(login) ? "" : mascaraTelefone(login));
  const [email, setEmail] = useState(ehEmail(login) ? login.trim().toLowerCase() : "");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const faltando = !foto ? "Coloque uma foto de perfil." : nome.trim().split(/\s+/).length < 2 ? "Digite o nome completo." : !genero ? "Escolha o gênero."
    : soNumeros(telefone).length < 10 ? "Digite o celular com DDD." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Digite um e-mail válido."
    : senha.length < 6 ? "A senha precisa ter pelo menos 6 caracteres." : senha !== senha2 ? "As senhas não são iguais." : "";

  const criar = async () => {
    if (faltando) { setErro(faltando); return; }
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ token: string }>("/conta/criar", {
        corpo: { papel: PAPEL, nome: nome.trim(), genero, telefone: soNumeros(telefone), email: email.trim().toLowerCase(), senha, cidadeId: cidade?.id },
      });
      guardarToken(r.token);
      if (foto) await api("/foto", { bruto: await prepararFoto(foto) }).catch(() => undefined);
      entrou(r.token);
    } catch (e) {
      if (rotaFaltando(e)) semRota(nome.trim(), soNumeros(telefone));
      else setErro(mensagemDeErro(e));
    } finally { setOcupado(false); }
  };

  const olho = <button type="button" className="icone-botao escuro pequeno" aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"} onClick={() => setVerSenha(!verSenha)}>{verSenha ? <EyeOff size={20} /> : <Eye size={20} />}</button>;
  return (
    <div className="tela-cheia clara com-rodape">
      <header className="topo-claro"><button className="icone-botao escuro" onClick={voltar} aria-label="Voltar"><ChevronLeft size={26} /></button><span /><span className="icone-vazio" /></header>
      <div className="conteudo">
        <h1 className="titulo-cadastro">Crie sua conta</h1>
        <p className="suave">Preencha os dados abaixo para começar.</p>
        <button type="button" className={`foto-cadastro ${foto ? "" : "falta"}`} onClick={() => setEscolhendo(true)} aria-label="Escolher foto de perfil">
          {previa ? <img src={previa} alt="Sua foto" /> : <><UserRound size={40} /><small>Obrigatório</small></>}
          <span className="foto-camera"><Camera size={16} /></span>
        </button>
        {escolhendo && <EscolherFoto fechar={() => setEscolhendo(false)} escolher={(f) => { setFoto(f); setPrevia(URL.createObjectURL(f)); }} />}

        <section className="cartao-form">
          <h2><span className="icone-redondo claro pequeno"><Contact size={18} /></span>Dados pessoais</h2>
          <Campo rotulo="Nome completo" icone={<UserRound size={20} />} obrigatorio><input placeholder="Ex.: João da Silva" autoComplete="name" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Gênero" icone={<Users size={20} />} obrigatorio>
            <select value={genero} onChange={(e) => setGenero(e.target.value)}><option value="" disabled>Selecione</option>{GENEROS.map((g) => <option key={g}>{g}</option>)}</select>
          </Campo>
        </section>
        <section className="cartao-form">
          <h2><span className="icone-redondo claro pequeno"><Smartphone size={18} /></span>Contato</h2>
          <Campo rotulo="Celular (com DDD)" icone={<Smartphone size={20} />} obrigatorio travado={!ehEmail(login) && !!login}>
            <input inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={telefone} readOnly={!ehEmail(login) && !!login} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
          </Campo>
          <Campo rotulo="E-mail" icone={<Mail size={20} />} obrigatorio travado={ehEmail(login)}>
            <input type="email" inputMode="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} readOnly={ehEmail(login)} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
        </section>
        <section className="cartao-form">
          <h2><span className="icone-redondo claro pequeno"><ShieldCheck size={18} /></span>Segurança</h2>
          <Campo rotulo="Senha" icone={<Lock size={20} />} obrigatorio direita={olho}>
            <input type={verSenha ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Campo rotulo="Confirmar senha" icone={<Lock size={20} />} obrigatorio>
            <input type={verSenha ? "text" : "password"} autoComplete="new-password" placeholder="Repita sua senha" value={senha2} onChange={(e) => setSenha2(e.target.value)} />
          </Campo>
        </section>
      </div>
      <div className="rodape-fixo">
        <Aviso texto={erro} />
        <button className="botao largo" disabled={ocupado} onClick={() => void criar()}>{ocupado ? "CRIANDO…" : "CRIAR CONTA"}</button>
        {whatsapp && <a className="link-whats" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Problemas no cadastro? Fale conosco</a>}
      </div>
    </div>
  );
}
