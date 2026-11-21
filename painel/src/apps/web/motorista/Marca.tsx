// Logo da empresa num círculo, no canto do topo do app. Vem da Personalização do painel (imagem escolhida); sem imagem, as iniciais do nome.
// Nunca usa imagem fixa do app.

import { urlArquivo } from "../comum/api";
import { logoDaPersonalizacao, usePersonalizacao } from "../comum/personalizacao";
import type { MarcaApp } from "../comum/ui";
import { iniciais } from "./tipos";

export function LogoMarca({ marca, tamanho = 76 }: { marca: MarcaApp; tamanho?: number }) {
  const pers = usePersonalizacao();
  const src = urlArquivo(logoDaPersonalizacao(pers) || (pers ? "" : marca.icone || marca.logoClaro || ""));
  const nome = pers?.empresa.nome || marca.nome;
  return (
    <span className="logo-circulo" style={{ width: tamanho, height: tamanho }}>
      {src ? <img src={src} alt={nome} /> : <strong>{iniciais(nome)}</strong>}
    </span>
  );
}
