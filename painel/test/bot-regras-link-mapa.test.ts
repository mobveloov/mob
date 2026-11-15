// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// node --experimental-strip-types supabase/functions/_shared/mapLink.test.ts
import { findMapUrl, hasMapLink, parseMapUrl, placeTextToAddress, resolveMapLink } from "../src/bot/link-mapa.ts";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.error(`FALHOU ${name}\n  veio:     ${g}\n  esperado: ${w}`); }
}

// --- achar o link ---
eq("link curto google", findMapUrl("https://maps.app.goo.gl/HmCLFTfS6mcYRBjR7?g_st=aw"), "https://maps.app.goo.gl/HmCLFTfS6mcYRBjR7?g_st=aw");
eq("link com texto em volta", findMapUrl("to aqui ó https://maps.app.goo.gl/abc123 vem logo."), "https://maps.app.goo.gl/abc123");
eq("apple", hasMapLink("https://maps.apple.com/?ll=-21.0115,-48.2339&q=Pin"), true);
eq("apple curto", hasMapLink("https://maps.apple/p/AbCdEf"), true);
eq("goo.gl antigo de mapa", hasMapLink("https://goo.gl/maps/xyz"), true);
eq("goo.gl que nao e mapa", hasMapLink("https://goo.gl/abc"), false);
eq("google sem /maps", hasMapLink("https://www.google.com/search?q=uber"), false);
eq("outro site", hasMapLink("https://instagram.com/p/abc"), false);
eq("sem link", hasMapLink("rua amazonas 53"), false);

// --- links reais (14/10 e 10/10) ja expandidos ---
const pin = "https://www.google.com/maps/place/-21.011552,-48.233933/data=!4m6!3m5!1s0!7e2!8m2!3d-21.0115516!4d-48.2339334!18m1!1e1?utm_source=mstt_1&entry=gps&g_st=aw";
eq("pino: usa !3d!4d", parseMapUrl(pin), { kind: "point", lat: -21.011552, lng: -48.233933 });
const lugar = "https://www.google.com/maps/place/Arena+Fitness+-+R.+Par%C3%A1,+95+-+Centro,+Pitangueiras+-+SP,+14750-075/data=!4m2!3m1!1s0x94b97deea920d563:0xcd884f4246d511e6!18m1!1e1?utm_source=mstt_1&entry=gps&g_st=aw";
eq("lugar sem coordenada: endereco", parseMapUrl(lugar), { kind: "text", text: "R. Pará, 95, Centro, Pitangueiras - SP", name: "Arena Fitness" });

// --- outros formatos ---
eq("lugar com !3d!4d leva o nome", parseMapUrl("https://www.google.com/maps/place/Padaria+Sol/@-21.0,-48.2,17z/data=!3m1!4b1!4m5!3m4!8m2!3d-21.0123!4d-48.2234"),
  { kind: "point", lat: -21.0123, lng: -48.2234 });
eq("?q=lat,lng", parseMapUrl("https://maps.google.com/?q=-21.0123,-48.2234"), { kind: "point", lat: -21.0123, lng: -48.2234 });
eq("search api query", parseMapUrl("https://www.google.com/maps/search/?api=1&query=-21.0123%2C-48.2234"), { kind: "point", lat: -21.0123, lng: -48.2234 });
eq("so @ (centro da tela)", parseMapUrl("https://www.google.com/maps/@-21.0123,-48.2234,17z"), { kind: "point", lat: -21.0123, lng: -48.2234 });
eq("apple ll + q", parseMapUrl("https://maps.apple.com/?ll=-21.0115,-48.2339&q=Casa%20da%20Maria"), { kind: "point", lat: -21.0115, lng: -48.2339, name: "Casa da Maria" });
eq("apple pin sem nome", parseMapUrl("https://maps.apple.com/?ll=-21.0115,-48.2339&q=Marked%20Location"), { kind: "point", lat: -21.0115, lng: -48.2339, name: "Marked Location" });
eq("apple endereco", parseMapUrl("https://maps.apple.com/?address=Rua%20Amazonas,%2053,%20Pitangueiras%20-%20SP"), { kind: "text", text: "Rua Amazonas, 53, Pitangueiras - SP" });
eq("fora do Brasil recusa", parseMapUrl("https://maps.google.com/?q=40.7128,-74.0060"), null);
eq("google q texto", parseMapUrl("https://maps.google.com/?q=Rodoviaria+de+Pitangueiras"), { kind: "text", text: "Rodoviaria de Pitangueiras" });

// --- endereco do lugar ---
eq("rua sem nome antes", placeTextToAddress("R. Pará, 95 - Centro"), { text: "R. Pará, 95, Centro" });
eq("so nome de lugar", placeTextToAddress("Santa Casa de Pitangueiras"), { text: "Santa Casa de Pitangueiras" });

// --- seguir link curto (fetch falso) ---
function fakeFetch(map: Record<string, string>) {
  const calls: string[] = [];
  const f = (u: string) => {
    calls.push(u);
    const loc = map[u];
    return Promise.resolve(new Response(null, { status: loc ? 302 : 200, headers: loc ? { location: loc } : {} }));
  };
  return { f, calls };
}
{
  const { f, calls } = fakeFetch({ "https://maps.app.goo.gl/HmCLFTfS6mcYRBjR7?g_st=aw": pin });
  const r = await resolveMapLink("https://maps.app.goo.gl/HmCLFTfS6mcYRBjR7?g_st=aw", f);
  eq("curto -> ponto", r, { kind: "point", lat: -21.011552, lng: -48.233933 });
  eq("uma chamada so", calls.length, 1);
}
{
  const { f, calls } = fakeFetch({ "https://maps.app.goo.gl/x": "http://169.254.169.254/latest/meta-data" });
  eq("nao segue para fora do Google/Apple", await resolveMapLink("https://maps.app.goo.gl/x", f), null);
  eq("parou no primeiro", calls.length, 1);
}
{
  const { f, calls } = fakeFetch({});
  eq("link com coordenada nao chama a rede", await resolveMapLink("https://maps.google.com/?q=-21.0123,-48.2234", f), { kind: "point", lat: -21.0123, lng: -48.2234 });
  eq("zero chamadas", calls.length, 0);
}
{
  const boom = () => Promise.reject(new Error("rede fora"));
  eq("rede fora devolve null", await resolveMapLink("https://maps.app.goo.gl/x", boom), null);
}

if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
console.log("mapLink: ok");
