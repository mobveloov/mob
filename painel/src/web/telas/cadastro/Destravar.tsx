// Cadastro › Destravar Motoristas: motoristas presos a corridas que não andam mais. Servidor: /api/gestao/destravar.

import { Unlock } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, chamar, dataHoraBr, Selo, useAviso, Vazio } from "./base";

interface Travado { corridaId: string; os: string; motoristaId: string; nome: string; telefone: string; status: string; desde: string; embarque: string; atencao: boolean }
const ROTULO: Record<string, string> = { a_caminho: "A caminho", no_local: "No local", em_andamento: "Em andamento" };

export default function Destravar() {
  const l = useCarregar(() => chamar<{ travados: Travado[] }>("GET", "/destravar"), [], 30_000);
  const { aviso, tentar } = useAviso();
  const lista = l.dados?.travados ?? [];
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Destravar Motoristas" sub="Liberte motoristas que ficaram vinculados a corridas que já pararam de andar." />
      <div className="cg-tabela-caixa">
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--cg-borda)" }}>
          <strong>Motoristas Travados</strong><Selo tom={lista.length ? "alerta" : "ok"}>{lista.length}</Selo>
        </div>
        {!lista.length ? <Vazio titulo="Tudo limpo por aqui!" sub="Nenhum motorista está travado em corridas no momento." /> : (
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Motorista</th><th>Corrida</th><th>Situação</th><th>Parada desde</th><th>Embarque</th><th className="direita">Ações</th></tr></thead>
            <tbody>{lista.map((t) => (
              <tr key={t.corridaId}>
                <td><div className="cg-pessoa"><span className="cg-avatar">{t.nome.slice(0, 1).toUpperCase()}</span><div><strong>{t.nome}</strong><small>{t.telefone}</small></div></div></td>
                <td>OS {t.os}</td><td><Selo tom={t.atencao ? "ruim" : "alerta"}>{ROTULO[t.status] ?? t.status}</Selo></td><td>{dataHoraBr(t.desde)}</td><td>{t.embarque}</td>
                <td className="direita"><button className="cg-botao primario" onClick={() => confirm(`Destravar ${t.nome}? A corrida ${t.os} será encerrada.`) && void tentar(async () => { await chamar("POST", `/destravar/${t.corridaId}`, {}); l.recarregar(); }, "Motorista destravado.")}><Unlock size={14} /> Destravar</button></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
