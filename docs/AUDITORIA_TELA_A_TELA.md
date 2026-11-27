# Auditoria tela a tela: painel x Machine (27/11/2026)

Método: cada tela do menu foi comparada com os `.htm` salvos da Machine (166 arquivos, vários são estados da mesma tela) por agentes Sonnet, lendo abas, colunas, filtros, botões e campos; o que faltava foi corrigido, com teste. As telas sem arquivo da Machine estão marcadas. Não foi usado navegador nas comparações dos grupos (só código + teste); a prova visual está em `docs/auditoria-parcial/` onde citada.

Resumo: 0 itens do menu em "Em breve" (teste `menu-todas-telas.test.ts`). Pendências que dependem de serviço externo ou dado inexistente estão listadas em cada grupo.


## Cadastro

# Auditoria Cadastro (painel x Machine)
Sem arquivo salvo na Machine: Minha equipe, Passe Livre, Consulta de cartões (existem no menu da Machine) e Filiais, Destravar, Veículos (não existem na Machine).

| tela (menu) | arquivos Machine usados | igual? (sim/não) | o que faltava | corrigido (arquivo ou teste) |
|---|---|---|---|---|
| Cupons (lista) | 363330ed, 6065ff58, 716a98de, 80b4c575, b3addcff | não | Lista em tabela; Machine tem contadores Ativos/Inativos/Aguardando, cartões (código, %, Compartilhado, situação, "Encerrado em", "Cupom utilizado"), filtro "Ver cupons parceiros?", 10 por página | `web/telas/cadastro/Cupons.tsx`, `gestao/outros.ts`; teste `cadastro-auditoria.test.ts` |
| Cupons (Novo cupom, 5 passos) | d85876c5, bfd1eebb, 6065ff58, e2455291, 901477f8 | não | Era um formulário único. Faltavam: público (todos/clientes específicos com busca), período com hora, pagamentos, limite de uso (4 opções), restrição por área partida/destino, exibir no app. As regras de limite, pagamento, cliente e mínimo nem eram aplicadas ao pedir corrida | `cadastros/cupom-regras.ts`, `cadastros/rotas.ts`, `corridas/index.ts` (descontoDoCupom, cupomDoCliente), `apps/v2.ts` (lista do app respeita exibir e cliente), `comum/cadastros.ts`; teste idem |
| Cupons automáticos | 716a98de | sim | nada | (já igual; "1 vez/vezes" ajustado) |
| Empresas (lista e Criar) | 7bde2649, 8322801d, 66ffea86 | não | Coluna e campo "Tipo de operação" | Campo guardado no cadastro (Corporativo ou Voucher; a Machine não mostra as opções nos arquivos, então são as duas do módulo de vouchers), coluna na lista e no CSV: `comum/cadastros.ts`, `gestao/empresas.ts`, `Empresas.tsx`; teste `cadastro-auditoria-gestao.test.ts` |
| Faixa de Vouchers | 53b2586f, 5a8496a9 | sim | nada | `web/telas/relatorios/Vouchers.tsx` (já igual) |
| Áreas (lista, Criar, Visão geral) | 0cff20db, 2036aca2, 8fa444fa | sim | nada (faixa "alterações não terão efeito" só aparece na Machine quando a bandeira não usa áreas; aqui as áreas sempre valem) | — |
| Plantão (lista, Criar, Gerenciar) | 94f44ef6, 4a0fd735, da41cca7 | sim | nada | — |
| Motoristas (lista) | 9eaef9bf | sim | nada (opção "Reserva" em Relação é extra nossa) | — |
| Motoristas (Alterando) | 65d47a6f, 704fecc7 | sim | nada: "Motorista indicado por" já vinha do código de indicação (`gestao/motoristas.ts` indicadoPorNome, `MotoristaJanela.tsx`). Na rodada anterior eu o tinha dado como pendente por engano | — |
| Punições (Gerenciar Punição) | 009dc1ba | sim | nada | — |
| Clientes (lista e Cadastro) | 63719dcd, c6f71700, eef538dc | não | Filtros "Cartões ativos" e "Cartões não validados"; cartões de resumo (corridas, cadastrado em, dias sem login, última estimativa, versão do app, ativo desde); CPF validado; e-mail validado; "Recebimento de e-mails bloqueado?" | Filtros ligados à tabela real de cartões tokenizados; resumo calculado das corridas, do cadastro e do último contato do app; CPF validado = CPF com dígitos corretos; e-mail validado e bloqueado guardados no cadastro; também corrigi `telefoneBase` (usava /D/ em vez de /\D/): `gestao/outros.ts`, `gestao/cadastros-machine.ts`, `Passageiros.tsx`, `comum/cadastros.ts`; teste `cadastro-auditoria-gestao.test.ts`. Sem dado: "Versão do aplicativo" (o app do passageiro não envia a versão ao servidor, mostra "-"); botão "Validar email" não envia link (não há serviço de e-mail ligado), a central confirma à mão |
| Ruas | c0fde27f, 4459038b | não | Sem regras, a Machine mostra "O que são regras de via?" e o botão "Criar nova regra" | `web/telas/areas/Ruas.tsx` |
| Desafios (Motoristas) | 20bdea1c, 23a0b744, 4d150ab6, 08abc7a5 | não | Tipos "Sequência diária de corridas" e "Desafio progressivo" no filtro | Pendente: sem regra de cálculo nos arquivos |
| Desafios (aba Clientes) | 5d9a2b09, 83a62edd, 928db2df, c7d5977b, e277b907 | não | A aba dizia "ainda não existem"; Machine cria desafio de clientes em 3 passos, com recompensa na carteira do passageiro | Tipo novo "Desafio de clientes": lista, criação (3 passos), detalhe, prévia, aprovação manual e automática (na carteira do passageiro) e o app do passageiro enxerga o desafio: `gestao/desafio-cliente.ts`, `gestao/outros.ts`, `apps/extras.ts`, `Desafios.tsx`; teste `cadastro-auditoria-gestao.test.ts` |
| Recompensas por indicação | 127f1c58, 723fea38, dcc760c9, ed6f943d | não | Opções de período diferentes das da Machine (Hoje, Semana passada, Mês passado, Últimos 7 e 30 dias, Personalizado) | `web/telas/grupoc/Recompensas.tsx`, `gestao/comum.ts`; teste `cadastro-auditoria.test.ts` |
| Minha equipe, Passe Livre, Consulta de cartões | nenhum .htm (docs/MENU_MACHINE.md: existem no menu da Machine, sem página salva) | sem prova | sem referência para comparar item a item; a Consulta de cartões já usa a mesma tabela de cartões do filtro de Clientes | — |
| Filiais, Destravar, Veículos | nenhum | n/a | docs/MENU_MACHINE.md: não existem na Machine (extras nossos) | — |


## Corridas

# Auditoria parcial: grupo CORRIDAS (painel mob x Machine)

Método: texto extraído dos `.htm` da Machine (filtros, colunas, botões, campos) e comparado item a item com o código das nossas telas. Sem prova visual no navegador: a conferência foi pela leitura do código e por testes.

| tela (menu) | arquivos Machine usados | igual? (sim/não) | o que faltava | corrigido (arquivo ou teste) |
|---|---|---|---|---|
| Solicitar nova corrida | 6e6c2ea2 | não | Forma de pagamento era escolha única (na Machine são caixas marcáveis: Dinheiro, Crédito, Débito, Pix). Exigências eram 4 textos fixos inventados (na Machine vêm do cadastro) e iam só como texto na observação. Dados da solicitação (informação antes/depois/interna, formas aceitas) não apareciam no detalhe da OS | `Solicitar.tsx`, `src/comum/pagamento-marcado.ts`, `src/corridas/index.ts` (`pagamentosAceitos`), `src/operacao/rotas.ts` (`/opcionais`, opcionais reais da Config. Gerais do App), `JanelaCorrida.tsx`; teste `test/solicitar-pagamentos.test.ts` |
| Acompanhamento | d121c60b | sim | nada (filtros, colunas e subtítulo iguais; filial e mensagens são extras nossos) | - |
| Retorno e Ocorrências | 9929f386, f75d4fd2 | não | Não existia "registrar ciência": o aviso fixo "Há corridas que podem requerer atenção do operador... registre ciência" nunca saía até passar 1 hora | `Ocorrencias.tsx` (botão Registrar/Desfazer ciência), `servico.ts` (`registrarCiencia`, `semCiencia`), `rotas.ts` (POST `/ocorrencias/:id/ciencia`), `CentralNotificacoes.tsx` (aviso conta só sem ciência e atualiza na hora); teste `test/ocorrencias-ciencia.test.ts` |
| Gravações | (sem arquivo na Machine) | sim | não há tela correspondente para comparar | - |
| Alertas de segurança | (sem arquivo na Machine; 3b10d089 é "Alertas para empresas", outro grupo) | sim | não há tela correspondente para comparar | - |
| Consultar corridas | 1dce9929, 8809ce63, a9fff453, e884ac7a | sim | nada (modal de filtro com os 20 campos, atalhos 15 min a 4 h, colunas, exportar e "Relatório gerado com sucesso!" conferidos) | - |
| Mapa de motoristas | 5e2a311f, a6bb4320 | não | Coluna Ações sem os ícones de mensagem e WhatsApp; "Adicionar créditos" abria o cadastro do motorista (na Machine vai às Carteiras) | `MapaReal.tsx` (mensagem, WhatsApp com o telefone do cadastro, link para `/carteiras`) |
| Consultar programadas | 650796ef, ffcb8b2c | sim | nada (11 filtros, 7 colunas, padrão ontem a +30 dias, exportar) | - |
| Taxas de cancelamento | 3e64338d, 5921f23b, 68595d3e | não | Filtros soltos na tela em vez da janela "Mais filtros" (OS, situação, período, motorista, cliente; Filtrar/Limpar/Cancelar); faltavam os chips "Filtrando por" com X; lista de períodos tinha "Ontem" que a Machine não tem | `Taxas.tsx` |
| Relatórios (índice) | dfa197f7 | sim | nada (9 relatórios padrão, 3 modelos sugeridos, Criar modelo) | - |
| Alteração de dados da OS | a1f95414 | sim | nada | - |
| Entrega de voucher | fab4fca7 | não | Antes de pesquisar mostrava "Clique em Obter OS Pendentes"; a Machine mostra "Nenhum resultado encontrado." | `relatorios/Vouchers.tsx` (arquivo de outro grupo, 1 linha) |
| Objetos perdidos | 3bb4ce9e, 5bd7edd6, a3c6d1e4, cfc3b165 | sim | nada (abas, período, busca, Mais filtros com motorista e OS, menu da linha) | - |
| Mapa de engajamento | 20 arquivos "Mapa de engajamento" | não | Subtítulo "Como motoristas e passageiros se comportam" não existe na Machine. Abas, filtros, indicadores, faixas, janela Ajustar faixas e Ações conferidos | `Engajamento.tsx` |
| Recuperação de Vendas | (não existe na Machine) | sim | tela nossa, sem referência | - |
| Funil de Clientes | (não existe na Machine) | sim | tela nossa, sem referência | - |
| Mapa de Bairros | (não existe na Machine) | sim | tela nossa, sem referência | - |
| Painel inicial (Indicadores) | 197085a8, 869e70e2, 99514569, efe9727e, f95e2df0 | sim | nada (cartões, períodos por bloco, engajamento, NPS, comparativos, versão). Seletor de cidade é nosso no lugar da bandeira; seletor de centrais fica no topo (outro grupo) | - |
| Modal Filtro de pesquisa (Retorno) | 9929f386 | sim | Empresa, Categoria e 4 status conferidos | - |
| Modal Mais filtros (Objetos) | 3bb4ce9e | sim | Motorista e Nº OS conferidos | - |

Pendências: nenhuma que dependa de serviço externo. Observação: a janela da OS ainda não foi comparada com a Machine por falta de arquivo salvo dela.


## Financeiro

# Auditoria parcial: FINANCEIRO (menu Financeiro e grupo Cobrança)

Referência: arquivos `.htm` da Machine (prefixos citados). Telas sem arquivo da Machine estão marcadas "sem referência".

| tela (menu) | arquivos Machine usados | igual? (sim/não) | o que faltava | corrigido (arquivo ou teste) |
|---|---|---|---|---|
| Créditos: Carteiras, Recargas e Saques, Extrato | nenhum (a Machine salva não tem estas telas) | sim (sem referência) | não há o que comparar | nada alterado |
| Cartão: Painel, Transações, Saldo da central, Saldo do motorista | nenhum | sim (sem referência) | não há o que comparar | nada alterado |
| Pix > Transações | ebbe6960 | não | filtros Bandeira e Bandeira da corrida, botão Filtrar, placeholder "Nº OS" | `src/web/telas/demais/Pix.tsx`, `src/operacao/pix.ts`, `src/operacao/rotas.ts`; teste `test/auditoria-financeiro.test.ts` |
| Contas a receber: Faturamento por empresa | cfe01c59 | sim | nada (filtros, asteriscos, botões, colunas conferem) | já existia (`src/relatorios/relatorios.ts`) |
| Contas a receber: Faturamento de centro de custo | 9ce39721 | sim | nada | já existia |
| Contas a receber: Faturamento por período | 4848d062 | sim | nada (taxa 20%, valor fixo, categorias, tipos de pagamento, Gerar) | já existia |
| Contas a pagar: Vouchers e tickets por motoristas | 26b6d311 | sim | nada | já existia |
| Contas a pagar: Pagamentos pendentes | 0f967758, 1c60de78, 48b36de5, 6e03c951 | não conferida | a tela é `src/web/telas/corridas/Pendentes.tsx` (grupo Corridas, fora dos meus arquivos) | fica com o grupo Corridas |
| Relatórios > Visão geral | 606e50a1, 7d550375 | não | aviso "Atenção" do topo | `FinanceiroMachine.tsx` (texto honesto: dados vêm do painel, sem citar Pagar.me) |
| Relatórios > Faturamento | 14aed2bd, 6c4f8352, ba11f48f | não | aviso do topo; filtro em "Filtro de pesquisa" com caixas de marcar (10 formas com os nomes da Machine e 3 status, "Todos") e botão Cancelar | `RelatorioFaturamento.tsx`, `src/config/financeiro-visao.ts`; teste `auditoria-financeiro.test.ts` |
| Relatórios > Transações online | 2003202f, 234861a5, 82ce4cd0, ef7839e3 | não | aviso do topo; tipo e repasse em caixas de marcar; paginação de 10 com Primeira/Última e "Exibindo x-y de n"; colunas (a coluna "Repasse" da Machine é a situação Pago/Pendente...) | `FinanceiroMachine.tsx`, `financeiro-visao.ts`, `src/config/rotas.ts`; teste `auditoria-financeiro.test.ts` |
| Estatísticas: OS por motorista (Corrida por motorista) | dfa197f7 (índice) | sim | nada | já existia |
| Estatísticas: OS por empresa / bairro / forma de pagamento / operador / % por motorista | a13d7794, 50d9f27d, 598190d0, fbdee954, caf1ff17 | sim | nada (botões Imprimir/Exportar e asterisco só na forma de pagamento conferem) | já existia |
| Poder público > Km rodados por motorista | 5a11a3e6 | sim | nada | já existia |
| Poder público > Recompensas por indicação | 127f1c58, 723fea38, dcc760c9, ed6f943d | não conferida | a tela está em `telas/cadastro/Indicacoes.tsx` / `crm2` (outro grupo) | fica com o outro grupo |
| Relatórios (índice e Criar modelo) | dfa197f7 | sim | nada (os 9 relatórios padrão e os 3 modelos sugeridos conferem; o formulário do modal não está salvo na Machine) | já existia |
| Extrato Geral, Saques, Recargas, Relatórios & Stats | nenhum | sim (sem referência) | não há o que comparar | nada alterado |
| Cobrança > Extrato da central | 4218862a, 47a0bf80, 968fff9a, 6c08b85d, facc5b1e, d9b3fef6 | não | seletor de central (botões, só com rede); aviso "Relatório gerado com sucesso! / Baixar relatório" ao exportar; item "Exportar" no Mais ações | `FinanceiroMachine.tsx`, `centrais/comum.ts` |
| Extrato da central: cards "Integradores" e "Limite de saldo", "Baixar nota fiscal", detalhe da tarifa por OS | mesmos | não | dependem de limite de crédito da plataforma, integradores e emissão de nota fiscal, que não existem aqui | pendente: serviço externo |
| Cobrança > Controle financeiro de centrais | cd607155 | não | dicas com o texto da Machine; "Exibir extrato" como chave (fixa e marcada na principal); opção "Não permitir" no débito automático; a principal também escolhe o próprio débito | `ControleCentrais.tsx`, `src/centrais/rede.ts`; teste `auditoria-financeiro.test.ts` |
| Cobrança > Demonstrativo Mensal | 4e772c44 | não | linha "Valor corridas" (resumo, não soma duas vezes). Linhas de serviços da Machine (anúncios 1 a 4, rota exibida, Analytics) não existem aqui | `src/centrais/cobranca.ts`; teste `auditoria-financeiro.test.ts` |
| Cobrança > Meus planos | f51178ed, f6d0da94 | não | falta a faixa "Você economizou R$ X em opcionais no mês anterior com o plano Ultra" | pendente: depende do uso de SMS e validação de CPF, que o painel não mede |
| Cobrança > Último boleto | nenhum | sim (sem referência) | boleto real depende da plataforma emitir | nada alterado |

Provas: testes novos em `painel/test/auditoria-financeiro.test.ts` (6 testes); `centrais`, `financeiro-machine`, `pix-pendencias` e `relatorios-vouchers` seguem passando. Não houve prova visual no navegador: conferido pela leitura do código.


## Config

# Auditoria CONFIG (Comunicação, Configurações, Avaliações, Ajuda, menu do usuário)

Método: extraí o texto, os campos (nome, tipo, opções) e as tabelas dos arquivos `.htm` da Machine e comparei com o código das nossas telas, campo a campo (por nome de campo e por rótulo). Prova visual no navegador não foi usada: a conferência foi por leitura do código mais testes.

| tela (menu) | arquivos Machine usados | igual? (sim/não) | o que faltava | corrigido (arquivo ou teste) |
|---|---|---|---|---|
| Comunicação > Conversas | 27304537, 3623776c | sim | nada (Criar conversa, busca, Mensagem Geral, lista) | n/a |
| Comunicação > Notificações app (lista) | 12d7258e | sim | nada (filtros, colunas, paginação) | n/a |
| Notificações app > Criar notificação | 77b91c92, 85bd3d43 | sim | nada (contadores 40/255, 5 filtros "Adicionar filtro por...") | n/a |
| Comunicação > Alertas para empresas (lista e Criar Alerta) | 3b10d089, 946137eb | sim | nada | n/a |
| Central de notificações (sino) | 5c81cde1, db0c0a29 | sim | nada | n/a |
| Configurações > Gerais > Motorista | 329a6010 | não | (1) "Mensagens rápidas" só tinham 5 e 7 espaços fixos, sem "Adicionar nova mensagem" nem "×"; (2) essas mensagens ficavam gravadas mas os apps liam outra lista (a lista antiga de Gerais), então o que a central digitava na aba da Machine não chegava ao app; (3) faltavam rótulos: "Ao chegar no local de embarque e aguardar por:", "Critério para liberar a recompensa", "Direcionar o indicado para:" e o aviso "Marque em quais períodos..." | `comum/bandeira-form.ts` (até 20 mensagens, `mensagensRapidasDe`, rótulos), `web/telas/grupoc/BandeiraAbas.tsx` (Adicionar/×), `config/gerais.ts` (apps passam a ler a lista da aba), `web/telas/demais/ConfigGerais.tsx` (a lista antiga virou aviso); teste `test/config-auditoria.test.ts` |
| Gerais > Passageiro | aa3ecda9 | não | rótulos "Abonar se o atraso for maior que", "Valor (%)", "Valor máximo de desconto (R$)", "Direcionar o indicado para:" | `comum/bandeira-form.ts`; teste `config-auditoria` (rótulos) |
| Gerais > Despacho | 170f6625 | não avaliado | outro agente está refazendo o Despacho (etapas ilimitadas); não mexi | fora do meu escopo (ConfigRegras, DespachoResumo, BandeiraDespacho, config/despacho.ts) |
| Gerais > Financeiro (vouchers) | 30c91a80 | sim | nada (4 campos Sim/Não) | n/a |
| Gerais > Filtros | ae12232d | não | seção "Filtros customizáveis" estava vazia: faltava o botão "Adicionar novo opcional customizável" e a lista | `ConfigGerais.tsx` (lista, liga/desliga, remove, adiciona; grava em Gerais e vai para os apps); teste `config-auditoria` |
| Gerais > Formas de pagamento | 34d8b714 | sim | nada (ativar, exibir no app, ordem, observação, tipo de Pix) | n/a |
| Gerais > Recursos Premium | a1cffda0 | sim | nada (já migrado para a Personalização de cada app, com um só "Salvar alterações") | n/a |
| Configurações > Personalização app passageiro | d9f5c303 | sim | nada (nome, cor, veículo, marca, estilo, recursos, pré-visualização) | n/a |
| Personalização app motorista | (não existe na Machine) | n/a | item nosso | n/a |
| Configurações > Carteiras de crédito | sem arquivo na Machine | n/a | sem página de referência capturada | n/a |
| Configurações > Taxas da central | sem arquivo na Machine | n/a | sem página de referência capturada | n/a |
| Configurações > Despacho | 12edeb5d | não avaliado | outro agente está refazendo | não mexi |
| Configurações > Transbordos | 5ac282e9 | sim | nada ("Envia corridas para" e "Recebe corridas de", 4 colunas) | n/a |
| Tarifas e categorias (lista) | 11cb4f8e, 9b4889eb, c332cda2, f2182599 | sim | nada (Reordenar, Criar, Disponível no aplicativo, menu, Tarifa expansível, tarifa padrão e extras) | n/a |
| Criar categoria | 7f68d6ce | sim | nada (todos os campos e blocos) | n/a |
| Editar tarifa | 9f012791, e0b85fba | sim | nada (método de cálculo, simulador) | n/a |
| Tarifas dinâmicas | 7051d7fa, 4852e186, 6268144e, c3ffc756 | não | faltava a apresentação "Dinâmica automática" (Uma ferramenta que entende sua demanda, Manual x Automática, fase experimental, botão Explorar) | `web/telas/demais/Dinamica.tsx` (abre na 1ª vez em Automações) |
| Descontos (lista) | b5969911 | sim | nada | n/a |
| Alterando Desconto | c532408c | não | "Desconto pelo app #2 a #4" ficavam sempre bloqueados, não dava para preencher (na Machine abrem em sequência) | `web/telas/demais/DescontosMatriz.tsx`; teste `config-auditoria` |
| Integrações > Transações Financeiras | 71481b6a, 7c537a4d | sim | nada | n/a |
| Integrações > Saque Automático | ab73ac6f | não | faltam "Status da integração", "Conta ativa" (conta corrente) e "Certificados e Chaves" (envio do .crt e .key) | PENDENTE: depende do provedor de saque (Asaas) e de guardar certificado; não existe aqui |
| Integrações > Iza, Nilara, Marketplace | ab73ac6f | não | dependem de contrato e chave do fornecedor | PENDENTE: serviço externo; tela mostra "Desativada" |
| Configurações > NPS | 34a1fc3f | sim | nada | n/a |
| Configurações > Termos de uso | 49a90785 | sim | nada (3 blocos: passageiro, motorista, empresa parceira) | n/a |
| Configurações > Regras de crédito | (só nossa) | n/a | item nosso | n/a |
| Avaliações > NPS | 3a6924db, 45454cf9, 46d65764, 763cf5a6, a6cd731b | sim | nada | n/a |
| Ajuda > Termos, Política, Central de suporte, Ouvidoria | só links externos na Machine | n/a | a Machine abre páginas externas (não capturadas); as nossas são telas internas | n/a |
| Ajuda > Central de Ajuda | (só nossa) | n/a | item nosso | n/a |
| Menu do usuário > Trocar senha | sem arquivo na Machine | n/a | sem página capturada | n/a |

## Pendências com motivo
- Mensagens rápidas "motorista e central": a aba grava a lista, mas o app do motorista só tem uma lista de respostas rápidas (a do cliente). Falta o app usar a lista da central; isso está em `apps/web` (outra sessão).
- Saque Automático (conta ativa, certificados): precisa do provedor de saque.
- Iza, Nilara e Marketplace: precisam de contrato e chave dos fornecedores.
- Os resumos de Despacho ficam com o outro agente.


## Despacho

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
