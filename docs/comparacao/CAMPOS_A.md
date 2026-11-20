# Campos do grupo A (segunda passada, nível de campo)

Formato: Tela > Aba/Janela > Campo ou botão | existia? | igual agora? | o que mudei.
Fonte: páginas salvas da Machine (todas as variações) lidas em texto (rótulos, campos, opções, colunas, botões). Conferido no navegador com banco de teste (porta 8871).

## Retorno e Ocorrências
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Retorno e Ocorrências > título | não (era "Ocorrências") | sim | Título "Retorno e Ocorrências" |
| > Busca "Nome da Empresa" + lupa | não | sim | Campo e botão novos (filtro no servidor) |
| > "Mais filtros" | não | sim | Janela "Filtro de pesquisa" ("Você pode filtrar um ou mais campos") |
| > Janela > Empresa, Categoria (Selecione) | não | sim | Criados, com as empresas e categorias da central |
| > Janela > Status: Canceladas, Não atendidas, Pendentes, Atrasadas (todas marcadas) | não | sim | Criados; servidor classifica (Pendente: 3 min sem motorista; Atrasada: 10 min com motorista a caminho) |
| > Janela > Filtrar, Limpar filtros | não | sim | Criados |
| > Atualização automática | existia (rótulo "Auto-Refresh") | sim | "Atualizando automaticamente" / "Atualização automática pausada" |
| > "Exibindo 1-N de N resultados." | não | sim | Criado |
| > Colunas Nº OS, Nome do passageiro (com endereço), Ocorrência, Motorista, Status, Prev, Aviso motorista, Tempo Expiração | parcial | sim | Colunas refeitas; Prev = estimativa (3 min por km); Aviso motorista = "Pgto por Pix/cartão"; Tempo Expiração mostra "-----" como na Machine |
| > Seletor de horas | existia (nosso) | removido | Janela fixa de 24 h, como na Machine |
| > Clique na linha (janela de detalhes) | existia (nosso) | mantido | Extra nosso |

## Consultar corridas
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Consultar corridas > Filtro de pesquisa > Telefone do passageiro | sim | sim | Campo tel com "+55 11 96123-4567" |
| > CPF do passageiro | sim | sim | Placeholder 000.000.000-00 |
| > Status | quase | sim | Acrescentei Aguardando aceite, Aguardando liberação, Pagamento pendente, Em negociação (filtro devolve vazio: fluxo não usa) |
| > Exportar relatório | sim | sim | Agora abre a janela "Relatório gerado com sucesso! O arquivo está pronto para download" com "Baixar relatório" |
| > demais campos (Nº OS, nº externo, centrais, empresa, categoria, nome, endereço, motorista, datas/horas, pagamento, urgência, via, cashback), botões Filtrar/Limpar/Cancelar, atalhos 15 min a 4 h, colunas Alerta/Nº OS/Partida/Passageiro/Motorista/Empresa/Status | sim | sim | Conferido, sem mudança |

## Corrida por motorista
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Todos os campos (datas, nome do motorista, Filtrar, Limpar, Imprimir, colunas OS a Valor) | sim | sim | Conferido, sem mudança |

## Corridas programadas
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| > Central chamada | sim | sim | Sem opção "Selecione" (só a própria central, como na Machine) |
| > Exportar | sim | sim | Janela "Relatório gerado com sucesso" com link "Clique aqui" e botão Fechar |
| > demais filtros e colunas (Nº OS programada, Data, Hora, Antecedência, Nome, Empresa, Situação) | sim | sim | Conferido |

## Solicitar nova corrida
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| > Telefone de cadastro / para contato | sim | sim | Placeholder "11 96123-4567", até 30 caracteres |
| > Nome * | sim | sim | Limite 100 |
| > Informação antes do aceite | 3 caixas | sim | Uma caixa (70 caracteres, texto de ajuda da Machine) e as opções "Informação após o aceite" e "Informação interna" |
| > Corridas apenas para o motorista | lista | sim | Campo de texto com sugestões |
| > Sala/Bloco/Apart | sem rótulo | sim | Rótulo e limite 100 |
| > Favoritar (partida) | desmarcado | sim | Vem marcado |
| > "Sem destino" | existia (nosso) | removido | Destino vazio vale como sem destino |
| > Referência do endereço de partida | campo | sim | Caixa de texto com a ajuda da Machine |
| > Valor estimado | editável | sim | Somente leitura, padrão 0,00 |
| > Demais (agendar, pagamento, categoria, exigências, mais de um carro, paradas, favoritar, valor final livre/prefixado, Tarifa, OBS, Atualizar motoristas, Voltar, Solicitar) | sim | sim | Conferido |

## Acompanhamento
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| > Telefone do passageiro | sim | sim | Placeholder "11 96123-4567" |
| > Demais filtros, colunas e "Exibindo 1-N de N resultados." | sim | sim | Conferido |

## Chat
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| > Busca | sim | sim | Placeholder "Buscar motorista" (muda por aba) |
| > Tela vazia | "Selecione uma conversa" | sim | "Envie mensagens para os motoristas" |
| > Abas, Criar conversa, Mensagem Geral, campo Mensagem, Enviar | sim | sim | Conferido |

## Objetos perdidos
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| > Período | opções diferentes | sim | Hoje, Semana passada, Mês passado, Últimos 7 dias, Últimos 30 dias, Personalizado |
| > Buscar passageiro | só na janela | sim | Campo na barra, como na Machine |
| > Janela "Filtro de pesquisa" | "Mais filtros" | sim | Título e subtítulo da Machine; campos Nome/VTR do motorista e Nº OS |

## Mapa de motoristas, Clientes, Notificações, Motoristas, Empresas, Leme
| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Clientes > Telefone (filtro e cadastro) | sim | sim | Placeholder "11 96123-4567" |
| Notificações app > Filtros > Título / Mensagem | sim | sim | Título até 40 e Mensagem (caixa) até 255 |
| Motoristas > lista > Telefone | sim | sim | Placeholder da Machine |
| Alterando Motorista > Geral, Cerca eletrônica, Controle de créditos | sim | sim | Conferidos item a item contra as 3 páginas "Editar Motorista - *"; sem diferença de campo |
| Empresas > Criar Empresa > "Não achou o endereço?" | não | sim | Link para a Central de Ajuda |
| Mapa de motoristas, Cadastro de passageiro, Leme (Painel inicial) | sim | sim | Conferidos; ver GRUPO_A.md |

## Terceira rodada (pendências resolvidas)
| Tela > Aba/Janela > Campo | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Notificações app > Nova notificação (Para agora / Agendar, conteúdo, destinatário, 5 filtros) | sim (feito pelo grupo D em CriarNotificacao.tsx) | sim | Não dupliquei. Acrescentei o passo "Avançar" com janela de confirmação do envio, como na Machine ("Agendar notificação" segue direto) |
| Consultar corridas > Filtro > Data inicial, Hora inicial, Data final, Hora final | campo de data do navegador | sim | Texto com máscara dd/mm/aaaa e hh:mm; datas abrem com hoje |
| Corridas programadas > Data inicial / final | idem | sim | Máscara dd/mm/aaaa; abre de ontem a 30 dias à frente, como na Machine |
| Objetos perdidos > Personalizado > datas | idem | sim | Máscara dd/mm/aaaa |
| Clientes > Filtros > nascimento e cadastro (inicial/final) | idem | sim | Máscara dd/mm/aaaa, placeholders "Data inicial"/"Data final" |
| Clientes > Avaliação | lista | sim | Campo de texto de até 3 caracteres, como na Machine |
| Clientes > Cadastro de passageiro > Bandeira | lista aberta | sim | Fica travada quando só há uma central |
| > Tipo / Status (criação) | todas as opções | sim | Na criação, sem Estabelecimento (só pelo botão Criar Estabelecimento) e só os 5 status da Machine |
| > CPF | sem limite | sim | Até 14 caracteres |
| > Edição > Foto de perfil, CPF validado, E-mail validado?, Recebimento de e-mails bloqueado? | não | sim | Campos somente leitura ("(Sem foto)", "Não") |
| Acompanhamento > colunas Nº OS, Nome do passageiro, Motorista, Empresa, Status | fixas | sim | Clicar no título ordena (nova batida inverte), com seta |
| Chat > Carregar mais mensagens | não | sim | Mostra as últimas 30; o botão traz mais 30 (servidor: `?limite=` e `total`) |
| Empresas > Filtros > Status da empresa | ordem diferente, vazio | sim | Ordem Ativo, Deletado, Suspenso, Aguardando Ativação; abre em Ativo |
| Empresas > Filtros > Nome fantasia / CPF-CNPJ | sem limite | sim | Até 32 e 18 caracteres |
| Criar Empresa > Número do contrato, Nome fantasia, Razão social, Endereço, Complemento, Bairro, CEP, Observação para motorista | sem limite | sim | Limites 6, 32, 100, 250, 100, 60, 9 e 300 |
| Leme (Painel inicial) | sim | sim | Conferido no navegador: Indicadores, Estatísticas da operação (Ontem), Corridas solicitadas e origens, Ganhos gerais, Ticket médio, Motoristas ativos, Corridas por motorista, Passageiros cadastrados, Tempo online (Ruim, Aceitável, Bom, "O que este número significa"), NPS dos passageiros e dos Motoristas, Comparativos, Evolução do NPS. Extras nossos: seletor de cidades, "Ajustar faixas", origens WhatsApp e Ponto fixo, formas de pagamento da nossa base |
| Programadas, Clientes, Motoristas, Empresas | sim | sim | Conferidos no navegador campo a campo contra as páginas da Machine; diferenças acima corrigidas |

## Não consegui igualar
- Janela de detalhe da corrida (Machine): não há página salva dela (carrega por ajax), então não deu para comparar.
- Janelas da Machine sem conteúdo salvo: "Determina posição" (Acompanhamento), "disparada", "lista de clientes" e "mensagem da corrida" (Solicitar), "horário de consulta" (Motoristas).
- Satélite no mapa do Solicitar (a Machine usa Google), filtros de cartão em Clientes e "Tipo de operação" em Empresas: dependem de dado ou serviço externo que não temos.
- Validar e-mail por link e bloqueio de e-mail do passageiro: precisam de envio de e-mail (sem chave de e-mail no ambiente).
- Origens extras no Leme e menu "Exportar relatório" dentro de "mais opções" (Empresas): mantidos como nosso.
