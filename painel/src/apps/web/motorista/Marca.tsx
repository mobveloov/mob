// Logo da empresa num círculo (ícone do app, ou o logo, ou as iniciais do nome).

import { urlArquivo } from "../comum/api";
import type { MarcaApp } from "../comum/ui";
import { iniciais } from "./tipos";

export function LogoMarca({ marca, tamanho = 76 }: { marca: MarcaApp; tamanho?: number }) {
  const src = urlArquivo(marca.icone || marca.logoClaro);
  return (
    <span className="logo-circulo" style={{ width: tamanho, height: tamanho }}>
      {src ? <img src={src} alt={marca.nome} /> : <strong>{iniciais(marca.nome)}</strong>}
    </span>
  );
}
