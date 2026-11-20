// Logo da empresa num círculo (ícone do app, ou o logo, ou as iniciais do nome).

import { urlArquivo } from "../comum/api";
import type { MarcaApp } from "../comum/ui";
import { iniciais } from "./tipos";
import { usePersonalizacao } from "../comum/personalizacao";

export function LogoMarca({ marca, tamanho = 76 }: { marca: MarcaApp; tamanho?: number }) {
  // O ícone/logo vem da Personalização do painel (imagem da marca, depois ícone e logo da empresa); o da marca do app só vale de reserva.
  const pers = usePersonalizacao();
  const doPainel = (pers?.design.mostrarImagem && pers.design.imagemMarcaUrl) || pers?.empresa.icone || pers?.empresa.logoClaro || "";
  const src = urlArquivo(doPainel || marca.icone || marca.logoClaro);
  return (
    <span className="logo-circulo" style={{ width: tamanho, height: tamanho }}>
      {src ? <img src={src} alt={marca.nome} /> : <strong>{iniciais(marca.nome)}</strong>}
    </span>
  );
}
