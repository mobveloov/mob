# Grupo D, segunda passada (nível de campo): Áreas, Plantão, Ruas, Mapa de engajamento, Desafios, NPS, Notificações

Fonte: páginas salvas da Machine (nomes "Leme - ..." e as páginas "Mapa de engajamento", "Ruas", "NPS Avaliacao"), lidas por inteiro (rótulos, campos, opções, botões, textos). Nosso painel conferido no navegador logado (servidor de teste, banco temporário), lendo o texto de cada tela.
Formato: `Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei`.

## Áreas
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Áreas > Título "Áreas" e texto "As áreas são delimitações geográficas..." | sim | sim | nada |
| Áreas > Botões "Criar Área" e "Visão Geral" | sim | sim | nada |
| Áreas > Filtros > Nome (100), Filtrar, Limpar filtros | sim | sim | nada |
| Áreas > Lista > coluna Nome (ordenável), editar, excluir, "Nenhum resultado encontrado." | sim | sim | nada |
| Áreas > Aviso amarelo "As alterações neste módulo não terão efeito por causa das configurações atuais da sua bandeira." | não | não | ver "Não consegui igualar" |
| Criando Área > abre como página (não janela) | não (era janela) | sim | agora é uma página; "Voltar" volta à lista |
| Criando Área > "Campos com * são obrigatórios." e faixa "Clique na área para entrar ou sair do modo de edição." | sim | sim | nada |
| Criando Área > Nome * (texto, 40) | sim | sim | nada |
| Criando Área > Prioridade * (número 1 a 5, padrão 1) | sim | sim | nada |
| Criando Área > Área Delimitada: 8 cores (Vermelho, Amarelo, Azul, Verde, Laranja, Roxo, Rosa, Cinza) | sim | sim | nada |
| Criando Área > mapa: pontos do contorno | parcial | sim | pontos agora se arrastam e o botão direito remove (antes só dava para desfazer o último) |
| Criando Área > Área de risco/bloqueio: texto e chave "Bloquear solicitações nesta área" (Desativado/Ativado) | sim | sim | nada (os horários do bloqueio são nossos, a Machine não mostra) |
| Criando Área > Voltar / Criar | sim | sim | nada |
| Visão Geral > Mapa / Satélite, Voltar, Gravar | sim | sim | nada |

## Plantão
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Plantão > texto "Funcionalidade para cobrir horários..." e botão "Criar Plantão" | sim | sim | nada |
| Plantão > Filtros > Data Inicial, Hora Inicial, Data Final, Hora Final, Filtrar, Limpar filtros | sim | sim | nada |
| Plantão > Lista > colunas Motoristas, Data Hora Inicial, Data Hora Final (com segundos) | sim | sim | nada |
| Plantão > Lista > ordenar clicando em Data Hora Inicial e Data Hora Final | não | sim | cabeçalhos clicáveis (▲/▼) |
| Plantão > Lista > "Exibindo 1-N de N resultados." e páginas | parcial | sim | texto conta a página; páginas de 10 com ← 1 2 → |
| Plantão > Lista > ações Gerenciar, Editar, Excluir | sim | sim | nada |
| Criando Plantão > página (não janela) | não | sim | agora é página |
| Criando Plantão > Data Inicial *, Hora Inicial, Data Final *, Hora Final, Voltar, Criar | sim | sim | nada |
| Gerenciar Plantão > página (não janela) | não | sim | agora é página |
| Gerenciar Plantão > Data/Hora Inicial e Final só para ler | sim | sim | nada |
| Gerenciar Plantão > Vtr / Motorista (busca, 50) e "Adicionar Motorista" | sim | sim | nada |
| Gerenciar Plantão > botão "Voltar" ao lado de "Adicionar Motorista" | não (ficava no rodapé) | sim | movido |
| Gerenciar Plantão > tabela Vtr, Motorista, Telefone, remover | sim | sim | nada |

## Ruas
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Ruas > Tela com "Nova regra" no topo da lista à esquerda e cartão à direita | não (tabela) | sim | refeita em dois painéis |
| Ruas > Cartão "Criando nova regra" + texto "Criar uma regra corrige o nome de exibição..." | parcial | sim | texto igual |
| Ruas > Mapa: "1 Clique no mapa para desenhar o traçado da via." e "2 Arraste um ponto para ajustar; clique com o botão direito para remover." | não | sim | textos e arrastar/remover pontos |
| Ruas > Rua: (texto, 50, obrigatório, "Digite o nome da rua") | parcial (era "Nome de exibição", 80) | sim | campo e limite iguais |
| Ruas > Bairro de exibição: (texto, 50, obrigatório, "Digite o bairro de exibição") | não | sim | campo novo; o servidor guarda e aplica o bairro nos endereços dentro do traçado |
| Ruas > CEP: (máscara 00000-000, 9, obrigatório) | não | sim | campo novo, com máscara; servidor valida 8 números e aplica o CEP |
| Ruas > Botões "Salvar nova regra", "Desistir" | não | sim | novos (ficam desligados até preencher tudo e ter 3 pontos) |
| Ruas > Regra existente: ver, editar (ícone), salvar, excluir | parcial | sim | lista à esquerda; editar/salvar/excluir no cartão |
| Ruas > Janela de excluir (modal-excluir) | não | sim | confirmação com o nome da regra |
| Ruas > Janela "confirmar sobrescrita" | não | sim | aviso quando o traçado cruza outra regra; vale a mais nova |
| Ruas > "Nome no mapa" e "Situação" (ativa/desligada) | sim (nossos) | extra | saíram do formulário (a Machine não tem); o servidor mantém os dois, regras antigas continuam valendo |
| Ruas > "O que são regras de via?" (tela sem regras) | sim | não | o cartão de criação já abre direto, como na página completa da Machine |

## Mapa de engajamento (20 páginas conferidas)
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Abas Motoristas, Passageiros, Histórico (na ordem) | sim | sim | nada |
| Contagem "43 Motoristas" / "6.172 Passageiros" | sim | sim | nada |
| Filtro de situação (Ativos 11%, Suspensos, Em análise, Fila de espera, Rejeitados, Inativos; Todos, Limpar, Aplicar) | sim | sim | nada |
| Filtro "Todas as categorias" (caixas, Todas, Limpar, Aplicar) | sim | sim | nada |
| Motoristas > Tempo online, Hora trabalhada, Corridas, Ausência, Frequência de trabalho, Avaliações, Tempo de casa (ordem, ícone, selo e percentual) | sim | sim | nada |
| Passageiros > Solicitações, Frequência de uso, Cancelamento, Estimativas, Avaliações, Tempo de casa | sim | sim | nada |
| Cada indicador > "Como os X se distribuem", régua com 2 marcas, "O que este número significa" (textos) | sim | sim | nada |
| Cada indicador > três cartões (nome e limite, Ações, número, "% do total", "N conectados N desconectados" só motoristas) | sim | sim | nada |
| Menu Ações (motoristas) > Ver motoristas, Lançar desafio, Enviar notificação, Enviar mensagem, Alterar status | sim | sim | nada |
| Menu Ações (motoristas) > **Punir** (vermelho) | não | sim | item novo: janela com Tempo, Unidade (Minutos, Horas, Dias) e Motivo; pune todos da faixa (só administrador); vai para o Histórico |
| Menu Ações (passageiros) > Ver passageiros, Enviar cupom, Enviar notificação | sim | sim | nada |
| Janela Ajustar faixas > Período (7/15/30/90 dias, Personalizado; semanas nos de frequência; sem período nos de data/nota), "Como dividir em faixas", campos "X até", "Y até", "Z acima de" (não editável), Cancelar, Aplicar | sim | sim | nada |
| Janelas de crédito, mensagem, notificação, status e punição | parcial | parcial | o conteúdo delas não vem na página salva (carregado por script); mantivemos as nossas e acrescentei a de punição |

## Desafios
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Desafios > Título, botão verde "Novo desafio", abas Motoristas e Clientes | sim | sim | nada |
| Desafios > Tela vazia ("Comece a criar desafios agora mesmo") | sim | sim | nada |
| Desafios > Barra: Período (Hoje, Semana passada, Mês passado, Últimos 7 dias, Últimos 30 dias, Personalizado), Status (Todos, Ativos, Aguardando, Cancelados, Finalizados), Tipo do desafio, "Buscar desafio" | sim | sim | nada |
| Desafios > Tipo do desafio > opções | parcial | parcial | agora "Corridas finalizadas" e "Corridas pendentes finalizadas" (nomes da Machine) + "Corridas maçaneta" (nossa); faltam "Sequência diária de corridas" e "Desafio progressivo" |
| Desafios > Cartões (nome, "N corridas | 18 Out - 18 Out", situação, 4 números) e páginas « 1 2 » | sim | sim | nada |
| Desafios > Aba Clientes | não | não | ver "Não consegui igualar" |
| Novo desafio > Passo 1 "Configurações do desafio": Nome * (30), Data/Hora de início *, Data/Hora final *, Meta de corridas finalizadas * (4 números, "Ex: 10") | parcial | sim | meta com 4 números; hora agora obrigatória (antes vinha 00:00/23:59) |
| Novo desafio > Passo 1 > Tipo de recompensa * (Em créditos / Personalizada) | não | sim | novo; o servidor guarda |
| Novo desafio > Passo 1 > Recompensa em créditos * ("R$ 0,00") ou Descrição da recompensa * (100) | parcial | sim | descrição nova; no cartão do desafio aparece "Recompensa" com a descrição |
| Novo desafio > Passo 1 > Aprovação da recompensa * (Automático/Manual) | sim | sim | nada |
| Novo desafio > Passo 2 "Quem vai receber o desafio?": rádio "Selecionar todos" / "Filtrar por corridas finalizadas" | não | sim | novo |
| Novo desafio > Passo 2 > "entre [Ex: 10*] e [Ex: 100*] corridas" + período (Ontem, Esta semana, Semana passada, Este mês, Mês passado, Personalizado) | parcial | sim | período novo; o servidor conta as corridas só dentro dele |
| Novo desafio > Passo 2 > Categorias do motorista | sim (nossa) | extra | mantida |
| Novo desafio > Passo 3 "Confirmar novo desafio:": Desafiados ("Todos" ou número), Recompensa, aviso sobre a carteira de créditos, Voltar, "Lançar desafio" | parcial | sim | "Todos" quando sem filtro; aviso muda com Automático/Manual |
| Detalhes do desafio (janela, abas Configurações e Relatório) | sim (nossa) | extra | nada (a Machine não tem página salva) |

## NPS (Net Promoter Score)
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| NPS > Abas Passageiros, Motoristas | sim | sim | nada |
| NPS > Período (Hoje, Semana passada, Mês passado, Últimos 7 dias, Últimos 30 dias, Personalizado) e Tipo (Tudo, Promotores, Neutros, Detratores) | sim | sim | nada |
| NPS > Passageiros > "Mais filtros" (Filtro de pesquisa: Período, Tipo, Email, Telefone, Filtrar, Limpar filtros, Cancelar) | sim | sim | nada |
| NPS > Motoristas > "Buscar Motorista" (mín. 2 letras) no lugar de "Mais filtros" | não | sim | campo novo, filtra pelo nome (servidor também) |
| NPS > Exportar | sim | parcial | baixa CSV; a Machine abre uma lista de formatos que não vem na página salva |
| NPS > "Filtrando por Período: ... até ..." com X | sim | sim | nada |
| NPS > Cartões Total avaliações, Promotores, Neutros, Detratores | sim | sim | nada |
| NPS > Lista por dia ("Terça-Feira, 03/11/2026"), nota, hora, nome, classe | parcial | sim | nota agora de 0 a 10 (estrelas x 2: 5 estrelas = 10 promotor, 4 = 8 neutro, até 3 = 6 detrator, mesma divisão da Machine) |
| NPS > Clicar numa avaliação abre o detalhe | não | sim | cartão com nome, nota, classe, data, telefone, e-mail e comentário |
| NPS > Sem resultado: "Não encontramos nenhum resultado para a sua pesquisa." + "Editar filtro" + "Limpar filtro" | não | sim | texto e botões novos |
| NPS > Páginas « 1 » sempre visíveis | não | sim | passa a mostrar mesmo com 1 página |
| NPS > "O que é NPS?" + "Saiba mais" | sim | sim | texto explica a nota de 0 a 10 |
| NPS > Cartão "Nota NPS", "Recusaram avaliar", abas Contestações e Denúncias, Resetar Recusas | sim (88) | extra | mantidos |
| Configurações NPS > "NPS para passageiros" / "NPS para motoristas", Ativar/Desativar, "Saiba mais", Voltar, Gravar | sim | sim | nada |

## Notificações app
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Notificações app > texto e botão "Nova notificação" | sim | sim | nada |
| Notificações app > Filtros > Destinatário (Todos, Clientes App, Motoristas), Data inicial, Data final | sim | sim | nada |
| Notificações app > Filtros > Título (40) | parcial (80) | sim | limite 40 |
| Notificações app > Filtros > Mensagem (caixa de texto, 255) | parcial (linha, 200) | sim | caixa de texto de 255 |
| Notificações app > Colunas Data criação, Destinatário, Título, Mensagem, Status do envio, Data do envio, ⋮ | sim | sim | nada |
| Notificações app > Ordenar clicando nos cabeçalhos | não | sim | todas as 6 colunas (servidor ordena) |
| Notificações app > Status "Concluído" e envios agendados (Data do envio = data marcada) | parcial | sim | envios únicos agendados aparecem como "Agendada" |
| Notificações app > Menu ⋮ | parcial | sim | "Ver detalhes" e, nas agendadas, "Cancelar envio" |
| Notificações app > "Exibindo 1-10 de N resultados." e ← 1 2 3 → | sim | sim | setas sempre visíveis |
| Criando Notificação > Para agora / Agendar; Data e hora de envio * e aviso do fuso | sim | sim | nada |
| Criando Notificação > Título (Opcional) 0/40 e texto das versões; Mensagem * 0/255 | sim | sim | nada |
| Criando Notificação > Destinatário * (Selecione, Clientes App, Motoristas); Filtros (5 "Adicionar filtro por ...") | sim | sim | nada |
| Criando Notificação > Botão final | parcial | sim | "Avançar" (para agora) abre a confirmação com quem recebe (total e nomes); "Agendar notificação" (agendar) |
| Criando Notificação > Janela de confirmação de destinatários | não | sim | nova (servidor devolve total e os primeiros 50 nomes) |
| Notificações > tela única ("Nova notificação" + abas do 88) | duplicava títulos | sim | "Nova notificação" abre só "Criando Notificação"; o agendamento inteligente do 88 virou botão à parte |

## Funil de Clientes, Mapa de Bairros e Estatística por bairro
Não há página salva do Funil de Clientes nem do Mapa de Bairros: nada a comparar, telas mantidas. A "Estatística por bairro" (relatório com Data inicial/final, Bairro, Cidade, Partidas, Porcentagem, Imprimir) é do grupo de relatórios, não foi mexida aqui.

## Não consegui igualar
- **Aviso amarelo da bandeira em Áreas**: aparece na Machine quando a central está sob uma bandeira/matriz; a página salva não mostra a regra que o liga. Nosso painel não tem essa relação de bandeira que desabilite Áreas.
- **Mapa do Google** (Áreas, Visão Geral, Ruas): precisa de chave do Google Maps; seguimos com OpenStreetMap.
- **Desafios para Clientes** (aba Clientes e o passo "Clientes desafiados"): precisa de regra nova (contar corridas do passageiro e depositar crédito na carteira) e de ajuste nos apps; não feito. A aba continua com o aviso.
- **Tipos "Sequência diária de corridas" e "Desafio progressivo"**: sem regra no servidor de desafios.
- **NPS 0 a 10 de verdade**: os apps pedem estrelas (1 a 5); o painel mostra x 2. Trocar a pergunta nos apps depende de nova versão dos apps.
- **Exportar do NPS**: lista de formatos não vem na página salva.
- **Janelas do Mapa de engajamento** (crédito, mensagem, notificação, status): conteúdo carregado por script, não está na página salva.
- **Cupom e desafio disparados pelo Mapa de engajamento** só avisam; não criam o cupom/desafio.

## Conferido no navegador (servidor de teste, porta própria, texto de cada tela)
Áreas (lista, Criando Área, Visão Geral), Plantão (lista, Criando Plantão com criação, Gerenciar Plantão), Ruas (cartão novo, CEP com máscara, salvar regra com 3 pontos no mapa), Mapa de engajamento (abas, menu Ações com Punir, janela de punição), Desafios (vazio, Novo desafio passo 1), NPS (Passageiros, Motoristas com Buscar Motorista), Configurações NPS, Notificações app e Criando Notificação. Sem erros de página; um 401 de carregamento antes do login, esperado.

## Testes
`plantao-ruas-areas` (Rua, Bairro, CEP), `engajamento` (Punir), `grupo-d` (lista de notificações, prévia). Suíte inteira: 594 de 595 passam; a que falha é `menu-lateral` (item de menu vindo do merge de main com as telas novas de outros agentes, fora do grupo D).
