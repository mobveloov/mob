// Endereço externo cadastrado por uma empresa (servidor de WhatsApp, por exemplo).
// O servidor do painel só chama endereço https público: nunca a rede interna nem o próprio computador.
// URL_LOCAL_LIBERADA=true (ou CRM_PERMITIR_URL_LOCAL=true, nome antigo) libera endereço local, só para testes.

import net from "node:net";

/** IPv4 em qualquer forma que o navegador/fetch aceita ("127.1", "2130706433", "0x7f.1") -> 4 números, ou null. */
function ipv4(host: string): number[] | null {
  const partes = host.split(".");
  if (partes.length < 1 || partes.length > 4 || partes.some((p) => !/^(0x[0-9a-f]+|\d+)$/i.test(p))) return null;
  const n = partes.map((p) => (/^0x/i.test(p) ? parseInt(p, 16) : /^0\d/.test(p) ? parseInt(p, 8) : parseInt(p, 10)));
  if (n.some((x) => !Number.isFinite(x))) return null;
  const ult = n.pop()!;
  const bytes = [...n];
  const resto = 4 - bytes.length;
  if (bytes.some((b) => b > 255) || ult >= 256 ** resto) return null;
  for (let i = resto - 1; i >= 0; i--) bytes.push(Math.floor(ult / 256 ** i) % 256);
  return bytes;
}

function ipv4Privado([a, b]: number[]) {
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** O host aponta para a rede interna, o próprio computador ou um endereço especial? */
export function hostInterno(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !net.isIPv6(h)) return true;
  if (net.isIPv6(h)) {
    if (h === "::" || h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;
    const mapeado = /^(?:0*:)*(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(h) ?? /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
    if (mapeado) {
      const bytes = mapeado.length === 2 ? ipv4(mapeado[1]) : [parseInt(mapeado[1], 16) >> 8, parseInt(mapeado[1], 16) & 255, parseInt(mapeado[2], 16) >> 8, parseInt(mapeado[2], 16) & 255];
      return !bytes || ipv4Privado(bytes);
    }
    return false;
  }
  const v4 = ipv4(h);
  return v4 ? ipv4Privado(v4) : false;
}

/** Valida o endereço. Erro com texto para a tela quando não pode. */
export function validarUrlExterna(u: string, oQue = "do servidor"): URL {
  let url: URL;
  try { url = new URL(u); } catch { throw new Error(`Endereço ${oQue} inválido.`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Endereço ${oQue} inválido (use https://).`);
  if (url.username || url.password) throw new Error(`Endereço ${oQue} não pode ter usuário e senha.`);
  const liberado = process.env.URL_LOCAL_LIBERADA === "true" || process.env.CRM_PERMITIR_URL_LOCAL === "true";
  if (!liberado && (url.protocol !== "https:" || hostInterno(url.hostname))) throw new Error(`Use um endereço https público ${oQue}.`);
  return url;
}
