// Erros do motor. O painel só precisa olhar `codigo` e mostrar `message` (já em português).

export type CodigoErro =
  | "NAO_CONFIGURADO" // falta credencial na configuração da empresa
  | "SEM_AUTORIZACAO" // chave, senha ou cookie errado/vencido
  | "NAO_ENCONTRADO"
  | "DADOS_INVALIDOS" // o sistema recusou o que mandamos
  | "LIMITE" // muitas chamadas; veja tentarEmSegundos
  | "INDISPONIVEL" // sem rede, tempo esgotado ou erro 5xx
  | "NAO_SUPORTADO" // o sistema não tem essa função
  | "ERRO_REMOTO"; // outra resposta inesperada

export class MotorErro extends Error {
  readonly codigo: CodigoErro;
  readonly integracaoId?: string;
  readonly statusHttp?: number;
  readonly tentarEmSegundos?: number;
  readonly detalhe?: unknown;

  constructor(
    codigo: CodigoErro,
    mensagem: string,
    extra: { integracaoId?: string; statusHttp?: number; tentarEmSegundos?: number; detalhe?: unknown } = {},
  ) {
    super(mensagem);
    this.name = "MotorErro";
    this.codigo = codigo;
    this.integracaoId = extra.integracaoId;
    this.statusHttp = extra.statusHttp;
    this.tentarEmSegundos = extra.tentarEmSegundos;
    this.detalhe = extra.detalhe;
  }

  /** Formato simples para mandar ao navegador (sem detalhe interno). */
  paraJson() {
    return {
      codigo: this.codigo,
      mensagem: this.message,
      integracaoId: this.integracaoId,
      statusHttp: this.statusHttp,
      tentarEmSegundos: this.tentarEmSegundos,
    };
  }
}

export function ehMotorErro(e: unknown): e is MotorErro {
  return e instanceof MotorErro;
}
