// Chamadas ao servidor de Relatórios e Vouchers (/api/relatorios), com a empresa escolhida (usuário da plataforma).

function empresaEscolhida() {
  try { return localStorage.getItem("empresa") ?? ""; } catch { return ""; }
}

export async function pedirRel<T = any>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const h: Record<string, string> = {};
  const emp = empresaEscolhida();
  if (emp) h["X-Empresa"] = emp;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`/api/relatorios${url}`, { method: metodo, headers: h, credentials: "same-origin", body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { erro?: string }).erro || `Erro ${r.status}`);
  return b as T;
}

/** Baixa um CSV do servidor (a proteção contra fórmula é feita lá). */
export async function baixarCsvRel(url: string, nome: string) {
  const emp = empresaEscolhida();
  const r = await fetch(`/api/relatorios${url}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const mesAtual = () => {
  const h = new Date(Date.now() - 3 * 3600_000), a = h.getUTCFullYear(), m = h.getUTCMonth();
  return { inicio: new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10), fim: new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10) };
};
