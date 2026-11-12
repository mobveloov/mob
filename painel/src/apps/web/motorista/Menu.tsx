// Telas novas do app do motorista: Corridas (Disp., Pend., Prog.), Maçaneta, histórico de ganhos, meus veículos,
// meu cadastro, alterar senha, configurações, diagnóstico, chat com o suporte e fale conosco.

import { useEffect, useRef, useState } from "react";
import { Bell, Car, ChevronLeft, ChevronRight, ClipboardList, Hand, Headset, LifeBuoy, LogOut, MapPin, MessageCircle, Mic, Phone, Plus, Send, Settings, ShieldCheck, Trash2, UserRound, Wrench } from "lucide-react";
import { api, Gravador, hora, reais, telefoneBonito, tempoReal, type Posicao } from "../comum/api";
import { mensagemDeErro, type MarcaApp } from "../comum/ui";
import { FormDados, FormDocumentos, FormEndereco, FormFoto, FormVeiculo, type DadosCadastro } from "./Cadastro";
import { Chamada } from "./Chamada";
import { ajustes as ajustesAgora, NOMES_NAVEGADOR, NOMES_TEMA, useAjustes, VERSAO, type Navegador, type Tema } from "./ajustes";
import { Avatar, Chave, Dialogo, empresaAtual, Erro, Info, ItemMenu, linkWhatsapp, Pagina, Placa, Secao, Topo, useBuscar, useContatos, useImagem, Vazio } from "./Pecas";
import { diaHora, type CorridaAberta, type CorridasAbertas, type Corrida, type Eu, type Veiculo } from "./tipos";

type Voltar = { voltar: () => void };

// ------------------------------------------------------------------ Corridas (Disp., Pend., Prog.)

export function Corridas({ voltar, aoPegar, aoMudar }: Voltar & { aoPegar: (c: Corrida) => void; aoMudar?: () => void }) {
  const [aba, setAba] = useState<"disponiveis" | "pendentes" | "programadas">("disponiveis");
  const { dados, erro, recarregar } = useBuscar<CorridasAbertas>("/corridas-abertas");
  const [aberta, setAberta] = useState<CorridaAberta | null>(null);
  const [aviso, setAviso] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  useEffect(() => { const t = setInterval(() => void recarregar(), 8000); return () => clearInterval(t); }, [recarregar]);
  const l = dados?.[aba] ?? [];
  const rotulo = (n: string, k: keyof CorridasAbertas) => `${n} (${dados?.[k].length ?? 0})`;
  return (
    <Pagina>
      <Topo titulo="Corridas" voltar={voltar} />
      <nav className="abas-m">
        <button className={aba === "disponiveis" ? "ativa" : ""} onClick={() => setAba("disponiveis")}>{rotulo("Disp.", "disponiveis")}</button>
        <button className={aba === "pendentes" ? "ativa" : ""} onClick={() => setAba("pendentes")}>{rotulo("Pend.", "pendentes")}</button>
        <button className={aba === "programadas" ? "ativa" : ""} onClick={() => setAba("programadas")}>{rotulo("Prog.", "programadas")}</button>
      </nav>
      <div className="conteudo">
        <Erro texto={erro} /><Info texto={aviso} tipo="ok" />
        {!l.length && <Vazio icone={Car} titulo="Nenhuma corrida no momento" texto={aba === "disponiveis" ? "Fique online perto de onde há passageiros. As corridas abertas aparecem aqui." : aba === "pendentes" ? "As corridas que você aceitou e ainda não começaram aparecem aqui." : "As corridas agendadas que você pode assumir aparecem aqui."} />}
        {l.map((c) => (
          <button key={c.id} type="button" className="cartao-m" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aba === "pendentes" ? undefined : setAberta(c)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}><strong>{c.categoria}</strong><strong>{reais(c.valorLiquido ?? c.valorBruto ?? c.estimativa?.valor ?? null)}</strong></div>
            <span className="dica">{c.embarque.texto}{c.distanciaKm != null ? ` · ${c.distanciaKm} km de você` : ""}</span>
            {c.destino && <span className="dica">→ {c.destino.texto}</span>}
            {c.agendadaPara && <span className="chip aviso">{diaHora(c.agendadaPara)}</span>}
          </button>
        ))}
      </div>
      {aberta && <Chamada dados={{ ...aberta, estimativa: aberta.estimativa!, observacao: aberta.observacao ?? "", categoria: aberta.categoria ?? "", pagamento: aberta.pagamento ?? "", passageiro: aberta.passageiro ?? "Passageiro", os: aberta.os ?? "" } as never}
        distanciaKm={aberta.distanciaKm} tocarSom={false} rotuloRecusar="Fechar" erro={erroAcao} recusar={() => { setAberta(null); setErroAcao(""); }}
        aceitar={async (valor, contra) => {
          setErroAcao("");
          try {
            if (contra) { await api(`/corridas/${aberta.id}/contraoferta`, { corpo: { valor } }); setAviso("Contra-oferta enviada. Vale por 60 segundos."); setAberta(null); }
            else { const r = await api<{ corrida: Corrida }>(`/corridas/${aberta.id}/pegar`, { corpo: {} }); setAberta(null); aoPegar(r.corrida); }
            aoMudar?.(); void recarregar();
          } catch (e) { setErroAcao(mensagemDeErro(e)); void recarregar(); }
        }} />}
    </Pagina>
  );
}

// ------------------------------------------------------------------ Maçaneta (corrida de rua)

export function Macaneta({ voltar, posicao, aoAbrir }: Voltar & { posicao: Posicao | null; aoAbrir: (c: Corrida) => void }) {
  const op = useBuscar<{ categorias: Array<{ nome: string }> }>("/opcoes");
  const [modo, setModo] = useState<"taximetro" | "destino">("taximetro");
  const [categoria, setCategoria] = useState("");
  const [destino, setDestino] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (!categoria && op.dados?.categorias[0]) setCategoria(op.dados.categorias[0].nome); }, [op.dados, categoria]);
  const abrir = async () => {
    if (!posicao) { setErro("Ligue o GPS para abrir a corrida."); return; }
    setErro(""); setOcupado(true);
    try {
      let ponto: { texto: string; lat?: number; lng?: number } | undefined;
      if (modo === "destino") {
        const r = await api<{ enderecos: Array<{ texto: string; lat: number; lng: number }> }>(`/enderecos?q=${encodeURIComponent(destino)}`);
        ponto = r.enderecos[0] ?? { texto: destino };
      }
      const r = await api<{ corrida: Corrida }>("/macaneta", { corpo: { modo, categoria, destino: ponto, lat: posicao.lat, lng: posicao.lng, passageiro: nome ? { nome } : undefined } });
      aoAbrir(r.corrida);
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  return (
    <Pagina>
      <Topo titulo="Corrida maçaneta" subtitulo="Embarque direto · Sem agendamento" voltar={voltar} />
      <div className="conteudo">
        <Secao titulo="Modo de cobrança" icone={Hand}>
          <div className="duas">
            <button type="button" className={modo === "taximetro" ? "botao-m" : "botao-contorno"} onClick={() => setModo("taximetro")}>Taxímetro livre</button>
            <button type="button" className={modo === "destino" ? "botao-m" : "botao-contorno"} onClick={() => setModo("destino")}>Com destino</button>
          </div>
          <p className="dica">{modo === "taximetro" ? "Sem destino. O valor sai da distância e do tempo reais, pela tarifa da categoria." : "Calcula a rota e o valor pelo destino que você informar."}</p>
        </Secao>
        <label className="campo"><span className="campo-rotulo">Categoria</span><span className="campo-caixa"><select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{(op.dados?.categorias ?? []).map((c) => <option key={c.nome}>{c.nome}</option>)}</select></span></label>
        {modo === "destino" && <label className="campo"><span className="campo-rotulo">Destino *</span><span className="campo-caixa"><input value={destino} placeholder="Rua, número e bairro" onChange={(e) => setDestino(e.target.value)} /></span></label>}
        <label className="campo"><span className="campo-rotulo">Nome do passageiro (opcional)</span><span className="campo-caixa"><input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></span></label>
        <div className="pilula-pagamento"><MapPin size={18} /> Embarque pela sua posição: <strong>{posicao ? "GPS ativo" : "sem GPS"}</strong></div>
        <Erro texto={erro} />
        <button type="button" className="botao-m verde" disabled={ocupado || !categoria || (modo === "destino" && destino.trim().length < 3)} onClick={() => void abrir()}>{modo === "taximetro" ? "INICIAR CORRIDA NO TAXÍMETRO" : "INICIAR CORRIDA"}</button>
      </div>
    </Pagina>
  );
}

// ------------------------------------------------------------------ Histórico de ganhos

interface GanhosPeriodo {
  periodo: string; de: string; ate: string; total: number; viagens: number; minutosOnline: number; minutosEmViagem: number;
  porDia: Array<{ dia: string; valor: number }>; porPagamento: Array<{ pagamento: string; valor: number; corridas: number }>;
  lista: Array<{ id: string; os: string; em: string; valor: number | null; passageiro: string; pagamento: string; embarque: string; destino: string }>;
}
const horas = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;

export function HistoricoGanhos({ voltar }: Voltar) {
  const [periodo, setPeriodo] = useState<"mes" | "semana">("mes");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const { dados, erro } = useBuscar<GanhosPeriodo>(`/ganhos?periodo=${periodo}&mes=${mes}`);
  const andar = (d: number) => { const [a, m] = mes.split("-").map(Number); const n = new Date(Date.UTC(a, m - 1 + d, 1)); setMes(n.toISOString().slice(0, 7)); };
  const nomeMes = new Date(`${mes}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const maior = Math.max(1, ...(dados?.porDia.map((d) => d.valor) ?? [1]));
  const porDia = new Map<string, GanhosPeriodo["lista"]>();
  for (const v of dados?.lista ?? []) porDia.set(v.em.slice(0, 10), [...(porDia.get(v.em.slice(0, 10)) ?? []), v]);
  return (
    <Pagina>
      <Topo titulo="Histórico de viagens" voltar={voltar} />
      <div className="conteudo">
        <div className="duas">
          <button type="button" className={periodo === "semana" ? "botao-m" : "botao-contorno"} onClick={() => setPeriodo("semana")}>Semanal</button>
          <button type="button" className={periodo === "mes" ? "botao-m" : "botao-contorno"} onClick={() => setPeriodo("mes")}>Mensal</button>
        </div>
        {periodo === "mes" && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" className="redondo" aria-label="Mês anterior" onClick={() => andar(-1)}><ChevronLeft size={20} /></button><strong className="primeira-maiuscula">{nomeMes}</strong>
          <button type="button" className="redondo" aria-label="Próximo mês" onClick={() => andar(1)}><ChevronRight size={20} /></button></div>}
        <Erro texto={erro} />
        {dados && <>
          <div className="cartao-m centro"><small className="dica">Ganhos {periodo === "mes" ? "do mês" : "da semana"}</small><p className="numero-grande cor-ok">{reais(dados.total)}</p>
            <div className="barras-dia">{dados.porDia.map((d) => <span key={d.dia} title={`${d.dia}: ${reais(d.valor)}`} style={{ height: `${Math.max(2, (d.valor / maior) * 100)}%` }} />)}</div></div>
          <div className="grade cartao-m"><div><small>VIAGENS</small><strong>{dados.viagens}</strong></div><div><small>TEMPO ONLINE</small><strong>{horas(dados.minutosOnline)}</strong></div><div><small>EM TRÂNSITO</small><strong>{horas(dados.minutosEmViagem)}</strong></div></div>
          <Secao titulo="Formas de pagamento">{dados.porPagamento.length ? dados.porPagamento.map((p) => <div key={p.pagamento} className="linha-viagem"><span>{p.pagamento} <small className="dica">({p.corridas})</small></span><strong>{reais(p.valor)}</strong></div>) : <p className="dica">Nenhuma viagem no período.</p>}</Secao>
          <Secao titulo="Viagens realizadas">
            {!dados.lista.length && <Vazio icone={Car} titulo="Nenhuma viagem por aqui" texto="As viagens finalizadas no período aparecem aqui." />}
            {[...porDia].map(([dia, l]) => <div key={dia}><div className="menu-titulo">{dia.split("-").reverse().join("/")}</div>{l.map((v) => <div key={v.id} className="linha-viagem"><div><strong>OS #{v.os} · {v.passageiro}</strong><br /><small className="dica">{v.embarque}{v.destino ? ` → ${v.destino}` : ""}</small></div><div style={{ textAlign: "right" }}><strong>{reais(v.valor)}</strong><br /><small className="dica">{v.pagamento}</small></div></div>)}</div>)}
          </Secao>
        </>}
      </div>
    </Pagina>
  );
}

// ------------------------------------------------------------------ Meus veículos

export function MeusVeiculos({ voltar }: Voltar) {
  const { dados, erro, recarregar } = useBuscar<{ veiculos: Veiculo[] }>("/veiculos");
  const [editando, setEditando] = useState<Veiculo | "novo" | null>(null);
  const [apagar, setApagar] = useState<Veiculo | null>(null);
  const [erroAcao, setErroAcao] = useState("");
  const agir = async (f: () => Promise<unknown>) => { setErroAcao(""); try { await f(); await recarregar(); } catch (e) { setErroAcao(mensagemDeErro(e)); } };
  if (editando) return (
    <Pagina><Topo titulo={editando === "novo" ? "Novo veículo" : "Editar veículo"} voltar={() => setEditando(null)} />
      <div className="conteudo"><FormVeiculo inicial={editando === "novo" ? null : editando} botao="SALVAR VEÍCULO" aoSalvar={() => { setEditando(null); void recarregar(); }} /></div></Pagina>
  );
  return (
    <Pagina>
      <Topo titulo="Meus veículos" voltar={voltar} direita={<button type="button" className="topo-voltar" aria-label="Adicionar veículo" onClick={() => setEditando("novo")}><Plus size={22} /></button>} />
      <div className="conteudo">
        <Erro texto={erro || erroAcao} />
        {dados && !dados.veiculos.length && <Vazio icone={Car} titulo="Nenhum veículo" texto="Toque em + para cadastrar o seu." />}
        {(dados?.veiculos ?? []).map((v) => (
          <div key={v.id} className="cartao-m">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".6rem" }}>
              <div><strong>{v.modelo}</strong><br /><small className="dica">{v.cor} · {v.ano}</small></div><Placa placa={v.placa} />
            </div>
            <div className="chips">{v.ativo ? <span className="chip ok">Ativo</span> : <button type="button" className="chip marca" onClick={() => void agir(() => api(`/veiculos/${v.id}/ativar`, { corpo: {} }))}>Usar este veículo</button>}{v.situacao && <span className="chip">{v.situacao}</span>}</div>
            <div className="duas"><button type="button" className="botao-contorno" onClick={() => setEditando(v)}><Wrench size={16} /> Editar</button><button type="button" className="botao-contorno perigo" onClick={() => setApagar(v)}><Trash2 size={16} /> Excluir</button></div>
          </div>
        ))}
      </div>
      {apagar && <Dialogo icone={Trash2} perigo titulo="Excluir veículo?" texto={`${apagar.modelo} (${apagar.placa}) sai da sua lista.`} cancelar={() => setApagar(null)} rotulo="Excluir" confirmar={() => { const v = apagar; setApagar(null); void agir(() => api(`/veiculos/${v.id}/excluir`, { corpo: {} })); }} />}
    </Pagina>
  );
}

// ------------------------------------------------------------------ Meu cadastro

export function MeuCadastro({ voltar, aoMudar }: Voltar & { aoMudar: () => void }) {
  const { dados, erro, recarregar } = useBuscar<DadosCadastro>("/cadastro");
  const [parte, setParte] = useState<"" | "dados" | "foto" | "endereco" | "veiculo" | "docs">("");
  const fim = () => { setParte(""); void recarregar(); aoMudar(); };
  const titulos = { dados: "Dados pessoais", foto: "Foto do rosto", endereco: "Endereço", veiculo: "Veículo", docs: "Documentos" };
  if (parte) return (
    <Pagina><Topo titulo={titulos[parte]} voltar={() => setParte("")} />
      <div className="conteudo">
        {parte === "dados" && dados && <FormDados inicial={dados.dados} aoSalvar={fim} botao="SALVAR" />}
        {parte === "foto" && <FormFoto fotoAtual={dados?.foto} aoSalvar={fim} botao="SALVAR" />}
        {parte === "endereco" && dados && <FormEndereco inicial={dados.endereco} aoSalvar={fim} botao="SALVAR" />}
        {parte === "veiculo" && <FormVeiculo aoSalvar={fim} botao="SALVAR VEÍCULO" />}
        {parte === "docs" && <FormDocumentos />}
      </div></Pagina>
  );
  const falta = (t: string) => dados?.pendencias.some((p) => p.toLowerCase().startsWith(t)) ?? false;
  return (
    <Pagina>
      <Topo titulo="Meu cadastro" subtitulo={dados?.situacao} voltar={voltar} />
      <div className="conteudo">
        <Erro texto={erro} />
        {dados && dados.pendencias.length > 0 && <Info tipo="erro" texto={`Falta completar: ${dados.pendencias.join(", ")}.`} />}
        {dados && dados.situacao === "Aguardando aprovação" && <Info texto="Seu cadastro está em análise pela central." />}
        <div className="cartao-m" style={{ padding: 0, overflow: "hidden" }}>
          <ItemMenu icone={UserRound} titulo="Dados pessoais" texto={dados?.dados.nome} aoTocar={() => setParte("dados")} selo={falta("dados") ? "Falta" : undefined} />
          <ItemMenu icone={UserRound} titulo="Foto do rosto" aoTocar={() => setParte("foto")} selo={falta("foto") ? "Falta" : undefined} />
          <ItemMenu icone={MapPin} titulo="Endereço" texto={dados?.endereco.rua} aoTocar={() => setParte("endereco")} selo={falta("endereço") ? "Falta" : undefined} />
          <ItemMenu icone={Car} titulo="Veículo" aoTocar={() => setParte("veiculo")} selo={falta("veículo") ? "Falta" : undefined} />
          <ItemMenu icone={ClipboardList} titulo="Documentos" aoTocar={() => setParte("docs")} selo={dados?.pendencias.some((p) => p.startsWith("Documento")) ? "Falta" : undefined} />
        </div>
      </div>
    </Pagina>
  );
}

export function AlterarSenha({ voltar }: Voltar) {
  const [atual, setAtual] = useState(""); const [nova, setNova] = useState(""); const [conf, setConf] = useState("");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(false);
  return (
    <Pagina><Topo titulo="Alterar senha" voltar={voltar} />
      <form className="conteudo formulario" onSubmit={async (e) => { e.preventDefault(); setErro(""); try { await api("/conta/senha", { corpo: { atual, nova } }); setOk(true); setAtual(""); setNova(""); setConf(""); } catch (x) { setErro(mensagemDeErro(x)); } }}>
        <label className="campo"><span className="campo-rotulo">Senha atual</span><span className="campo-caixa"><input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" /></span></label>
        <label className="campo"><span className="campo-rotulo">Nova senha (mínimo 6)</span><span className="campo-caixa"><input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" /></span></label>
        <label className="campo"><span className="campo-rotulo">Confirmar nova senha</span><span className="campo-caixa"><input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" /></span></label>
        <Erro texto={erro} /><Info texto={ok ? "Senha alterada." : ""} tipo="ok" />
        <button className="botao-m" disabled={nova.length < 6 || nova !== conf}>SALVAR SENHA</button>
      </form></Pagina>
  );
}

// ------------------------------------------------------------------ Configurações e diagnóstico

export function Configuracoes({ voltar }: Voltar) {
  const [a, mudar] = useAjustes();
  return (
    <Pagina><Topo titulo="Configurações" voltar={voltar} />
      <div className="conteudo">
        <Secao titulo="Interface e tema">
          <label className="campo"><span className="campo-rotulo">Tema do app</span><span className="campo-caixa"><select value={a.tema} onChange={(e) => mudar({ tema: e.target.value as Tema })}>{Object.entries(NOMES_TEMA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></span></label>
          <label className="campo"><span className="campo-rotulo">Navegador padrão</span><span className="campo-caixa"><select value={a.navegador} onChange={(e) => mudar({ navegador: e.target.value as Navegador })}>{Object.entries(NOMES_NAVEGADOR).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></span></label>
        </Secao>
        <Secao titulo="Alertas"><div className="cartao-m" style={{ padding: 0, overflow: "hidden" }}>
          <Chave ligado={a.vibrar} mudar={(v) => mudar({ vibrar: v })} titulo="Vibrar no chamado" />
          <Chave ligado={a.insistente} mudar={(v) => mudar({ insistente: v })} titulo="Aviso insistente" texto="Repete o som e a vibração a cada 5 s até você responder." />
        </div></Secao>
        <Secao titulo="Áudio"><div className="cartao-m" style={{ padding: 0, overflow: "hidden" }}>
          <Chave ligado={a.voz} mudar={(v) => mudar({ voz: v })} titulo="Assistente de voz" texto="Avisa quando você chega perto do embarque, da parada e do destino." />
          <Chave ligado={a.volume} mudar={(v) => mudar({ volume: v })} titulo="Volume automático" />
        </div></Secao>
      </div></Pagina>
  );
}

export function Diagnostico({ voltar, eu, conectado, posicao, online }: Voltar & { eu: Eu; conectado: boolean; posicao: Posicao | null; online: boolean }) {
  const [notif, setNotif] = useState<string>(typeof Notification === "undefined" ? "indisponível" : Notification.permission);
  const itens: Array<[string, boolean, string]> = [
    ["Conta e cadastro", !!eu.aprovado, eu.aprovado ? "Aprovado" : `Em análise${eu.pendencias?.length ? `: falta ${eu.pendencias.length} item(ns)` : ""}`],
    ["GPS", !!posicao, posicao ? "Posição recebida" : "Sem posição. Libere a localização."],
    ["Canal de chamadas (tempo real)", conectado, conectado ? "Conectado" : "Reconectando…"],
    ["Notificações", notif === "granted" || notif === "indisponível", notif === "granted" ? "Permitidas" : notif === "indisponível" ? "Gerenciadas pelo sistema" : "Libere nas configurações do aparelho"],
    ["Online", online, online ? "Você está recebendo chamadas" : "Você está offline"],
  ];
  const tudo = itens.every(([, ok]) => ok || false);
  return (
    <Pagina><Topo titulo="Diagnóstico do app" voltar={voltar} />
      <div className="conteudo">
        <div className="cartao-m centro"><ShieldCheck size={36} className={tudo ? "cor-ok" : "cor-aviso"} /><h3>{tudo ? "Tudo pronto" : "Falta algo"}</h3></div>
        {itens.map(([nome, ok, texto]) => <div key={nome} className="linha-viagem"><div><strong>{nome}</strong><br /><small className="dica">{texto}</small></div><span className={ok ? "cor-ok" : "cor-aviso"}>{ok ? "✔" : "!"}</span></div>)}
        {typeof Notification !== "undefined" && notif === "default" && <button type="button" className="botao-contorno" onClick={() => void Notification.requestPermission().then(setNotif)}>Permitir notificações</button>}
        <p className="dica centro">Versão do app: {VERSAO}</p>
      </div></Pagina>
  );
}

// ------------------------------------------------------------------ Suporte (chat com a central) e Fale conosco

interface MsgSuporte { id: string; de: "eu" | "central"; texto?: string; em: string; audio?: { id: string } }
function AudioSuporte({ id }: { id: string }) {
  const url = useImagem(`/api/apps/${empresaAtual()}/suporte/audio/${id}`);
  return url ? <audio controls preload="metadata" src={url} /> : <small className="dica">Carregando áudio…</small>;
}

export function Suporte({ voltar }: Voltar) {
  const [msgs, setMsgs] = useState<MsgSuporte[]>([]);
  const [texto, setTexto] = useState(""); const [erro, setErro] = useState(""); const [gravando, setGravando] = useState(false);
  const grav = useRef(new Gravador()); const fim = useRef<HTMLDivElement>(null);
  const carregar = () => api<{ mensagens: MsgSuporte[] }>("/suporte").then((r) => setMsgs(r.mensagens)).catch((e) => setErro(mensagemDeErro(e)));
  useEffect(() => { void carregar(); return tempoReal((tipo) => { if (tipo === "suporte") void carregar(); }, () => undefined); }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);
  const enviar = async () => { if (!texto.trim()) return; setErro(""); try { await api("/suporte", { corpo: { texto } }); setTexto(""); await carregar(); } catch (e) { setErro(mensagemDeErro(e)); } };
  const parar = async (cancelar: boolean) => {
    const r = await grav.current.parar(cancelar); setGravando(false);
    if (!r || r.segundos < 1) return;
    try { await api("/suporte/audio", { bruto: r.audio, cabecalhos: { "x-segundos": String(r.segundos) } }); await carregar(); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  return (
    <Pagina><Topo titulo="Chat com suporte" voltar={voltar} />
      <div className="conteudo" style={{ gap: ".5rem" }}>
        {!msgs.length && <Vazio icone={Headset} titulo="Fale com a central" texto="Escreva ou mande um áudio. A central responde por aqui." />}
        {msgs.map((m) => <div key={m.id} className={`balao ${m.de === "eu" ? "meu" : "dele"}`}>{m.texto && <p>{m.texto}</p>}{m.audio && <AudioSuporte id={m.audio.id} />}<time>{hora(m.em)}</time></div>)}
        <div ref={fim} /><Erro texto={erro} />
        {gravando
          ? <div className="chat-entrada gravando"><span className="ponto-rec" /> Gravando…<button className="link-m" onClick={() => void parar(true)}>Descartar</button><button className="botao" onClick={() => void parar(false)}>Enviar áudio</button></div>
          : <form className="chat-entrada" style={{ position: "sticky", bottom: 0 }} onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            <input placeholder="Escreva uma mensagem" value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} />
            {texto.trim() ? <button className="botao" aria-label="Enviar"><Send size={18} /></button> : <button type="button" className="botao" aria-label="Gravar áudio" onClick={() => void grav.current.comecar().then(() => setGravando(true)).catch((e) => setErro(mensagemDeErro(e)))}><Mic size={18} /></button>}
          </form>}
      </div></Pagina>
  );
}

export function FaleConosco({ voltar, marca }: Voltar & { marca: MarcaApp }) {
  const c = useContatos(marca.suporte);
  return (
    <Pagina><Topo titulo="Fale conosco" voltar={voltar} />
      <div className="conteudo">
        {c.whatsapp && <a className="botao-m verde" href={linkWhatsapp(c.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Suporte via WhatsApp</a>}
        {c.site && <a className="botao-contorno" href={c.site} target="_blank" rel="noreferrer"><LifeBuoy size={18} /> Abrir chamado (site)</a>}
        {c.telefone && <a className="botao-contorno" href={`tel:${c.telefone}`}><Phone size={18} /> Ligar para a central {telefoneBonito(c.telefone)}</a>}
        {!c.whatsapp && !c.site && !c.telefone && <Vazio icone={Headset} titulo="Sem contatos cadastrados" texto="Use o chat com o suporte." />}
      </div></Pagina>
  );
}

// ------------------------------------------------------------------ menu lateral

export function MenuLateral({ eu, marca, fechar, ir, sair }: { eu: Eu; marca: MarcaApp; fechar: () => void; ir: (t: string) => void; sair: () => void }) {
  const c = useContatos(marca.suporte);
  const [confirmar, setConfirmar] = useState(false);
  const item = (icone: typeof Car, titulo: string, tela: string, texto?: string, selo?: string) => <ItemMenu icone={icone} titulo={titulo} texto={texto} selo={selo} aoTocar={() => { fechar(); ir(tela); }} />;
  return (
    <div className="menu-lateral" onClick={fechar}>
      <div onClick={(e) => e.stopPropagation()}>
        <div className="menu-perfil"><Avatar foto={eu.foto} nome={eu.nome} tamanho={56} /><div><strong>{eu.nome}</strong><br /><small>{eu.aprovado ? "Aprovado" : "Em análise"}{eu.veiculo ? ` · ${eu.veiculo}` : ""}{eu.placa ? ` · ${eu.placa}` : ""}</small></div></div>
        <div className="menu-titulo">OPERAÇÃO</div>
        {item(Hand, "Abrir corrida (Maçaneta)", "macaneta")}{item(Car, "Corridas", "corridas")}{item(ClipboardList, "Histórico de ganhos", "historico")}{item(Wrench, "Carteira e saque", "carteira")}{item(UserRound, "Indique e ganhe", "desafios", undefined, "Bônus")}{item(Bell, "Notificações", "notificacoes")}
        <div className="menu-titulo">CONTA E VEÍCULO</div>
        {item(Car, "Meus veículos", "veiculos")}{item(UserRound, "Dados cadastrais", "cadastro", undefined, eu.pendencias?.length ? "Falta" : undefined)}{item(ClipboardList, "Documentos", "documentos")}{item(Settings, "Preferências de corrida", "preferencias")}{item(ShieldCheck, "Alterar senha", "senha")}
        <div className="menu-titulo">SUPORTE E SISTEMA</div>
        {item(ShieldCheck, "Diagnóstico do app", "diagnostico")}{item(Headset, "Chat com suporte", "suporte")}{item(Phone, "Fale conosco", "fale")}{item(Settings, "Configurações", "config")}
        {c.termosUrl && <ItemMenu icone={ClipboardList} titulo="Termos de uso" aoTocar={() => window.open(c.termosUrl, "_blank")} />}
        {c.privacidadeUrl && <ItemMenu icone={ShieldCheck} titulo="Política de privacidade" aoTocar={() => window.open(c.privacidadeUrl, "_blank")} />}
        <ItemMenu icone={LogOut} perigo titulo="Sair da conta" aoTocar={() => setConfirmar(true)} />
        <p className="dica centro" style={{ padding: "1rem" }}>Versão {VERSAO} · {ajustesAgora().navegador === "waze" ? "Waze" : "Google Maps"}</p>
      </div>
      {confirmar && <Dialogo icone={LogOut} perigo titulo="Sair da conta?" texto="Você vai ficar offline." cancelar={() => setConfirmar(false)} rotulo="Sair" confirmar={sair} />}
    </div>
  );
}
