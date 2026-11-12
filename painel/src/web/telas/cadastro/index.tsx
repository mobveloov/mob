// Telas do grupo Cadastro, por chave de função (o menu e as rotas ficam em App.tsx).

import Areas from "./Areas";
import Cupons from "./Cupons";
import Desafios from "./Desafios";
import Destravar from "./Destravar";
import Empresas from "./Empresas";
import Equipe from "./Equipe";
import Indicacoes from "./Indicacoes";
import Motoristas from "./Motoristas";
import Passageiros from "./Passageiros";
import Punicoes from "./Punicoes";
import Veiculos from "./Veiculos";

export const TELAS_CADASTRO: Record<string, JSX.Element> = {
  motoristas: <Motoristas />,
  destravar: <Destravar />,
  passageiros: <Passageiros />,
  veiculos: <Veiculos />,
  equipe: <Equipe />,
  cupons: <Cupons />,
  empresas: <Empresas />,
  areas: <Areas />,
  punicoes: <Punicoes />,
  desafios: <Desafios />,
  indicacoes: <Indicacoes />,
};
