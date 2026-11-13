// Telas do menu do app do motorista: Corridas (Disp., Pend., Prog.), Maçaneta, histórico de viagens, meus veículos,
// meu cadastro, alterar senha, configurações, diagnóstico, chat com o suporte, fale conosco e o menu lateral.

import { useEffect, useState } from "react";
import {
  Bell, BadgeCheck, Banknote, Calendar, Car, ChevronDown, ChevronRight, ClipboardList, FileText, Gauge, GitFork, Gift, Hand, Headphones, Headset, Info, LifeBuoy, LocateFixed, LogOut, Lock,
  MapPin, MessageCircle, MessageSquare, Navigation, Pencil, Phone, Play, Plus, Radar, RefreshCw, ScanFace, Settings, ShieldCheck, SlidersHorizontal, Trash2, User, UserRound, Wallet, X,
  BatteryCharging, Globe, Layers, Map as IconeMapa, Music, Smartphone, SquareDashed, Volume2, Vibrate, Timer, Mic, Radio, Bolt,
} from "lucide-react";
import { api, hora, reais, telefoneBonito, tempoReal, type Posicao } from "../comum/api";
import { mensagemDeErro, type MarcaApp } from "../comum/ui";
import { FormDados, FormDocumentos, FormEndereco, FormFoto, FormVeiculo, type DadosCadastro } from "./Cadastro";
import { Chamada } from "./Chamada";
import { Conversa, type MensagemM } from "./Conversa";
import {
  ajustes as ajustesAgora, NOMES_NAVEGADOR, NOMES_SONS, NOMES_TEMA, tocar, useAjustes, VERSAO, type Navegador, type Sons, type Tema,
} from "./ajustes";
import { Avatar, Chave, Dialogo, empresaAtual, Erro, Folha, Info as Aviso, ItemMenu, linkWhatsapp, Pagina, Placa, Topo, useBuscar, useContatos, useImagem, Vazio } from "./Pecas";
import { diaHora, soHora, type CorridaAberta, type CorridasAbertas, type Corrida, type Eu, type Veiculo } from "./tipos";

type Voltar = { voltar: () => void };

// ------------------------------------------------------------------ Corridas (Disp., Pend., Prog.)

export function Corridas({ barra, aoPegar, aoMudar }: { barra: React.ReactNode; aoPegar: (c: Corrida) => void; aoMudar?: () => void }) {
  const [aba, setAba] = useState<"disponiveis" | "pendentes" | "programadas">("disponiveis");
  const { dados, erro, recarregar } = useBuscar<CorridasAbertas>("/corridas-abertas");
  const [aberta, setAberta] = useState<CorridaAberta | null>(null);
  const [aviso, setAviso] = useState("");
  const [erroAcao, setErroAcao] = useState("");
  useEffect(() => { const t = setInterval(() => void recarregar(), 8000); return () => clearInterval(t); }, [recarregar]);
  const l = dados?.[aba] ?? [];
  const rotulo = (n: string, k: keyof CorridasAbertas) => `${n} (${dados?.[k].length ?? 0})`;
  return (
    <div className="pagina-baixo">
      <nav className="abas-topo">
        <button type="button" className={aba === "disponiveis" ? "ativa" : ""} onClick={() => setAba("disponiveis")}>{rotulo("Disp.", "disponiveis")}</button>
        <button type="button" className={aba === "pendentes" ? "ativa" : ""} onClick={() => setAba("pendentes")}>{rotulo("Pend.", "pendentes")}</button>
        <button type="button" className={aba === "programadas" ? "ativa" : ""} onClick={() => setAba("programadas")}>{rotulo("Prog.", "programadas")}</button>
      </nav>
      <div className="corridas-corpo" style={{ display: "flex", flexDirection: "column" }}>
        {(erro || aviso) && <div className="conteudo" style={{ flex: "none", paddingBottom: 0 }}><Erro texto={erro} /><Aviso texto={aviso} tipo="ok" /></div>}
        {!l.length ? (
          <div className="vazio-centro"><Radar size={72} strokeWidth={1.4} /><span>Nenhuma corrida no momento...</span></div>
        ) : (
          <div className="conteudo">
            {l.map((c) => (
              <button key={c.id} type="button" className="cartao-m" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aba === "pendentes" ? undefined : setAberta(c)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}><strong>{c.categoria}</strong><strong className="cor-ok">{reais(c.valorLiquido ?? c.valorBruto ?? c.estimativa?.valor ?? null)}</strong></div>
                <div className="rota-mini"><span className="bolinha embarque" /><span>{c.embarque.texto}</span></div>
                {c.destino && <div className="rota-mini"><span className="bolinha destino" /><span>{c.destino.texto}</span></div>}
                <div className="chips">
                  {c.distanciaKm != null && <span className="chip">{c.distanciaKm} km de você</span>}
                  {c.agendadaPara && <span className="chip aviso">{diaHora(c.agendadaPara)}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {barra}
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
    </div>
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
      <Topo estilo="esquerda" titulo="CORRIDA MAÇANETA" subtitulo={<><span className="ponto-verde" />Embarque direto • Sem agendamento</>} voltar={voltar} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, flex: 1 }}>
        <div className="bloco-maca">
          <h4>MODO DE COBRANÇA</h4>
          <div className="modo-cobranca">
            <button type="button" className={modo === "taximetro" ? "ativo" : ""} onClick={() => setModo("taximetro")}><Gauge size={22} /><strong>Taxímetro Livre</strong><small>Sem destino prévio</small></button>
            <button type="button" className={modo === "destino" ? "ativo" : ""} onClick={() => setModo("destino")}><GitFork size={22} /><strong>Com Destino</strong><small>Calcular rota e valor</small></button>
          </div>
        </div>
        <div className="bloco-maca">
          <h4>TRAJETO DA CORRIDA</h4>
          <div className="ponto-gps">
            <span className="item-icone"><LocateFixed size={20} /></span>
            <div className="t"><small>PONTO DE EMBARQUE</small><strong>Sua localização atual (GPS)</strong></div>
            <span className="selo-gps">{posicao ? "GPS ATIVO" : "SEM GPS"}</span>
          </div>
          {modo === "destino" && <label className="campo"><span className="campo-rotulo">Destino *</span><span className="campo-caixa"><MapPin size={18} className="campo-icone" /><input value={destino} placeholder="Rua, número e bairro" onChange={(e) => setDestino(e.target.value)} /></span></label>}
          <div className="aviso-taximetro"><Info size={18} /><span>{modo === "taximetro" ? "O valor será apurado em tempo real pelo taxímetro durante a viagem de acordo com a distância e o tempo decorridos." : "O valor será calculado pela rota até o destino que você informar."}</span></div>
          <label className="campo"><span className="campo-rotulo">Categoria</span><span className="campo-caixa"><select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{(op.dados?.categorias ?? []).map((c) => <option key={c.nome}>{c.nome}</option>)}</select><ChevronDown size={18} className="campo-icone" /></span></label>
          <label className="campo"><span className="campo-rotulo">Nome do passageiro (opcional)</span><span className="campo-caixa"><User size={18} className="campo-icone" /><input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></span></label>
          <Erro texto={erro} />
        </div>
        <div className="fundo-botao">
          <button type="button" className="botao-m verde" disabled={ocupado || !categoria || (modo === "destino" && destino.trim().length < 3)} onClick={() => void abrir()}><Play size={16} fill="currentColor" /> {modo === "taximetro" ? "INICIAR CORRIDA NO TAXÍMETRO" : "INICIAR CORRIDA"}</button>
        </div>
      </div>
    </Pagina>
  );
}

// ------------------------------------------------------------------ Histórico de viagens

interface GanhosPeriodo {
  periodo: string; de: string; ate: string; total: number; viagens: number; minutosOnline: number; minutosEmViagem: number;
  porDia: Array<{ dia: string; valor: number }>; porPagamento: Array<{ pagamento: string; valor: number; corridas: number }>;
  lista: Array<{ id: string; os: string; em: string; valor: number | null; passageiro: string; pagamento: string; embarque: string; destino: string }>;
}
const minutos = (min: number) => (min < 60 ? `${min}min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function HistoricoGanhos({ voltar }: Voltar) {
  const [periodo, setPeriodo] = useState<"mes" | "semana">("mes");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [filtro, setFiltro] = useState(false);
  const { dados, erro } = useBuscar<GanhosPeriodo>(`/ganhos?periodo=${periodo}&mes=${mes}`);
  const opcoesMes = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  const nomeMes = (m: string, curto = true) => { const [a, n] = m.split("-").map(Number); const t = MESES[n - 1]; return curto ? `${t.slice(0, 3)[0].toUpperCase()}${t.slice(1, 3)}${a !== new Date().getUTCFullYear() ? `/${String(a).slice(2)}` : ""}` : t; };
  const maior = Math.max(1, ...(dados?.porDia.map((d) => d.valor) ?? [1]));
  const porDia = new Map<string, GanhosPeriodo["lista"]>();
  for (const v of dados?.lista ?? []) porDia.set(v.em.slice(0, 10), [...(porDia.get(v.em.slice(0, 10)) ?? []), v]);
  const titulo = (dia: string) => { const [, m, d] = dia.split("-").map(Number); return `${String(d).padStart(2, "0")} de ${MESES[m - 1]}`; };
  return (
    <Pagina>
      <Topo estilo="escuro" titulo="Histórico de Viagens" voltar={voltar} direita={<button type="button" className="topo-acao" aria-label="Filtrar" onClick={() => setFiltro(true)}><SlidersHorizontal size={22} /></button>} />
      <div className="conteudo">
        {periodo === "mes" && (
          <label className="mes-pilula"><Calendar size={16} className="cor-marca" />{nomeMes(mes)}<ChevronDown size={16} />
            <select aria-label="Mês" value={mes} onChange={(e) => setMes(e.target.value)}>{opcoesMes.map((m) => <option key={m} value={m}>{nomeMes(m, false)} {m.slice(0, 4)}</option>)}</select>
          </label>
        )}
        <Erro texto={erro} />
        {dados && <>
          <div className="cartao-ganhos">
            <div className="linha-topo"><span>Ganhos {periodo === "mes" ? "do Mês" : "da Semana"}</span><span className="selo-periodo">{periodo === "mes" ? "MENSAL" : "SEMANAL"}</span></div>
            <p className="valor">{reais(dados.total)}</p>
            <div className="barras-dia">{dados.porDia.map((d) => <span key={d.dia} title={`${d.dia}: ${reais(d.valor)}`} style={{ height: d.valor > 0 ? `${Math.max(3, (d.valor / maior) * 100)}%` : 0 }} />)}</div>
            <div className="estat-ganhos"><div><strong>{dados.viagens}</strong><small>Viagens</small></div><div><strong>{minutos(dados.minutosOnline)}</strong><small>Online</small></div><div><strong>{minutos(dados.minutosEmViagem)}</strong><small>Em Trânsito</small></div></div>
          </div>
          <div className="cartao-forma">
            <h3><span className="item-icone"><Wallet size={17} /></span>Formas de Pagamento &amp; Bônus</h3>
            {dados.porPagamento.length ? dados.porPagamento.map((p) => (
              <div key={p.pagamento} className="forma-linha"><span className="icone-verde"><Banknote size={20} /></span><div className="textos"><strong>{p.pagamento}</strong><small>{p.corridas} {p.corridas === 1 ? "corrida" : "corridas"}</small></div><strong>{reais(p.valor)}</strong></div>
            )) : <p className="dica" style={{ margin: 0 }}>Nenhuma viagem no período.</p>}
          </div>
          <div className="rotulo-lista">VIAGENS REALIZADAS</div>
          {!dados.lista.length && <Vazio icone={Car} titulo="Nenhuma viagem por aqui" texto="As viagens finalizadas no período aparecem aqui." />}
          {[...porDia].map(([dia, l]) => (
            <div key={dia} style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
              <div className="dia-titulo">{titulo(dia)}</div>
              {l.map((v) => (
                <div key={v.id} className="cartao-viagem">
                  <div className="l1"><span className="os">#{v.os}</span><span className="hora">{soHora(v.em)}</span><span className="valor">{reais(v.valor)}</span></div>
                  <div className="l2"><span className="nome"><User size={14} className="cor-marca" />{v.passageiro}</span><span className="chip">{v.pagamento}</span></div>
                  <div className="rota"><div><span className="bola" /><span className="t">{v.embarque}</span></div>{v.destino && <div><span className="quad" /><span className="t">{v.destino}</span></div>}</div>
                </div>
              ))}
            </div>
          ))}
        </>}
      </div>
      {filtro && (
        <Folha titulo="Visualizar por" fechar={() => setFiltro(false)}>
          {(["semana", "mes"] as const).map((p) => (
            <button key={p} type="button" className={`opcao-folha ${periodo === p ? "ativa" : ""}`} onClick={() => { setPeriodo(p); setFiltro(false); }}>
              {p === "semana" ? "Semanal" : "Mensal"}{periodo === p && <BadgeCheck size={20} />}
            </button>
          ))}
        </Folha>
      )}
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
    <Pagina className="clara"><Topo titulo={editando === "novo" ? "Novo veículo" : "Veículo"} voltar={() => setEditando(null)} />
      <div className="conteudo"><FormVeiculo inicial={editando === "novo" ? null : editando} botao="SALVAR VEÍCULO" aoSalvar={() => { setEditando(null); void recarregar(); }} /></div></Pagina>
  );
  return (
    <Pagina>
      <Topo titulo="Meus veículos" voltar={voltar} />
      <div className="conteudo">
        <div><h1 className="titulo-grande">Meus Veículos</h1><p className="dica" style={{ margin: ".5rem 0 0" }}>Caso queira trocar, toque no veículo desejado abaixo para selecioná-lo.</p></div>
        <Erro texto={erro || erroAcao} />
        {dados && !dados.veiculos.length && <Vazio icone={Car} titulo="Nenhum veículo" texto="Toque em + para cadastrar o seu." />}
        {(dados?.veiculos ?? []).map((v) => (
          <div key={v.id} role="button" tabIndex={0} className={`cartao-veiculo ${v.ativo ? "ativo" : ""}`} onClick={() => { if (!v.ativo) void agir(() => api(`/veiculos/${v.id}/ativar`, { corpo: {} })); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !v.ativo) void agir(() => api(`/veiculos/${v.id}/ativar`, { corpo: {} })); }}>
            <div className="cima">
              <span className="carro"><Car size={26} /></span>
              <div className="nomes">
                <div className="lin-v"><strong>{v.modelo}</strong>{v.ativo && <span className="selo-ativo">ATIVO</span>}</div>
                <div className="lin-v"><Placa placa={v.placa} pequena /><span className="dica">{v.cor} • {v.ano}</span></div>
              </div>
            </div>
            <div className="baixo" onClick={(e) => e.stopPropagation()}>
              {v.situacao ? <span className={`selo-situacao ${/aprov/i.test(v.situacao) ? "" : /recus/i.test(v.situacao) ? "ruim" : "espera"}`}>{v.situacao}</span> : <span style={{ marginRight: "auto" }} />}
              <button type="button" className="mini-botao" onClick={() => setEditando(v)}><Pencil size={14} /> Editar</button>
              <button type="button" className="mini-botao perigo" onClick={() => setApagar(v)}><Trash2 size={14} /> Excluir</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="fab" aria-label="Adicionar veículo" onClick={() => setEditando("novo")}><Plus size={28} /></button>
      {apagar && <Dialogo icone={Trash2} perigo titulo="Excluir veículo?" texto={`${apagar.modelo} (${apagar.placa}) sai da sua lista.`} cancelar={() => setApagar(null)} rotulo="Excluir" confirmar={() => { const v = apagar; setApagar(null); void agir(() => api(`/veiculos/${v.id}/excluir`, { corpo: {} })); }} />}
    </Pagina>
  );
}

// ------------------------------------------------------------------ Meu cadastro

export function MeuCadastro({ voltar, aoMudar, irCarteira, aoSairDaConta }: Voltar & { aoMudar: () => void; irCarteira: () => void; aoSairDaConta: () => void }) {
  const { dados, erro, recarregar } = useBuscar<DadosCadastro>("/cadastro");
  const [parte, setParte] = useState<"" | "dados" | "foto" | "endereco" | "veiculo" | "docs">("");
  const [excluir, setExcluir] = useState(false);
  const [senha, setSenha] = useState("");
  const [erroExcluir, setErroExcluir] = useState("");
  const fim = () => { setParte(""); void recarregar(); aoMudar(); };
  const titulos = { dados: "Dados Pessoais", foto: "Foto do Rosto", endereco: "Endereço", veiculo: "Veículo", docs: "Documentos" };
  if (parte) return (
    <Pagina className="clara"><Topo titulo={titulos[parte]} voltar={() => setParte("")} />
      <div className="conteudo">
        {parte === "dados" && dados && <FormDados inicial={dados.dados} aoSalvar={fim} botao="SALVAR ALTERAÇÕES" />}
        {parte === "foto" && <FormFoto fotoAtual={dados?.foto} aoSalvar={fim} botao="SALVAR" />}
        {parte === "endereco" && dados && <FormEndereco inicial={dados.endereco} aoSalvar={fim} botao="SALVAR ENDEREÇO" />}
        {parte === "veiculo" && <FormVeiculo aoSalvar={fim} botao="SALVAR VEÍCULO" />}
        {parte === "docs" && <FormDocumentos />}
      </div></Pagina>
  );
  const falta = (t: string) => dados?.pendencias.some((p) => p.toLowerCase().startsWith(t)) ?? false;
  const cartao = (I: typeof User, titulo: string, texto: string, f: () => void, selo?: string) => (
    <button type="button" className="item-cartao" onClick={f}><span className="item-icone"><I size={21} /></span><span className="item-textos"><strong>{titulo}</strong><small>{texto}</small></span>{selo && <span className="selo-mini">{selo}</span>}<ChevronRight size={18} className="item-seta" /></button>
  );
  const apagarConta = async () => {
    setErroExcluir("");
    try { await api("/conta/excluir", { corpo: { senha } }); aoSairDaConta(); } catch (e) { setErroExcluir(mensagemDeErro(e)); }
  };
  return (
    <Pagina className="clara">
      <Topo titulo="Meu Cadastro" voltar={voltar} />
      <div className="conteudo">
        <div><h1 className="titulo-grande" style={{ fontSize: "1.3rem" }}>Gerencie seus dados</h1><p className="dica" style={{ margin: ".4rem 0 0" }}>Mantenha suas informações atualizadas para evitar bloqueios.</p></div>
        <Erro texto={erro} />
        {dados && dados.pendencias.length > 0 && <Aviso tipo="erro" texto={`Falta completar: ${dados.pendencias.join(", ")}.`} />}
        {dados && dados.situacao === "Aguardando aprovação" && <Aviso texto="Seu cadastro está em análise pela central." />}
        <div className="lista-cartoes">
          {cartao(User, "Dados Pessoais", "Nome, CPF, Email...", () => setParte("dados"), falta("dados") ? "Falta" : undefined)}
          {cartao(ScanFace, "Foto do Rosto", "Foto de perfil para identificação", () => setParte("foto"), falta("foto") ? "Falta" : undefined)}
          {cartao(MapPin, "Endereço", "Local de residência", () => setParte("endereco"), falta("endereço") ? "Falta" : undefined)}
          {cartao(Car, "Veículo", "Informações do carro atual", () => setParte("veiculo"), falta("veículo") ? "Falta" : undefined)}
          {cartao(FileText, "Documentos", "CNH e documentos do veículo", () => setParte("docs"), dados?.pendencias.some((p) => p.startsWith("Documento")) ? "Falta" : undefined)}
        </div>
        <div className="rotulo-grupo" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: ".8rem" }}>Financeiro</div>
        <div className="lista-cartoes">{cartao(Wallet, "Carteira e saque", "Saldo, extrato e saque pelo Pix", irCarteira)}</div>
        <button type="button" className="botao-excluir-conta" onClick={() => setExcluir(true)}><span className="item-icone"><Trash2 size={20} /></span><span className="item-textos"><strong>Deletar minha conta</strong><small>Ação irreversível</small></span><ChevronRight size={18} /></button>
      </div>
      {excluir && (
        <Dialogo icone={Trash2} perigo titulo="Deletar minha conta?" texto="A central recebe o pedido e a sua conta será apagada. Isso não pode ser desfeito." cancelar={() => { setExcluir(false); setSenha(""); setErroExcluir(""); }} rotulo="Deletar" confirmar={() => void apagarConta()}>
          <span className="campo-caixa" style={{ width: "100%" }}><Lock size={18} className="campo-icone" /><input type="password" placeholder="Sua senha (se tiver)" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></span>
          <Erro texto={erroExcluir} />
        </Dialogo>
      )}
    </Pagina>
  );
}

export function AlterarSenha({ voltar }: Voltar) {
  const [atual, setAtual] = useState(""); const [nova, setNova] = useState(""); const [conf, setConf] = useState("");
  const [erro, setErro] = useState(""); const [ok, setOk] = useState(false);
  const campo = (rotulo: string, v: string, f: (s: string) => void, auto: string) => (
    <label className="campo"><span className="campo-rotulo">{rotulo}</span><span className="campo-caixa"><Lock size={18} className="campo-icone" /><input type="password" value={v} onChange={(e) => f(e.target.value)} autoComplete={auto} /></span></label>
  );
  return (
    <Pagina><Topo titulo="Alterar senha" voltar={voltar} />
      <form className="conteudo formulario" onSubmit={async (e) => { e.preventDefault(); setErro(""); try { await api("/conta/senha", { corpo: { atual, nova } }); setOk(true); setAtual(""); setNova(""); setConf(""); } catch (x) { setErro(mensagemDeErro(x)); } }}>
        {campo("Senha atual", atual, setAtual, "current-password")}
        {campo("Nova senha (mínimo 6)", nova, setNova, "new-password")}
        {campo("Confirmar nova senha", conf, setConf, "new-password")}
        <Erro texto={erro} /><Aviso texto={ok ? "Senha alterada." : ""} tipo="ok" />
        <button className="botao-m" disabled={nova.length < 6 || nova !== conf}>SALVAR SENHA</button>
      </form></Pagina>
  );
}

// ------------------------------------------------------------------ Configurações e diagnóstico

export function Configuracoes({ voltar }: Voltar) {
  const [a, mudar] = useAjustes();
  const [abrir, setAbrir] = useState<"" | "tema" | "navegador" | "sons">("");
  const linha = (I: typeof User, titulo: string, texto: string | undefined, valor: string, f: () => void) => (
    <button type="button" className="config-linha" onClick={f}><span className="item-icone"><I size={19} /></span><span className="item-textos"><strong>{titulo}</strong>{texto && <small>{texto}</small>}<small className="valor">{valor}</small></span><ChevronRight size={18} className="item-seta" /></button>
  );
  return (
    <Pagina><Topo titulo="Configurações" voltar={voltar} />
      <div className="config-titulo">Interface &amp; Tema</div>
      <div className="config-grupo">
        {linha(Settings, "Tema do Aplicativo", undefined, NOMES_TEMA[a.tema], () => setAbrir("tema"))}
        {linha(IconeMapa, "Navegador Padrão", undefined, NOMES_NAVEGADOR[a.navegador], () => setAbrir("navegador"))}
        <Chave icone={MessageSquare} ligado={a.prioritarias} mudar={(v) => mudar({ prioritarias: v })} titulo="Mensagens Prioritárias" texto="O app abrirá automaticamente ao receber mensagens." />
        <Chave icone={Layers} ligado={a.flutuante} mudar={(v) => mudar({ flutuante: v })} titulo="Ícone Flutuante (Segundo Plano)" texto="Exibir bolinha com logo ao minimizar o app" />
      </div>
      <div className="config-divisor" />
      <div className="config-titulo">Alertas &amp; Notificações</div>
      <div className="config-grupo">
        <Chave icone={Vibrate} ligado={a.vibrar} mudar={(v) => mudar({ vibrar: v })} titulo="Vibrar no Chamado" texto="Vibrar celular ao receber nova corrida" />
        <Chave icone={Timer} ligado={a.insistente} mudar={(v) => mudar({ insistente: v })} titulo="Aviso Insistente" texto="Repetir som a cada 5s até aceitar/recusar" />
      </div>
      <div className="config-divisor" />
      <div className="config-titulo">Áudio</div>
      <div className="config-grupo">
        <Chave icone={Mic} ligado={a.voz} mudar={(v) => mudar({ voz: v })} titulo="Assistente de Voz (Co-piloto)" texto="Avisos por voz ao chegar perto do destino" />
        {linha(Music, "Pacote de Sons", undefined, NOMES_SONS[a.sons], () => setAbrir("sons"))}
        <Chave icone={Volume2} ligado={a.volume} mudar={(v) => mudar({ volume: v })} titulo="Volume Automático" texto="Ajustar volume da mídia ao tocar alarme" />
      </div>
      <p className="dica" style={{ textAlign: "center", padding: "1.4rem 1rem 2rem", fontSize: ".72rem" }}>Versão {VERSAO}</p>
      {abrir === "tema" && <Folha titulo="Tema do Aplicativo" fechar={() => setAbrir("")}>{(Object.keys(NOMES_TEMA) as Tema[]).map((k) => <button key={k} type="button" className={`opcao-folha ${a.tema === k ? "ativa" : ""}`} onClick={() => { mudar({ tema: k }); setAbrir(""); }}>{NOMES_TEMA[k]}{a.tema === k && <BadgeCheck size={20} />}</button>)}</Folha>}
      {abrir === "navegador" && <Folha titulo="Navegador Padrão" fechar={() => setAbrir("")}>{(Object.keys(NOMES_NAVEGADOR) as Navegador[]).map((k) => <button key={k} type="button" className={`opcao-folha ${a.navegador === k ? "ativa" : ""}`} onClick={() => { mudar({ navegador: k }); setAbrir(""); }}>{NOMES_NAVEGADOR[k]}{a.navegador === k && <BadgeCheck size={20} />}</button>)}</Folha>}
      {abrir === "sons" && <Folha titulo="Pacote de Sons" fechar={() => setAbrir("")}>{(Object.keys(NOMES_SONS) as Sons[]).map((k) => <button key={k} type="button" className={`opcao-folha ${a.sons === k ? "ativa" : ""}`} onClick={() => { mudar({ sons: k }); tocar(2); }}>{NOMES_SONS[k]}{a.sons === k && <BadgeCheck size={20} />}</button>)}</Folha>}
    </Pagina>
  );
}

export function Diagnostico({ voltar, eu, conectado, posicao, online }: Voltar & { eu: Eu; conectado: boolean; posicao: Posicao | null; online: boolean }) {
  const lerNotif = () => (typeof Notification === "undefined" ? "indisponível" : Notification.permission);
  const [notif, setNotif] = useState<string>(lerNotif());
  const [agora, setAgora] = useState(Date.now());
  const itens: Array<{ I: typeof User; nome: string; texto: string; ok: boolean; estado: string }> = [
    { I: ClipboardList, nome: "Conta e cadastro", texto: eu.aprovado ? "Cadastro regularizado" : `Cadastro em análise${eu.pendencias?.length ? `: falta ${eu.pendencias.length} item(ns)` : ""}`, ok: !!eu.aprovado, estado: eu.aprovado ? "Aprovado" : "Em análise" },
    { I: LocateFixed, nome: "GPS e localização", texto: "Permissão e localização disponíveis", ok: !!posicao, estado: posicao ? "Ativo" : "Sem posição" },
    { I: Layers, nome: "Alerta de corridas na tela", texto: "Exibição sobre outros aplicativos permitida", ok: true, estado: "Ativado" },
    { I: Radio, nome: "Canal de chamadas", texto: "Comunicação ativa para recebimento de corridas", ok: conectado, estado: conectado ? "Conectado" : "Reconectando…" },
    { I: Bell, nome: "Notificações e alertas", texto: "Avisos sonoros e notificações habilitados", ok: notif === "granted" || notif === "indisponível", estado: notif === "granted" ? "Permitido" : notif === "indisponível" ? "Pelo sistema" : "Não permitido" },
    { I: BatteryCharging, nome: "Execução em segundo plano", texto: "Sem restrições de energia em segundo plano", ok: true, estado: online ? "Ativo" : "Pronto" },
    { I: Smartphone, nome: "Versão do aplicativo", texto: `Aplicativo atualizado (v${VERSAO})`, ok: true, estado: "Atualizado" },
  ];
  const tudo = itens.every((i) => i.ok);
  void agora;
  return (
    <Pagina>
      <div className="topo-diag">
        <button type="button" aria-label="Voltar" onClick={voltar}><ChevronRight size={22} style={{ transform: "rotate(180deg)" }} /></button>
        <div className="t"><strong>Diagnóstico</strong><small>Verificação do aplicativo</small></div>
        <button type="button" aria-label="Verificar de novo" className="cor-marca" onClick={() => { setNotif(lerNotif()); setAgora(Date.now()); }}><RefreshCw size={22} /></button>
      </div>
      <div className={`cartao-pronto ${tudo ? "" : "falta"}`}>
        <h3><ShieldCheck size={22} />{tudo ? "Tudo pronto" : "Falta algo"}</h3>
        <p>{tudo ? "Os requisitos verificados estão funcionando corretamente." : "Alguns requisitos precisam de atenção. Veja os itens abaixo."}</p>
        <small>Última verificação: agora</small>
      </div>
      <div className="diag-lista">
        <div className="diag-cab"><strong>Verificações</strong><small>{itens.length} itens</small></div>
        {itens.map(({ I, nome, texto, ok, estado }) => (
          <div key={nome} className="diag-item"><I size={22} /><div className="t"><strong>{nome}</strong><small>{texto}</small></div><div className={`est ${ok ? "" : "falta"}`}>{ok ? <BadgeCheck size={20} /> : <Info size={20} />}<span>{estado}</span></div></div>
        ))}
        {typeof Notification !== "undefined" && notif === "default" && <button type="button" className="botao-contorno" style={{ marginTop: "1rem" }} onClick={() => void Notification.requestPermission().then(setNotif)}>Permitir notificações</button>}
      </div>
    </Pagina>
  );
}

// ------------------------------------------------------------------ Suporte (chat com a central) e Fale conosco

interface MsgSuporte { id: string; de: "eu" | "central"; texto?: string; em: string; audio?: { id: string } }
function AudioSuporte({ id }: { id: string }) {
  const url = useImagem(`/api/apps/${empresaAtual()}/suporte/audio/${id}`);
  return url ? <audio controls preload="metadata" src={url} /> : <small className="dica">Carregando áudio…</small>;
}

export function Suporte({ voltar, marca }: Voltar & { marca: MarcaApp }) {
  const [msgs, setMsgs] = useState<MsgSuporte[]>([]);
  const carregar = () => api<{ mensagens: MsgSuporte[] }>("/suporte").then((r) => setMsgs(r.mensagens)).catch(() => undefined);
  useEffect(() => { void carregar(); return tempoReal((tipo) => { if (tipo === "suporte") void carregar(); }, () => undefined); }, []);
  const lista: MensagemM[] = msgs.map((m) => ({ id: m.id, meu: m.de === "eu", texto: m.texto, em: m.em, audio: m.audio ? <AudioSuporte id={m.audio.id} /> : undefined }));
  return (
    <Conversa utc titulo={<>Suporte Central <BadgeCheck size={17} style={{ color: "#3b82f6" }} /></>} subtitulo={`Atendimento Oficial ${marca.nome}`} avatar={<Headphones size={22} />} mensagens={lista} fechar={voltar}
      enviarTexto={async (texto) => { await api("/suporte", { corpo: { texto } }); await carregar(); }}
      enviarAudio={async (audio, segundos) => { await api("/suporte/audio", { bruto: audio, cabecalhos: { "x-segundos": String(segundos) } }); await carregar(); }} />
  );
}

export function FaleConosco({ voltar, marca }: Voltar & { marca: MarcaApp }) {
  const c = useContatos(marca.suporte);
  return (
    <Pagina><Topo titulo="Fale Conosco" voltar={voltar} />
      <div className="conteudo">
        <div><h1 className="titulo-grande" style={{ fontSize: "1.4rem" }}>Canais de Atendimento</h1><p className="dica" style={{ margin: ".5rem 0 0" }}>Entre em contato conosco através dos canais abaixo.</p></div>
        {c.whatsapp && <a className="contato-cartao" href={linkWhatsapp(c.whatsapp)} target="_blank" rel="noreferrer"><span className="item-icone verde"><MessageCircle size={24} /></span><span className="item-textos"><strong>Suporte via WhatsApp</strong><small>{c.whatsapp}</small></span><ChevronRight size={18} className="item-seta" /></a>}
        {c.site && <a className="contato-cartao" href={c.site} target="_blank" rel="noreferrer"><span className="item-icone"><Globe size={22} /></span><span className="item-textos"><strong>Abrir Chamado (Site)</strong><small>Acesse a central de ajuda.</small></span><ChevronRight size={18} className="item-seta" /></a>}
        {c.telefone && <a className="contato-cartao" href={`tel:${c.telefone}`}><span className="item-icone"><Phone size={22} /></span><span className="item-textos"><strong>Ligar para a Central</strong><small>{c.telefone}</small></span><ChevronRight size={18} className="item-seta" /></a>}
        {!c.whatsapp && !c.site && !c.telefone && <Vazio icone={Headset} titulo="Sem contatos cadastrados" texto="Use o chat com o suporte." />}
        <p className="dica" style={{ textAlign: "center", fontSize: ".72rem", marginTop: "1.5rem" }}>Seus contatos são baseados na sua cidade de registro.</p>
      </div>
    </Pagina>
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
        <div className="menu-perfil">
          <Avatar foto={eu.foto} nome={eu.nome} tamanho={60} selo={eu.aprovado ? <span className="selo-ok"><BadgeCheck size={16} /></span> : undefined} />
          <div className="nome"><strong>{eu.nome.split(" ")[0]}</strong>{(eu.veiculo || eu.placa) && <span>{[eu.veiculo, eu.placa].filter(Boolean).join(" · ")}</span>}</div>
          <button type="button" className="fechar" aria-label="Fechar o menu" onClick={fechar}><X size={18} /></button>
        </div>
        <div className="menu-titulo">Operação</div>
        {item(Hand, "Abrir corrida (Maçaneta)", "macaneta", "Iniciar viagem direta na rua")}
        {item(Wallet, "Histórico de ganhos", "historico", "Resumo financeiro e corridas")}
        {item(Gift, "Indique e ganhe", "desafios", undefined, "Bônus")}
        <div className="menu-sep" />
        <div className="menu-titulo">Conta e veículo</div>
        {item(Car, "Meus veículos", "veiculos")}
        {item(UserRound, "Dados cadastrais", "cadastro", undefined, eu.pendencias?.length ? "Falta" : undefined)}
        {item(SlidersHorizontal, "Preferências de corrida", "preferencias")}
        {item(Lock, "Alterar senha", "senha")}
        <div className="menu-sep" />
        <div className="menu-titulo">Suporte e sistema</div>
        {item(ShieldCheck, "Diagnóstico do app", "diagnostico", "Verificar permissões e status")}
        {item(MessageSquare, "Chat com suporte", "suporte")}
        {item(Headset, "Fale conosco", "fale")}
        {item(Settings, "Configurações", "config")}
        {c.termosUrl && <ItemMenu icone={FileText} titulo="Termos de uso" aoTocar={() => window.open(c.termosUrl, "_blank")} />}
        {c.privacidadeUrl && <ItemMenu icone={ShieldCheck} titulo="Política de privacidade" aoTocar={() => window.open(c.privacidadeUrl, "_blank")} />}
        <div className="menu-rodape">
          <ItemMenu icone={LogOut} perigo titulo="Sair da conta" aoTocar={() => setConfirmar(true)} direita={<span />} />
          <small>Versão {VERSAO}</small>
        </div>
      </div>
      {confirmar && <Dialogo icone={LogOut} perigo titulo="Sair da conta?" texto="Você vai ficar offline." cancelar={() => setConfirmar(false)} rotulo="Sair" confirmar={sair} />}
    </div>
  );
}

// ajuda para o compilador: ícones usados só em texto de ajuda
void [LifeBuoy, Navigation, SquareDashed, Bolt, ajustesAgora, telefoneBonito, hora, FileText];
