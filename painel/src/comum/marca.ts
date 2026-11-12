// Marca de cada empresa (white-label). Fica guardada nos dados da empresa, nunca no código.
// Usada no painel, no relatório exportado, na análise da IA, no manifest (PWA) e no app (APK).

export type Tema = "claro" | "escuro" | "sistema";

export interface Marca {
  /** Nome do produto (ex.: "Painel Rota Fácil"). Aparece no topo, no título da aba e no relatório. */
  produto: string;
  /** Nome curto da empresa, usado nos textos ("Central Rota Fácil"). */
  nomeExibido: string;
  assistente: {
    /** Nome do assistente de IA (ex.: "Lia"). */
    nome: string;
    /** Tom de voz em poucas palavras (ex.: "direto e cordial"). */
    tom: string;
  };
  cores: { primaria: string; secundaria: string; fundo: string; texto: string };
  /** Fonte do Google Fonts (só as da lista FONTES). */
  fonte: string;
  tema: Tema;
  /** Nomes dos arquivos enviados (ficam na pasta da empresa). Vazio = sem imagem. */
  arquivos: { logoClaro: string; logoEscuro: string; favicon: string; iconeApp: string; abertura: string };
  textos: {
    saudacao: string; suporteEmail: string; suporteTelefone: string; rodapeRelatorio: string;
    /** Contatos que aparecem nos apps (Fale conosco, termos e privacidade). */
    suporteWhatsapp: string; suporteSite: string; termosUrl: string; privacidadeUrl: string;
  };
  /** Domínios próprios ou subdomínios (ex.: "painel.rotafacil.com.br"). */
  dominios: string[];
  /** Mostrar a etiqueta de origem (qual sistema trouxe a corrida). */
  mostrarOrigem: boolean;
  app: { nome: string; pacote: string; urlPainel: string };
}

export type TipoArquivo = keyof Marca["arquivos"];
export const TIPOS_ARQUIVO: TipoArquivo[] = ["logoClaro", "logoEscuro", "favicon", "iconeApp", "abertura"];

export const FONTES = ["Plus Jakarta Sans", "Inter", "Poppins", "Montserrat", "Nunito", "Roboto", "Open Sans", "Lato"];

/** Marca neutra: usada antes de a empresa configurar a dela. Sem nome de nenhuma empresa real. */
export const MARCA_PADRAO: Marca = {
  produto: "Painel de Corridas",
  nomeExibido: "Sua central",
  assistente: { nome: "Assistente", tom: "direto, cordial e prático" },
  cores: { primaria: "#2563eb", secundaria: "#0f1b2d", fundo: "#f4f6fa", texto: "#1c2434" },
  fonte: "Plus Jakarta Sans",
  tema: "sistema",
  arquivos: { logoClaro: "", logoEscuro: "", favicon: "", iconeApp: "", abertura: "" },
  textos: { saudacao: "Olá! Bom trabalho hoje.", suporteEmail: "", suporteTelefone: "", rodapeRelatorio: "", suporteWhatsapp: "", suporteSite: "", termosUrl: "", privacidadeUrl: "" },
  dominios: [],
  mostrarOrigem: true,
  app: { nome: "Painel de Corridas", pacote: "", urlPainel: "" },
};

const COR = /^#[0-9a-fA-F]{6}$/;
const texto = (v: unknown, max: number, padrao: string) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : padrao);
const cor = (v: unknown, padrao: string) => (typeof v === "string" && COR.test(v) ? v.toLowerCase() : padrao);
const arquivo = (v: unknown) => (typeof v === "string" && /^[\w.-]{1,80}$/.test(v) ? v : "");
/** Link http(s) sem espaço nem aspas; vazio apaga; outra coisa mantém o anterior. */
const link = (v: unknown, padrao: string | undefined) => {
  if (typeof v !== "string") return padrao ?? "";
  const s = v.trim();
  if (!s) return "";
  return /^https?:\/\/[^\s"'<>]{3,300}$/.test(s) ? s : padrao ?? "";
};
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Limpa uma marca vinda de fora (formulário, brand.json). Campo inválido volta ao padrão. */
export function sanearMarca(entrada: unknown, base: Marca = MARCA_PADRAO): Marca {
  const m = obj(entrada);
  const a = obj(m.assistente), c = obj(m.cores), f = obj(m.arquivos), t = obj(m.textos), ap = obj(m.app);
  const produto = texto(m.produto, 60, base.produto) || base.produto;
  return {
    produto,
    nomeExibido: texto(m.nomeExibido, 60, base.nomeExibido) || produto,
    assistente: { nome: texto(a.nome, 30, base.assistente.nome) || "Assistente", tom: texto(a.tom, 80, base.assistente.tom) },
    cores: { primaria: cor(c.primaria, base.cores.primaria), secundaria: cor(c.secundaria, base.cores.secundaria), fundo: cor(c.fundo, base.cores.fundo), texto: cor(c.texto, base.cores.texto) },
    fonte: FONTES.includes(String(m.fonte)) ? String(m.fonte) : base.fonte,
    tema: m.tema === "claro" || m.tema === "escuro" || m.tema === "sistema" ? m.tema : base.tema,
    arquivos: {
      logoClaro: "logoClaro" in f ? arquivo(f.logoClaro) : base.arquivos.logoClaro,
      logoEscuro: "logoEscuro" in f ? arquivo(f.logoEscuro) : base.arquivos.logoEscuro,
      favicon: "favicon" in f ? arquivo(f.favicon) : base.arquivos.favicon,
      iconeApp: "iconeApp" in f ? arquivo(f.iconeApp) : base.arquivos.iconeApp,
      abertura: "abertura" in f ? arquivo(f.abertura) : base.arquivos.abertura,
    },
    textos: {
      saudacao: texto(t.saudacao, 120, base.textos.saudacao),
      suporteEmail: texto(t.suporteEmail, 120, base.textos.suporteEmail),
      suporteTelefone: texto(t.suporteTelefone, 40, base.textos.suporteTelefone),
      rodapeRelatorio: texto(t.rodapeRelatorio, 200, base.textos.rodapeRelatorio),
      suporteWhatsapp: typeof t.suporteWhatsapp === "string" ? t.suporteWhatsapp.replace(/\D/g, "").slice(0, 15) : base.textos.suporteWhatsapp ?? "",
      suporteSite: link(t.suporteSite, base.textos.suporteSite),
      termosUrl: link(t.termosUrl, base.textos.termosUrl),
      privacidadeUrl: link(t.privacidadeUrl, base.textos.privacidadeUrl),
    },
    dominios: (Array.isArray(m.dominios) ? m.dominios : base.dominios)
      .map((d) => String(d).trim().toLowerCase()).filter((d) => /^[a-z0-9.-]{3,120}$/.test(d)).slice(0, 10),
    mostrarOrigem: typeof m.mostrarOrigem === "boolean" ? m.mostrarOrigem : base.mostrarOrigem,
    app: {
      nome: texto(ap.nome, 30, base.app.nome) || produto,
      pacote: typeof ap.pacote === "string" && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(ap.pacote) ? ap.pacote : base.app.pacote,
      urlPainel: typeof ap.urlPainel === "string" && /^https?:\/\/[^\s"'<>]+$/.test(ap.urlPainel) ? ap.urlPainel : base.app.urlPainel,
    },
  };
}

/** Variáveis CSS do tema (usadas no painel e no relatório exportado). */
export function variaveisTema(m: Marca, escuro: boolean): Record<string, string> {
  const { primaria, secundaria, fundo, texto } = m.cores;
  const base = escuro
    ? { "--fundo": "#0b1121", "--cartao": "#1e293b", "--texto": "#f1f5f9", "--suave": "#94a3b8", "--borda": "#334155", "--barra": "#151e32", "--barra-borda": "#2a3b55" }
    : { "--fundo": fundo, "--cartao": "#ffffff", "--texto": texto, "--suave": `color-mix(in srgb, ${texto} 60%, ${fundo})`, "--borda": `color-mix(in srgb, ${texto} 10%, ${fundo})`, "--barra": "#ffffff", "--barra-borda": `color-mix(in srgb, ${texto} 7%, #ffffff)` };
  return { ...base, "--primaria": primaria, "--primaria-txt": contraste(primaria), "--menu": secundaria, "--menu-txt": contraste(secundaria) === "#ffffff" ? "#d5dcea" : "#1c2434", "--fonte": `"${m.fonte}", system-ui, sans-serif` };
}

/** Branco ou quase-preto, o que ler melhor sobre a cor. */
export function contraste(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#1c2434" : "#ffffff";
}
