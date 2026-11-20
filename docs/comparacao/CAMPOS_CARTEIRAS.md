# Campos: Carteiras de crédito

Referência: página salva da Machine "Carteiras de crédito" (Configurações). Era ela que o dono dizia estar sem a opção.

**O que faltava:** a tela Configurações > Carteiras de crédito (id `carteiras-credito`) abria a mesma lista de carteiras do Financeiro (id `carteiras`). Não existia nenhuma das opções de configuração: saldo mínimo, mensagens de recarga, movimentações do app (Recarga, Saque, Pix, Saque automático, Presencial, Telefone), repasse imediato da taxa de cancelamento e recarga pelo passageiro. Agora a tela é a da Machine e cada opção grava no servidor e vale no app.

Onde cada opção é guardada (uma fonte só, que o despacho e o app já liam):

- Saldo mínimo e mensagem de recarga: `gestao/regras` (padrão da empresa; é o mesmo "padrão da bandeira" da janela do motorista).
- Recarga, valor mínimo de recarga, Saque e recarga do passageiro: `config/pagamentos` (a Integrações > Pagamentos lê os mesmos números).
- Pix, Saque automático, Presencial, Telefone, Repasse e os valores lembrados: `config/carteiras-credito.json` (novo).
- Rotas: `GET/PUT /api/config/carteiras-credito` (gestor lê, administrador grava).

## Configurações > Carteiras de crédito

| Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Carteiras de crédito > (tela inteira) | não (abria a lista de carteiras) | sim | tela nova `ConfigCarteirasCredito.tsx` |
| > Seção "Para motoristas" (recolhível na Machine) | não | sim | seção com título |
| > Aviso "Se quiser, você pode definir exceções alterando as configurações de crédito de um motorista específico." | não | sim | texto igual |
| > Personalizações > Ativar saldo mínimo (Não / Sim) | não | sim | rádio; Sim grava `saldoMinimo`, Não grava vazio (sem bloqueio) |
| > Personalizações > Texto "Evite que motoristas atuem com o saldo negativo..." | não | sim | texto igual |
| > Personalizações > "O saldo mínimo de créditos para receber corridas é de: R$" | não | sim | campo numérico, aceita negativo; fica desligado quando Não; o valor é lembrado |
| > Personalizações > Ativar mensagens de recarga (Não / Sim) | não | sim | rádio; grava `avisoRecarga` |
| > Personalizações > "Enviar mensagem quando a carteira de créditos do motorista atingir: R$" | não | sim | campo numérico; o app mostra o aviso de saldo baixo |
| > Movimentações disponíveis no aplicativo > Entrada e saída de créditos > Recarga (caixa) | não | sim | grava `pagamentos.recarga.motorista`; o app esconde "Adicionar" se desmarcado |
| > Movimentações > Saque (caixa) | não | sim | grava `pagamentos.saque.ativo`; o app esconde "Retirar" e o servidor recusa o saque |
| > Movimentações > "Métodos disponíveis para recarga e/ou saque:" PIX (caixa) | não | sim | grava `pix` |
| > Movimentações > Aviso "O valor das recargas é transferido diariamente..." | não | sim | texto igual |
| > Movimentações > Texto "Para ativar a recarga automática via Pix..." + link "Faça o cadastro na integração." | não | sim | texto igual; o link leva a Pix (transações financeiras) |
| > Movimentações > "Valor mínimo para recarga" (R$ 20,00) | não | sim | aparece com PIX marcado; grava `pagamentos.recarga.minimoMotorista`; o app usa este mínimo |
| > Movimentações > Saque automático via PIX (caixa) | não | sim (só a opção, ver abaixo) | grava `saqueAutomaticoPix` |
| > Movimentações > Texto "Para ativar o saque automático via Pix..." + link | não | sim | link leva a Integrações |
| > Movimentações > Presencial (caixa) | não | sim | grava `presencial`; o app avisa que pode ser na central |
| > Movimentações > "Telefone para o motorista realizar a recarga ou o saque" (caixa) | não | sim | grava `telefoneAtivo`; ao marcar, aparece o campo Telefone (obrigatório, mínimo 8 dígitos) |
| > Repasse imediato da taxa de cancelamento (caixa) + texto "O motorista recebe no ato..." | não | sim (só a opção, ver abaixo) | grava `repasseTaxaCancelamento` |
| > Seção "Para passageiros" > Permitir recarga de créditos pelo passageiro via app (Não / Sim) + texto | não | sim | grava `pagamentos.recarga.passageiro` |
| > Botão Salvar | não | sim | grava tudo de uma vez; só administrador; mensagem "Configuração salva." |
| > Botão Voltar | não | sim (menu lateral) | a Machine volta ao início; aqui o menu lateral cumpre o papel |
| App do motorista > Carteira > botões Adicionar / Retirar | sim | sim | passam a respeitar Recarga e Saque |
| App do motorista > Carteira > aviso de saldo baixo, telefone, presencial | não | sim | `/api/apps/<empresa>/carteira` devolve `movimentos` e `avisoRecarga` |

## Financeiro > Créditos > Carteiras de crédito (id `carteiras`)

Não há página salva da Machine para esta tela (só existe a de Configurações); ela ficou como estava: lista de motoristas e passageiros com busca, filtro de status, detalhe com saldo, entradas, saídas, período, últimas transações e as janelas Adicionar e Retirar (motivo e valor).

## Conferido no navegador

Conferido no navegador (Chromium automatizado, painel de teste na porta 8902): tela abre com todos os textos acima, alterei saldo mínimo, Recarga, Presencial, Telefone e recarga do passageiro, salvei, recarreguei a página e os valores voltaram do servidor; `GET /api/config/carteiras-credito` e `GET /api/gestao/config-creditos` mostram o mesmo saldo mínimo. Sem erro no console.

## Não consegui igualar

- **Saque automático via PIX:** a opção existe e é gravada, mas o pagamento automático depende da integração com o banco (credenciais da central). Sem ela o saque continua sendo pedido e pago pela central.
- **Recarga automática via PIX (repasse diário):** depende do cadastro na integração de transações financeiras; a opção só controla o que o app mostra.
- **Repasse imediato da taxa de cancelamento:** a opção é gravada, mas hoje o servidor já credita a taxa ao motorista no ato do cancelamento (e debita a carteira do passageiro). Por isso o padrão é marcado; desmarcar ainda não adia o repasse.
- **Campo "Presencial" (conteúdo):** na página salva o bloco abaixo de Presencial está vazio (era preenchido por script que não foi salvo), então ficou só a caixa.
- **Padrões:** a Machine mostra Sim com -10,00 e 5,00 por padrão; aqui o padrão continua "Não" (sem bloqueio), para não mudar o despacho de quem já usa.
