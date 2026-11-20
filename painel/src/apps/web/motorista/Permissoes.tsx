// Passo a passo das permissões do Android para o motorista receber corrida com o app minimizado ou a tela bloqueada.
// Cada item mostra "OK" ou "Falta" e tem um atalho que abre a tela certa de configurações. Ao voltar das configurações, a situação é lida de novo.
// Sem as essenciais o motorista não fica online (App.tsx). Fora do APK (navegador) esta tela só explica.

import { useCallback, useEffect, useState } from "react";
import { BatteryCharging, Bell, Check, Layers, LocateFixed, Rocket, Smartphone, TriangleAlert } from "lucide-react";
import { ESSENCIAIS, permissoesNativas, type Permissoes } from "../comum/api";
import { Pagina, Topo } from "./Pecas";

interface Passo { id: keyof Permissoes | "autoinicio"; abrir: string; titulo: string; texto: string; icone: typeof Bell; essencial: boolean }

const PASSOS: Passo[] = [
  { id: "localizacaoSempre", abrir: "localizacao", titulo: "Localização o tempo todo", texto: "Para a central mandar a corrida mais perto de você mesmo com a tela apagada. Na tela do Android escolha \"Permitir o tempo todo\".", icone: LocateFixed, essencial: true },
  { id: "notificacoes", abrir: "notificacoes", titulo: "Notificações", texto: "Para tocar a chamada e mostrar \"Você está online\" com o botão Ficar offline.", icone: Bell, essencial: true },
  { id: "sobrePosicao", abrir: "sobre", titulo: "Exibir sobre outros apps", texto: "Para a chamada abrir por cima de qualquer app e mostrar o ícone flutuante quando você minimizar.", icone: Layers, essencial: true },
  { id: "bateria", abrir: "bateria", titulo: "Sem otimização de bateria", texto: "Para o Android não desligar o app em segundo plano e você não perder corrida.", icone: BatteryCharging, essencial: true },
  { id: "telaCheia", abrir: "telaCheia", titulo: "Chamada em tela cheia", texto: "Android 14 ou mais novo: permite abrir a chamada com a tela bloqueada.", icone: Smartphone, essencial: false },
];
const FABRICANTES_EXIGENTES = ["xiaomi", "redmi", "poco", "oppo", "realme", "oneplus", "vivo", "samsung", "huawei", "honor", "asus"];

export function PermissoesPasso({ voltar }: { voltar: () => void }) {
  const [p, setP] = useState<Permissoes | null>(null);
  const [lido, setLido] = useState(false);
  const ler = useCallback(async () => { setP(await permissoesNativas.ler()); setLido(true); }, []);
  useEffect(() => {
    void ler();
    const volta = () => { if (document.visibilityState === "visible") void ler(); }; // voltou das configurações do Android
    document.addEventListener("visibilitychange", volta);
    const t = setInterval(() => void ler(), 3000);
    return () => { document.removeEventListener("visibilitychange", volta); clearInterval(t); };
  }, [ler]);

  const nativo = permissoesNativas.disponivel();
  const faltam = p ? ESSENCIAIS.filter((k) => !p[k]) : [];
  const exigente = !!p && FABRICANTES_EXIGENTES.some((f) => p.fabricante.includes(f));

  return (
    <Pagina>
      <Topo estilo="esquerda" titulo="Permissões do aparelho" voltar={voltar} />
      <div className="conteudo">
        {nativo && lido && (
          <section className={`cartao-m perm-resumo ${faltam.length ? "falta" : "ok"}`}>
            {faltam.length
              ? <><TriangleAlert size={22} /><div><strong>Faltam {faltam.length} permissão(ões) essenciais</strong><span>Sem elas você não consegue ficar online. Toque em Liberar em cada item.</span></div></>
              : <><Check size={22} /><div><strong>Tudo liberado</strong><span>Você já pode ficar online e receber corridas com o app minimizado.</span></div></>}
          </section>
        )}
        {!nativo && <section className="cartao-m"><p className="dica">Estas permissões existem só no aplicativo instalado no Android. No navegador, mantenha esta aba aberta para receber corridas.</p></section>}
        {PASSOS.map((s) => {
          const ok = p ? !!p[s.id as keyof Permissoes] : false;
          const I = s.icone;
          return (
            <section key={s.id} className="cartao-m perm-item">
              <span className={`perm-icone ${ok ? "ok" : ""}`}><I size={22} /></span>
              <div className="perm-texto">
                <strong>{s.titulo}{!s.essencial && <small> · opcional</small>}</strong>
                <span>{s.texto}</span>
              </div>
              {nativo && (ok
                ? <span className="perm-estado ok"><Check size={16} /> OK</span>
                : <button type="button" className="botao-m perm-botao" onClick={() => void permissoesNativas.abrir(s.abrir)}>{s.essencial ? "Liberar" : "Abrir"}</button>)}
            </section>
          );
        })}
        {nativo && exigente && (
          <section className="cartao-m perm-item">
            <span className="perm-icone"><Rocket size={22} /></span>
            <div className="perm-texto">
              <strong>Início automático e bateria do fabricante</strong>
              <span>No seu aparelho ({p?.fabricante}) o sistema também precisa permitir o início automático e "sem restrição" de bateria para este app. O Android não deixa o app conferir isso: abra e ative.</span>
            </div>
            <button type="button" className="botao-m perm-botao" onClick={() => void permissoesNativas.abrir("autoinicio")}>Abrir</button>
          </section>
        )}
        {nativo && <button type="button" className="botao-m" disabled={faltam.length > 0} onClick={voltar}>{faltam.length ? "Libere as essenciais para continuar" : "Continuar"}</button>}
      </div>
    </Pagina>
  );
}
