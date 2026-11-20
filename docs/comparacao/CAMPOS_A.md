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

## Não consegui igualar
- Janela de detalhe da corrida (Machine): não há página salva dela (carrega por ajax), então não deu para comparar.
- Janelas da Machine sem conteúdo salvo: "Determina posição" (Acompanhamento), "disparada", "lista de clientes" e "mensagem da corrida" (Solicitar), "horário de consulta" (Motoristas).
- Criar notificação: o fluxo da Machine (Para agora / Agendar, filtros por quantidade de corridas, período de cadastro, gênero, categorias e status, passo "Avançar") não foi refeito; mantemos o nosso formulário (disparo imediato e agendamento recorrente).
- Datas dos filtros da Machine são texto com máscara e valor inicial; as nossas usam campo de data do navegador.
- Satélite no mapa do Solicitar (Machine usa Google), colunas ordenáveis do Acompanhamento, "Carregar mais mensagens" no Chat, filtros de cartão em Clientes e "Tipo de operação" em Empresas: dependem de dado ou serviço externo que não temos.
- Cadastro de passageiro: bloqueio e validação de e-mail por link dependem de envio de e-mail (sem chave de e-mail no ambiente).
