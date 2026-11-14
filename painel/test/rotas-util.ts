// Ajuda dos testes de segurança: lista TODAS as rotas registradas no Express (caminho completo e método).

interface Camada {
  route?: { path: string | RegExp; methods: Record<string, boolean>; stack: Array<{ name: string; handle: unknown }> };
  name: string;
  handle: { stack?: Camada[] };
  regexp: RegExp;
  keys?: Array<{ name: string }>;
  path?: string;
}

export interface RotaListada { metodo: string; caminho: string; filtros: string[] }

/** Trecho de caminho montado por um `app.use("/x", router)`, lido da expressão regular que o Express guarda. */
function prefixo(c: Camada): string {
  if ((c.regexp as RegExp & { fast_slash?: boolean }).fast_slash) return "";
  let i = 0;
  return c.regexp.source
    .replace(/^[^\?/]/, "")
    .replace(/[^\?/]\/\?\(\?=\\\/\|\$\)$/, "") // final "/?(?=/|$)" que o Express acrescenta
    .replace(/\(\?:\\\/\(\[\^\\?\/\]\+\?\)\)/g, () => `/:${c.keys?.[i++]?.name ?? "p"}`)
    .replace(/\(\?:\(\[\^\\?\/\]\+\?\)\)/g, () => `:${c.keys?.[i++]?.name ?? "p"}`)
    .replace(/[^\?/]\//g, "/");
}

export function listarRotas(app: unknown): RotaListada[] {
  const saida: RotaListada[] = [];
  const andar = (pilha: Camada[], base: string, filtros: string[]) => {
    let acumulado = [...filtros];
    for (const c of pilha) {
      if (c.route) {
        const caminhos = Array.isArray(c.route.path) ? c.route.path : [c.route.path];
        for (const p of caminhos) {
          for (const metodo of Object.keys(c.route.methods)) {
            saida.push({ metodo: metodo.toUpperCase(), caminho: base + (typeof p === "string" ? p : String(p)), filtros: [...acumulado, ...c.route.stack.map((s) => s.name)] });
          }
        }
      } else if (c.name === "router" && c.handle.stack) {
        andar(c.handle.stack, base + prefixo(c), acumulado);
      } else {
        // middleware comum (exigirLogin, json, etc.): vale para o que vem depois dele
        acumulado = [...acumulado, `${c.name}@${base + prefixo(c) || "/"}`];
      }
    }
  };
  const raiz = (app as { _router: { stack: Camada[] } })._router.stack;
  andar(raiz, "", []);
  return saida;
}
