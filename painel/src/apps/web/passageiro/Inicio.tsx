// Início: topo na cor da marca com a foto e a saudação, "Para onde você vai?" com IR, atalhos Casa, Trabalho e
// Recentes, e o mapa com a minha posição.

import { useEffect, useState } from "react";
import { Briefcase, Gift, History, House, Search, Tag, Trophy } from "lucide-react";
import { api, reais, urlArquivo, type Posicao } from "../comum/api";
import { saudacao, type Eu, type Lugares } from "./apoio";
import { usePersonalizacao } from "../comum/personalizacao";
import { Mapa } from "./Mapa";
import { Avatar } from "./pecas";

export function Inicio({ eu, aqui, lugares, irPara, atalho, indique }: {
  eu: Eu; aqui: Posicao | null; lugares: Lugares | null;
  irPara: () => void; atalho: (a: "casa" | "trabalho" | "recentes") => void; indique: () => void;
}) {
  const primeiro = eu.nome.split(" ")[0];
  const pers = usePersonalizacao();
  const rec = pers?.recursos; // recursos ligados e desligados em Configurações > Personalização (sem a personalização, tudo como era)
  const comMapa = rec?.mapa !== false, comDestino = rec?.selecao_destino !== false;
  // Blocos opcionais da tela inicial (ordem e visibilidade vêm de Configurações > Personalização, recursos): cupons e desafio leem os dados reais do painel.
  const [cupons, setCupons] = useState<Array<{ codigo: string; tipo: string; valor: number }>>([]);
  const [desafio, setDesafio] = useState<{ nome: string; meta: number; feito: number } | null>(null);
  const querCupons = rec?.aviso_cupons === true, querDesafio = rec?.desafio === true;
  useEffect(() => { if (querCupons) void api<{ cupons: Array<{ codigo: string; tipo: string; valor: number }> }>("/cupons").then((r) => setCupons(r.cupons ?? [])).catch(() => setCupons([])); }, [querCupons]);
  useEffect(() => { if (querDesafio) void api<{ desafios: Array<{ nome: string; meta: number; feito: number }> }>("/desafios").then((r) => setDesafio(r.desafios?.[0] ?? null)).catch(() => setDesafio(null)); }, [querDesafio]);
  const ordem = pers?.telaInicial.ordemVisiveis ?? ["mapa", "destino"];
  const pos = (id: string) => { const i = ordem.indexOf(id); return i < 0 ? 99 : i; };
  const mostrarImagem = !!pers?.design.mostrarImagem && !!pers.design.imagemMarcaUrl, mostrarNome = !!pers?.design.mostrarNome;
  const blocoDestino = comDestino && (
    <button key="destino" className="busca-inicio" style={{ order: pos("destino") }} onClick={irPara}>
      <span className="icone-redondo cor"><Search size={22} /></span>
      <span className="busca-texto"><strong>Para onde você vai?</strong><small>Digite um endereço ou lugar</small></span>
      <span className="botao-ir">IR</span>
    </button>
  );
  const blocoCupons = querCupons && cupons.length > 0 && (
    <button key="cupons" className="bloco-inicio" style={{ order: pos("cupons") }} onClick={indique}>
      <span className="icone-redondo claro"><Tag size={18} /></span>
      <span className="bloco-texto"><strong>{cupons.length === 1 ? "1 cupom disponível" : `${cupons.length} cupons disponíveis`}</strong><small>Use {cupons[0].codigo}: {cupons[0].tipo === "valor" ? reais(cupons[0].valor) : `${cupons[0].valor}%`} de desconto</small></span>
    </button>
  );
  const blocoDesafio = querDesafio && desafio && (
    <button key="desafio" className="bloco-inicio" style={{ order: pos("desafio") }} onClick={indique}>
      <span className="icone-redondo claro"><Trophy size={18} /></span>
      <span className="bloco-texto"><strong>{desafio.nome}</strong><small>{Math.min(desafio.feito, desafio.meta)} de {desafio.meta}</small></span>
    </button>
  );
  return (
    <div className={`inicio estilo-${pers?.design.estiloTela ?? "flutuante"}`}>
      {comMapa && <Mapa eu={aqui} perto={aqui} controles className="fundo" />}
      <div className="inicio-topo">
        {(mostrarImagem || mostrarNome) && (
          <div className="inicio-marca">
            {mostrarImagem && <img src={urlArquivo(pers!.design.imagemMarcaUrl)} alt="" style={pers!.design.dimensoesImagem ? { width: pers!.design.dimensoesImagem.largura, height: pers!.design.dimensoesImagem.altura } : undefined} />}
            {mostrarNome && <strong>{pers!.empresa.nomeExibido || pers!.empresa.nome}</strong>}
          </div>
        )}
        <div className="inicio-ola">
          <Avatar foto={eu.foto} nome={eu.nome} tamanho={52} />
          <div><small>{saudacao()}</small><strong>{primeiro}! <span aria-hidden="true">👋</span></strong></div>
          <button className="icone-botao presente" onClick={indique} aria-label="Indique e ganhe"><Gift size={24} /></button>
        </div>
        <div className="inicio-blocos">{blocoDestino}{blocoCupons}{blocoDesafio}</div>
        <div className="atalhos">
          <button onClick={() => atalho("casa")}><span className="icone-redondo claro"><House size={18} /></span><strong>Casa</strong><small>{lugares?.casa ? "Ir para casa" : "Definir"}</small></button>
          <button onClick={() => atalho("trabalho")}><span className="icone-redondo claro"><Briefcase size={18} /></span><strong>Trabalho</strong><small>{lugares?.trabalho ? "Ir trabalhar" : "Definir"}</small></button>
          <button onClick={() => atalho("recentes")}><span className="icone-redondo claro"><History size={18} /></span><strong>Recentes</strong><small>Ver últimos</small></button>
        </div>
      </div>
    </div>
  );
}
