// Contêiner das entradas do menu que juntam várias telas: barra de abas em cima e a tela da aba escolhida embaixo.
// A aba vem da rota (?aba=<id da função>); sem parâmetro (ou com aba que o cargo não vê), abre a primeira aba permitida.
// Cada aba é a tela de sempre (mesmo componente), então nada muda dentro delas. Quando a entrada tem seções (ex.: Apps >
// Passageiro | Motorista | Totem), a barra mostra primeiro as seções e depois as abas da seção escolhida.

import { Fragment, type ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import type { EntradaVisivel } from "../../../comum/menu-lateral.ts";
import "./abas.css";

export function EntradaAbas({ entrada, tela }: { entrada: EntradaVisivel; tela: (funcaoId: string) => ReactNode }) {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("aba");
  const atual = entrada.abas.find((x) => x.id === pedida) ?? entrada.abas[0];
  const secoes = [...new Set(entrada.abas.map((x) => x.secao).filter((s): s is string => !!s))];
  const abasDaSecao = atual.secao ? entrada.abas.filter((x) => x.secao === atual.secao) : entrada.abas;
  const escolher = (id: string) => {
    // A primeira aba abre sem parâmetro; os outros parâmetros da tela anterior não valem para a nova aba.
    setParams(id === entrada.abas[0].id ? {} : { aba: id });
  };
  const barra = entrada.abas.length > 1;
  return (
    <>
      {barra && (
        <div className="entrada-abas" data-entrada={entrada.id}>
          {secoes.length > 1 && (
            <div className="entrada-secoes" role="tablist" aria-label={`${entrada.nome}: seções`}>
              {secoes.map((s) => {
                const primeira = entrada.abas.find((x) => x.secao === s)!;
                return <button key={s} role="tab" aria-selected={atual.secao === s} className={atual.secao === s ? "ativo" : ""} onClick={() => escolher(primeira.id)}>{s}</button>;
              })}
            </div>
          )}
          {abasDaSecao.length > 1 && (
            <div className="entrada-lista" role="tablist" aria-label={`${entrada.nome}: abas`}>
              {abasDaSecao.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === atual.id} data-aba={x.id} className={x.id === atual.id ? "ativo" : ""} onClick={() => escolher(x.id)}>{x.rotulo}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <Fragment key={atual.id}>{tela(atual.id)}</Fragment>
    </>
  );
}

/** Rota antiga: abre a entrada nova na aba certa, mantendo os outros parâmetros (ex.: ?motorista=...). */
export function RedirecionaParaAba({ para }: { para: string }) {
  const { search, hash } = useLocation();
  const [caminho, q = ""] = para.split("?");
  const novo = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(q)) novo.set(k, v);
  const s = novo.toString();
  return <Navigate to={`${caminho}${s ? `?${s}` : ""}${hash}`} replace />;
}
