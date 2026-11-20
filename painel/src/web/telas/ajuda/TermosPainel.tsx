// Ajuda › Termos de uso: termos de uso do painel (texto e versão) e o aceite de cada usuário. Servidor: /api/gestao/termos-painel.
// Os termos dos apps (passageiro e motorista) ficam em Configurações › Termos de uso.

import { useCarregar } from "../../componentes/ui";
import { Cabecalho, chamar, Selo, useAviso } from "../cadastro/base";

interface Resposta {
  versao: string; atualizadoEm: string; texto: string;
  aceite: { versao: string; em: string } | null; aceiteAnterior: { versao: string; em: string } | null;
  aceitos?: Array<{ email: string; nome: string; versao: string; em: string }>;
}
const dataHora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
const dia = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

export default function TermosPainel() {
  const l = useCarregar(() => chamar<Resposta>("GET", "/termos-painel"), []);
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Termos de uso" sub={d ? `Versão ${d.versao} · atualizado em ${dia(d.atualizadoEm)}` : undefined}>
        {d && (d.aceite ? <Selo tom="ok">Você aceitou a versão {d.aceite.versao} em {dataHora(d.aceite.em)}</Selo> : <Selo tom="alerta">Aceite pendente</Selo>)}
      </Cabecalho>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      {d && (
        <>
          <section className="cg-tabela-caixa" style={{ padding: 20, lineHeight: 1.6 }} aria-label="Texto dos termos de uso">
            {d.texto.split("\n").map((linha, i) => (/^\d+\.\s/.test(linha) ? <h3 key={i} style={{ margin: "18px 0 4px" }}>{linha}</h3> : linha.trim() ? <p key={i} style={{ margin: "0 0 6px" }}>{linha}</p> : null))}
          </section>
          {!d.aceite && (
            <div style={{ margin: "14px 0" }}>
              {d.aceiteAnterior && <p style={{ color: "var(--cg-suave)" }}>Os termos mudaram desde o seu último aceite (versão {d.aceiteAnterior.versao}).</p>}
              <button className="cg-botao primario" onClick={() => void tentar(async () => { await chamar("POST", "/termos-painel/aceitar"); l.recarregar(); }, "Aceite registrado.")}>Li e aceito os termos de uso</button>
            </div>
          )}
          {d.aceitos && (
            <>
              <h2 className="cg-secao">Quem já aceitou</h2>
              <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
                <thead><tr><th>Usuário</th><th>Versão</th><th>Quando</th></tr></thead>
                <tbody>{d.aceitos.map((a) => <tr key={a.email}><td><strong>{a.nome || a.email}</strong><br /><small className="cg-mono">{a.email}</small></td><td>{a.versao}{a.versao !== d.versao && <> <Selo tom="alerta">desatualizada</Selo></>}</td><td>{dataHora(a.em)}</td></tr>)}</tbody>
              </table></div>{!d.aceitos.length && <div className="cg-vazio"><strong>Ninguém aceitou ainda.</strong></div>}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
