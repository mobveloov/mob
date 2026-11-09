// Conta do passageiro: dados e e-mail, motoristas favoritos e bloqueados, carteira, indique e ganhe, avisos e ajuda.
// Também a lista de corridas agendadas.

import { useEffect, useState, type ReactNode } from "react";
import { api, reais, telefoneBonito } from "../comum/api";
import { Aviso, Carregando, Cartao, mensagemDeErro, type MarcaApp } from "../comum/ui";
import { compartilharTexto, dataCurta, quandoAgendada, type Eu, type Perfil } from "./apoio";

type Tela = "" | "favoritos" | "carteira" | "indique" | "avisos" | "ajuda";

function Voltar({ titulo, voltar, children }: { titulo: string; voltar: () => void; children: ReactNode }) {
  return (
    <div className="tela">
      <button className="botao-link" style={{ alignSelf: "flex-start" }} onClick={voltar}>‹ Voltar</button>
      <h1 style={{ marginTop: 0 }}>{titulo}</h1>
      {children}
    </div>
  );
}

export function Conta({ eu, marca, sair }: { eu: Eu; marca: MarcaApp; sair: () => void }) {
  const [tela, setTela] = useState<Tela>("");
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const temAjuda = !!(marca.suporte.email || marca.suporte.telefone);
  const carregar = () => api<Perfil>("/perfil").then((p) => { setPerfil(p); setEmail(p.email ?? ""); }).catch((e) => setErro(mensagemDeErro(e)));
  useEffect(() => { void carregar(); }, []);

  const voltar = () => { setTela(""); void carregar(); };
  if (tela === "favoritos") return <Voltar titulo="Motoristas favoritos e bloqueados" voltar={voltar}><Favoritos /></Voltar>;
  if (tela === "carteira") return <Voltar titulo="Carteira" voltar={voltar}><Carteira /></Voltar>;
  if (tela === "indique" && perfil) return <Voltar titulo="Indique e ganhe" voltar={voltar}><Indique perfil={perfil} marca={marca} mudou={setPerfil} /></Voltar>;
  if (tela === "avisos") return <Voltar titulo="Notificações" voltar={voltar}><Avisos /></Voltar>;
  if (tela === "ajuda") return <Voltar titulo="Ajuda" voltar={voltar}><Ajuda marca={marca} /></Voltar>;

  const salvarEmail = async () => {
    setErro(""); setOk("");
    try { const p = await api<Perfil>("/perfil", { corpo: { email: email.trim() } }); setPerfil((a) => ({ ...a, ...p })); setOk("E-mail salvo."); } catch (e) { setErro(mensagemDeErro(e)); }
  };

  return (
    <div className="tela">
      <h1>Conta</h1>
      <Cartao>
        <dl className="dados"><dt>Nome</dt><dd>{eu.nome}</dd><dt>Celular</dt><dd>{telefoneBonito(eu.telefone)}</dd></dl>
        <form className="parada" onSubmit={(e) => { e.preventDefault(); void salvarEmail(); }}>
          <label>E-mail<input type="email" inputMode="email" autoComplete="email" value={email} maxLength={120} placeholder="voce@exemplo.com" onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="botao secundario remover" disabled={!perfil || email.trim() === (perfil.email ?? "")}>Salvar</button>
        </form>
        <Aviso texto={ok} tipo="ok" />
        <Aviso texto={erro} />
      </Cartao>
      <Cartao className="menu">
        <button onClick={() => setTela("carteira")}>Carteira <small>saldo e extrato ›</small></button>
        <button onClick={() => setTela("favoritos")}>Motoristas favoritos e bloqueados <small>›</small></button>
        <button onClick={() => setTela("indique")} disabled={!perfil}>Indique e ganhe <small>›</small></button>
        <button onClick={() => setTela("avisos")}>Notificações <small>›</small></button>
        {temAjuda && <button onClick={() => setTela("ajuda")}>Ajuda <small>›</small></button>}
      </Cartao>
      <button className="botao secundario" onClick={sair}>Sair</button>
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

function Carteira() {
  const [dados, setDados] = useState<{ saldo: number; extrato: Array<{ valor: number; descricao: string; em: string }>; recarga: string } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { void api<NonNullable<typeof dados>>("/carteira").then(setDados).catch((e) => setErro(mensagemDeErro(e))); }, []);
  if (!dados) return erro ? <Aviso texto={erro} /> : <Carregando />;
  return (
    <>
      <Cartao className="centro">
        <span className="dica">Seu saldo</span>
        <span className="numero-grande">{reais(dados.saldo)}</span>
        <p className="dica">Na hora de pedir, escolha “Saldo da carteira” para pagar com ele.</p>
      </Cartao>
      {dados.recarga && <Aviso texto={dados.recarga} tipo="info" />}
      <Cartao>
        <h2>Extrato</h2>
        {!dados.extrato.length && <p className="dica">Nenhuma movimentação ainda.</p>}
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
