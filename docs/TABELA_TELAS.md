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

Refeito por outra sessão (commit `6377ee0` e seguintes). Conferi lado a lado, no navegador com posição simulada em Pitangueiras, as telas marcadas "Conferido"; as demais precisam de uma corrida em andamento ou ainda não foram vistas.

| Tela (referência) | Situação |
|---|---|
| Início offline (M29) | Conferido. Botões e pílula R$ sobre o mapa, botão INICIAR amarelo, barra preta "Mapa / Você está offline / Corridas" |
| Ficar Online (M01, mesmo padrão) | Conferido. Diálogo escuro com ícone redondo, Cancelar e Iniciar |
| Início online (M04) | Conferido. Mapa escuro com nomes de ruas, "Você está online", "Procurando…", botão vermelho PARAR, Maçaneta; as opções ficam acima do mapa |
| Menu lateral (M30) | Conferido. Cartão do motorista, Operação, Conta e veículo, Suporte e sistema, Sair com versão |
| Corridas Disp./Pend./Prog. (M14) | Conferido. Três abas e "Nenhuma corrida no momento…" |
| Histórico de Viagens (M11) | Conferido. Mês, Ganhos do Mês, Viagens/Online/Em trânsito, Formas de Pagamento & Bônus |
| Login (M02) | Conferido. Topo da marca com logo redonda, "PARCEIRO / MOTORISTA", cartão "Acesse sua conta", onda preta com "FAZER CADASTRO" |
| Cadastro, passo 1 "Dados Pessoais 1/5" (M24) | Conferido. Cabeçalho da marca com contador 1/5 e campos preenchidos. Passos 2 a 5 (Foto, Endereço, Veículo, Documentos): não conferidos |
| Meu Cadastro (M25) | Conferido. Cartões Dados Pessoais, Foto do Rosto, Endereço, Veículo, Documentos, com aviso do que falta |
| Meus veículos (M26) | Conferido. Cartão do veículo com placa Mercosul, ATIVO, Aprovado, Editar e Excluir, botão + |
| Preferências (M05/M06) | Conferido. Formas de pagamento, Categorias, Filtros e exigências, SALVAR PREFERÊNCIAS |
| Notificações (M09) | Conferido. "Sem notificações" |
| Maçaneta (M12) | Conferido. Taxímetro Livre / Com Destino, ponto de embarque por GPS, INICIAR CORRIDA NO TAXÍMETRO |
| Fale Conosco (M13) | Conferido na estrutura. Sem contatos porque a UP ainda não cadastrou WhatsApp, telefone e site (dado, não tela) |
| Configurações (M15/M16) | Conferido. Interface e tema, Alertas e notificações, Áudio, com ícone flutuante e vibrar |
| Diagnóstico (M18) | Conferido. Os mesmos 7 itens, com situação |
| Chat com suporte (M19) | Conferido. Cabeçalho Suporte Central, respostas rápidas e microfone |
| Senha / Bem-vindo (M03) | Refeito, não conferido |
| Chamada com valor líquido grande, bruto e taxa menores (cartaz) | Já existia e foi mantida; não reconferida |
| Em corrida (P09/P04/P01), chat da corrida (P06) | Rota pelas ruas no mapa; layout não conferido (precisa de uma corrida em andamento) |

Diferença conhecida: o menu lateral da referência (M27) tem também "Termos de uso" e "Política de privacidade"; o nosso ainda não.

## Rota, mapa e endereços (pedidos do usuário)

| Pedido | Situação |
|---|---|
| Trajeto pelas ruas, não em linha reta | Feito e conferido no navegador (Pitangueiras): a linha segue as ruas; o app não desenha reta |
| Preço pela distância e tempo por rua | Feito (o servidor usa o OSRM); OSRM público só para teste, próprio em produção |
| Mapa claro com ruas e nomes | Feito nos dois apps |
| Mapa não fica por cima das opções (motorista) | Corrigido e conferido no navegador (início offline e online); falta ver no aparelho |
| Endereços no destino | Feito: CNEFE primeiro, OpenStreetMap quando não acha |
