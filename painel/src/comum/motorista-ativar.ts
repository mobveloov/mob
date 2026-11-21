// O que o motorista precisa ter preenchido para ser ATIVADO (status Ativo). Cadastro que veio do app nasce com vários
// campos vazios e o operador precisa poder gravar um ajuste sem preencher tudo: a exigência só vale na hora de ativar
// (ou ao criar um motorista novo pelo painel). Usado pela tela e pelo servidor, para dizerem a mesma coisa.

export const OBRIGATORIOS_ATIVAR: ReadonlyArray<readonly [string, string]> = [
  ["nome", "Nome"], ["nascimento", "Nascimento"], ["email", "E-mail"], ["telefone", "Telefone"], ["cpf", "CPF"], ["nivel", "Relação"],
  ["endereco", "Endereço"], ["cep", "CEP"], ["uf", "UF"], ["cidade", "Cidade"], ["bairro", "Bairro"],
];

const vazio = (v: unknown) => v == null || String(v).trim() === "";

/** Nomes dos campos obrigatórios que estão vazios (o número do endereço só é cobrado quando o motorista tem número). */
export function camposFaltando(d: Record<string, unknown>): string[] {
  const f = OBRIGATORIOS_ATIVAR.filter(([k]) => vazio(d[k])).map(([, r]) => r);
  if (d.semNumero !== true && vazio(d.numero)) f.push("Número");
  return f;
}

/** A gravação está ativando o motorista? (passou a Ativo agora; quem já era Ativo não é cobrado de novo). */
export const estaAtivando = (statusAntes: unknown, statusDepois: unknown) => String(statusDepois ?? "") === "Ativo" && String(statusAntes ?? "") !== "Ativo";

/** Frase de erro: "Para ativar o motorista faltam: Nascimento, CPF." */
export const mensagemFaltam = (faltam: string[], acao: "ativar" | "cadastrar" = "ativar") => `Para ${acao} o motorista faltam: ${faltam.join(", ")}.`;
