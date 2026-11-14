// Telas de Relatórios e Vouchers no formato da Machine. Cada chave é o id do menu (src/comum/funcoes.ts).
import type { JSX } from "react";
import Indice from "./Indice";
import Estatistica from "./Estatistica";
import Relatorio from "./Relatorio";
import { EntregaVoucher, FaixasVouchers } from "./Vouchers";

const rel = (id: string) => <Relatorio key={id} id={id} />;

export const TELAS_RELATORIOS: Record<string, JSX.Element> = {
  "indice-relatorios": <Indice />,
  "faturamento-empresa": rel("faturamento-empresa"),
  "faturamento-centro-custo": rel("faturamento-centro-custo"),
  "faturamento-periodo": rel("faturamento-periodo"),
  "vouchers-motoristas": rel("vouchers-motoristas"),
  "os-motorista": rel("os-motorista"),
  "os-empresa": <Estatistica key="os-empresa" id="os-empresa" />,
  "os-bairro": <Estatistica key="os-bairro" id="os-bairro" />,
  "os-pagamento": <Estatistica key="os-pagamento" id="os-pagamento" />,
  "os-operador": <Estatistica key="os-operador" id="os-operador" />,
  "os-percentual-motorista": <Estatistica key="os-percentual-motorista" id="os-percentual-motorista" />,
  "km-rodados": rel("km-rodados"),
  "faixas-vouchers": <FaixasVouchers />,
  "entrega-voucher": <EntregaVoucher />,
};
