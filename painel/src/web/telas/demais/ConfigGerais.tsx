// Config › Gerais do App: suporte, motorista, preferências, passageiro, indicações, cancelamentos, maçaneta, banners e jurídico.

import { useState, type ReactNode } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Abas, Aviso, Cab, Campo, Carregando, Interruptor, Modal, dinheiro, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

type Aba = "geral" | "motorista" | "preferencias" | "passageiro" | "indicacoes" | "cancelamento" | "macaneta" | "banners" | "juridico";
const ABAS: Array<[Aba, string]> = [["geral", "Geral"], ["motorista", "Motorista"], ["preferencias", "Preferências"], ["passageiro", "Passageiro"], ["indicacoes", "Indicações"], ["cancelamento", "Cancelamentos"], ["macaneta", "Maçaneta"], ["banners", "Banners"], ["juridico", "Jurídico"]];

const dinheiroNum = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
const Num = ({ v, on, ...r }: { v: number; on: (n: number) => void } & Record<string, unknown>) => <input inputMode="decimal" value={String(v).replace(".", ",")} onChange={(e) => on(dinheiroNum(e.target.value))} {...r} />;

export function ConfigGerais() {
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("geral");
  const d = useCarregar(() => pedirConfig("/gerais"), []);
  const [c, setC] = useState<any>(null);
  const [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setC(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  const [chat, setChat] = useState(""), [novoDoc, setNovoDoc] = useState(false), [novoFiltro, setNovoFiltro] = useState(false), [upload, setUpload] = useState(false);
  const termos = useCarregar(() => pedirConfig("/termos"), []);
  const [tx, setTx] = useState<any>(null);
  const [txLido, setTxLido] = useState<unknown>(null);
  if (termos.dados && txLido !== termos.dados) { setTxLido(termos.dados); setTx(structuredClone(termos.dados)); }
  if (!c) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (caminho: string[], valor: unknown) => {
    const n = structuredClone(c); let o = n;
    caminho.slice(0, -1).forEach((k) => { o = o[k]; });
    o[caminho[caminho.length - 1]] = valor;
    setC(n);
  };
  const gravar = (parte: Record<string, unknown>, ok: string) => salvar(async () => { const r = await pedirConfig("/gerais", "PUT", parte); setC({ ...c, ...r }); }, ok);
  const Salvar = ({ parte, texto }: { parte: Record<string, unknown>; texto: string }) => admin ? <div className="dm-salvar"><button className="botao primario" disabled={salvando} onClick={() => gravar(parte, "Alterações salvas.")}>{texto}</button></div> : <p className="sub">Só o administrador altera estas configurações.</p>;
  const sw = (cam: string[], rotulo: string, descricao: string, ref = c) => <Interruptor valor={!!cam.reduce((o: any, k) => o?.[k], ref)} onChange={(v) => set(cam, v)} rotulo={rotulo} descricao={descricao} desabilitado={!admin} />;
  const g = c;
  return (
    <>
      <Cab titulo="Configurações" sub="Ajuste as regras de negócio e comportamento do sistema." />
      <Abas abas={ABAS} valor={aba} onChange={setAba} />
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      {aba === "geral" && (
        <Secao titulo="Suporte e Contato">
          <div className="dm-grade3">
            <Campo rotulo="WhatsApp de Suporte"><input value={g.suporte.whatsapp} onChange={(e) => set(["suporte", "whatsapp"], e.target.value)} placeholder="Ex: 5511999999999" /></Campo>
            <Campo rotulo="Telefone da Central"><input value={g.suporte.telefone} onChange={(e) => set(["suporte", "telefone"], e.target.value)} /></Campo>
            <Campo rotulo="Link de Ajuda / FAQ Externo"><input value={g.suporte.linkAjuda} onChange={(e) => set(["suporte", "linkAjuda"], e.target.value)} placeholder="https://..." /></Campo>
          </div>
          <Salvar parte={{ suporte: g.suporte }} texto="Salvar Alterações" />
        </Secao>
      )}
      {aba === "motorista" && (
        <>
          <Secao titulo="Bônus de Primeiro Cadastro" sub="Atraia mais motoristas dando um incentivo financeiro para quem baixar e se cadastrar no app organicamente.">
            <Interruptor valor={g.motorista.bonusCadastroAtivo} onChange={(v) => set(["motorista", "bonusCadastroAtivo"], v)} rotulo="Bônus ativo" desabilitado={!admin} />
            <Campo rotulo="Valor que o motorista ganha (R$)"><Num v={g.motorista.bonusCadastroValor} on={(n) => set(["motorista", "bonusCadastroValor"], n)} placeholder="10,00" /></Campo>
            {sw(["motorista", "editarValorFinal"], "Editar Valor Final", "Permite ao motorista corrigir o preço manualmente no fim da corrida (ex: pedágio, desvios).")}
            {sw(["motorista", "confirmarTaxas"], "Confirmar Taxas Extras", "Exige que o motorista revise as taxas e comissões da corrida antes de poder iniciar o trajeto.")}
            {sw(["motorista", "editarRota"], "Motorista pode Editar Rota?", "Permite ao motorista alterar o destino ou adicionar paradas durante a corrida pelo aplicativo.")}
            {sw(["motorista", "cpfObrigatorio"], "CPF Obrigatório", "Torna o campo de CPF obrigatório durante o cadastro de novos motoristas no app.")}
            {sw(["motorista", "descontarCupomNoToque"], "Descontar Cupom na Tela de Aceite", "O valor que o motorista vê quando a corrida toca já vem com o desconto do passageiro subtraído.")}
            {sw(["motorista", "botaoPanico"], "Botão de Pânico Integrado", "Ativa um botão de emergência flutuante na tela do motorista durante a corrida.")}
          </Secao>
          <Secao titulo="Mapa de Navegação GPS" selo="App Nativo" sub="O motorista acompanha a rota e o GPS direto pela tela do app, sem precisar abrir apps de terceiros.">
            <Interruptor valor={g.motorista.mapaNavegacao} onChange={(v) => set(["motorista", "mapaNavegacao"], v)} rotulo="Mapa de navegação no app" desabilitado={!admin} />
            {g.motorista.mapaNavegacao && (
              <>
                <Campo rotulo="Distância p/ Recálculo (Metros)" dica="Quanto menor for essa distância, mais rápido o app traça uma nova rota se o motorista errar a rua. Valores muito baixos fazem muitas consultas ao serviço de mapas e podem encarecer a fatura."><input type="number" min={20} value={g.motorista.distanciaRecalculo} onChange={(e) => set(["motorista", "distanciaRecalculo"], Number(e.target.value))} /></Campo>
                <SimuladorCusto distancia={g.motorista.distanciaRecalculo} />
              </>
            )}
          </Secao>
          <Secao titulo="Mensagens Rápidas (Chat)" sub="Textos prontos para o motorista enviar com 1 toque.">
            <ul className="dm-lista-edit">{g.motorista.mensagensRapidas.map((m: string, i: number) => (
              <li key={i}><input value={m} aria-label={`Mensagem ${i + 1}`} onChange={(e) => set(["motorista", "mensagensRapidas"], g.motorista.mensagensRapidas.map((x: string, j: number) => (j === i ? e.target.value : x)))} />{admin && <button className="icone" aria-label="Remover mensagem" onClick={() => set(["motorista", "mensagensRapidas"], g.motorista.mensagensRapidas.filter((_: string, j: number) => j !== i))}><Trash2 size={14} /></button>}</li>
            ))}</ul>
            {admin && <div className="dm-linha"><input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Escreva uma nova mensagem..." aria-label="Nova mensagem rápida" maxLength={120} /><button className="botao" onClick={() => { if (chat.trim()) { set(["motorista", "mensagensRapidas"], [...g.motorista.mensagensRapidas, chat.trim()]); setChat(""); } }}>Adicionar</button></div>}
          </Secao>
          <Secao titulo="Gestão de Documentos" sub="O que o motorista precisa enviar para ser aprovado." acao={admin && <button className="botao" onClick={() => setNovoDoc(true)}><Plus size={14} /> Novo Doc</button>}>
            <ul className="dm-docs">{g.motorista.documentos.map((d: any, i: number) => (
              <li key={d.id}><span><strong>{d.nome}</strong><small>{d.alvo === "veiculo" ? "Documento do Veículo" : "Documento Pessoal"}</small></span>
                <label className="dm-check"><input type="checkbox" checked={d.validade} disabled={!admin} onChange={(e) => set(["motorista", "documentos", String(i), "validade"], e.target.checked)} /> Validade</label>
                <label className="dm-check"><input type="checkbox" checked={d.exigir} disabled={!admin} onChange={(e) => set(["motorista", "documentos", String(i), "exigir"], e.target.checked)} /> Exigir</label>
                {admin && <button className="icone" aria-label={`Remover ${d.nome}`} onClick={() => set(["motorista", "documentos"], g.motorista.documentos.filter((_: unknown, j: number) => j !== i))}><Trash2 size={14} /></button>}</li>
            ))}</ul>
          </Secao>
          <Salvar parte={{ motorista: g.motorista }} texto="Salvar Motorista" />
          <NovoDocumento aberto={novoDoc} onFechar={() => setNovoDoc(false)} onAdd={(d) => { set(["motorista", "documentos"], [...g.motorista.documentos, d]); setNovoDoc(false); }} />
        </>
      )}
      {aba === "preferencias" && (
        <Secao titulo="Filtros e Preferências" acao={admin && <button className="botao" onClick={() => setNovoFiltro(true)}><Plus size={14} /> Novo Filtro</button>}>
          <ul className="dm-docs">{g.preferencias.map((p: any, i: number) => (
            <li key={p.id}><span><strong>{p.nome}</strong><small>{p.tipo === "pagamento" ? "pagamento" : "exigencia"}</small></span>
              <Interruptor valor={p.ativo} onChange={(v) => set(["preferencias", String(i), "ativo"], v)} rotulo={`${p.nome} ativo`} desabilitado={!admin} />
              {admin && <button className="icone" aria-label={`Remover ${p.nome}`} onClick={() => set(["preferencias"], g.preferencias.filter((_: unknown, j: number) => j !== i))}><Trash2 size={14} /></button>}</li>
          ))}</ul>
          <Salvar parte={{ preferencias: g.preferencias }} texto="Salvar Preferências" />
          <NovoFiltro aberto={novoFiltro} onFechar={() => setNovoFiltro(false)} onAdd={(p) => { set(["preferencias"], [...g.preferencias, p]); setNovoFiltro(false); }} />
        </Secao>
      )}
      {aba === "passageiro" && (
        <Secao titulo="Passageiro">
          {sw(["passageiro", "cpfObrigatorio"], "CPF Obrigatório no Cadastro", "Exige que o passageiro preencha o CPF ao criar uma nova conta no aplicativo.")}
          {sw(["passageiro", "avisoDinamica"], "Aviso de Alta Demanda (Dinâmica)", "Exibe um alerta pop-up na tela do passageiro informando que os preços estão mais altos devido à tarifa dinâmica na cidade.")}
          {sw(["passageiro", "editarRota"], "Passageiro Pode Editar Rota?", "Permite que o passageiro altere o destino final no meio da corrida em andamento.")}
          <Interruptor valor={g.passageiro.bonusAtivo} onChange={(v) => set(["passageiro", "bonusAtivo"], v)} rotulo="Bônus de Boas-Vindas (Passageiro)" descricao="Ofereça um saldo na carteira para passageiros que baixarem o app organicamente (sem indicação)." desabilitado={!admin} />
          {g.passageiro.bonusAtivo && <Campo rotulo="Crédito Inicial (R$)"><Num v={g.passageiro.bonusValor} on={(n) => set(["passageiro", "bonusValor"], n)} placeholder="5,00" /></Campo>}
          <Interruptor valor={g.passageiro.paradasAtivo} onChange={(v) => set(["passageiro", "paradasAtivo"], v)} rotulo="Permitir Múltiplas Paradas" descricao="Passageiros poderão adicionar paradas extras na rota durante a viagem." desabilitado={!admin} />
          {g.passageiro.paradasAtivo && <Campo rotulo="Limite Máximo:"><input type="number" min={0} max={3} value={g.passageiro.limiteParadas} onChange={(e) => set(["passageiro", "limiteParadas"], Number(e.target.value))} /></Campo>}
          {sw(["passageiro", "destinoLivre"], "Destino Livre (A combinar)", "Permite solicitar a corrida sem informar o destino final no mapa (ideal para modo taxímetro/corrida livre).")}
          <Salvar parte={{ passageiro: g.passageiro }} texto="Salvar Passageiro" />
        </Secao>
      )}
      {aba === "indicacoes" && (
        <>
          <Secao titulo="Programa de Indicações" sub="Crie sua rede de crescimento orgânico recompensando usuários que convidam amigos.">
            <Interruptor valor={g.indicacoes.ativo} onChange={(v) => set(["indicacoes", "ativo"], v)} rotulo="Ativar Módulo de Indicações" descricao="Chave mestra. Se desligado, todo o sistema de indicação e comissionamento será desativado." desabilitado={!admin} />
          </Secao>
          {([["motMot", "Motorista indica Motorista", "Expanda sua frota pagando bônus por novos parceiros ativos.", "Bônus do Novato (Boas-Vindas)", "Prêmio de quem Indicou", "Meta de Corridas"],
            ["motPax", "Motorista indica Passageiro", "Cartaz QR Code no banco de trás do carro gerando renda.", "Bônus do Passageiro", "Comissão do Motorista", "Duração (Qtd de Corridas)"],
            ["paxPax", "Passageiro indica Passageiro", "Transforme usuários em divulgadores orgânicos do aplicativo.", "Bônus do Convidado", "Bônus de quem Convidou", "Duração (Qtd de Corridas)"]] as const).map(([k, t, s, a, b, cc]) => (
            <Secao key={k} titulo={t} sub={s}>
              <Interruptor valor={g.indicacoes[k].ativo} onChange={(v) => set(["indicacoes", k, "ativo"], v)} rotulo={`${t} ativo`} desabilitado={!admin} />
              <div className="dm-grade3">
                <Campo rotulo={a}><Num v={g.indicacoes[k].valorIndicado} on={(n) => set(["indicacoes", k, "valorIndicado"], n)} /></Campo>
                <Campo rotulo={b}><Num v={g.indicacoes[k].valorIndicador} on={(n) => set(["indicacoes", k, "valorIndicador"], n)} /></Campo>
                <Campo rotulo={cc}><input type="number" min={0} value={g.indicacoes[k].corridas} onChange={(e) => set(["indicacoes", k, "corridas"], Number(e.target.value))} /></Campo>
              </div>
            </Secao>
          ))}
          <Secao titulo="Firewall Anti-Spam de Convites" sub="Impede a criação de contas falsas apenas para farmar crédito. Define o máximo de pessoas que uma única conta pode convidar.">
            <Campo rotulo="Limite Global por Usuário"><input type="number" min={0} value={g.indicacoes.limiteGlobal} onChange={(e) => set(["indicacoes", "limiteGlobal"], Number(e.target.value))} /></Campo>
            <Salvar parte={{ indicacoes: g.indicacoes }} texto="Salvar Indicações" />
          </Secao>
        </>
      )}
      {aba === "cancelamento" && (
        <>
          <Secao titulo="Regras de Cancelamento" sub="Configure o tempo de carência, taxas e motivos disponíveis para desistências.">
            <Campo rotulo="Método de Cobrança Padrão" dica="O que define se uma taxa será cobrada do passageiro quando ele cancelar a corrida com o motorista já a caminho?">
              <select value={g.cancelamento.metodo} disabled={!admin} onChange={(e) => set(["cancelamento", "metodo"], e.target.value)}><option value="tempo">Tempo (Minutos)</option><option value="distancia">Distância Faltante (KM)</option></select>
            </Campo>
          </Secao>
          <Secao titulo="Passageiro">
            <Interruptor valor={g.cancelamento.passageiro.ativo} onChange={(v) => set(["cancelamento", "passageiro", "ativo"], v)} rotulo="Cobrar taxa de cancelamento" desabilitado={!admin} />
            {g.cancelamento.metodo === "tempo" ? <Campo rotulo="Minutos de Carência" dica="Após este tempo, gera taxa."><input type="number" min={0} value={g.cancelamento.passageiro.minutos} onChange={(e) => set(["cancelamento", "passageiro", "minutos"], Number(e.target.value))} /></Campo>
              : <Campo rotulo="Distância Limite (KM)" dica="Se o motorista estiver mais perto, gera taxa."><input type="number" min={0} value={g.cancelamento.passageiro.distanciaKm} onChange={(e) => set(["cancelamento", "passageiro", "distanciaKm"], Number(e.target.value))} /></Campo>}
            <Motivos titulo="Motivos Exibidos no App" lista={g.cancelamento.passageiro.motivos} on={(l) => set(["cancelamento", "passageiro", "motivos"], l)} />
          </Secao>
          <Secao titulo="Motorista">
            <Interruptor valor={g.cancelamento.motorista.ativo} onChange={(v) => set(["cancelamento", "motorista", "ativo"], v)} rotulo="Regras de cancelamento do motorista" desabilitado={!admin} />
            <Campo rotulo="Minutos Esperando no Local" dica="Tempo até o botão de cancelar liberar isento de punição."><input type="number" min={0} value={g.cancelamento.motorista.minutos} onChange={(e) => set(["cancelamento", "motorista", "minutos"], Number(e.target.value))} /></Campo>
            <Interruptor valor={g.cancelamento.motorista.reenvio} onChange={(v) => set(["cancelamento", "motorista", "reenvio"], v)} rotulo="Reenvio Automático" descricao="Se o motorista cancelar, joga a corrida pra outro?" desabilitado={!admin} />
            {g.cancelamento.motorista.reenvio && <Campo rotulo="Tentar por (min)"><input type="number" min={0} value={g.cancelamento.motorista.reenvioMinutos} onChange={(e) => set(["cancelamento", "motorista", "reenvioMinutos"], Number(e.target.value))} /></Campo>}
            <Motivos titulo="Motivos Exibidos no App" lista={g.cancelamento.motorista.motivos} on={(l) => set(["cancelamento", "motorista", "motivos"], l)} />
          </Secao>
          <Secao titulo="Bloqueio por Rejeição (Fila Fria)">
            <Campo rotulo="Ativar Punição Automatizada"><select value={g.cancelamento.rejeicao.ativo ? "1" : "0"} disabled={!admin} onChange={(e) => set(["cancelamento", "rejeicao", "ativo"], e.target.value === "1")}><option value="1">Sistema Ligado</option><option value="0">Sistema Desligado</option></select></Campo>
            <div className="dm-duplo">
              <Campo rotulo="Limite de Corridas Ignoradas" dica="Se rejeitar X seguidas, toma o gancho."><input type="number" min={1} value={g.cancelamento.rejeicao.limite} onChange={(e) => set(["cancelamento", "rejeicao", "limite"], Number(e.target.value))} /></Campo>
              <Campo rotulo="Tempo de Bloqueio na Geladeira" dica="MIN"><input type="number" min={1} value={g.cancelamento.rejeicao.minutos} onChange={(e) => set(["cancelamento", "rejeicao", "minutos"], Number(e.target.value))} /></Campo>
            </div>
            <Salvar parte={{ cancelamento: g.cancelamento }} texto="Salvar Cancelamentos" />
          </Secao>
        </>
      )}
      {aba === "macaneta" && (
        <Secao titulo="Maçaneta (Totem / Rua)" sub="Regras para corridas originadas manualmente por promotores ou direto com o motorista.">
          <Interruptor valor={g.macaneta.ativo} onChange={(v) => set(["macaneta", "ativo"], v)} rotulo="Ativar Módulo de Maçaneta" descricao='Se desativado, o botão "Nova Corrida" some do app do Motorista.' desabilitado={!admin} />
          <h4>Campos Obrigatórios na Criação da Corrida</h4>
          <div className="dm-radios">{([["pedeNome", "nome"], ["pedeTelefone", "telefone"], ["pedeCpf", "cpf"], ["pedeEmail", "email"]] as const).map(([k, n]) => <label key={k} className="dm-check"><input type="checkbox" checked={g.macaneta[k]} disabled={!admin} onChange={(e) => set(["macaneta", k], e.target.checked)} /> {n}</label>)}</div>
          <h4>Categorias Habilitadas na Maçaneta</h4>
          <div className="dm-radios">{g.categoriasNomes?.map((cat: { id: string; nome: string }) => <label key={cat.id} className="dm-check"><input type="checkbox" disabled={!admin} checked={g.macaneta.categorias.includes(cat.nome)} onChange={(e) => set(["macaneta", "categorias"], e.target.checked ? [...g.macaneta.categorias, cat.nome] : g.macaneta.categorias.filter((x: string) => x !== cat.nome))} /> {cat.nome}</label>)}</div>
          <p className="sub">Selecione quais categorias estarão disponíveis para o motorista escolher ao iniciar uma nova corrida.</p>
          <Salvar parte={{ macaneta: g.macaneta }} texto="Salvar Maçaneta" />
        </Secao>
      )}
      {aba === "banners" && (
        <Secao titulo="Gerenciador de Banners" sub="Venda o topo da tela inicial do aplicativo para comércios locais, festas e restaurantes. Crie sua própria rede de publicidade." acao={admin && <button className="botao primario" onClick={() => setUpload(true)}><Upload size={14} /> Fazer Upload</button>}>
          {!g.banners.length ? <div className="dm-vazio-pequeno"><h4>Nenhum banner cadastrado</h4><p>Clique em "Fazer Upload" para adicionar sua primeira propaganda.</p></div> : (
            <ul className="dm-banners">{g.banners.map((b: any) => <li key={b.id}><img src={`/api/config/gerais/banners/${b.id}`} alt="Banner" /><span><strong>{b.tipo === "login" ? "Tela de Aviso (Trava o Login)" : "Banner Rotativo (Tela Inicial)"}</strong><small>{b.link || "Sem link"}</small></span>{admin && <button className="icone" aria-label="Remover banner" onClick={async () => { if (confirm("Remover este banner?")) { await pedirConfig(`/gerais/banners/${b.id}`, "DELETE"); d.recarregar(); } }}><Trash2 size={14} /></button>}</li>)}</ul>
          )}
          <UploadBanner aberto={upload} onFechar={() => setUpload(false)} onFeito={() => { setUpload(false); d.recarregar(); }} />
        </Secao>
      )}
      {aba === "juridico" && tx && (
        <Secao titulo="Políticas e Termos Legais" sub="Defina os contratos que os usuários precisam aceitar antes de usar o aplicativo.">
          <Campo rotulo="Termos de Uso do Passageiro"><textarea rows={8} value={tx.passageiro} disabled={!admin} onChange={(e) => setTx({ ...tx, passageiro: e.target.value })} /></Campo>
          <Campo rotulo="Termos de Uso do Motorista"><textarea rows={8} value={tx.motorista} disabled={!admin} onChange={(e) => setTx({ ...tx, motorista: e.target.value })} /></Campo>
          <Campo rotulo="Política de Privacidade (LGPD)"><textarea rows={8} value={tx.privacidade} disabled={!admin} onChange={(e) => setTx({ ...tx, privacidade: e.target.value })} /></Campo>
          {admin && <div className="dm-salvar"><button className="botao primario" disabled={salvando} onClick={() => salvar(async () => { await pedirConfig("/termos", "PUT", tx); termos.recarregar(); }, "Textos jurídicos salvos.")}>Salvar Textos Jurídicos</button></div>}
        </Secao>
      )}
    </>
  );
}

function Secao({ titulo, sub, selo, acao, children }: { titulo: string; sub?: string; selo?: string; acao?: ReactNode; children: ReactNode }) {
  return <section className="dm-cartao dm-secao"><div className="dm-linha dm-entre"><div><h3>{titulo} {selo && <span className="selo ok">{selo}</span>}</h3>{sub && <p className="sub">{sub}</p>}</div>{acao}</div>{children}</section>;
}

function Motivos({ titulo, lista, on }: { titulo: string; lista: string[]; on: (l: string[]) => void }) {
  return <div><h4>{titulo}</h4><div className="dm-duplo">{lista.map((m, i) => <input key={i} value={m} aria-label={`Motivo ${i + 1}`} maxLength={60} onChange={(e) => on(lista.map((x, j) => (j === i ? e.target.value : x)))} />)}</div></div>;
}

/** Quanto o recálculo de rota custa por mês (estimativa: quanto menor a distância, mais recálculos por viagem). */
function SimuladorCusto({ distancia }: { distancia: number }) {
  const [corridas, setCorridas] = useState(1000);
  const [preco, setPreco] = useState(0.5);
  const recalc = Math.max(0, Math.round((3000 / Math.max(distancia, 20)) * 10) / 10);
  const mensal = corridas * 30 * recalc * (preco / 1000);
  return (
    <div className="dm-simulador">
      <h4>Simulador de Custo (serviço de mapas)</h4>
      <div className="dm-duplo"><Campo rotulo="Corridas Diárias:"><input type="number" min={0} value={corridas} onChange={(e) => setCorridas(Number(e.target.value))} /></Campo><Campo rotulo="Preço por 1.000 consultas (R$)"><Num v={preco} on={setPreco} /></Campo></div>
      <div className="dm-duplo"><div><small>Estimativa Mensal</small><p><strong>{dinheiro(mensal)}</strong></p></div><div><small>Recálculos/Viagem</small><p><strong>{recalc.toFixed(1)}</strong></p></div></div>
    </div>
  );
}

function NovoDocumento({ aberto, onFechar, onAdd }: { aberto: boolean; onFechar: () => void; onAdd: (d: unknown) => void }) {
  const [nome, setNome] = useState(""), [alvo, setAlvo] = useState("motorista"), [validade, setValidade] = useState(false);
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo Documento">
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); onAdd({ nome, alvo, validade, exigir: true }); setNome(""); }}>
        <Campo rotulo="Nome do Documento"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Antecedentes Criminais" required maxLength={80} /></Campo>
        <fieldset><legend>Para quem é o documento?</legend><div className="dm-radios"><label><input type="radio" checked={alvo === "motorista"} onChange={() => setAlvo("motorista")} /> Motorista</label><label><input type="radio" checked={alvo === "veiculo"} onChange={() => setAlvo("veiculo")} /> Veículo</label></div></fieldset>
        <label className="dm-check"><input type="checkbox" checked={validade} onChange={(e) => setValidade(e.target.checked)} /> Exige data de validade?</label>
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario">Adicionar</button></div>
      </form>
    </Modal>
  );
}

function NovoFiltro({ aberto, onFechar, onAdd }: { aberto: boolean; onFechar: () => void; onAdd: (p: unknown) => void }) {
  const [nome, setNome] = useState(""), [tipo, setTipo] = useState("exigencia");
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo Filtro">
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); onAdd({ nome, tipo, ativo: true }); setNome(""); }}>
        <Campo rotulo="Nome do Filtro"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Ar Condicionado" required maxLength={60} /></Campo>
        <Campo rotulo="Tipo de Preferência"><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="exigencia">Filtro de Carro/Serviço</option><option value="pagamento">Forma de Pagamento</option></select></Campo>
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario">Adicionar</button></div>
      </form>
    </Modal>
  );
}

function UploadBanner({ aberto, onFechar, onFeito }: { aberto: boolean; onFechar: () => void; onFeito: () => void }) {
  const [arq, setArq] = useState<File | null>(null), [link, setLink] = useState(""), [tipo, setTipo] = useState("app");
  const { msg, salvando, salvar } = useSalvar();
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo Banner" sub="Insira as informações do patrocinador.">
      <form className="dm-form" onSubmit={async (e) => {
        e.preventDefault();
        if (!arq) return;
        const r = await salvar(async () => {
          const res = await fetch(`/api/config/gerais/banners?link=${encodeURIComponent(link)}&tipo=${tipo}`, { method: "POST", headers: { "Content-Type": arq.type || "application/octet-stream" }, body: arq, credentials: "same-origin" });
          if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não foi possível enviar.");
        }, "Banner publicado.");
        if (r !== undefined) { setArq(null); setLink(""); onFeito(); }
      }}>
        <Campo rotulo="Arquivo de Imagem (JPG, PNG)" dica="Resolução Ideal: 1100x450px"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setArq(e.target.files?.[0] ?? null)} required /></Campo>
        <Campo rotulo="Link ao Clicar (Ação)"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://instagram.com/..." /></Campo>
        <Campo rotulo="Comportamento do Banner"><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="app">Banner Rotativo (Tela Inicial)</option><option value="login">Tela de Aviso (Trava o Login)</option></select></Campo>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando || !arq}>Publicar</button></div>
      </form>
    </Modal>
  );
}
