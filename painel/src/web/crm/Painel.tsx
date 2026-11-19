import { useState } from "react";
import {
  Activity, Bell, CalendarClock, Car, Clock, Crown, Database, FileText, Flame, Gift, History, LayoutDashboard, MapPin, MessageCircle,
  Route, Send, Shield, Smile, Sparkles, Tag, TrendingUp, Users, Zap, type LucideIcon,
} from "lucide-react";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";
import { crm } from "./api";
import { useAdmin, useRetorno } from "./comum";
import { ABAS } from "./abas";
import { ABAS_EXTRAS } from "./abas-extras";
import { ABAS_CRM2 } from "../crm2/registro";

type Aba = "dashboard" | "triggers" | "queue" | "journeys" | "regua" | "behavior_templates" | "campaigns" | "templates" | "logs" | "behavior_history" | "whatsapp" | "optout"
  | "passengers" | "drivers" | "behavior" | "contacts" | "segments" | "rfm" | "conversion" | "heatmap" | "rewards" | "cities" | "governance" | "audit";
interface Item { key: Aba; label: string; icon: LucideIcon }

// Mesmos grupos e abas, na mesma ordem, do CRM do sistema de referência. A aba "Machine" não existe aqui: a corrida é nativa.
const GRUPOS: Array<{ key: string; label: string; icon: LucideIcon; abas: Item[] }> = [
  { key: "overview", label: "Visão Geral", icon: LayoutDashboard, abas: [{ key: "dashboard", label: "Visão Geral", icon: LayoutDashboard }] },
  { key: "automation", label: "Automação", icon: Zap, abas: [
    { key: "triggers", label: "Gatilhos", icon: Zap }, { key: "queue", label: "Fila de Dispatches", icon: Clock }, { key: "journeys", label: "Jornadas", icon: Route },
    { key: "regua", label: "Régua de reativação", icon: Activity }, { key: "behavior_templates", label: "Templates Comportamentais", icon: CalendarClock },
  ] },
  { key: "communication", label: "Comunicação", icon: Send, abas: [
    { key: "campaigns", label: "Campanhas", icon: Send }, { key: "templates", label: "Templates", icon: FileText }, { key: "logs", label: "Notificações", icon: Bell },
    { key: "behavior_history", label: "Histórico de Disparos", icon: History }, { key: "whatsapp", label: "WhatsApp", icon: MessageCircle }, { key: "optout", label: "Descadastros", icon: Shield },
  ] },
  { key: "audience", label: "Público", icon: Users, abas: [
    { key: "passengers", label: "Passageiros", icon: Users }, { key: "drivers", label: "Motoristas", icon: Car }, { key: "behavior", label: "Comportamentos", icon: Activity },
    { key: "contacts", label: "Contatos", icon: Database }, { key: "segments", label: "Segmentos", icon: Tag },
  ] },
  { key: "insights", label: "Análises", icon: TrendingUp, abas: [
    { key: "rfm", label: "RFM", icon: Crown }, { key: "conversion", label: "Conversão", icon: TrendingUp }, { key: "heatmap", label: "Mapa de Calor", icon: Flame },
  ] },
  { key: "rewards", label: "Recompensas", icon: Gift, abas: [{ key: "rewards", label: "Recompensas", icon: Gift }] },
  { key: "settings", label: "Configurações", icon: Shield, abas: [
    { key: "cities", label: "Cidades", icon: MapPin }, { key: "governance", label: "Governança", icon: Shield }, { key: "audit", label: "Auditoria", icon: History },
  ] },
];

/** Abas do sistema de referência que ainda não foram portadas: a tela diz isso claramente (nada de dado inventado). */
const AINDA_NAO: Partial<Record<Aba, string>> = {
};

/** CRM & Engajamento: menu em grupos (o grupo escolhe as abas da segunda linha), igual ao do sistema de referência. */
export default function CrmPainel() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const grupo = GRUPOS.find((g) => g.abas.some((a) => a.key === aba)) ?? GRUPOS[0];
  const emojis = useCarregar(() => crm.emojis(), []);
  const ligado = emojis.dados?.ligado ?? false;
  const admin = useAdmin();
  const { tentar, caixa } = useRetorno();
  const Tela = [...ABAS, ...ABAS_EXTRAS].find((x) => x.id === aba)?.componente;
  const alternar = () => tentar(() => crm.ligarEmojis(!ligado)).then(emojis.recarregar);

  return (
    <>
      <Titulo titulo="CRM & Engajamento" sub="WhatsApp, gatilhos, jornadas, RFM e conversão"><Sparkles size={18} /></Titulo>
      {caixa}
      <div className="cartao linha-filtro">
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Smile size={18} />
          <span><strong>Emojis nas mensagens</strong><br /><small className="sub">{ligado ? "Emojis ativados — use o seletor ao editar templates" : "Emojis desativados para suas mensagens"}</small></span>
        </span>
        {emojis.dados && <input type="checkbox" role="switch" aria-label="Emojis nas mensagens" checked={ligado} disabled={!admin} onChange={alternar} />}
      </div>
      <div className="cartao" style={{ padding: 6 }}>
        <div className="abas">
          {GRUPOS.map((g) => (
            <button key={g.key} className={g.key === grupo.key ? "ativo" : ""} onClick={() => setAba(g.abas[0].key)}><g.icon size={14} /> {g.label}</button>
          ))}
        </div>
        {grupo.abas.length > 1 && (
          <div className="abas" style={{ marginTop: 6 }}>
            {grupo.abas.map((a) => <button key={a.key} className={a.key === aba ? "ativo" : ""} onClick={() => setAba(a.key)}><a.icon size={14} /> {a.label}</button>)}
          </div>
        )}
      </div>
      {Tela && <Tela emojis={ligado} />}
      {ABAS_CRM2.map((a) => aba === a.id && <a.componente key={a.id} />)}
      {!Tela && !ABAS_CRM2.some((a) => a.id === aba) && AINDA_NAO[aba] && (
        <Cartao titulo={AINDA_NAO[aba]}>
          <p className="vazio">Esta aba do CRM ainda está sendo portada para este painel. As demais já funcionam.</p>
        </Cartao>
      )}
    </>
  );
}
