// Conta do passageiro: dados e e-mail, motoristas favoritos e bloqueados, carteira, indique e ganhe, avisos e ajuda.
// Também a lista de corridas agendadas.

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, CalendarDays, Camera, ChevronRight, Headphones, History, Lock, LogOut, Mail, Megaphone, Pencil, Phone, Star, UserRound, Users, Wallet } from "lucide-react";
import { api, reais, telefoneBonito } from "../comum/api";
import { Aviso, Carregando, Cartao, mensagemDeErro, type MarcaApp } from "../comum/ui";
import { compartilharTexto, dataCurta, prepararFoto, quandoAgendada, type Eu, type Perfil } from "./apoio";
import { GENEROS } from "./Entrar";
import { Avatar, Campo } from "./pecas";

type Tela = "" | "perfil" | "favoritos" | "carteira" | "indique" | "avisos" | "ajuda";

function Voltar({ titulo, voltar, children }: { titulo: string; voltar: () => void; children: ReactNode }) {
  return (
    <div className="tela">
      <button className="botao-link" style={{ alignSelf: "flex-start" }} onClick={voltar}>‹ Voltar</button>
      <h1 style={{ marginTop: 0 }}>{titulo}</h1>
      {children}
    </div>
  );
}

export function Conta({ eu, marca, sair, irPara, mudouEu }: { eu: Eu; marca: MarcaApp; sair: () => void; irPara: (a: "historico" | "carteira" | "agendadas") => void; mudouEu?: () => void }) {
  const [tela, setTela] = useState<Tela>("");
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const temAjuda = !!(marca.suporte.email || marca.suporte.telefone);
  const carregar = () => {
    void api<Perfil>("/perfil").then(setPerfil).catch(() => undefined);
    void api<{ saldo: number }>("/carteira").then((r) => setSaldo(r.saldo)).catch(() => undefined);
  };
  useEffect(() => { carregar(); }, []);

  const voltar = () => { setTela(""); carregar(); };
  if (tela === "perfil") return <EditarPerfil eu={eu} voltar={voltar} salvou={() => { mudouEu?.(); voltar(); }} />;
  if (tela === "favoritos") return <Voltar titulo="Motoristas favoritos e bloqueados" voltar={voltar}><Favoritos /></Voltar>;
  if (tela === "carteira") return <Voltar titulo="Carteira" voltar={voltar}><Carteira /></Voltar>;
  if (tela === "indique" && perfil) return <Voltar titulo="Indique e ganhe" voltar={voltar}><Indique perfil={perfil} marca={marca} mudou={setPerfil} /></Voltar>;
  if (tela === "avisos") return <Voltar titulo="Notificações" voltar={voltar}><Avisos /></Voltar>;
  if (tela === "ajuda") return <Voltar titulo="Ajuda" voltar={voltar}><Ajuda marca={marca} /></Voltar>;

  return (
    <div className="minha-conta">
      <div className="conta-topo"><strong>Minha Conta</strong></div>
      <div className="conta-perfil">
        <span className="conta-foto"><Avatar foto={eu.foto} nome={eu.nome} tamanho={104} /></span>
        <h2>{eu.nome.split(" ")[0] || "Sem nome"}</h2>
        <small>{eu.telefone}</small>
        <button className="botao-claro" onClick={() => setTela("perfil")}><Pencil size={16} /> Editar Perfil</button>
      </div>
      <section className="conta-carteira">
        <div><Wallet size={26} /><strong>Carteira</strong><button onClick={() => irPara("carteira")}>Ver extrato ›</button></div>
        <small>Saldo disponível</small>
        <strong className="conta-saldo">{saldo != null ? reais(saldo) : "—"}</strong>
      </section>
      <h3 className="conta-secao">FINANCEIRO</h3>
      <div className="conta-grupo">
        <ItemConta icone={<Megaphone size={22} />} cor="laranja" titulo="Indique e Ganhe" sub="Convide amigos e ganhe bônus" ir={() => setTela("indique")} />
      </div>
      <h3 className="conta-secao">MINHAS ATIVIDADES</h3>
      <div className="conta-grupo">
        <ItemConta icone={<History size={22} />} cor="azul" titulo="Histórico de Corridas" sub="Veja suas viagens anteriores" ir={() => irPara("historico")} />
        <ItemConta icone={<CalendarDays size={22} />} cor="verde" titulo="Agendamentos" sub="Suas viagens agendadas" ir={() => irPara("agendadas")} />
        <ItemConta icone={<Star size={22} />} cor="amarelo" titulo="Motoristas Favoritos" sub="Seus motoristas preferidos" ir={() => setTela("favoritos")} />
        <ItemConta icone={<Bell size={22} />} cor="roxo" titulo="Notificações" sub="Avisos da central" ir={() => setTela("avisos")} />
      </div>
      <h3 className="conta-secao">CONTA</h3>
      <div className="conta-grupo">
        {temAjuda && <ItemConta icone={<Headphones size={22} />} cor="verde" titulo="Central de Ajuda" sub="Suporte e dúvidas frequentes" ir={() => setTela("ajuda")} />}
        <ItemConta icone={<LogOut size={22} />} cor="vermelho" titulo="Sair da conta" sub="Encerrar sessão" ir={sair} />
      </div>
    </div>
  );
}

function ItemConta({ icone, cor, titulo, sub, ir }: { icone: ReactNode; cor: string; titulo: string; sub?: string; ir: () => void }) {
  return (
    <button className="conta-item" onClick={ir}>
      <span className={`conta-icone ${cor}`}>{icone}</span>
      <span className="conta-texto"><strong>{titulo}</strong>{sub && <small>{sub}</small>}</span>
      <ChevronRight size={18} className="conta-seta" />
    </button>
  );
}

/** Editar Perfil: foto, nome completo, e-mail, telefone (só leitura), gênero e troca de senha. */
function EditarPerfil({ eu, voltar, salvou }: { eu: Eu; voltar: () => void; salvou: () => void }) {
  const [nome, setNome] = useState(eu.nome);
  const [email, setEmail] = useState(eu.email ?? "");
  const [genero, setGenero] = useState(eu.genero ?? "");
  const [foto, setFoto] = useState(eu.foto ?? null);
  const [senha, setSenha] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { void api<Perfil>("/perfil").then((p) => setEmail((e) => e || p.email || "")).catch(() => undefined); }, []);

  const trocarFoto = async (f: File | undefined) => {
    if (!f) return;
    setErro("");
    try { await api("/foto", { bruto: await prepararFoto(f) }); const r = await api<{ eu: Eu }>("/eu"); setFoto(r.eu.foto ?? null); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const salvar = async () => {
    setErro(""); setOcupado(true);
    try {
      await api("/eu", { corpo: { nome: nome.trim(), ...(genero ? { genero } : {}) } });
      await api("/perfil", { corpo: { email: email.trim() } });
      if (senha && nova) await api("/conta/senha", { corpo: { atual, nova } });
      salvou();
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <div className="tela-cheia clara editar-perfil">
      <header className="topo-marca"><button className="icone-botao" onClick={voltar} aria-label="Voltar"><ArrowLeft size={22} /></button><strong>Editar Perfil</strong><span /></header>
      <div className="conteudo">
        <label className="perfil-foto"><Avatar foto={foto} nome={nome} tamanho={120} /><span className="foto-camera"><Camera size={18} /></span>
          <input type="file" accept="image/*" hidden onChange={(e) => void trocarFoto(e.target.files?.[0])} /></label>
        <Campo rotulo="Nome Completo" icone={<UserRound size={20} />}><input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="E-mail" icone={<Mail size={20} />}><input type="email" inputMode="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo rotulo="Telefone" icone={<Phone size={20} />} travado><input value={eu.telefone} readOnly /></Campo>
        <Campo rotulo="Gênero" icone={<Users size={20} />}>
          <select value={genero} onChange={(e) => setGenero(e.target.value)}><option value="" disabled>Selecione</option>{GENEROS.map((g) => <option key={g}>{g}</option>)}</select>
        </Campo>
        <ItemConta icone={<Lock size={20} />} cor="azul" titulo="Alterar senha de acesso" ir={() => setSenha(!senha)} />
        {senha && <>
          <Campo rotulo="Senha atual" icone={<Lock size={20} />}><input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} /></Campo>
          <Campo rotulo="Nova senha (mínimo 6)" icone={<Lock size={20} />}><input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} /></Campo>
        </>}
        <Aviso texto={erro} />
        <button className="botao largo" disabled={ocupado || nome.trim().length < 2} onClick={() => void salvar()}>{ocupado ? "SALVANDO…" : "SALVAR ALTERAÇÕES"}</button>
      </div>
    </div>
  );
}

interface Motorista { id: string; nome: string; veiculo: string; placa: string }

function Favoritos() {
  const [dados, setDados] = useState<{ favoritos: Motorista[]; bloqueados: Motorista[] } | null>(null);
  const [erro, setErro] = useState("");
  const carregar = () => api<{ favoritos: Motorista[]; bloqueados: Motorista[] }>("/favoritos").then(setDados).catch((e) => setErro(mensagemDeErro(e)));
  useEffect(() => { void carregar(); }, []);
  const remover = async (m: Motorista) => {
    try { await api(`/favoritos/${encodeURIComponent(m.id)}/remover`, { corpo: {} }); await carregar(); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  if (!dados) return erro ? <Aviso texto={erro} /> : <Carregando />;
  const lista = (titulo: string, l: Motorista[], vazio: string, botao: string) => (
    <Cartao>
      <h2>{titulo}</h2>
      {!l.length && <p className="dica">{vazio}</p>}
      <ul className="lista">{l.map((m) => (
        <li key={m.id}>
          <span><strong>{m.nome}</strong>{(m.veiculo || m.placa) && <><br /><small className="dica">{[m.veiculo, m.placa].filter(Boolean).join(" · ")}</small></>}</span>
          <button className="botao-link" onClick={() => void remover(m)}>{botao}</button>
        </li>
      ))}</ul>
    </Cartao>
  );
  return (
    <>
      {lista("Favoritos", dados.favoritos, "Nenhum ainda. Depois de uma corrida, toque em “Favoritar motorista”.", "Remover")}
      {lista("Bloqueados", dados.bloqueados, "Nenhum motorista bloqueado.", "Desbloquear")}
      <p className="dica">Motoristas bloqueados não recebem suas corridas.</p>
      <Aviso texto={erro} />
    </>
  );
}

/** Aba Carteira: "Sua Carteira" com o cartão preto de saldo e o histórico de movimentações. */
export function CarteiraTela() {
  return <div className="tela tela-carteira"><h1 className="titulo-tela">Sua Carteira</h1><Carteira /></div>;
}

function Carteira() {
  const [dados, setDados] = useState<{ saldo: number; extrato: Array<{ valor: number; descricao: string; em: string }>; recarga: string } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { void api<NonNullable<typeof dados>>("/carteira").then(setDados).catch((e) => setErro(mensagemDeErro(e))); }, []);
  if (!dados) return erro ? <Aviso texto={erro} /> : <Carregando />;
  return (
    <>
      <section className="cartao-saldo">
        <small>Saldo Disponível</small>
        <strong>{reais(dados.saldo)}</strong>
        <p>Na hora de pedir, escolha “Saldo da carteira” para pagar com ele.</p>
      </section>
      {dados.recarga && <Aviso texto={dados.recarga} tipo="info" />}
      <h2 className="secao-titulo">Histórico de Movimentações</h2>
      <Cartao>
        {!dados.extrato.length && <div className="vazio"><strong>Sem movimentações</strong><p>Seu histórico de transações está limpo.</p></div>}
        <ul className="lista">{dados.extrato.map((x, i) => (
          <li key={i}>
            <span>{x.descricao}<br /><small className="dica">{dataCurta(x.em)}</small></span>
            <span className={x.valor >= 0 ? "valor-mais" : "valor-menos"}>{x.valor >= 0 ? "+" : "−"} {reais(Math.abs(x.valor))}</span>
          </li>
        ))}</ul>
      </Cartao>
    </>
  );
}

interface Desafio { nome: string; tipo: string; meta: number; feito: number; premio: number | null; fim: string | null; regras: string; ganho: boolean }

function Indique({ perfil, marca, mudou }: { perfil: Perfil; marca: MarcaApp; mudou: (p: Perfil) => void }) {
  const [desafios, setDesafios] = useState<Desafio[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  useEffect(() => { void api<{ desafios: Desafio[] }>("/desafios").then((r) => setDesafios(r.desafios)).catch(() => setDesafios([])); }, []);
  const compartilhar = async () => {
    const r = await compartilharTexto(`Baixe o app ${marca.nome} e use meu código ${perfil.codigo} no cadastro.`);
    if (r === "copiado") setOk("Código copiado. Cole para quem quiser.");
  };
  const informar = async () => {
    setErro(""); setOk("");
    try { const p = await api<Perfil>("/perfil", { corpo: { indicadoPor: codigo.trim().toUpperCase() } }); mudou({ ...perfil, ...p }); setOk("Código de quem te indicou salvo. Obrigado!"); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  return (
    <>
      <Cartao className="centro">
        <span className="dica">Seu código</span>
        <span className="codigo">{perfil.codigo}</span>
        <p className="dica">Mande para amigos. Quando eles fizerem a primeira corrida, conta para você.</p>
        <button className="botao" style={{ width: "100%" }} onClick={() => void compartilhar()}>Compartilhar meu código</button>
      </Cartao>
      {!perfil.indicadoPor ? (
        <form className="cartao" onSubmit={(e) => { e.preventDefault(); void informar(); }}>
          <label>Fui indicado por<input value={codigo} maxLength={20} placeholder="Código de quem te indicou" onChange={(e) => setCodigo(e.target.value.toUpperCase())} /></label>
          <button className="botao secundario" disabled={codigo.trim().length < 3}>Salvar código</button>
          <p className="dica">Só dá para informar uma vez.</p>
        </form>
      ) : <p className="dica">Você foi indicado pelo código {perfil.indicadoPor}.</p>}
      <Aviso texto={ok} tipo="ok" />
      <Aviso texto={erro} />
      <h2>Suas indicações</h2>
      {!desafios ? <Carregando /> : !desafios.length ? <p className="dica">Nenhuma campanha de indicação no momento.</p> : desafios.map((d, i) => (
        <Cartao key={i}>
          <strong>{d.nome}</strong>
          <div className="barra" aria-label={`${d.feito} de ${d.meta}`}><span style={{ width: `${d.meta ? Math.min(100, (d.feito / d.meta) * 100) : 0}%` }} /></div>
          <span>{d.feito} de {d.meta} {d.meta === 1 ? "indicação" : "indicações"}{d.premio ? ` · prêmio ${reais(d.premio)}` : ""}</span>
          {d.ganho && <Aviso texto="Meta atingida! O prêmio entrou na sua carteira." tipo="ok" />}
          {d.fim && <small className="dica">Vale até {dataCurta(d.fim)}</small>}
          {d.regras && <p className="dica">{d.regras}</p>}
        </Cartao>
      ))}
    </>
  );
}

function Avisos() {
  const [lista, setLista] = useState<Array<{ titulo: string; texto: string; em: string }> | null>(null);
  useEffect(() => { void api<{ notificacoes: NonNullable<typeof lista> }>("/notificacoes").then((r) => setLista(r.notificacoes)).catch(() => setLista([])); }, []);
  if (!lista) return <Carregando />;
  if (!lista.length) return <p className="dica">Nenhum aviso por enquanto.</p>;
  return <>{lista.map((n, i) => <Cartao key={i}><strong>{n.titulo}</strong>{n.texto && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.texto}</p>}{n.em && <small className="dica">{dataCurta(n.em)}</small>}</Cartao>)}</>;
}

function Ajuda({ marca }: { marca: MarcaApp }) {
  return (
    <Cartao>
      <p className="dica">Fale com a central da {marca.nome}:</p>
      {marca.suporte.telefone && <p>Telefone: <a href={`tel:${marca.suporte.telefone.replace(/\D/g, "")}`}>{marca.suporte.telefone}</a></p>}
      {marca.suporte.email && <p>E-mail: <a href={`mailto:${marca.suporte.email}`}>{marca.suporte.email}</a></p>}
      <p className="dica">Para algo de uma corrida (objeto esquecido, valor cobrado), abra a corrida no Histórico.</p>
    </Cartao>
  );
}

// ------------------------------------------------------------------ agendadas

interface Agendada { id: string; os: string; agendadaPara: string; embarque: string; destino: string; categoria: string; valor: number | null }

export function Agendadas({ pedir }: { pedir: () => void }) {
  const [lista, setLista] = useState<Agendada[] | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const carregar = () => api<{ agendadas: Agendada[] }>("/agendadas").then((r) => setLista(r.agendadas)).catch((e) => { setErro(mensagemDeErro(e)); setLista([]); });
  useEffect(() => { void carregar(); }, []);
  const cancelar = async (a: Agendada) => {
    if (!confirm(`Cancelar a corrida de ${quandoAgendada(a.agendadaPara)}?`)) return;
    setErro(""); setOk("");
    try {
      const r = await api<{ corrida: { taxaCancelamento?: number | null } }>(`/corridas/${a.id}/cancelar`, { corpo: { motivo: "Agendamento cancelado pelo passageiro" } });
      setOk(r.corrida.taxaCancelamento ? `Agendamento cancelado. Taxa de cancelamento: ${reais(r.corrida.taxaCancelamento)}.` : "Agendamento cancelado.");
      await carregar();
    } catch (e) { setErro(mensagemDeErro(e)); }
  };
  if (!lista) return <Carregando />;
  return (
    <div className="tela">
      <h1>Agendadas</h1>
      <Aviso texto={ok} tipo="ok" />
      <Aviso texto={erro} />
      {!lista.length && <p className="dica">Nenhuma corrida agendada. Na tela de pedir, escolha “Agendar”.</p>}
      {lista.map((a) => (
        <Cartao key={a.id}>
          <div className="status">{quandoAgendada(a.agendadaPara)}</div>
          <dl className="dados">
            <dt>Embarque</dt><dd>{a.embarque}</dd>
            {a.destino && <><dt>Destino</dt><dd>{a.destino}</dd></>}
            <dt>Categoria</dt><dd>{a.categoria}</dd>
            <dt>Valor</dt><dd>{reais(a.valor)}</dd>
          </dl>
          <button className="botao secundario" onClick={() => void cancelar(a)}>Cancelar agendamento</button>
        </Cartao>
      ))}
      <button className="botao" onClick={pedir}>Agendar outra</button>
    </div>
  );
}
