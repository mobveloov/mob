// Telas de Relatórios e Vouchers no formato da Machine. Cada chave é o id do menu (src/comum/funcoes.ts).
import type { JSX } from "react";
import Indice from "./Indice";
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
  "os-empresa": rel("os-empresa"),
  "os-bairro": rel("os-bairro"),
  "os-pagamento": rel("os-pagamento"),
  "os-operador": rel("os-operador"),
  "os-percentual-motorista": rel("os-percentual-motorista"),
  "km-rodados": rel("km-rodados"),
  "faixas-vouchers": <FaixasVouchers />,
  "entrega-voucher": <EntregaVoucher />,
};
