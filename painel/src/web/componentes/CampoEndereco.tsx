import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

export interface PontoEscolhido { texto: string; lat?: number; lng?: number }
interface Opcao { texto: string; lat: number; lng: number; exato: boolean; cep: string }

/** Campo de endereço com sugestões da base de endereços (CNEFE). Sem a base, é um campo de texto comum. */
export function CampoEndereco({ rotulo, valor, onChange, required, autoFocus }: { rotulo: string; valor: PontoEscolhido; onChange: (p: PontoEscolhido) => void; required?: boolean; autoFocus?: boolean }) {
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const ultimo = useRef("");
  useEffect(() => {
    const q = valor.texto.trim();
    if (valor.lat != null || q.length < 3 || q === ultimo.current) return;
    const t = setTimeout(async () => {
      ultimo.current = q;
      try {
        const r = await fetch(`/api/enderecos/buscar?q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
        const j = (await r.json()) as { enderecos?: Opcao[]; aviso?: string | null };
        setOpcoes(j.enderecos ?? []); setAviso(j.aviso ?? null); setAberto(true);
      } catch { setOpcoes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [valor.texto, valor.lat]);
  return (
    <label className="campo-endereco">
      {rotulo}
      <input value={valor.texto} required={required} autoFocus={autoFocus} maxLength={200} autoComplete="off" placeholder="Rua, número e bairro"
        onChange={(e) => onChange({ texto: e.target.value })} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 200)} />
      {valor.lat != null && <small className="ok"><MapPin size={12} /> Endereço encontrado no mapa.</small>}
      {aberto && valor.lat == null && (opcoes.length > 0 || aviso) && (
        <ul className="sugestoes">
          {opcoes.map((o, i) => (
            <li key={i}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange({ texto: o.texto, lat: o.lat, lng: o.lng }); setAberto(false); }}>
              {o.texto}{!o.exato && <small> · número aproximado</small>}
            </button></li>
          ))}
          {aviso && <li className="sub">{aviso}</li>}
        </ul>
      )}
    </label>
  );
}
