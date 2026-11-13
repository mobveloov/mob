// Início: topo na cor da marca com a foto e a saudação, "Para onde você vai?" com IR, atalhos Casa, Trabalho e
// Recentes, e o mapa com a minha posição.

import { Briefcase, Gift, History, House, Search } from "lucide-react";
import type { Posicao } from "../comum/api";
import { saudacao, type Eu, type Lugares } from "./apoio";
import { Mapa } from "./Mapa";
import { Avatar } from "./pecas";

export function Inicio({ eu, aqui, lugares, irPara, atalho, indique }: {
  eu: Eu; aqui: Posicao | null; lugares: Lugares | null;
  irPara: () => void; atalho: (a: "casa" | "trabalho" | "recentes") => void; indique: () => void;
}) {
  const primeiro = eu.nome.split(" ")[0];
  return (
    <div className="inicio">
      <Mapa eu={aqui} className="fundo" />
      <div className="inicio-topo">
        <div className="inicio-ola">
          <Avatar foto={eu.foto} nome={eu.nome} tamanho={52} />
          <div><small>{saudacao()}</small><strong>{primeiro}! <span aria-hidden="true">👋</span></strong></div>
          <button className="icone-botao presente" onClick={indique} aria-label="Indique e ganhe"><Gift size={24} /></button>
        </div>
        <button className="busca-inicio" onClick={irPara}>
          <span className="icone-redondo cor"><Search size={22} /></span>
          <span className="busca-texto"><strong>Para onde você vai?</strong><small>Digite um endereço ou lugar</small></span>
          <span className="botao-ir">IR</span>
        </button>
        <div className="atalhos">
          <button onClick={() => atalho("casa")}><span className="icone-redondo claro"><House size={18} /></span><strong>Casa</strong><small>{lugares?.casa ? "Ir para casa" : "Definir"}</small></button>
          <button onClick={() => atalho("trabalho")}><span className="icone-redondo claro"><Briefcase size={18} /></span><strong>Trabalho</strong><small>{lugares?.trabalho ? "Ir trabalhar" : "Definir"}</small></button>
          <button onClick={() => atalho("recentes")}><span className="icone-redondo claro"><History size={18} /></span><strong>Recentes</strong><small>Ver últimos</small></button>
        </div>
      </div>
    </div>
  );
}
