# Estado do painel igual aos originais (13/11/2026)

## O que está pronto (PR #15)
- Menu em cima, tema escuro, Indicadores e Alterar Senha.
- Cadastro, Corridas, Financeiro, Comunicação, Config, Avaliações e Ajuda: as 51 telas do menu abrem, sem "Em construção" e sem erro no console.
- Comissão da central na tela Categorias (`painel/src/config/comissao.ts`).
- Testes: 133 no painel e 73 no motor. Carga de 500 corridas com bot, totem e CRM: 0 erros.

## Revisão final (feita com o Fable, só leitura)
Não achou vazamento entre empresas. Corrigido neste PR:
1. Administrador virava dono da plataforma trocando a senha dele pela tela Equipe.
2. Operador mudava a cobrança e o financeiro do motorista.
3. Valor digitado com ponto (30.50) virava R$ 3.050 em Editar OS e Programadas.
4. Lista de cadastros com 2 ou mais registros dava erro (tela Avaliações).

## O que a revisão apontou e ainda falta (do mais para o menos importante)
- **Abonar ou baixar pendência** devolve o valor editado, não o debitado (`operacao/servico.ts`).
- **Comissão da central** nunca é debitada da carteira; os relatórios mostram receita só prevista (`config/comissao.ts`).
- **Saldo mínimo** existe em duas configurações (Regras de Crédito e gestão do motorista); só a da gestão vale no despacho.
- **Operador** ainda mexe em punições e veículos; nos cadastros genéricos isso é só de admin (`gestao/motoristas.ts`).
- **Saque:** `pedirSaque` ignora o bloqueio de saque do motorista e as regras de Integrações (`apps/extras.ts`).
- **Desafios** automáticos ignoram hora, faixa de corridas e situação definidas no painel.
- **Editar OS** finaliza ou cancela sem os efeitos da carteira e apaga a coordenada ao trocar o endereço.
- **Fila virtual** ordena pela hora em que o motorista ficou online, não por "livre desde".
- **Notificação agendada** pode sair duas vezes; **disparo para todos** segura o pedido por minutos.
- **Financeiro** soma só os 2.000 lançamentos mais recentes do período (`config/financeiro.ts`).
- **Planilhas** (Empresas, Recuperação, Histórico): injeção de fórmula em células que começam com `=`, `+`, `-` ou `@`.
- **Desempenho** com milhares de corridas: relatórios, desafios, indicações e o Monitoramento.
- **Clique duplo** em "Confirmar" de crédito do motorista lança duas vezes.
- **Segurança de conta:** trocar o e-mail sem pedir a senha atual; trocar a senha não derruba as outras sessões.
- **Sem uso ainda:** NPS dos apps, descontos automáticos no preço, vários campos de Regras de Despacho, senha de login dos apps, banners nos apps, cargos finos da Equipe.

## Como retomar
Cada item acima é pequeno e independente. Comece pelos quatro primeiros (dinheiro e permissão).
