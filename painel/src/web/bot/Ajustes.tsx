import { useEffect, useState } from "react";
import { Ban, BookOpenCheck, CheckCircle2, Image as Imagem, MessageSquare, Plus, Save, Settings, Trash2 } from "lucide-react";
import { DEFAULT_BOT_CONTROL } from "../../bot/controle.ts";
import { STATUS_MESSAGE_DEFS, STATUS_MESSAGE_VARS } from "../../bot/mensagens-status.ts";
import { BOT_TEXT_DEFS, BOT_TEXT_MAX, FAQ_MAX_ENTRIES } from "../../bot/textos-editaveis.ts";
import { useSessao } from "../App";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiBot, type ConfigAvancada } from "./api";

const TOGGLES: Array<{ key: keyof ConfigAvancada["fluxo"]; label: string; description: string }> = [
  { key: "show_welcome_menu", label: "Menu de boas-vindas", description: "Mostra o menu inicial (1 - Corrida / 2 - Suporte). Se desativado, vai direto para o endereço." },
  { key: "ask_destination", label: "Pedir destino", description: "Pergunta o endereço de destino após o embarque. Se desativado, despacha sem destino." },
  { key: "allow_skip_destination", label: "Permitir 'Não informar destino'", description: "Ligado: o passageiro pode escolher \"2 - Não informar\" e o motorista combina o destino no carro. Desligado: o destino é obrigatório — o bot não mostra essa opção e pede o endereço de novo se o passageiro tentar pular. Só vale se \"Pedir destino\" estiver ligado." },
  { key: "confirm_address", label: "Confirmar endereços", description: "Pede confirmação SIM/NÃO antes de despachar. Se desativado, avança direto." },
  { key: "ask_category", label: "Pedir categoria", description: "Pergunta qual categoria o passageiro deseja. Se desativado, usa a primeira disponível." },
  { key: "ask_payment", label: "Pedir forma de pagamento", description: "Pergunta Dinheiro/Pix/Cartão. Se desativado, a corrida vai como Dinheiro." },
];

/** Bot de WhatsApp › Ajustes: etapas do fluxo, mensagens, saudação e respostas prontas, comandos da central e mensagens de status. */
export function BotAjustes() {
  const { sessao } = useSessao();
  const admin = sessao.usuario.papel !== "operador";
  const cfg = useCarregar(() => apiBot.config(), []);
  const [c, setC] = useState<ConfigAvancada | null>(null);
  const [faqTxt, setFaqTxt] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!cfg.dados) return;
    const a = cfg.dados.config;
    setC({ fluxo: a.fluxo, textos: a.textos, saudacao: a.saudacao, faq: a.faq, controle: a.controle, textosStatus: a.textosStatus, voz: a.voz, agendar: a.agendar });
    setFaqTxt(a.faq.map((f) => f.keywords.join(", ")));
  }, [cfg.dados]);
  if (!c) return cfg.erro ? <div className="aviso erro">{cfg.erro}</div> : null;

  const salvar = async (parte: Partial<ConfigAvancada>, ok: string) => {
    setOcupado(true);
    try { await apiBot.salvarAvancada(parte); setMsg({ texto: ok }); cfg.recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    setOcupado(false);
  };
  const grupos = [...new Set(BOT_TEXT_DEFS.map((d) => d.group))];
  const nStatus = Object.keys(c.textosStatus).length;

  return (
    <div className="pilha">
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      {!admin && <div className="aviso">Só o administrador muda os ajustes do bot.</div>}

      <Cartao titulo="Etapas do fluxo">
        <p className="sub">Controle quais etapas o bot executa. Desativar etapas reduz o número de mensagens enviadas.</p>
        {TOGGLES.map((t) => (
          <label key={t.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
            <input type="checkbox" role="switch" disabled={!admin} checked={c.fluxo[t.key]} onChange={() => setC({ ...c, fluxo: { ...c.fluxo, [t.key]: !c.fluxo[t.key] } })} />
            <span><strong>{t.label}</strong><br /><small className="sub">{t.description}</small></span>
          </label>
        ))}
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ fluxo: c.fluxo }, "Configurações do fluxo salvas")}><Settings size={14} /> Salvar</button>
      </Cartao>

      <Cartao titulo="Mensagens do Bot">
        <p className="sub">Deixe em branco para usar o texto padrão. O menu com as opções e os dados da corrida (endereços, número, valor) o bot sempre acrescenta.</p>
        {grupos.map((g) => (
          <div key={g}>
            <h4 className="sub" style={{ margin: "12px 0 4px", textTransform: "uppercase" }}>{g}</h4>
            {BOT_TEXT_DEFS.filter((d) => d.group === g).map((d) => (
              <label key={d.key} style={{ display: "block", marginBottom: 8 }}>
                <small><strong>{d.label}</strong></small>
                <textarea rows={2} maxLength={BOT_TEXT_MAX} disabled={!admin} style={{ width: "100%" }} placeholder={d.def} value={c.textos[d.key] ?? ""}
                  onChange={(e) => setC({ ...c, textos: { ...c.textos, [d.key]: e.target.value } })} />
              </label>
            ))}
          </div>
        ))}
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ textos: c.textos }, "Mensagens salvas")}><MessageSquare size={14} /> Salvar mensagens</button>
      </Cartao>

      <Cartao titulo="Saudação e respostas prontas">
        <p className="sub">A imagem vai antes do menu de boas-vindas (no máximo uma vez a cada 12 h por passageiro). As respostas prontas respondem perguntas como "aceita pet?" sem sair do pedido.</p>
        <h4 className="sub"><Imagem size={14} /> Imagem de saudação</h4>
        <input style={{ width: "100%" }} disabled={!admin} placeholder="https://..." value={c.saudacao.imageUrl} onChange={(e) => setC({ ...c, saudacao: { ...c.saudacao, imageUrl: e.target.value } })} />
        <input style={{ width: "100%", marginTop: 6 }} disabled={!admin} placeholder="Legenda da imagem (opcional)" maxLength={500} value={c.saudacao.caption} onChange={(e) => setC({ ...c, saudacao: { ...c.saudacao, caption: e.target.value } })} />
        {c.saudacao.imageUrl && /^https:\/\//i.test(c.saudacao.imageUrl) && <img src={c.saudacao.imageUrl} alt="Prévia da imagem de saudação" style={{ maxWidth: 220, marginTop: 8, borderRadius: 10 }} />}
        <h4 className="sub" style={{ marginTop: 16 }}><BookOpenCheck size={14} /> Respostas prontas</h4>
        <p className="sub">Palavras-chave separadas por vírgula. O bot responde quando a mensagem é uma pergunta e tem uma dessas palavras. No meio do pedido, só responde se a pergunta tiver "?" (para não confundir com endereço).</p>
        {c.faq.map((f, i) => (
          <div key={i} className="cartao" style={{ marginBottom: 8 }}>
            <div className="acoes">
              <input style={{ flex: 1 }} disabled={!admin} placeholder="Pergunta (ex.: Aceita animais?)" value={f.question} onChange={(e) => setC({ ...c, faq: c.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
              <button className="icone" title="Remover" disabled={!admin} onClick={() => { setC({ ...c, faq: c.faq.filter((_, j) => j !== i) }); setFaqTxt(faqTxt.filter((_, j) => j !== i)); }}><Trash2 size={14} /></button>
            </div>
            <input style={{ width: "100%", marginTop: 6 }} disabled={!admin} placeholder="Palavras-chave: pet, cachorro, gato" value={faqTxt[i] ?? ""} onChange={(e) => setFaqTxt(faqTxt.map((x, j) => (j === i ? e.target.value : x)))} />
            <textarea rows={2} maxLength={1000} style={{ width: "100%", marginTop: 6 }} disabled={!admin} placeholder="Resposta do bot" value={f.answer} onChange={(e) => setC({ ...c, faq: c.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
          </div>
        ))}
        <div className="acoes">
          <button className="botao" disabled={!admin || c.faq.length >= FAQ_MAX_ENTRIES} onClick={() => { setC({ ...c, faq: [...c.faq, { question: "", keywords: [], answer: "" }] }); setFaqTxt([...faqTxt, ""]); }}><Plus size={14} /> Adicionar resposta</button>
          <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ saudacao: c.saudacao, faq: c.faq.map((f, i) => ({ ...f, keywords: (faqTxt[i] ?? "").split(/[,;\n]/).map((k) => k.trim()).filter(Boolean) })) }, "Saudação e respostas salvas")}><Save size={14} /> Salvar</button>
        </div>
      </Cartao>

      <Cartao titulo="Comandos da central no WhatsApp do bot">
        <p className="sub">No celular (ou WhatsApp Web) do número do bot, abra a conversa da pessoa e mande só a palavra. O comando vale para aquele contato. Também dá para digitar com o número: "#bloquear 16 99999-0000". Também dá para fazer em Conversas.</p>
        <div className="grade">
          {([["blockWord", "Bloquear", "A pessoa não consegue pedir corrida pelo bot; fica só a conversa normal (ex.: central e motorista)."],
            ["unblockWord", "Desbloquear", "Volta a poder pedir corrida."], ["pauseWord", "Pausar o bot", "O bot fica quieto com essa pessoa para você atender."],
            ["resumeWord", "Voltar o bot", "Encerra a pausa antes do tempo."], ["pauseMinutes", "Tempo da pausa (minutos)", "Depois disso o bot volta sozinho (1 a 1440)."]] as const).map(([k, rotulo, dica]) => (
            <label key={k}><small><strong>{rotulo}</strong></small>
              <input disabled={!admin} value={String(c.controle[k])} placeholder={String(DEFAULT_BOT_CONTROL[k])} onChange={(e) => setC({ ...c, controle: { ...c.controle, [k]: k === "pauseMinutes" ? Number(e.target.value) : e.target.value } })} />
              <small className="sub">{dica}</small>
            </label>
          ))}
        </div>
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ controle: c.controle }, "Comandos salvos")}><Ban size={14} /> Salvar comandos</button>
      </Cartao>

      <Cartao titulo="Agendamento pelo bot">
        <p className="sub">Ligado, o menu ganha "Agendar uma corrida" (1 pedir, 2 agendar, 3 suporte) e o bot entende frases como "amanhã 7h" ou "me pega na Rua X às 10:45". Mínimo de 15 minutos de antecedência e até 7 dias à frente; até 3 agendadas por passageiro. O passageiro recebe um aviso 15 e 5 minutos antes.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>
          <input type="checkbox" role="switch" disabled={!admin} checked={c.agendar} onChange={() => setC({ ...c, agendar: !c.agendar })} /> <strong>Permitir agendar corrida</strong>
        </label>
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ agendar: c.agendar }, "Agendamento salvo")}><CheckCircle2 size={14} /> Salvar agendamento</button>
      </Cartao>

      <Cartao titulo="Voz do bot">
        <p className="sub">Quando o passageiro manda um áudio, o bot responde com o texto e, em seguida, com a mesma resposta em áudio. Só funciona com chave de voz da plataforma ou da empresa (Gemini ou OpenAI); sem chave, a resposta fica só em texto. Menus e listas longas não viram áudio.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>
          <input type="checkbox" role="switch" disabled={!admin} checked={c.voz.ligada} onChange={() => setC({ ...c, voz: { ...c.voz, ligada: !c.voz.ligada } })} /> <strong>Responder em áudio</strong>
        </label>
        <label>Voz
          <select disabled={!admin} value={c.voz.nome} onChange={(e) => setC({ ...c, voz: { ...c.voz, nome: e.target.value } })}>
            {["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ voz: c.voz }, "Voz do bot salva")}><CheckCircle2 size={14} /> Salvar voz</button>
      </Cartao>

      <Cartao titulo="Mensagens de status da corrida">
        <p className="sub">{nStatus ? `${nStatus} personalizada(s)` : "textos padrão"}. O passageiro recebe na hora em que o motorista muda a corrida. Deixe em branco para usar o texto padrão. Pode usar {STATUS_MESSAGE_VARS.join(", ")}. Na mensagem de aceite e de troca, os dados do motorista e do carro vão logo abaixo.</p>
        {STATUS_MESSAGE_DEFS.map((d) => (
          <label key={d.key} style={{ display: "block", marginBottom: 8 }}>
            <small><strong>{d.label}</strong> <span className="sub">· {d.when}</span></small>
            <textarea rows={2} maxLength={600} disabled={!admin} style={{ width: "100%" }} placeholder={d.def} value={c.textosStatus[d.key] ?? ""} onChange={(e) => setC({ ...c, textosStatus: { ...c.textosStatus, [d.key]: e.target.value } })} />
          </label>
        ))}
        <button className="botao primario" disabled={!admin || ocupado} onClick={() => salvar({ textosStatus: c.textosStatus }, "Mensagens de status salvas")}><CheckCircle2 size={14} /> Salvar mensagens de status</button>
      </Cartao>
    </div>
  );
}
