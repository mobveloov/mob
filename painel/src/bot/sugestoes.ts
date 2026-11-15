// Sugestoes de Endereco: acha a sugestao pelo APELIDO que o passageiro digitou ("espetin do gui",
// "amarelinha da av"). Puro. Teste: suggestionMatch.test.ts
//
// v14.40.3: a busca antiga casava palavras soltas tambem com o ENDERECO da sugestao e com "contem" nos dois
// sentidos: "Rua Sergipe 10" virava a Amarelinha (Rua Sergipe, 606) e o ", Pitangueiras - SP" do fim
// ajudava a casar qualquer coisa. Agora: apelido inteiro, ou palavras significativas do apelido (prefixo),
// sem a cidade do fim e sem palavras genericas.

export interface SuggestionRow { nickname: string | null; address_text: string; lat: number | null; lng: number | null }

const ABBREV: Record<string, string> = { av: "avenida", tv: "travessa", pca: "praca", jd: "jardim", sta: "santa", sto: "santo", dr: "doutor", prof: "professor" };
const GENERIC = new Set(["rua", "avenida", "travessa", "alameda", "praca", "jardim", "vila", "parque", "centro", "bairro",
  "residencial", "conjunto", "santa", "santo", "sao", "dos", "das", "del", "para", "pra", "perto", "frente", "aqui", "ali"]);

/** minusculo, sem acento, sem pontuacao e sem ", Cidade - UF" no fim. */
export function normSuggestionText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/,\s*[^,]*\s-\s*[a-z]{2}\s*$/, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const words = (s: string) => s.split(" ").map((w) => ABBREV[w] ?? w).filter((w) => w.length >= 3 && !GENERIC.has(w));

// (21/10/2026) "Em frente a escola Lucimara" nao achava "EMEF Lucimara Cristina Viana Rossi": TIPO do lugar com sinonimos
// (escola = EMEF/EMEI/colegio...). Com o mesmo tipo dos dois lados, um nome forte (5+ letras) ja basta.
const PLACE_TYPE: Record<string, string> = {
  escola: "escola", emef: "escola", emeb: "escola", emei: "escola", eme: "escola", colegio: "escola", creche: "escola", etec: "escola", escolinha: "escola",
  hospital: "saude", ubs: "saude", upa: "saude", posto: "posto", mercado: "mercado", supermercado: "mercado",
  igreja: "igreja", paroquia: "igreja", padaria: "padaria", farmacia: "farmacia", drogaria: "farmacia",
};

/** Nota de 0 a 100 (0 = nao casa). */
export function suggestionScore(input: string, nickname: string | null): number {
  const i = normSuggestionText(input);
  const n = normSuggestionText(nickname ?? "");
  if (!i || !n || i.length < 3) return 0;
  if (i === n) return 100;
  if (n.length >= 4 && (i.startsWith(n) || n.startsWith(i)) && Math.min(i.length, n.length) >= 4) return 80;
  if (n.length >= 6 && i.includes(n)) return 60;
  const iw = words(i), nw = words(n);
  if (!iw.length || !nw.length) return 0;
  // cada palavra significativa do passageiro precisa casar com o comeco de uma palavra do apelido (ou o contrario)
  const hit = (w: string) => nw.some((t) => t.startsWith(w) || (w.startsWith(t) && t.length >= 4));
  const matched = iw.filter(hit).length;
  // e o apelido nao pode ter sobrado quase todo de fora (ex.: "gui" sozinho nao e "espetinho do gui")
  const covered = nw.filter((t) => iw.some((w) => t.startsWith(w) || (w.startsWith(t) && t.length >= 4))).length;
  if (matched === iw.length && covered >= Math.ceil(nw.length * 0.5)) return 30 + matched * 5;
  const byType = placeTypeNameMatch(input, nickname);
  return byType > 0 ? 30 + byType * 5 : 0;
}

/** O texto fala de um TIPO de lugar ("escola", "EMEF", "UBS", "posto", "igreja"...)? */
export function mentionsPlaceType(text: string | null | undefined): boolean {
  return words(normSuggestionText(text ?? "")).some((w) => !!PLACE_TYPE[w]);
}

/**
 * (23/10/2026) Lugar com NOME DE PESSOA ("EMEF Doutor Mauricio Montecchi", "UBS Dr. Clovis") — quase sempre ha uma RUA
 * com o mesmo nome. Casos reais: "Mauricio Montecchi (Bar do Carlao)" e "Rua Clovis Guimaraes Espinola" viraram as
 * EMEFs. Esse lugar so vale se o passageiro falar do lugar (escola, EMEF...) ou escrever o nome exato.
 */
export function isPersonNamedPlace(nickname: string | null | undefined): boolean {
  const n = normSuggestionText(nickname ?? "");
  return /\b(?:doutor|doutora|dr|dra|professor|professora|prof|profa|padre|dona|vereador|prefeito|comendador|coronel|engenheiro|eng|irma|frei|monsenhor|deputado|senador|governador|presidente)\b/.test(n);
}

/**
 * Tipo do lugar no texto do passageiro ("escola Lucimara") e o mesmo tipo (ou nenhum) no apelido, e todas as
 * outras palavras do passageiro no nome (uma com 5+ letras). Devolve quantas palavras do nome casaram (0 = nao casa).
 */
export function placeTypeNameMatch(input: string, nickname: string | null): number {
  const iw = words(normSuggestionText(input)), nw = words(normSuggestionText(nickname ?? ""));
  const it = iw.map((w) => PLACE_TYPE[w]).filter(Boolean), nt = nw.map((w) => PLACE_TYPE[w]).filter(Boolean);
  if (!it.length || (nt.length && !nt.some((t) => it.includes(t)))) return 0;
  const iName = iw.filter((w) => !PLACE_TYPE[w]), nName = nw.filter((w) => !PLACE_TYPE[w]);
  const nameHit = (w: string) => nName.some((t) => t.startsWith(w) || (w.startsWith(t) && t.length >= 4));
  return iName.length && iName.every(nameHit) && iName.some((w) => w.length >= 5) ? iName.length : 0;
}

/** Melhor sugestao (nota minima 30) ou null. */
export function pickSuggestion<T extends SuggestionRow>(rows: T[], input: string): T | null {
  let best: T | null = null, bestScore = 0;
  for (const r of rows) {
    const s = suggestionScore(input, r.nickname);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return bestScore >= 30 ? best : null;
}

/**
 * (08/11/2026) LUGAR entre parenteses so vale pelo NOME do lugar (apelido), nunca pelo endereco da sugestao.
 * Caso real: "Paulo queiroz catony 93 ( bela vista)" virou "Padaria Bella Vista" porque o endereco dela e
 * "Jardim Bela Vista" (o bairro). Com numero de casa no texto, o nome tem que bater quase inteiro (nota >= 80):
 * regra do dono (v16.10), endereco com numero nunca vira sugestao aproximada. Sem numero, nota >= 30 (pickSuggestion).
 */
export function parenPlaceMatches(ref: string, nickname: string | null, textHasHouseNumber: boolean): boolean {
  return suggestionScore(ref, nickname) >= (textHasHouseNumber ? 80 : 30);
}

/**
 * (10/11/2026) Lista de Sugestoes que casam com o texto (ranking do whatsapp-webhook, movido para ca para ser testavel).
 * Caso "Amarelinha": 2 lojas ("da Avenida" e "do Centro"). So "Amarelinha" = as DUAS para o passageiro escolher; com
 * "avenida" ou "centro" = so a loja certa. "super mercado" (separado) vale igual a "supermercado(s)".
 * Parte generica: vale para qualquer empresa/lugar de nomes parecidos.
 */
export function rankSuggestions<T extends SuggestionRow>(suggestions: T[], rawInput: string): T[] {
  // "super mercado" (separado) = "supermercado" tambem para o tipo do lugar (placeTypeNameMatch/mentionsPlaceType)
  const input = rawInput.replace(/\bsuper\s+mercado/gi, "supermercado");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    // "super mercado(s)" = "supermercado(s)"
    .replace(/\bsuper\s+mercado/g, "supermercado").trim();
  const inputNorm = norm(input);
  if (!inputNorm) return [];
  const viaRe = /^(?:rua|r|av|avenida|travessa|tv|alameda|al|praca|estrada|rodovia|rod)\b\.?\s/;
  const pedeRua = viaRe.test(inputNorm.replace(/[^a-z0-9\s.]/g, " ").trim());
  // "supermercados" -> "supermercado" so para comparar palavras
  const idWords = (txt: string) => txt.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !/^(supermercado|mercado|loja|lojas)$/.test(w));
  const sing = (s: string) => s.replace(/\bsupermercados\b/g, "supermercado");

  const matches = suggestions.map((s) => {
    const sNorm = sing(norm(s.nickname ?? ""));
    const sAddr = sing(norm(s.address_text ?? ""));
    const inN = sing(inputNorm);
    let score = 0;
    if (sNorm === inN || sAddr === inN) score += 100;
    else if (sNorm.includes(inN) || inN.includes(sNorm) || sAddr.includes(inN) || inN.includes(sAddr)) score += 50;
    else {
      const inputWords = inN.split(/\s+/).filter((w) => w.length >= 4 && !/^(uber|carro|corrida|super|mercado|mercados|supermercado|frente|to|em|na|no|da|do|dos|das|e|a|o|as|os|um|uma|pro|pra|para|em|frente|de|da|do|das|dos|loja|lojas|centro|bairro|perto|proximo|lado)$/.test(w));
      const stem = (kw: string, w: string): boolean => {
        if (w === kw) return true;
        if (w.length < 6 || kw.length < 6) return false;
        const root = kw.slice(0, Math.min(8, kw.length - 1));
        return w.startsWith(root) || kw.startsWith(w.slice(0, Math.min(8, w.length - 1)));
      };
      let bonusBigram = 0;
      for (let i = 0; i < inputWords.length - 1; i++) {
        const w1 = inputWords[i], w2 = inputWords[i + 1];
        if (sNorm.includes(`${w1} ${w2}`) || sNorm.includes(`${w2} ${w1}`) || sAddr.includes(`${w1} ${w2}`) || sAddr.includes(`${w2} ${w1}`)) bonusBigram += 40;
      }
      for (const keyWord of inputWords) {
        if (sNorm.split(/\s+/).some((w) => stem(keyWord, w)) || sAddr.split(/\s+/).some((w) => stem(keyWord, w))) score += 30;
      }
      score += bonusBigram;
      const porTipo = placeTypeNameMatch(input, s.nickname);
      if (porTipo > 0) score = Math.max(score, 60 + porTipo * 5);
      const GENERICAS = /^(loja|lojas|centro|mercado|mercados|supermercado|super|de|da|do|das|dos|e)$/;
      const nickWords = sNorm.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !GENERICAS.test(w));
      const inputSet = new Set(inN.replace(/[^a-z0-9\s]/g, " ").split(/\s+/));
      if (nickWords.length > 0 && nickWords.every((w) => inputSet.has(w))) score = Math.max(score, 70);
    }
    if (pedeRua && score < 100 && !viaRe.test(sNorm.replace(/[^a-z0-9\s.]/g, " ").trim())) score = 0;
    if (score > 0 && score < 100 && isPersonNamedPlace(s.nickname) && !mentionsPlaceType(input)) score = 0;
    return { s, score, toks: new Set(idWords(sNorm + " " + sAddr)) };
  }).filter((m) => m.score > 0);

  // (10/11/2026) palavra que DIFERENCIA as lojas ("avenida", "centro"): esta em algumas e nao em todas. Se o passageiro a
  // disse, a loja que a tem sobe (+40 cada); "Amarelinha" sozinha nao diferencia: as duas ficam empatadas e vao para escolha.
  if (matches.length > 1) {
    const common = [...matches[0].toks].filter((w) => matches.every((m) => m.toks.has(w)));
    const inWords = new Set(sing(inputNorm).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map((w) => ABBREV[w] ?? w));
    for (const m of matches) {
      if (m.score >= 100) continue;
      m.score += 40 * [...m.toks].filter((w) => !common.includes(w) && inWords.has(w)).length;
    }
  }
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 0) return [];
  const bestScore = matches[0].score;
  if (bestScore < 50) return [];
  return matches.filter((m) => m.score >= bestScore - 10).slice(0, 5).map((m) => m.s);
}

/**
 * (10/11/2026) Sugestoes cujo NOME o passageiro escreveu no texto, junto de uma rua ou sozinho: "Rua Sergipe, amarelinha na
 * avenida" -> Amarelinha da Avenida; "Supermercado amarelinha" -> as 2 lojas. Todas as palavras do nome (sem as genericas
 * "avenida", "centro", "loja", "supermercado"...) tem que estar no texto: "Rua Sergipe, centro" NAO vira "Amarelinha do Centro".
 * Quem chama garante que o texto nao tem numero de casa (endereco com numero nunca vira Sugestao aproximada).
 */
export function suggestionsMentioned<T extends SuggestionRow>(rows: T[], text: string): T[] {
  const base = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bsuper\s+mercado/g, "supermercado").replace(/\bsupermercados\b/g, "supermercado")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const tw = new Set(base(text).split(" ").map((w) => ABBREV[w] ?? w));
  const SKIP = /^(loja|lojas|mercado|mercados|supermercado|super|de|da|do|das|dos|na|no|em)$/;
  const candidates = rows.filter((r) => {
    const nw = base(r.nickname ?? "").split(" ").map((w) => ABBREV[w] ?? w).filter((w) => w.length >= 3 && !GENERIC.has(w) && !SKIP.test(w));
    return nw.length > 0 && nw.every((w) => tw.has(w));
  });
  if (!candidates.length) return [];
  // a rua do inicio ("Rua Sergipe,") nao pode transformar a busca em busca de RUA (pedeRua zera lugares)
  const VIA = "(?:rua|r|av|avenida|travessa|tv|alameda|al|pra[cç]a|estrada|rodovia|rod)";
  const semVia = text.replace(new RegExp("^\\s*" + VIA + "\\b\\.?\\s+[^,;]*[,;]\\s*", "i"), "")
    .replace(new RegExp("^\\s*" + VIA + "\\b\\.?\\s+", "i"), "");
  return rankSuggestions(candidates, semVia || text);
}
