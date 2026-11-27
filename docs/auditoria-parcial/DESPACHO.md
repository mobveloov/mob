# Despacho: o número de motoristas segue 100% o painel

## O que mudou
- `CARROS_SIMULTANEOS = 3` removido. "Enviar mais de um carro" usa o Limite de motoristas do Despacho (0 = todos).
- 0 = ilimitado em: Limite de motoristas, Raio inicial, e em cada etapa (motoristas, raio, tempo). Servidor e telas aceitam 0.
- Novo modelo de **etapas** (`config/despacho.ts`, por empresa, sem limite de quantidade; teto técnico de 500 só para proteger o armazenamento). Campos: motoristas ao mesmo tempo, raio (km), tempo na tela (s), inclui secundários, inclui transbordo. Tela Despacho: botão "+ Adicionar etapa", remover, subir/descer.
- `despachar` percorre as etapas na ordem (uma por rodada; a última se repete). Etapa sem ninguém no raio dela conta como tentada e passa para a próxima. Salvar etapas sobe "Máx. Tentativas" até o número de etapas.
- Removidos números fixos: variáveis `APPS_RAIO_KM` / `APPS_OFERTA_SEGUNDOS` (raio 20 km e 20 s) em `apps/despacho.ts` e `operacao/servico.ts`; agora valem Raio Inicial e Tempo na Tela do painel. Listas do app do motorista: Disponíveis usam o Raio; Pendentes/Programadas usam "distância para listar" e aceitar pendência usa "distância limite" (Alterando Bandeira), antes ignoradas.
- Migração: config antiga (`prioritarios/secundarios/reserva`) vira 3 etapas com as mesmas quantidades; raio, limite e tentativas ficam iguais. A entrada antiga na API também funciona.
- Os "disparos" da tela Alterando Bandeira (config/bandeira.ts) são a mesma lista de etapas (uma só gravação). Sem teto de 6 disparos, 20 motoristas ou 50 km. Gerais › Despacho e a tela Despacho ganharam "+ Adicionar disparo".

## Sobre a Machine
Nos HTMLs salvos ("Alterando Bandeira", "Despacho") só há o seletor 1 a 6 de tentativas e, por disparo: motoristas simultâneos, distância, inclui secundários, inclui transbordo. Não existe botão "+" nos arquivos salvos; a lista com "+" foi feita conforme o pedido do dono, com os mesmos campos (mais "tempo"). Por filial: a Machine não tem, então fica só por empresa. Não implementado: "eleição" e tipos Ponto de apoio/Área (ficam gravados, o despacho segue o Método das Regras).

## Testes (rodados)
- `test/despacho-etapas.test.ts`: 8 de 8. 12 online, ilimitado: 12 recebem; limite 5: 5; mais próximo: 1; etapa com 4: 4; "mais de um carro" ilimitado: 12, limite 4: 4; 6 etapas (1,2,1,3,2,1) percorridas em ordem, 10 motoristas sem repetir; etapa fora do raio passa para a próxima; migração da config antiga.
- Existentes: apps-despacho 10/10, despacho-varios-carros 3/3, grupo-c-config 4/4, bandeira-campos 6/6, corrida-registro 4/4, config-financeiro 13/13 (1 falha intermitente em uma rodada, passou na seguinte). apps-painel 20/21: a falha é "cupom novo aparece" (Cupons, de outro grupo, não do despacho). `tsc --noEmit` sem erros.
- Testes ajustados: despacho-varios-carros (sem constante) e grupo-c-config (sem tetos 6/20/50).

## Tela
Prova no navegador (portas 8805/5205): Configurações › Despacho mostra "Etapas do Despacho (Ciclos)" com tabela (Etapa, Motoristas ao mesmo tempo, Raio, Tempo, Secundários, Transbordo, ações) e "+ Adicionar etapa". Cliquei "+" duas vezes (3 para 5 etapas), salvei: a API devolveu 5 etapas e Máx. Tentativas 5.
