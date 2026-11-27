// Ajustes da voz dos avisos (os dois apps). A voz padrão vem do painel (mp3 neural). A voz do aparelho é só opção manual.
import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { falarTexto, lerConfigVoz, salvarConfigVoz, vozDe, vozDoPainel, vozesDoAparelho } from "./voz";

const EXEMPLO = "Seu motorista está a caminho.";

export function AjustesDeVoz() {
  const [cfg, setCfg] = useState(lerConfigVoz);
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>(vozesDoAparelho);
  const [atual, setAtual] = useState("");
  useEffect(() => {
    const s = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const ler = () => setVozes(vozesDoAparelho());
    s?.addEventListener?.("voiceschanged", ler);
    return () => s?.removeEventListener?.("voiceschanged", ler);
  }, []);
  useEffect(() => { void vozDe(EXEMPLO).then((v) => setAtual(v.origem === "nenhuma" ? "Só o toque (sem voz do painel agora)" : v.origem === "painel" ? v.nome : `${v.nome} (voz do aparelho)`)); }, [cfg, vozes]);
  const mudar = (p: Partial<typeof cfg>) => { salvarConfigVoz(p); setCfg(lerConfigVoz()); };
  return (
    <div className="ajustes-voz">
      <p className="ajustes-voz-atual">Voz em uso: <strong data-testid="voz-em-uso">{atual || "…"}</strong></p>
      <p className="ajustes-voz-atual">A voz e a velocidade do painel: {vozDoPainel().ligada ? `${vozDoPainel().genero}, ${vozDoPainel().velocidade.toFixed(2)}×` : "desligada"}</p>
      <label className="ajustes-voz-linha"><input type="checkbox" checked={!cfg.painel} onChange={(e) => mudar({ painel: !e.target.checked })} /> Usar a voz do aparelho (menos natural)</label>
      {!cfg.painel && <><label>Voz do aparelho
        <select value={cfg.nome} onChange={(e) => mudar({ nome: e.target.value })}>
          <option value="">Automática (a melhor)</option>
          {vozes.map((v) => <option key={v.name} value={v.name}>{v.name}{v.localService === false ? " · rede" : ""}</option>)}
        </select>
      </label>
      <label>Velocidade: {cfg.velocidade.toFixed(2)}×
        <input type="range" min={0.7} max={1.3} step={0.05} value={cfg.velocidade} onChange={(e) => mudar({ velocidade: Number(e.target.value) })} />
      </label></>}
      <button type="button" className="botao secundario" onClick={() => void falarTexto(EXEMPLO, { fixa: true })}><Volume2 size={16} /> Ouvir exemplo</button>
    </div>
  );
}
