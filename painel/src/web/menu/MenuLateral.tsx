// Menu lateral do painel: grupos coloridos, ícones, recolher/expandir e item ativo destacado (estilo do painel de referência).
// Os itens (entradas com abas internas) vêm de src/comum/menu-lateral.ts. O mesmo componente serve ao menu fixo do
// computador e à gaveta do celular.

import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Ban, BarChart3, Bell, Bot, Briefcase, Building2, CalendarClock, Car, CircleHelp, Coins, CreditCard, Crown, Eye, FileSearch,
  FileText, Filter, Heart, KeyRound, Landmark, LayoutDashboard, LifeBuoy, Map as MapaIcone, MapPin, MessagesSquare, Navigation,
  Package, PanelLeftClose, PanelLeftOpen, Percent, Plug, Radio, Receipt, Route, Scale, ScrollText, Settings, ShieldCheck, SlidersHorizontal,
  Smartphone, Sparkles, Star, Tag, Target, Ticket, Trophy, Truck, UserCheck, UserCog, UserPlus, Users, Wallet, Zap, Siren, Layers, TrendingUp,
  RotateCcw, ArrowDownToLine, Banknote, Clock, Lock, Gauge, Megaphone, Cone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { menuLateral, type CorMenu, type EntradaVisivel, type GrupoMenuVisivel } from "../../comum/menu-lateral.ts";
import type { Funcao } from "../../comum/funcoes.ts";

const ICONE_GRUPO: Record<string, LucideIcon> = {
  painel: LayoutDashboard, cadastro: Users, corridas: Car, financeiro: Wallet, comunicacao: MessagesSquare, configuracoes: SlidersHorizontal,
  cobranca: Landmark, avaliacoes: Star, ajuda: LifeBuoy, "bot-totem": Bot, crm: Sparkles, mais: Briefcase,
};

const ICONES: Record<string, LucideIcon> = {
  painel: LayoutDashboard, conversas: MessagesSquare,
  solicitar: Car, monitoramento: Radio, mapa: MapaIcone, historico: ScrollText, programadas: CalendarClock, ocorrencias: Siren, recuperacao: RotateCcw,
  "pagamentos-pendentes": Clock, "taxas-cancelamento": Ban, objetos: Package, "entrega-voucher": Ticket,
  motoristas: Users, destravar: Lock, veiculos: Truck, plantao: Clock, areas: MapPin, ruas: Route, punicoes: Scale, desafios: Trophy, documentos: FileText,
  bot: Bot, totem: Smartphone, "app-totem": ArrowDownToLine, notificacoes: Bell, "alertas-empresas": Megaphone, apps: Smartphone, enderecos: Navigation,
  passageiros: UserCheck, empresas: Building2, cupons: Tag, indicacoes: UserPlus, "faixas-vouchers": Ticket, crm: Sparkles,
  engajamento: Heart, "funil-clientes": Filter, "mapa-bairros": MapaIcone, avaliacoes: Star,
  analise: FileSearch,
  "visao-geral": Gauge, "extrato-central": Landmark, "extrato-online": CreditCard, "transacao-pix": Zap, "indice-relatorios": BarChart3,
  "faturamento-empresa": Building2, "faturamento-centro-custo": Layers, "faturamento-periodo": CalendarClock, "vouchers-motoristas": Ticket,
  "os-motorista": Users, "os-empresa": Building2, "os-bairro": MapPin, "os-pagamento": Coins, "os-operador": UserCog, "os-percentual-motorista": Percent, "km-rodados": Route,
  carteiras: Wallet, "carteiras-credito": Wallet, extrato: Receipt, saques: ArrowDownToLine, recargas: Banknote, relatorios: TrendingUp,
  "demonstrativo-mensal": FileText, "meus-planos": Crown, "controle-centrais": Landmark,
  marca: Settings, equipe: UserCog, "alterar-senha": KeyRound,
  "config-gerais": Settings, "regras-credito": CreditCard, categorias: Layers, "tarifas-dinamicas": TrendingUp, descontos: Percent, "regras-despacho": Target,
  transbordos: Cone, integracoes: Plug, "config-nps": Star, "termos-app": ShieldCheck,
  juridico: Scale, "central-ajuda": CircleHelp,
  "passe-livre": Ticket, "consulta-cartoes": CreditCard, "creditos-recargas-saques": Banknote, "creditos-extrato": Receipt,
  "cartao-painel": Gauge, "cartao-transacoes": CreditCard, "cartao-saldo-central": Landmark, "cartao-saldo-motorista": Wallet,
  "ultimo-boleto": FileText, "ajuda-termos": ScrollText, "central-suporte": LifeBuoy, ouvidoria: MessagesSquare,
};
const ICONES_ENTRADA: Record<string, LucideIcon> = { "alertas-seguranca": Siren, "os-motorista": BarChart3, "visao-geral": BarChart3, "faturamento-empresa": Receipt, equipe: UserCog, apps: Smartphone, carteiras: CreditCard, "ultimo-boleto": Landmark };
const iconeDe = (e: EntradaVisivel, grupo: string): LucideIcon => ICONES_ENTRADA[e.id] ?? ICONES[e.id] ?? ICONE_GRUPO[grupo] ?? Eye;

const ativa = (e: EntradaVisivel, caminho: string) => (e.rota === "/" ? caminho === "/" : caminho === e.rota || caminho.startsWith(`${e.rota}/`));

interface Props {
  /** Funções que o cargo e os recursos da empresa permitem. */
  funcoes: Funcao[];
  assistente: string;
  /** Só ícones (menu fixo recolhido). */
  recolhido?: boolean;
  /** Chamado ao escolher uma tela (a gaveta do celular fecha). */
  aoEscolher?: () => void;
}

/** Os grupos coloridos com seus itens. */
export function MenuItens({ funcoes, assistente, recolhido = false, aoEscolher }: Props) {
  const grupos = menuLateral(funcoes);
  const { pathname } = useLocation();
  // Ao trocar de tela, o item ativo aparece na rolagem do menu.
  const raiz = useRef<HTMLElement>(null);
  useEffect(() => { raiz.current?.querySelector(".ml-item.ativo")?.scrollIntoView({ block: "nearest" }); }, [pathname]);

  return (
    <nav ref={raiz} className="ml-nav" aria-label="Menu do painel">
      {grupos.map((g) => <Grupo key={g.id} g={g} recolhido={recolhido} pathname={pathname} assistente={assistente} aoEscolher={aoEscolher} />)}
    </nav>
  );
}

function Grupo({ g, recolhido, pathname, assistente, aoEscolher }: { g: GrupoMenuVisivel; recolhido: boolean; pathname: string; assistente: string; aoEscolher?: () => void }) {
  const IcGrupo = ICONE_GRUPO[g.id];
  return (
    <div className={`ml-grupo mlc-${g.cor}`} data-grupo={g.id}>
      <p className="ml-titulo" title={g.nome}><IcGrupo size={12} /><span className="ml-texto">{g.nome}</span></p>
      {g.entradas.map((e) => {
        const Ic = iconeDe(e, g.id);
        const nome = e.id === "analise" ? `Análise com ${assistente}` : e.nome;
        const ativo = ativa(e, pathname);
        return (
          <NavLink key={e.id} to={e.rota} end title={nome} onClick={aoEscolher} aria-label={recolhido ? nome : undefined} aria-current={ativo ? "page" : undefined}
            className={`ml-item ${ativo ? "ativo" : ""}`}>
            <Ic size={17} className="ml-icone" />
            <span className="ml-texto">{nome}</span>
          </NavLink>
        );
      })}
    </div>
  );
}

/** Botão Recolher menu / Expandir menu do rodapé do menu fixo. */
export function BotaoRecolher({ recolhido, alternar }: { recolhido: boolean; alternar: () => void }) {
  const texto = recolhido ? "Expandir menu" : "Recolher menu";
  return (
    <button className="ml-recolher" onClick={alternar} title={texto} aria-label={texto} aria-expanded={!recolhido}>
      {recolhido ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}<span className="ml-texto">{texto}</span>
    </button>
  );
}

export type { CorMenu };
