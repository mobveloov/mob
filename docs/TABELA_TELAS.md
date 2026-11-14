# Tela por tela: referência x nosso app x situação (13/11/2026)

Referências: `docs/APPS_PRINTS_REFERENCIA.md` (P## = passageiro, M## = motorista). "Conferido" = comparei um print do nosso app com o da referência. Os prints ficam fora do Git.

## Passageiro

| Tela (referência) | Nosso app | Situação |
|---|---|---|
| Login (P30) | Topo na cor da marca com curva, botão Ajuda, cartão branco, corpo cinza, onda preta com termos | Conferido. Igual; falta só o tamanho da logo (a da UP é um texto "UP") |
| Cidade (P29/P31) | Lista com busca e botão Continuar; pula quando a empresa tem uma cidade só | Não conferido lado a lado |
| Crie sua conta (P28/P27/P25) | Cartões "Dados pessoais" e "Contato", campos preenchidos, foto, botão fixo CRIAR CONTA | Conferido. Diferença: falta "Problemas no cadastro? Fale conosco" (precisa do WhatsApp da empresa no cadastro da marca) |
| Início (P26) | Degradê da cor da marca, "Para onde você vai?" com IR, Casa/Trabalho/Recentes em cartões brancos, mapa cinza claro com ruas e nomes, menu de baixo flutuante | Conferido. Igual na estrutura |
| Menu de baixo (P26 etc.) | Início, Histórico, Carteira, Conta | Conferido. Igual |
| Para onde vamos? (P23/P17) | Partida e Destino em cartão, favoritos, Escolher no mapa, Não informar destino; sugestões de rua (CNEFE, depois OpenStreetMap) | Conferido. Igual; o aviso "CNEFE não configurada" saiu |
| Opções da corrida Agora/Agendar (P15/P11/P16/P14) | Mapa com rota pelas ruas e etiquetas, lista de categorias com − e +, pagamento, descontos, SOLICITAR | Conferido (Agora). Falta: selo de min/km no pino do destino. Agendar não conferido |
| Data e hora do agendamento (P13/P12) | Seletores de data e relógio | Não conferido lado a lado |
| Procurando (P10) | Barra, "Procurando", cronômetro, oferta atual − e +, embarque e destino, chips | Conferido. Igual na estrutura |
| Contra-oferta do motorista (P10) | Existe (contra-oferta com Aceitar/Recusar) | Não conferido |
| Acompanhar viagem (P08/P03) | Existe, com rota pelas ruas e carro | Não conferido lado a lado (precisa de motorista aceitando) |
| Motivo do cancelamento (P02) | Opções em cartões com borda e CONFIRMAR | Conferido. Igual |
| Chat (P05/P07) | Existe | Não conferido |
| Suas Viagens (P22/P24) | Título, pílulas (Todas, Finalizadas, Canceladas, Em andamento, Agendadas), vazio com ícone | Conferido. Falta "Filtrar Data" |
| Sua Carteira (P20) | Cartão preto com saldo, + Adicionar Saldo, histórico de movimentações | Conferido. Falta o botão de QR |
| Minha Conta (P21/P19) | Topo da marca, foto, nome, telefone, Editar Perfil, cartão Carteira, Financeiro, Minhas atividades, Conta | Conferido. Faltam Meus Cartões e Meus Cupons (sem pagamento por cartão ainda) |
| Editar Perfil (P18) | Foto, nome, e-mail, telefone, gênero, alterar senha, SALVAR | Conferido pela estrutura (a captura saiu em branco por causa do painel oculto) |

## Motorista

Refeito por outra sessão (commit `6377ee0` e seguintes). Conferi lado a lado, no navegador com posição simulada em Pitangueiras, as telas marcadas "Conferido"; as demais foram refeitas mas eu não as vi (a sessão que as refez atingiu o limite de uso antes de escrever a tabela dela).

| Tela (referência) | Situação |
|---|---|
| Início offline (M29) | Conferido. Botões e pílula R$ sobre o mapa, botão INICIAR amarelo, barra preta "Mapa / Você está offline / Corridas" |
| Ficar Online (M01, mesmo padrão) | Conferido. Diálogo escuro com ícone redondo, Cancelar e Iniciar |
| Início online (M04) | Conferido. Mapa escuro com nomes de ruas, "Você está online", "Procurando…", botão vermelho PARAR, Maçaneta; as opções ficam acima do mapa |
| Menu lateral (M30) | Conferido. Cartão do motorista, Operação, Conta e veículo, Suporte e sistema, Sair com versão |
| Corridas Disp./Pend./Prog. (M14) | Conferido. Três abas e "Nenhuma corrida no momento…" |
| Histórico de Viagens (M11) | Conferido. Mês, Ganhos do Mês, Viagens/Online/Em trânsito, Formas de Pagamento & Bônus |
| Login/Senha (M02/M03) | Refeito, não conferido |
| Cadastro em 5 passos (M24/M28/M22/M21/M20) | Refeito, não conferido |
| Chamada com valor líquido grande, bruto e taxa menores (cartaz) | Já existia e foi mantida; não reconferida |
| Em corrida (P09/P04/P01) | Rota pelas ruas no mapa; layout não conferido |
| Chat (P06), Maçaneta (M12) | Refeitos, não conferidos |
| Meus veículos (M26), Meu Cadastro (M25), Preferências (M05/M06), Notificações (M09), Fale Conosco (M13), Configurações (M16/M15), Diagnóstico (M23/M18), Chat de suporte (M19) | Refeitos, não conferidos |

## Rota, mapa e endereços (pedidos do usuário)

| Pedido | Situação |
|---|---|
| Trajeto pelas ruas, não em linha reta | Feito e conferido no navegador (Pitangueiras): a linha segue as ruas; o app não desenha reta |
| Preço pela distância e tempo por rua | Feito (o servidor usa o OSRM); OSRM público só para teste, próprio em produção |
| Mapa claro com ruas e nomes | Feito nos dois apps |
| Mapa não fica por cima das opções (motorista) | Corrigido e conferido no navegador (início offline e online); falta ver no aparelho |
| Endereços no destino | Feito: CNEFE primeiro, OpenStreetMap quando não acha |
