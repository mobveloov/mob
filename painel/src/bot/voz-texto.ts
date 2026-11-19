// Resposta em audio do bot (voz pela nuvem; o Kokoro da VPS foi retirado). Modulo puro. Teste: voiceReply.test.ts

/** Mensagens maiores que isso nao viram audio (menus longos e listas ficam so no texto). */
export const VOICE_MAX_CHARS = 450;

/**
 * Os textos do bot saem sem acento ("voce", "numero", "opcao", "NAO"). O Kokoro depende do acento para saber a
 * vogal e a silaba forte: sem ele le "voce" como "voz se" e "opcao" como "upcau", e a fala fica estranha.
 * So para a VOZ restauramos o acento das palavras mais comuns (a mensagem de texto nao muda).
 */
const ACCENTS: Record<string, string> = {
  voce: "você", voces: "vocês", numero: "número", numeros: "números", opcao: "opção", opcoes: "opções",
  nao: "não", sao: "são", ate: "até", ja: "já", tambem: "também", ola: "olá", so: "só",
  endereco: "endereço", enderecos: "endereços", preco: "preço", cartao: "cartão", credito: "crédito", debito: "débito",
  confirmacao: "confirmação", informacao: "informação", informacoes: "informações", solicitacao: "solicitação",
  localizacao: "localização", referencia: "referência", preferencia: "preferência", distancia: "distância",
  veiculo: "veículo", proximo: "próximo", proxima: "próxima", rapido: "rápido", possivel: "possível",
  disponivel: "disponível", invalido: "inválido", invalida: "inválida", valido: "válido", gratis: "grátis",
  unico: "único", ultimo: "último", util: "útil", area: "área", codigo: "código", atraves: "através",
  acao: "ação", cancelamento: "cancelamento", pagamento: "pagamento", horario: "horário", servico: "serviço",
  motorista: "motorista", corrida: "corrida", mensagem: "mensagem", categoria: "categoria",
};
const ACCENT_RE = new RegExp(`\\b(${Object.keys(ACCENTS).join("|")})\\b`, "gi");

/** Ajusta o texto para a pronuncia brasileira (acentos, SIM/NAO em maiusculas, "=", valores em reais). */
export function pronunciaBR(input: string): string {
  let t = String(input ?? "");
  // "R$ 1.234,50" -> "1234 reais e 50 centavos" (o Kokoro le "R$" como "real dolar" e "," como pontuacao)
  t = t.replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (_m, inteiro: string, cent?: string) => {
    const reais = inteiro.replace(/\./g, "");
    const c = cent ? parseInt(cent.padEnd(2, "0"), 10) : 0;
    const unidade = reais === "1" ? "real" : "reais";
    return c > 0 ? `${reais} ${unidade} e ${c} centavos` : `${reais} ${unidade}`;
  });
  t = t.replace(/\s=\s/g, ", ").replace(/\s*[-–—]\s+/g, ", ");
  t = t.replace(/\b(\d+)\s*km\b/gi, "$1 quilômetros").replace(/\b(\d+)\s*min\b/gi, "$1 minutos");
  // palavras em CAIXA ALTA comuns viram minusculas (o motor le "SIM" soletrado)
  t = t.replace(/\b(SIM|NAO|NÃO|OK)\b/g, (w) => w.toLowerCase());
  t = t.replace(/\b([Ee])sta (a caminho|aguardando|esperando|chegando|proximo|perto|em )/g, "$1stá $2");
  t = t.replace(ACCENT_RE, (w) => {
    const r = ACCENTS[w.toLowerCase()];
    return w[0] === w[0].toUpperCase() && w.length > 1 && w !== w.toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
  return t;
}

/**
 * Texto da mensagem do bot pronto para falar: sem *negrito*, emojis, links e listas numeradas longas.
 * null = nao vale a pena falar (vazio, longo demais ou so link/codigo).
 */
export function speakableText(message: string): string | null {
  let t = String(message ?? "");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/[*_~`]/g, "");
  // emojis e simbolos graficos
  t = t.replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu, " ");
  t = t.replace(/[•▪►➡→]/g, " ");
  t = t.replace(/\s*\n+\s*/g, ". ").replace(/\.(\s*\.)+/g, ".").replace(/([!?:])\./g, "$1");
  t = t.replace(/\s{2,}/g, " ").replace(/^[\s.]+/, "").trim();
  t = pronunciaBR(t);
  if (t.length < 2 || !/[a-zA-ZÀ-ú]/.test(t)) return null;
  if (t.length > VOICE_MAX_CHARS) return null;
  return t;
}

/** base64 sem estourar a pilha com audios grandes (String.fromCharCode(...bytes) quebra acima de ~100 KB). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Vozes do Kokoro em portugues do Brasil (servidor de voz). */
export const VOICES: Record<string, string> = { pf_dora: "Dora (feminina)", pm_alex: "Alex (masculina)", pm_santa: "Santa (masculina)" };
export const DEFAULT_VOICE = "pf_dora";
export const cleanVoice = (v: unknown): string => (typeof v === "string" && v in VOICES ? v : DEFAULT_VOICE);

/**
 * Dica para o Whisper (initial_prompt): cidades, lugares e ruas da empresa. Ajuda a escrever certo nomes de rua e
 * bairro. Curta (o Whisper so usa o comeco) e sem repetir.
 */
export function buildWhisperPrompt(cities: string[], places: string[], streets: string[], max = 600): string {
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter((x) => {
      const k = x.toLowerCase();
      if (x.length < 2 || x.length > 60 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const parts: string[] = [];
  const c = uniq(cities);
  if (c.length) parts.push(`Corrida em ${c.slice(0, 5).join(", ")}.`);
  const p = uniq(places);
  if (p.length) parts.push(`Lugares: ${p.slice(0, 15).join(", ")}.`);
  const s = uniq(streets);
  if (s.length) parts.push(`Ruas: ${s.join(", ")}.`);
  let out = parts.join(" ");
  if (out.length > max) out = out.slice(0, out.lastIndexOf(",", max)).trimEnd() + ".";
  return out;
}
