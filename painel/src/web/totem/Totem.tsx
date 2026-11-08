// Totem: /totem/:empresa/:local em tela cheia, com a marca da empresa. Sem login: o aparelho digita a senha do
// local uma vez. Fluxo: início (endereço fixo) -> destino -> categoria com preço -> pagamento -> nome e telefone ->
// confirmação -> acompanhamento (status, motorista, carro, cancelar enquanto não começou).
// Recarregar remoto: pergunta a versão a cada 60 s e recarrega só quando está na tela inicial.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Car, Check, CircleX, Loader2, MapPin, Navigation } from "lucide-react";
import { MARCA_PADRAO, variaveisTema, type Marca } from "../../comum/marca.ts";
import { apiTotem, ErroTotem, mascaraTelefone, novoPedidoId, reais, urlArquivo, type CategoriaTotem, type SituacaoTotem } from "./api";
import "./totem.css";

type Passo = "carregando" | "senha" | "inicio" | "destino" | "categoria" | "pagamento" | "dados" | "confirmar" | "acompanhar" | "indisponivel" | "nao-existe";
interface Config { local: { id: string; nome: string; endereco: string; pagamentos: string[]; versao: number }; categorias: CategoriaTotem[] }
interface Pedido { destino: string; semDestino: boolean; categoria: string; pagamento: string; nome: string; telefone: string }
const PEDIDO_VAZIO: Pedido = { destino: "", semDestino: false, categoria: "", pagamento: "", nome: "", telefone: "" };

const INATIVO_MS = 90_000;
const VERSAO_MS = 60_000;
const SITUACAO_MS = 5_000;
const FIM_MS = 30_000;

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

function escuroDa(m: Marca) {
  if (m.tema === "escuro") return true;
  if (m.tema === "claro") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Marca no documento: cores, fonte, título e ícone da empresa. */
function aplicarMarca(m: Marca, empresa: string) {
  const raiz = document.documentElement;
  const escuro = escuroDa(m);
  for (const [k, v] of Object.entries(variaveisTema(m, escuro))) raiz.style.setProperty(k, v);
  raiz.dataset.theme = escuro ? "dark" : "light";
  document.title = m.app.nome || m.produto;
  let link = document.getElementById("fonte-marca") as HTMLLinkElement | null;
  if (!link) { link = document.createElement("link"); link.id = "fonte-marca"; link.rel = "stylesheet"; document.head.appendChild(link); }
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(m.fonte).replace(/%20/g, "+")}:wght@400;600;700;800&display=swap`;
  const fav = document.getElementById("favicon") as HTMLLinkElement | null;
  if (fav) fav.href = m.arquivos.favicon ? urlArquivo(empresa, m.arquivos.favicon) : "data:,";
  const man = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (man) man.href = `/manifest.webmanifest?empresa=${empresa}`;
}

export default function Totem(props: { empresa?: string; local?: string }) {
  const params = useParams();
  const empresa = props.empresa ?? params.empresa ?? "";
  const localId = props.local ?? params.local ?? "";
  const api = useMemo(() => apiTotem(empresa, localId), [empresa, localId]);
  const K = `totem:${empresa}:${localId}`;

  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);
  const [nomeLocal, setNomeLocal] = useState("");
  const [chave, setChave] = useState<string | null>(() => ler(`${K}:chave`));
  const [config, setConfig] = useState<Config | null>(null);
  const [passo, setPasso] = useState<Passo>("carregando");
  const [pedido, setPedido] = useState<Pedido>(PEDIDO_VAZIO);
  const [pedidoId, setPedidoId] = useState(novoPedidoId);
  const [corridaId, setCorridaId] = useState<string | null>(() => ler(`${K}:corrida`));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const versao = useRef<number | null>(null);

  const sairDoAparelho = useCallback(() => { gravar(`${K}:chave`, null); setChave(null); setPasso("senha"); }, [K]);

  const recomecar = useCallback(() => {
    setPedido(PEDIDO_VAZIO); setPedidoId(novoPedidoId()); setErro(null); setEnviando(false);
    setCorridaId(null); gravar(`${K}:corrida`, null); setPasso("inicio");
  }, [K]);

  // Marca e nome do local (público) e, com a chave, a configuração.
  const carregar = useCallback(async () => {
    try {
      const p = await api.inicio();
      setMarca(p.marca); setNomeLocal(p.local.nome); aplicarMarca(p.marca, p.empresaId);
    } catch (e) { setPasso(e instanceof ErroTotem && e.status === 404 ? "nao-existe" : "indisponivel"); return; }
    if (!chave) { setPasso("senha"); return; }
    try {
      const c = await api.config(chave);
      setMarca(c.marca); aplicarMarca(c.marca, empresa);
      setConfig(c); versao.current = c.local.versao;
      setErro(null);
      setPasso(ler(`${K}:corrida`) ? "acompanhar" : "inicio");
    } catch (e) {
      if (e instanceof ErroTotem && e.status === 401) sairDoAparelho();
      else { setErro(e instanceof Error ? e.message : String(e)); setPasso("indisponivel"); }
    }
  }, [api, chave, empresa, K, sairDoAparelho]);
  useEffect(() => { carregar(); }, [carregar]);

  // Totem indisponível: tenta de novo sozinho a cada minuto.
  useEffect(() => {
    if (passo !== "indisponivel") return;
    const t = setTimeout(carregar, VERSAO_MS);
    return () => clearTimeout(t);
  }, [passo, carregar]);

  // Recarregar remoto (o admin salvou o local ou clicou em "Recarregar totem").
  const passoRef = useRef(passo);
  passoRef.current = passo;
  useEffect(() => {
    if (!chave) return;
    const t = setInterval(async () => {
      try {
        const v = (await api.versao(chave)).versao;
        if (versao.current != null && v !== versao.current && passoRef.current === "inicio") location.reload();
      } catch (e) { if (e instanceof ErroTotem && e.status === 401) sairDoAparelho(); }
    }, VERSAO_MS);
    return () => clearInterval(t);
  }, [api, chave, sairDoAparelho]);

  // Ninguém mexeu por 90 s no meio do pedido: volta para o início.
  useEffect(() => {
    if (!["destino", "categoria", "pagamento", "dados", "confirmar"].includes(passo)) return;
    let t = setTimeout(recomecar, INATIVO_MS);
    const mexeu = () => { clearTimeout(t); t = setTimeout(recomecar, INATIVO_MS); };
    window.addEventListener("pointerdown", mexeu);
    window.addEventListener("keydown", mexeu);
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", mexeu); window.removeEventListener("keydown", mexeu); };
  }, [passo, recomecar]);

  // Quiosque: sem menu do botão direito; tela cheia no primeiro toque (quando o navegador deixa).
  useEffect(() => {
    const menu = (e: Event) => e.preventDefault();
    const cheia = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined); };
    document.addEventListener("contextmenu", menu);
    document.addEventListener("pointerdown", cheia, { once: true });
    return () => { document.removeEventListener("contextmenu", menu); document.removeEventListener("pointerdown", cheia); };
  }, []);

  // Ordem dos passos: pula categoria ou pagamento quando só existe uma opção.
  const ordem = useMemo<Passo[]>(() => {
    const l: Passo[] = ["destino"];
    if ((config?.categorias.length ?? 0) > 1) l.push("categoria");
    if ((config?.local.pagamentos.length ?? 0) > 1) l.push("pagamento");
    l.push("dados", "confirmar");
    return l;
  }, [config]);
  const avancar = () => { setErro(null); const i = ordem.indexOf(passo); setPasso(i < 0 ? ordem[0] : ordem[Math.min(i + 1, ordem.length - 1)]); };
  const voltar = () => { setErro(null); const i = ordem.indexOf(passo); setPasso(i <= 0 ? "inicio" : ordem[i - 1]); };
  const comecar = () => {
    if (!config) return;
    setPedido({ ...PEDIDO_VAZIO, categoria: config.categorias.length === 1 ? config.categorias[0].nome : "", pagamento: config.local.pagamentos.length === 1 ? config.local.pagamentos[0] : "" });
    setPedidoId(novoPedidoId());
    setErro(null); setPasso("destino");
  };

  const confirmar = async () => {
    if (!chave || enviando) return;
    setEnviando(true); setErro(null);
    try {
      const r = await api.pedir(chave, {
        pedidoId, destino: pedido.semDestino ? undefined : { texto: pedido.destino.trim() }, semDestino: pedido.semDestino,
        categoria: pedido.categoria, pagamento: pedido.pagamento, nome: pedido.nome.trim(), telefone: pedido.telefone,
      });
      gravar(`${K}:corrida`, r.corrida.id);
      setCorridaId(r.corrida.id); setPasso("acompanhar");
    } catch (e) {
      if (e instanceof ErroTotem && e.status === 401) sairDoAparelho();
      setErro(e instanceof Error ? e.message : String(e));
    } finally { setEnviando(false); }
  };

  const cat = config?.categorias.find((c) => c.nome === pedido.categoria);
  const logo = escuroDa(marca) ? marca.arquivos.logoEscuro || marca.arquivos.logoClaro : marca.arquivos.logoClaro;
  const nPasso = ordem.indexOf(passo);

  return (
    <div className="tt">
      <header className="tt-topo">
        {logo ? <img src={urlArquivo(empresa, logo)} alt={marca.nomeExibido} /> : <span className="tt-nome">{marca.nomeExibido}</span>}
        <span className="tt-local">{nomeLocal}</span>
      </header>
      <main className="tt-corpo">
        <div className="tt-caixa">
          {passo === "carregando" && <div className="tt-status"><Loader2 size={56} className="tt-gira" /></div>}

          {passo === "nao-existe" && <div className="tt-status"><h1>Totem não encontrado</h1><p>Confira o endereço desta tela com a empresa.</p></div>}

          {passo === "indisponivel" && (
            <div className="tt-status">
              <div className="tt-icone"><CircleX size={52} /></div>
              <h1>Totem indisponível</h1>
              <p>{erro || "Não consegui falar com a central. Tento de novo em instantes."}</p>
              <button className="tt-botao" onClick={carregar}>Tentar de novo</button>
            </div>
          )}

          {passo === "senha" && <Senha nomeLocal={nomeLocal} entrar={async (s) => { const r = await api.entrar(s); gravar(`${K}:chave`, r.chave); setChave(r.chave); }} />}

          {passo === "inicio" && config && (
            <>
              <h1>{marca.textos.saudacao && marca.textos.saudacao !== MARCA_PADRAO.textos.saudacao ? marca.textos.saudacao : "Peça seu carro aqui"}</h1>
              <p>Rápido e sem aplicativo. O motorista vem até você.</p>
              <div className="tt-partida"><small><MapPin size={14} /> Você está em</small>{config.local.endereco}</div>
              <button className="tt-botao primario grande" onClick={comecar}><Car size={34} /> Pedir corrida</button>
            </>
          )}

          {passo === "destino" && (
            <form className="tt-caixa" onSubmit={(e) => { e.preventDefault(); if (pedido.destino.trim().length >= 3) avancar(); }}>
              <h2>Para onde você vai?</h2>
              <label className="tt-campo">Destino
                <input autoFocus value={pedido.destino} enterKeyHint="next" maxLength={200} placeholder="Rua e número, bairro ou lugar"
                  onChange={(e) => setPedido({ ...pedido, destino: e.target.value, semDestino: false })} />
              </label>
              <button type="submit" className="tt-botao primario" disabled={pedido.destino.trim().length < 3}>Continuar</button>
              <button type="button" className="tt-botao" onClick={() => { setPedido({ ...pedido, destino: "", semDestino: true }); avancar(); }}>
                <Navigation size={22} /> Vou dizer ao motorista
              </button>
              <button type="button" className="tt-botao" onClick={voltar}><ArrowLeft size={22} /> Voltar</button>
            </form>
          )}

          {passo === "categoria" && config && (
            <>
              <h2>Escolha o carro</h2>
              <div className="tt-opcoes">
                {config.categorias.map((c) => (
                  <button key={c.nome} className={`tt-botao tt-opcao ${c.nome === pedido.categoria ? "ativo" : ""}`} onClick={() => { setPedido({ ...pedido, categoria: c.nome }); avancar(); }}>
                    <span>{c.nome}{c.descricao && <small>{c.descricao}</small>}</span>
                    <strong>{c.preco == null ? "" : <><small>a partir de</small>{reais(c.preco)}</>}</strong>
                  </button>
                ))}
              </div>
              <button className="tt-botao" onClick={voltar}><ArrowLeft size={22} /> Voltar</button>
            </>
          )}

          {passo === "pagamento" && config && (
            <>
              <h2>Como você vai pagar?</h2>
              <p>O pagamento é feito direto ao motorista.</p>
              <div className="tt-opcoes">
                {config.local.pagamentos.map((p) => (
                  <button key={p} className={`tt-botao tt-opcao ${p === pedido.pagamento ? "ativo" : ""}`} onClick={() => { setPedido({ ...pedido, pagamento: p }); avancar(); }}>
                    <span>{p}</span>
                  </button>
                ))}
              </div>
              <button className="tt-botao" onClick={voltar}><ArrowLeft size={22} /> Voltar</button>
            </>
          )}

          {passo === "dados" && config && (
            <form className="tt-caixa" onSubmit={(e) => { e.preventDefault(); avancar(); }}>
              <h2>Seus dados</h2>
              <p>O motorista usa para chamar você.</p>
              <label className="tt-campo">Seu nome
                <input autoFocus value={pedido.nome} maxLength={60} enterKeyHint="next" autoComplete="off" onChange={(e) => setPedido({ ...pedido, nome: e.target.value })} />
              </label>
              <label className="tt-campo">Celular com DDD
                <input value={pedido.telefone} inputMode="tel" enterKeyHint="done" autoComplete="off" placeholder="(11) 90000-0000" onChange={(e) => setPedido({ ...pedido, telefone: mascaraTelefone(e.target.value) })} />
              </label>
              <button type="submit" className="tt-botao primario" disabled={pedido.nome.trim().length < 2 || pedido.telefone.replace(/\D/g, "").length < 10}>Continuar</button>
              <button type="button" className="tt-botao" onClick={voltar}><ArrowLeft size={22} /> Voltar</button>
            </form>
          )}

          {passo === "confirmar" && config && (
            <>
              <h2>Confira o pedido</h2>
              <div className="tt-resumo">
                <div><span>Embarque</span><b>{config.local.endereco}</b></div>
                <div><span>Destino</span><b>{pedido.semDestino ? "Vou dizer ao motorista" : pedido.destino}</b></div>
                {cat && <div><span>Carro</span><b>{cat.nome}</b></div>}
                {cat?.preco != null && <div><span>Preço a partir de</span><b>{reais(cat.preco)}</b></div>}
                {pedido.pagamento && <div><span>Pagamento</span><b>{pedido.pagamento}</b></div>}
                <div><span>Passageiro</span><b>{pedido.nome}{pedido.telefone && <><br />{pedido.telefone}</>}</b></div>
              </div>
              {erro && <div className="tt-erro" role="alert">{erro}</div>}
              <div className="tt-linha">
                <button className="tt-botao" onClick={voltar} disabled={enviando}><ArrowLeft size={22} /> Voltar</button>
                <button className="tt-botao primario" onClick={confirmar} disabled={enviando}>{enviando ? <><Loader2 size={24} className="tt-gira" /> Pedindo...</> : <><Check size={24} /> Confirmar</>}</button>
              </div>
            </>
          )}

          {passo === "acompanhar" && chave && corridaId && (
            <Acompanhar id={corridaId} buscar={() => api.situacao(chave, corridaId)} cancelar={() => api.cancelar(chave, corridaId)} novaCorrida={recomecar} />
          )}
        </div>
      </main>
      {nPasso >= 0 && <div className="tt-passos" aria-hidden>{ordem.map((p, i) => <i key={p} className={i <= nPasso ? "feito" : ""} />)}</div>}
      {(marca.textos.suporteTelefone || passo === "inicio") && <footer className="tt-rodape">{marca.nomeExibido}{marca.textos.suporteTelefone && ` · Ajuda: ${marca.textos.suporteTelefone}`}</footer>}
    </div>
  );
}

function Senha({ nomeLocal, entrar }: { nomeLocal: string; entrar: (s: string) => Promise<void> }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  return (
    <form className="tt-caixa" onSubmit={async (e) => {
      e.preventDefault(); setIndo(true); setErro(null);
      try { await entrar(senha); } catch (x) { setErro(x instanceof Error ? x.message : String(x)); setSenha(""); } finally { setIndo(false); }
    }}>
      <h2>Ativar este totem</h2>
      <p>{nomeLocal ? `Local: ${nomeLocal}. ` : ""}Digite a senha do totem cadastrada no painel.</p>
      <label className="tt-campo">Senha do totem
        <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" enterKeyHint="go" />
      </label>
      {erro && <div className="tt-erro" role="alert">{erro}</div>}
      <button className="tt-botao primario" disabled={!senha || indo}>{indo ? "Conferindo..." : "Ativar"}</button>
    </form>
  );
}

function Acompanhar({ id, buscar, cancelar, novaCorrida }: { id: string; buscar: () => Promise<{ corrida: SituacaoTotem }>; cancelar: () => Promise<unknown>; novaCorrida: () => void }) {
  const [s, setS] = useState<SituacaoTotem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const atualizar = useCallback(async () => {
    try { setS((await buscar()).corrida); setErro(null); }
    catch (e) { if (e instanceof ErroTotem && e.status === 404) novaCorrida(); else setErro(e instanceof Error ? e.message : String(e)); }
  }, [buscar, novaCorrida]);
  useEffect(() => { atualizar(); const t = setInterval(atualizar, SITUACAO_MS); return () => clearInterval(t); }, [atualizar, id]);
  const acabou = !!s && s.grupo !== "aberta";
  // Corrida terminou ou foi cancelada: volta sozinho para o início.
  useEffect(() => { if (!acabou) return; const t = setTimeout(novaCorrida, FIM_MS); return () => clearTimeout(t); }, [acabou, novaCorrida]);
  // Motorista já a caminho: depois de 5 min sem ninguém mexer, libera o totem para o próximo.
  useEffect(() => { if (!s?.motorista || acabou) return; const t = setTimeout(novaCorrida, 5 * 60_000); return () => clearTimeout(t); }, [s?.motorista, acabou, novaCorrida]);
  useEffect(() => { if (!confirmando) return; const t = setTimeout(() => setConfirmando(false), 6000); return () => clearTimeout(t); }, [confirmando]);

  if (!s) return <div className="tt-status">{erro ? <div className="tt-erro">{erro}</div> : <Loader2 size={56} className="tt-gira" />}</div>;
  const procurando = s.grupo === "aberta" && !s.motorista;
  return (
    <>
      <div className="tt-status">
        <div className="tt-icone">{s.grupo === "finalizada" ? <Check size={52} /> : s.grupo === "aberta" ? (procurando ? <Loader2 size={52} className="tt-gira" /> : <Car size={52} />) : <CircleX size={52} />}</div>
        <h1>{s.grupo === "cancelada" ? "Corrida cancelada" : s.grupo === "nao_atendida" ? "Nenhum motorista aceitou" : s.statusTexto}</h1>
        <p>{procurando ? "Aguarde aqui. Estamos chamando o motorista mais perto." : s.grupo === "nao_atendida" ? "Tente pedir de novo em alguns minutos." : s.grupo === "aberta" ? "Fique perto da entrada." : ""}</p>
      </div>
      {s.motorista && s.grupo === "aberta" && (
        <div className="tt-carro">
          <span><b>{s.motorista.nome}</b></span>
          {s.veiculo && <>{s.veiculo.modelo && <span>{s.veiculo.modelo}</span>}{s.veiculo.placa && <span className="tt-placa">{s.veiculo.placa}</span>}</>}
        </div>
      )}
      <div className="tt-resumo">
        <div><span>Pedido</span><b>{s.os}</b></div>
        {s.destino && <div><span>Destino</span><b>{s.destino}</b></div>}
        {s.categoria && <div><span>Carro</span><b>{s.categoria}</b></div>}
        {s.valor != null && <div><span>{s.valorEstimado ? "Valor estimado" : "Valor"}</span><b>{reais(s.valor)}</b></div>}
      </div>
      {erro && <div className="tt-erro">{erro}</div>}
      {s.podeCancelar && !acabou && (
        <button className={`tt-botao perigo`} disabled={cancelando} onClick={async () => {
          if (!confirmando) return setConfirmando(true);
          setCancelando(true);
          try { await cancelar(); await atualizar(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCancelando(false); setConfirmando(false); }
        }}>{confirmando ? "Toque de novo para cancelar" : "Cancelar corrida"}</button>
      )}
      <button className={acabou ? "tt-botao primario" : "tt-botao"} onClick={novaCorrida}>{acabou ? "Nova corrida" : "Concluir e liberar o totem"}</button>
    </>
  );
}
