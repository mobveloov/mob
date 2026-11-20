// Ícones de carro do mapa (Personalização do app do passageiro): Realista, Moderno e Clássico, livre e ocupado.
// Desenhos próprios, em SVG de 48 x 48 (sem arquivos de fora). O servidor entrega por URL; o painel usa na pré-visualização.

export const VEICULOS_MAPA = ["realista", "moderno", "classico"] as const;
export type VeiculoMapa = (typeof VEICULOS_MAPA)[number];
export type EstadoCarro = "livre" | "ocupado";
/** Número que a Machine usa para cada estilo (Clássico 0, Moderno 1, Realista 2). */
export const TIPO_VEICULO: Record<VeiculoMapa, number> = { classico: 0, moderno: 1, realista: 2 };
export const ROTULO_VEICULO: Record<VeiculoMapa, string> = { realista: "Realista", moderno: "Moderno", classico: "Clássico" };

const VERDE = "#16a34a", VERMELHO = "#dc2626", CINZA = "#6b7280", AZUL = "#1d4ed8";

/** Carro visto de cima, com vidros e rodas. O Realista não diferencia livre de ocupado (mesmo desenho). */
const realista = () =>
  `<ellipse cx="24" cy="44" rx="11" ry="2.5" fill="#000" opacity=".18"/>` +
  `<rect x="13" y="9" width="3" height="9" rx="1.5" fill="#111"/><rect x="32" y="9" width="3" height="9" rx="1.5" fill="#111"/>` +
  `<rect x="13" y="31" width="3" height="9" rx="1.5" fill="#111"/><rect x="32" y="31" width="3" height="9" rx="1.5" fill="#111"/>` +
  `<rect x="15" y="4" width="18" height="40" rx="8" fill="#f3f4f6" stroke="#374151" stroke-width="1.5"/>` +
  `<path d="M18 14c2-2 10-2 12 0l1 6H17z" fill="#1f2937"/><rect x="18" y="22" width="12" height="9" rx="2" fill="#e5e7eb" stroke="#9ca3af" stroke-width=".8"/>` +
  `<path d="M18 34h12l1 5c-3 2-11 2-14 0z" fill="#1f2937"/>`;

/** Moderno: botão redondo com a silhueta do carro; verde livre, vermelho ocupado. */
const moderno = (e: EstadoCarro) => {
  const cor = e === "livre" ? VERDE : VERMELHO;
  return `<circle cx="24" cy="24" r="21" fill="${cor}" stroke="#fff" stroke-width="3"/>` +
    `<path d="M12 27l3-8c.5-1.2 1.5-2 3-2h12c1.5 0 2.5.8 3 2l3 8v6h-3v-2H15v2h-3z" fill="#fff"/>` +
    `<circle cx="17" cy="28.5" r="2" fill="${cor}"/><circle cx="31" cy="28.5" r="2" fill="${cor}"/>`;
};

/** Clássico: carro de lado dentro de um pino; azul livre, cinza ocupado. */
const classico = (e: EstadoCarro) => {
  const cor = e === "livre" ? AZUL : CINZA;
  return `<path d="M24 46C13 34 8 28 8 20a16 16 0 0 1 32 0c0 8-5 14-16 26z" fill="${cor}" stroke="#fff" stroke-width="2"/>` +
    `<path d="M14 23l2.5-6c.4-1 1.2-1.6 2.4-1.6h10.2c1.2 0 2 .6 2.4 1.6l2.5 6v4.5h-2.4V26H16.4v1.5H14z" fill="#fff"/>` +
    `<circle cx="18" cy="24.5" r="1.8" fill="${cor}"/><circle cx="30" cy="24.5" r="1.8" fill="${cor}"/>`;
};

export function iconeCarroSvg(veiculo: VeiculoMapa, estado: EstadoCarro = "livre"): string {
  const corpo = veiculo === "moderno" ? moderno(estado) : veiculo === "classico" ? classico(estado) : realista();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${corpo}</svg>`;
}

/** Para usar em <img src>: o mesmo desenho como endereço de dados. */
export const iconeCarroUrl = (v: VeiculoMapa, e: EstadoCarro = "livre") => `data:image/svg+xml;utf8,${encodeURIComponent(iconeCarroSvg(v, e))}`;
