// Config › Gerais › Despacho (a tela "Alterando Bandeira" da Machine): parâmetros de pendência, reenvio, alertas, cerca, corrida em espera,
// estimativa, tela de solicitação, área de operação controlada e o tipo de despacho com os disparos por proximidade.

import { useState, type ReactNode } from "react";
import { Aviso, Carregando, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";

const num = (v: string) => (v === "" ? 0 : Number(v.replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number) => String(n).replace(".", ",");

function SimNao({ rotulo, ajuda, valor, onChange, desabilitado }: { rotulo: string; ajuda: ReactNode; valor: boolean; onChange: (v: boolean) => void; desabilitado: boolean }) {
  const nome = rotulo.slice(0, 24);
  return (
    <div className="dm-opcao"><h4>{rotulo}</h4>
      <div className="dm-radios"><label className="dm-check"><input type="radio" name={nome} disabled={desabilitado} checked={valor} onChange={() => onChange(true)} /> Sim</label><label className="dm-check"><input type="radio" name={nome} disabled={desabilitado} checked={!valor} onChange={() => onChange(false)} /> Não</label></div>
      <small className="bloco">{ajuda}</small></div>
  );
}

export function BandeiraDespacho() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/bandeira"), []);
  const din = useCarregar(() => pedirConfig("/dinamicas"), []);
  const [b, setB] = useState<any>(null), [lido, setLido] = useState<unknown>(null);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setB(structuredClone(d.dados)); }
  const { msg, salvando, salvar } = useSalvar();
  if (!b) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const set = (k: string, v: unknown) => setB({ ...b, [k]: v });
  const dis = !admin;
  const gravar = () => salvar(async () => { const r = await pedirConfig("/bandeira", "PUT", b); setLido(r); setB(structuredClone(r)); }, "Configurações gravadas.");
  const km = (k: string, rotulo: string, ajuda: string) => <div className="dm-opcao"><label className="dm-campo"><span>{rotulo}</span><input inputMode="decimal" disabled={dis} value={txt(b[k])} onChange={(e) => set(k, num(e.target.value))} /></label><small className="bloco">{ajuda}</small></div>;
  const setDisparo = (i: number, k: string, v: unknown) => set("disparos", b.disparos.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
  const prioridades: any[] = din.dados?.prioridades ?? [];
  return (
    <>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <div className="aviso" role="note">Alterações destes dados devem ser feitas com cuidado, pois afetarão o funcionamento da plataforma para sua central.</div>
      <section className="dm-cartao">
        <p className="sub">Estes parâmetros definem o funcionamento do despacho de corridas.</p>
        <div className="dm-opcao"><label className="dm-campo"><span>Tempo de expiração de pendência (minutos)</span><input type="number" min={1} disabled={dis} value={b.expiracaoPendenciaMin} onChange={(e) => set("expiracaoPendenciaMin", Number(e.target.value))} /></label><small className="bloco">Tempo em minutos que uma solicitação pendente (pendência) ficará disponível para os motoristas antes de ser considerada NÃO ATENDIDA.</small></div>
        {km("distanciaListarKm", "Distância para listar solicitações pendentes ou programadas (quilômetros)", "Distância máxima em Km entre o passageiro e o motorista para que este visualize uma pendência ou um agendamento.")}
        {km("distanciaPendenciaKm", "Distância limite para aceitar pendência (Km)", "Distância máxima em Km entre o passageiro e o motorista para que este possa atender uma pendência.")}
        <SimNao rotulo="Habilitar o reenvio automático de corridas pendentes" valor={b.reenvioAutomatico} onChange={(v) => set("reenvioAutomatico", v)} desabilitado={dis} ajuda="A corrida será reenviada se permanecer no status pendente por mais de 1 minuto. Serão feitas até 3 tentativas de reenvio. Se não houver aceitação após as 3 tentativas, a corrida permanecerá no status de pendente durante o tempo configurado, até que passe para o status de não atendida." />
        <SimNao rotulo="Redistribuir corrida agendada quando o motorista favorito/específico recusar ou estiver indisponível" valor={b.redistribuirAgendada} onChange={(v) => set("redistribuirAgendada", v)} desabilitado={dis} ajuda="Indica se uma corrida agendada com motorista favorito/específico deve ser redistribuída para outros motoristas quando ele recusar a corrida ou estiver indisponível no momento do despacho. Corridas reservadas continuam sendo redistribuídas normalmente." />
        <SimNao rotulo="Exibir alertas de corridas para operadores" valor={b.alertasOperadores} onChange={(v) => set("alertasOperadores", v)} desabilitado={dis} ajuda="Indica se a plataforma deve exibir alertas na parte superior das telas a cada nova existência de uma corrida atrasada, pendente, cancelada ou não atendida." />
        <SimNao rotulo="Enviar o número do endereço de partida" valor={b.enviarNumeroPartida} onChange={(v) => set("enviarNumeroPartida", v)} desabilitado={dis} ajuda="Enviar o número do endereço nas corridas oferecidas aos motoristas." />
        <div className="dm-opcao"><label className="dm-campo"><span>Tempo de autorização automática para corrida corporativa</span>
          <span className="dm-linha"><input type="number" min={1} disabled={dis} value={b.autorizacaoCorporativa.valor} onChange={(e) => set("autorizacaoCorporativa", { ...b.autorizacaoCorporativa, valor: Number(e.target.value) })} />
            <select disabled={dis} aria-label="Unidade" value={b.autorizacaoCorporativa.unidade} onChange={(e) => set("autorizacaoCorporativa", { ...b.autorizacaoCorporativa, unidade: e.target.value })}><option value="minutos">Minutos</option><option value="horas">Horas</option><option value="dias">Dias</option></select></span></label>
          <small className="bloco">Tempo para a autorização automática de uma corrida corporativa.</small></div>
        <SimNao rotulo="Obrigar despacho via app por proximidade" valor={b.obrigarProximidadeApp} onChange={(v) => set("obrigarProximidadeApp", v)} desabilitado={dis} ajuda="Indica se deve forçar os despachos por app serem por proximidade." />
        <SimNao rotulo="Habilitar cerca eletrônica" valor={b.cercaEletronica} onChange={(v) => set("cercaEletronica", v)} desabilitado={dis} ajuda="Esta opção permite restringir a atuação de um motorista a uma determinada área geográfica previamente desenhada na plataforma." />
        <SimNao rotulo="Permitir que os motoristas recebam uma corrida em espera" valor={b.corridaEmEspera} onChange={(v) => set("corridaEmEspera", v)} desabilitado={dis} ajuda="Permite que os motoristas da bandeira recebam corridas em espera." />
        {km("distanciaEsperaKm", "Distância máxima para o motorista receber a corrida em espera (Km)", "Distância entre o ponto atual do motorista e o destino informado de finalização da corrida, em quilômetros, para o motorista receber uma corrida em espera.")}
        <div className="dm-opcao"><label className="dm-campo"><span>Prioridade das dinâmicas:</span>
          <select disabled={dis || !din.dados} value={din.dados?.prioridade ?? "somar"} onChange={(e) => salvar(async () => { await pedirConfig("/dinamicas-prioridade", "PUT", { prioridade: e.target.value }); din.recarregar(); }, "Prioridade gravada.")}>
            {prioridades.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select></label><small className="bloco">Define qual critério será usado para definir a prioridade entre as dinâmicas. Maior valor: a prioridade será sempre dada à dinâmica com o maior valor. Dinâmica manual: sempre às dinâmicas configuradas manualmente. Dinâmica automática: sempre às dinâmicas geradas automaticamente. Sem área: sempre da dinâmica sem área, quando ativa.</small></div>
        <fieldset><legend>Tipo de estimativa de trajeto</legend>
          <div className="dm-radios"><label className="dm-check"><input type="radio" name="estimativa" disabled={dis} checked={b.tipoEstimativa === "menor_tempo"} onChange={() => set("tipoEstimativa", "menor_tempo")} /> Menor tempo</label><label className="dm-check"><input type="radio" name="estimativa" disabled={dis} checked={b.tipoEstimativa === "menor_trajeto"} onChange={() => set("tipoEstimativa", "menor_trajeto")} /> Menor trajeto</label></div>
          <small className="bloco">Quando uma corrida é criada o sistema identifica diferentes trajetos possíveis entre embarque e a corrida. Esta configuração define o critério principal para a escolha do trajeto que será utilizado na estimativa. Menor tempo: prioriza o trajeto mais rápido (menor duração), mesmo que a quilometragem seja maior. Menor trajeto: prioriza o trajeto de menor quilometragem, mesmo que o tempo de percurso seja maior.</small></fieldset>
      </section>
      <section className="dm-cartao">
        <h3>Configurações da tela de solicitação</h3>
        <SimNao rotulo="Observação obrigatória para central" valor={b.observacaoObrigatoria} onChange={(v) => set("observacaoObrigatoria", v)} desabilitado={dis} ajuda="Indica se o campo observação deve ser de preenchimento obrigatório para solicitar uma corrida pela central." />
        <SimNao rotulo="Obriga endereço desejado" valor={b.obrigaEnderecoDesejado} onChange={(v) => set("obrigaEnderecoDesejado", v)} desabilitado={dis} ajuda="Indica se o endereço desejado é obrigatório no site." />
        <SimNao rotulo="Calcular e exibir estimativa de valor da corrida" valor={b.calcularEstimativa} onChange={(v) => set("calcularEstimativa", v)} desabilitado={dis} ajuda="Habilita o cálculo do valor estimado na tela de solicitação do site e envia essa informação para o cartão de oferta do aplicativo do motorista. Se desativado, o valor estimado não será gerado nem exibido para o motorista." />
      </section>
      <section className="dm-cartao">
        <h3>Limites para abertura de corridas</h3>
        <label className="dm-campo"><span>Associar área de operação controlada</span>
          <select disabled={dis} value={b.areaControlada} onChange={(e) => set("areaControlada", e.target.value)}><option value="">Selecione</option>{b.areas.map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
        <small className="bloco">As áreas de operação controlada permitem definir uma região específica da cidade onde os passageiros podem solicitar corridas. Ao associar uma área nessa configuração, qualquer solicitação de corrida feita fora dessa área será bloqueada automaticamente. Ao contrário das áreas de risco/bloqueio, que proíbem corridas em locais específicos, as áreas de operação controlada delimitam onde as corridas podem acontecer, garantindo que a operação fique restrita a uma zona planejada. Essa funcionalidade é útil para administrar a expansão da operação, ajudando a controlar a oferta e demanda entre motoristas e passageiros.</small>
      </section>
      <section className="dm-cartao">
        <h3>Tipo de despacho</h3>
        <p className="sub">Despacho é a forma como as situações são distribuídas entre os motoristas.</p>
        <div className="dm-radios dm-radios-col">
          <label><input type="radio" name="tipoDespacho" disabled={dis} checked={b.tipoDespacho === "proximidade"} onChange={() => set("tipoDespacho", "proximidade")} /> <span><strong>Proximidade</strong><small className="bloco">No disparo por Proximidade, é possível ter eleição do motorista mais próximo ou não da chamada.</small></span></label>
          <label><input type="radio" name="tipoDespacho" disabled={dis} checked={b.tipoDespacho === "apoio_proximidade"} onChange={() => set("tipoDespacho", "apoio_proximidade")} /> <span><strong>Ponto de apoio (fila) + Proximidade</strong><small className="bloco">Você define um endereço onde o seu ponto de apoio será localizado. Quando um motorista entra no raio ou na área definida, ele é automaticamente colocado na fila e receberá as solicitações de corridas que forem feitas dentro dela. Se nenhum motorista aceitar a chamada de corrida naquela área, o método de despacho mudará para a opção de proximidade.</small></span></label>
          <label><input type="radio" name="tipoDespacho" disabled={dis} checked={b.tipoDespacho === "area_proximidade"} onChange={() => set("tipoDespacho", "area_proximidade")} /> <span><strong>Área (fila) + Proximidade</strong><small className="bloco">Você desenha polígonos no mapa. Quando um motorista entra nessa área desenhada, ele é automaticamente colocado na fila daquela região específica e receberá as solicitações de corrida que forem feitas dentro dela. Se nenhum motorista aceitar a chamada de corrida naquela área, o método de despacho mudará para a opção de proximidade.</small></span></label>
        </div>
        {b.tipoDespacho === "proximidade" && (
          <>
            <SimNao rotulo="Fazer eleição de motoristas" valor={b.eleicao} onChange={(v) => set("eleicao", v)} desabilitado={dis} ajuda="Proximidade com eleição: a corrida toca para os motoristas mais próximos e eles têm pouco menos de 10 segundos para aceitá-la. Dentre os motoristas que a aceitarem, o sistema vai identificar o que estiver a menos tempo ou na menor distância do passageiro ou do local de coleta. Proximidade sem eleição: toca em um determinado número de motoristas dentro de uma distância específica; o primeiro motorista que aceitar, não necessariamente o mais próximo, efetua a corrida." />
            <label className="dm-campo"><span>Quantidade de tentativas de despacho por Proximidade</span>
              <select disabled={dis} value={b.tentativas} onChange={(e) => set("tentativas", Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <small className="bloco">Define o número de tentativas (ciclos) de despacho antes que uma solicitação fique pendente. A quantidade escolhida determina o limite de motoristas acionados e o raio de alcance por disparo: máximo de 20 motoristas em um raio de até 50 km; máximo de 6 motoristas em um raio de até 20 km.</small>
            {b.disparos.slice(0, b.tentativas).map((x: any, i: number) => (
              <div key={i} className="dm-cartao dm-disparo">
                <h4>{i + 1}°</h4>
                <div className="dm-duplo">
                  <label className="dm-campo"><span>Motoristas simultâneos no {i + 1}º despacho</span><input type="number" min={1} max={20} disabled={dis} value={x.motoristas} onChange={(e) => setDisparo(i, "motoristas", Number(e.target.value))} /></label>
                  <label className="dm-campo"><span>Distância até o local de solicitação (Km)</span><input inputMode="decimal" disabled={dis} value={txt(x.km)} onChange={(e) => setDisparo(i, "km", num(e.target.value))} /></label>
                </div>
                <label className="dm-check"><input type="checkbox" disabled={dis} checked={x.secundarios} onChange={(e) => setDisparo(i, "secundarios", e.target.checked)} /> Inclui motoristas secundários</label>
                <label className="dm-check"><input type="checkbox" disabled={dis} checked={x.transbordo} onChange={(e) => setDisparo(i, "transbordo", e.target.checked)} /> Inclui motoristas de transbordo</label>
                {i === 0 && <small className="bloco">Motoristas simultâneos nos despachos: quantidade de motoristas que receberão a chamada simultaneamente na primeira tentativa. Distância até o local da solicitação em Km: distância máxima em Km para um motorista ser chamado na primeira tentativa.</small>}
              </div>
            ))}
          </>
        )}
      </section>
      {admin ? <div className="dm-salvar"><button className="botao" onClick={() => setB(structuredClone(d.dados))}>Voltar</button><button className="botao primario" disabled={salvando} onClick={gravar}>Gravar</button></div> : <p className="sub">Só o administrador altera estas configurações.</p>}
    </>
  );
}
