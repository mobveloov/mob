// fetch falso para os testes: registra cada pedido e responde o que o teste mandar.

/** Endereços de mentira (domínio .invalid nunca existe). Os testes não chamam a rede. */
export const A_URL = "https://sistema-a.exemplo.invalid/api/v2/integracao";
export const B_PAINEL = "https://sistema-b.exemplo.invalid/dashboard";
export const B_APP = "https://sistema-b.exemplo.invalid/_/app";

export interface PedidoGravado {
  metodo: string;
  url: URL;
  cabecalhos: Record<string, string>;
  corpo?: string;
}

type Resposta = { status?: number; json?: unknown; texto?: string; cabecalhos?: Record<string, string> };
type Regra = (p: PedidoGravado) => Resposta | undefined;

export function fetchFalso(...regras: Regra[]) {
  const pedidos: PedidoGravado[] = [];
  const fn = async (input: string | URL, init: RequestInit = {}) => {
    const p: PedidoGravado = {
      metodo: init.method ?? "GET",
      url: new URL(String(input)),
      cabecalhos: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      corpo: typeof init.body === "string" ? init.body : undefined,
    };
    pedidos.push(p);
    for (const r of regras) {
      const resp = r(p);
      if (resp) {
        const corpo = resp.texto ?? (resp.json !== undefined ? JSON.stringify(resp.json) : "");
        return new Response(corpo, {
          status: resp.status ?? 200,
          headers: { "content-type": resp.json !== undefined ? "application/json" : "text/html", ...resp.cabecalhos },
        });
      }
    }
    return new Response(JSON.stringify({ success: false, errors: [{ code: "X", message: "rota não simulada" }] }), { status: 404 });
  };
  return { fetch: fn, pedidos };
}

export const rota =
  (metodo: string, caminho: string | RegExp, resp: Resposta): Regra =>
  (p) =>
    p.metodo === metodo && (typeof caminho === "string" ? p.url.pathname.endsWith(caminho) : caminho.test(p.url.pathname + p.url.search))
      ? resp
      : undefined;

export const falha = (): never => {
  throw new Error("não devia chamar a rede");
};
