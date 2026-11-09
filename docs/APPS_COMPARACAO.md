# Apps: comparação com os apps de referência (Sistema B)

A lista completa de funções dos apps de referência está em [APPS_FUNCOES.md](APPS_FUNCOES.md). Ela foi levantada só pela leitura dos dois APKs, sem copiar código, marca ou textos.

Esta tabela mostra o que existe agora nos nossos apps. Legenda: **sim** = funciona e tem teste; **—** = ficou de fora (o motivo está na última coluna).

## App do passageiro

| Função | Referência | Nós | Observação |
|---|---|---|---|
| Entrar pelo telefone com código | sim | sim | O código vai pelo WhatsApp da empresa. |
| Nome, e-mail e perfil | sim | sim | Conta → perfil. |
| Mapa com embarque, paradas e destino | sim | sim | Leaflet + OpenStreetMap, sem chave. Dá para tocar no mapa para marcar o ponto. |
| Buscar endereço | sim | sim | Base de endereços do IBGE (CNEFE). |
| Paradas no caminho | sim | sim | Até 3. Entram no preço pela rota. |
| Corrida agendada | sim | sim | De 15 minutos a 30 dias. Aba "Agendadas", com cancelar. |
| Categoria com preço antes de pedir | sim | sim | |
| Formas de pagamento | sim | sim | Dinheiro, Pix, cartão na maquininha e saldo da carteira. |
| Carteira (saldo e extrato) | sim | sim | A central lança a recarga recebida. |
| Recarga por Pix gerado no app | sim | — | Precisa de conta num serviço de pagamento (gateway). |
| Pagar com cartão salvo no app | sim | — | Precisa de gateway. |
| Cupom | sim | sim | |
| Motorista a caminho no mapa (ao vivo) | sim | sim | O carro anda no mapa. |
| Chat com texto e áudio | sim | sim | |
| Ligar para o motorista | sim | sim | |
| Compartilhar a viagem | sim | sim | Link público que mostra só o essencial e para de valer 2 horas depois do fim. |
| Cancelar e taxa de cancelamento | sim | sim | A taxa é por categoria, com tolerância em minutos, e vai para o motorista. |
| Nota com comentário | sim | sim | |
| Reclamar ou contestar o valor | sim | sim | Vira uma ocorrência no painel. |
| Objeto esquecido | sim | sim | Vira um registro em Objetos perdidos. |
| Motoristas favoritos e bloqueados | sim | sim | O favorito recebe a corrida primeiro. O bloqueado não recebe mais. |
| Histórico com detalhe | sim | sim | |
| Indicação (código e prêmio) | sim | sim | O prêmio entra na carteira. |
| Notificações | sim | sim | Avisos da central (painel → Notificações do app). |
| SOS | — | sim | |
| Lances de preço dos motoristas | sim | — | Não é o nosso modelo: o preço vem da tarifa. |

## App do motorista

| Função | Referência | Nós | Observação |
|---|---|---|---|
| Entrar pelo telefone com código | sim | sim | Só entra motorista Ativo no cadastro. |
| Mapa (posição, chamada e corrida) | sim | sim | Leaflet + OpenStreetMap. O trajeto pelas ruas fica com o app de navegação. |
| Ficar online e offline e GPS em segundo plano | sim | sim | |
| Receber chamada (som) e aceitar ou recusar | sim | sim | Paradas e horário agendado já aparecem na chamada. |
| Chamada por cima de outros apps | sim | — | Precisa de um recurso nativo do Android (permissão de sobreposição). Fica para depois. |
| Navegar até o embarque, cada parada e o destino | sim | sim | Abre o app de mapas do aparelho. |
| Cheguei, iniciar, sair da parada e finalizar | sim | sim | |
| Chat com texto e áudio, com "Ouvir" (ler em voz alta) | sim | sim | |
| Nota para o passageiro | sim | sim | |
| Bloquear passageiro | sim | sim | |
| Objeto encontrado e reportar problema | sim | sim | |
| Ganhos e histórico | sim | sim | |
| Carteira, extrato e saque por Pix | sim | sim | A central paga o Pix e marca como pago, ou recusa e o valor volta para o motorista. |
| Conectar conta de pagamento | sim | — | Precisa de gateway. |
| Documentos (CNH, documento do veículo, foto) | sim | sim | Foto ou PDF. A central aprova ou recusa com motivo. |
| Preferências de corrida (categorias) | sim | sim | |
| Desafios e indicações | sim | sim | Barra de progresso. O prêmio entra na carteira uma vez. |
| Notificações | sim | sim | |
| SOS | sim | sim | |
| Fila de corridas (aceitar a próxima durante uma corrida) | sim | — | Decisão do nosso despacho: um motorista em corrida não recebe outra. |

## Painel (para as funções novas)

- **Carteiras, saques e recargas:** saldos, extrato, lançamento da central e saques.
- **Documentos dos motoristas:** abrir, aprovar e recusar.
- **Notificações do app:** avisos para passageiros, motoristas ou todos.
- **Categorias e tarifas:** campos novos de taxa de cancelamento e de tolerância.

## Testes

- `painel/test/apps-extras.test.ts` tem 10 testes com tudo acima pelo servidor: paradas, agendamento, favoritos e bloqueios, preferências, carteira, taxa, saque, documentos, desafios, indicação, notificações, objeto, reclamação, nota do passageiro e link de compartilhar.
- **Pelo navegador:** as telas dos dois apps foram usadas com o servidor de teste, do login até a nota.
- **Carga:** 500 corridas ao mesmo tempo, com bot, totem e CRM. Resultado: 0 problemas na conferência, 500 corridas pedidas em 5 s e todas completas em 39 s.
