// Menu lateral do painel: grupos coloridos, ícones, recolher/expandir e item ativo destacado (estilo do painel de referência).
// Os itens vêm de src/comum/menu-lateral.ts (mesmos ids e rotas de funcoes.ts). O mesmo componente serve ao menu fixo do
// computador e à gaveta do celular.

import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Ban, BarChart3, Bell, Bot, Briefcase, Building2, CalendarClock, Car, ChevronRight, CircleHelp, Coins, CreditCard, Crown, Eye, FileSearch,
  FileText, Filter, Heart, KeyRound, Landmark, LayoutDashboard, LifeBuoy, Map as MapaIcone, MapPin, MessagesSquare, Navigation,
  Package, PanelLeftClose, PanelLeftOpen, Percent, Plug, Radio, Receipt, Route, Scale, ScrollText, Settings, ShieldCheck, SlidersHorizontal,
  Smartphone, Sparkles, Star, Tag, Target, Ticket, Trophy, Truck, UserCheck, UserCog, UserPlus, Users, Wallet, Zap, Siren, Layers, TrendingUp,
  RotateCcw, ArrowDownToLine, Banknote, Clock, Lock, Gauge, Megaphone, Cone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { menuLateral, ROTULO_MENU, type CorMenu, type GrupoMenuVisivel } from "../../comum/menu-lateral.ts";
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
  "passe-livre": Ticket, cidades: Building2, "consulta-cartoes": CreditCard, "creditos-recargas-saques": Banknote, "creditos-extrato": Receipt,
  "cartao-painel": Gauge, "cartao-transacoes": CreditCard, "cartao-saldo-central": Landmark, "cartao-saldo-motorista": Wallet,
  "ultimo-boleto": FileText, "ajuda-termos": ScrollText, "central-suporte": LifeBuoy, ouvidoria: MessagesSquare,
};
const ICONE_BLOCO: Record<string, LucideIcon> = {
  "Gestão de áreas": MapPin, Clientes: UserCheck, "Créditos": Wallet, "Cartão": CreditCard, Pix: Zap, "Contas a receber": Receipt, "Contas a pagar": Banknote,
  "Relatórios": BarChart3, "Estatísticas": TrendingUp, "Poder público": Route, "Operação": Radio, Financeiro: Wallet, "Conta e plataforma": Settings,
};
const rotulo = (f: Funcao, assistente: string) => (f.id === "analise" ? `Análise com ${assistente}` : ROTULO_MENU[f.id] ?? f.nome);
const iconeDe = (f: Funcao, grupo: string): LucideIcon => ICONES[f.id] ?? ICONE_GRUPO[grupo] ?? Eye;

const ativa = (f: Funcao, caminho: string) => (f.rota === "/" ? caminho === "/" : caminho === f.rota || caminho.startsWith(`${f.rota}/`));

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
  // Blocos recolhíveis: o que tem a tela aberta fica aberto; o resto o usuário abre e fecha (guardado só nesta visita).
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  // Ao trocar de tela, o item ativo aparece na rolagem do menu.
  const raiz = useRef<HTMLElement>(null);
  useEffect(() => { raiz.current?.querySelector(".ml-item.ativo")?.scrollIntoView({ block: "nearest" }); }, [pathname]);

  return (
    <nav ref={raiz} className="ml-nav" aria-label="Menu do painel">
      {grupos.map((g) => <Grupo key={g.id} g={g} recolhido={recolhido} abertos={abertos} setAbertos={setAbertos} pathname={pathname} assistente={assistente} aoEscolher={aoEscolher} />)}
    </nav>
  );
}

function Grupo({ g, recolhido, abertos, setAbertos, pathname, assistente, aoEscolher }: {
  g: GrupoMenuVisivel; recolhido: boolean; abertos: Record<string, boolean>; setAbertos: (f: (a: Record<string, boolean>) => Record<string, boolean>) => void;
  pathname: string; assistente: string; aoEscolher?: () => void;
}) {
  const IcGrupo = ICONE_GRUPO[g.id];
  const item = (f: Funcao) => {
    const Ic = iconeDe(f, g.id);
    const nome = rotulo(f, assistente);
    return (
      <NavLink key={f.id} to={f.rota} end title={nome} onClick={aoEscolher} aria-label={recolhido ? nome : undefined} aria-current={ativa(f, pathname) ? "page" : undefined}
        className={`ml-item ${ativa(f, pathname) ? "ativo" : ""}`}>
        <Ic size={17} className="ml-icone" />
        <span className="ml-texto">{nome}</span>
      </NavLink>
    );
  };
  return (
    <div className={`ml-grupo mlc-${g.cor}`} data-grupo={g.id}>
      <p className="ml-titulo" title={g.nome}><IcGrupo size={12} /><span className="ml-texto">{g.nome}</span></p>
      {g.blocos.map((b, i) => {
        if (!b.titulo || recolhido) return <div key={i}>{b.itens.map(item)}</div>;
        const chave = `${g.id}/${b.titulo}`;
        const temAtiva = b.itens.some((f) => ativa(f, pathname));
        const aberto = abertos[chave] ?? temAtiva;
        return (
          <div key={i} className="ml-bloco">
            <button className={`ml-item ml-bloco-botao ${temAtiva && !aberto ? "ativo-suave" : ""}`} aria-expanded={aberto}
              onClick={() => setAbertos((a) => ({ ...a, [chave]: !aberto }))}>
              {(() => { const IcB = ICONE_BLOCO[b.titulo] ?? Layers; return <IcB size={17} className="ml-icone" />; })()}
              <span className="ml-texto">{b.titulo}</span>
              <span className="ml-contagem">{b.itens.length}</span>
              <ChevronRight size={15} className={`ml-seta ${aberto ? "gira" : ""}`} />
            </button>
            {aberto && <div className="ml-sub">{b.itens.map(item)}</div>}
          </div>
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
