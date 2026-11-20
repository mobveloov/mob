# Menu da Machine x menu lateral do painel (20/11/2026)

Fonte do menu da Machine: captura da tela "Taxas Bandeira" com cargo Administrador. Cada linha abaixo é um item do menu da Machine.
"Onde está no painel" é o caminho no menu lateral (grupo e submenu). "Existe?" diz se a tela já abre com conteúdo.
"Igual?" vem das comparações em `docs/comparacao/GRUPO_A..E.md`: **sim**, **quase** (com diferença pequena listada lá) ou **não existe / sem página de referência**.
Os nomes e a estrutura de submenus são os mesmos da Machine; o teste `painel/test/menu-machine.test.ts` confere isso para o ADMIN.

## Itens do menu da Machine

| Machine (caminho) | Onde está no painel (menu lateral) | Existe? | Igual? | Abas, botões e observações |
|---|---|---|---|---|
| Painel | Painel > Painel (`/`) | sim | sim | Indicadores, período, mapa; igual, com adaptação (GRUPO_E, painel inicial). |
| Cadastro > Minha equipe | Cadastro > Minha equipe (`/equipe`) | sim | quase | Lista de usuários e cargos (ADMIN, Gestor, Operador); nosso tem seletor de filial. Sem página de comparação própria. |
| Cadastro > Cupons | Cadastro > Cupons (`/cupons`) | sim | quase | GRUPO_B: lista, criar, filtros. |
| Cadastro > Passe Livre | Cadastro > Passe Livre (`/passe-livre`) | em construção (outra frente) | não existe | Sem página de referência. Tela em construção por outra frente. |
| Cadastro > Empresas | Cadastro > Empresas (`/empresas`) | sim | quase | GRUPO_A: lista, Criar Empresa, abas do cadastro. |
| Cadastro > Faixa de Vouchers | Cadastro > Faixa de Vouchers (`/faixas-vouchers`) | sim | sim | GRUPO_B: lista e Criar faixa. |
| Cadastro > Gestão de áreas > Áreas | Cadastro > Gestão de áreas > Áreas (`/areas`) | sim | quase | GRUPO_D: lista, Criar Área, Visão geral no mapa. |
| Cadastro > Gestão de áreas > Cidades | não existe (sem equivalente direto; ver Áreas) | não | não existe | O dono não achou essa tela na Machine e ela não foi criada. Equivalente: Áreas (polígonos com prioridade e bloqueio). |
| Cadastro > Gestão de áreas > Plantão | Cadastro > Gestão de áreas > Plantão (`/plantao`) | sim | sim | GRUPO_D: lista, Criar, Gerenciar. |
| Cadastro > Motoristas | Cadastro > Motoristas (`/motoristas`) | sim | quase | GRUPO_A: lista e Editar Motorista (abas). |
| Cadastro > Punições | Cadastro > Punições (`/punicoes`) | sim | quase | GRUPO_C: Gerenciar Punição. |
| Cadastro > Clientes > Clientes | Cadastro > Clientes > Clientes (`/passageiros`) | sim | quase | GRUPO_A: lista, Criar cliente (abas). |
| Cadastro > Clientes > Consulta de cartões | Cadastro > Clientes > Consulta de cartões (`/consulta-cartoes`) | em construção (outra frente) | não existe | Sem página de referência. Tela em construção por outra frente. |
| Cadastro > Ruas | Cadastro > Ruas (`/ruas`) | sim | quase | GRUPO_D: regras de via, traçado no mapa. |
| Cadastro > Desafios | Cadastro > Desafios (`/desafios`) | sim | sim | GRUPO_D: lista de Desafios e desafios dos motoristas (quase). |
| Corridas > Solicitar nova corrida | Corridas > Solicitar nova corrida (`/solicitar`) | sim | quase | GRUPO_A: formulário na ordem da Machine; mapa nosso. |
| Corridas > Acompanhamento | Corridas > Acompanhamento (`/monitoramento`) | sim | quase | GRUPO_A: mapa e lista da operação. |
| Corridas > Retorno e Ocorrências | Corridas > Retorno e Ocorrências (`/ocorrencias`) | sim | quase | Lista e registro de ocorrências. |
| Corridas > Consultar corridas | Corridas > Consultar corridas (`/historico`) | sim | quase | GRUPO_A: Filtro, Exportar relatório, atualização automática, janela Filtro de pesquisa. |
| Corridas > Mapa de motoristas | Corridas > Mapa de motoristas (`/mapa`) | sim | quase | GRUPO_A. |
| Corridas > Consultar programadas | Corridas > Consultar programadas (`/programadas`) | sim | quase | GRUPO_A: filtros, Exportar, 10 por página. |
| Corridas > Taxas de cancelamento | Corridas > Taxas de cancelamento (`/taxas-cancelamento`) | sim | quase | GRUPO_B: abas Taxas, Pendentes, Repassados, Resolvidos, Abonados. |
| Corridas > Relatórios | Corridas > Relatórios (`/indice-relatorios`) | sim | sim | GRUPO_E: índice de Relatórios com Criar modelo (igual, com adaptação). |
| Corridas > Alteração de dados da OS | Corridas > Alteração de dados da OS (`/alterar-os`) | sim | sim | GRUPO_C: tela nova (AlteraValor). |
| Corridas > Entrega de voucher | Corridas > Entrega de voucher (`/entrega-voucher`) | sim | sim | GRUPO_B. |
| Corridas > Objetos perdidos | Corridas > Objetos perdidos (`/objetos`) | sim | quase | GRUPO_A. |
| Corridas > Mapa de engajamento | Corridas > Mapa de engajamento (`/engajamento`) | sim | sim | GRUPO_D: já estava igual. |
| Financeiro > Créditos > Carteiras de crédito | Financeiro > Créditos > Carteiras de crédito (`/carteiras`) | sim | quase | Carteiras de motoristas e passageiros; ajuste de saldo. Sem página de referência própria. |
| Financeiro > Créditos > Recargas e Saques | Financeiro > Créditos > Recargas e Saques (`/creditos-recargas-saques`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Créditos > Extrato | Financeiro > Créditos > Extrato (`/creditos-extrato`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Cartão > Painel de Controle | Financeiro > Cartão > Painel de Controle (`/cartao-painel`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Cartão > Transações | Financeiro > Cartão > Transações (`/cartao-transacoes`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Cartão > Saldo da Central | Financeiro > Cartão > Saldo da Central (`/cartao-saldo-central`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Cartão > Saldo do Motorista | Financeiro > Cartão > Saldo do Motorista (`/cartao-saldo-motorista`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Financeiro > Pix > Transações | Financeiro > Pix > Transações (`/transacao-pix`) | sim | quase | GRUPO_B: Transação com Pix; sem gateway, o admin registra à mão. |
| Financeiro > Contas a receber > Faturamento por empresa | Financeiro > Contas a receber > Faturamento por empresa (`/faturamento-empresa`) | sim | quase | GRUPO_B. |
| Financeiro > Contas a receber > Faturamento de centro de custo | Financeiro > Contas a receber > Faturamento de centro de custo (`/faturamento-centro-custo`) | sim | sim | GRUPO_B. |
| Financeiro > Contas a receber > Faturamento por período | Financeiro > Contas a receber > Faturamento por período (`/faturamento-periodo`) | sim | sim | GRUPO_B. |
| Financeiro > Contas a pagar > Vouchers e tickets por motoristas | Financeiro > Contas a pagar > Vouchers e tickets por motoristas (`/vouchers-motoristas`) | sim | sim | GRUPO_B. |
| Financeiro > Contas a pagar > Pagamentos pendentes | Financeiro > Contas a pagar > Pagamentos pendentes (`/pagamentos-pendentes`) | sim | quase | GRUPO_B: Gestão de pendências de pagamentos. |
| Financeiro > Relatórios > Visão geral | Financeiro > Relatórios > Visão geral (`/visao-geral`) | sim | quase | GRUPO_B. |
| Financeiro > Relatórios > Faturamento | Financeiro > Relatórios > Faturamento (`/relatorio-faturamento`) | sim | sim | GRUPO_B: tela nova. |
| Financeiro > Relatórios > Transações online | Financeiro > Relatórios > Transações online (`/extrato-online`) | sim | quase | GRUPO_B. |
| Financeiro > Estatísticas > OS por motorista | Financeiro > Estatísticas > OS por motorista (`/os-motorista`) | sim | sim | GRUPO_E (igual, com adaptação) e GRUPO_A. |
| Financeiro > Estatísticas > OS por empresa | Financeiro > Estatísticas > OS por empresa (`/os-empresa`) | sim | sim | GRUPO_E (igual, com adaptação). |
| Financeiro > Estatísticas > OS por bairro | Financeiro > Estatísticas > OS por bairro (`/os-bairro`) | sim | sim | GRUPO_E (igual, com adaptação). |
| Financeiro > Estatísticas > OS por forma de pagamento | Financeiro > Estatísticas > OS por forma de pagamento (`/os-pagamento`) | sim | sim | GRUPO_E (igual, com adaptação). |
| Financeiro > Estatísticas > OS por operador | Financeiro > Estatísticas > OS por operador (`/os-operador`) | sim | sim | GRUPO_E (igual, com adaptação). |
| Financeiro > Estatísticas > % de OS por motorista | Financeiro > Estatísticas > % de OS por motorista (`/os-percentual-motorista`) | sim | sim | GRUPO_E (igual, com adaptação). |
| Financeiro > Poder público > Km rodados por motorista | Financeiro > Poder público > Km rodados por motorista (`/km-rodados`) | sim | sim | GRUPO_B. |
| Financeiro > Recompensas por indicação | Financeiro > Recompensas por indicação (`/indicacoes`) | sim | sim | GRUPO_C: tela nova. |
| Comunicação > Conversas | Comunicação > Conversas (`/conversas`) | sim | quase | GRUPO_A: Chat; o nosso liga ao WhatsApp. |
| Comunicação > Notificações app | Comunicação > Notificações app (`/notificacoes`) | sim | quase | GRUPO_A/D: lista e Criar notificação. |
| Comunicação > Alertas para empresas | Comunicação > Alertas para empresas (`/alertas-empresas`) | sim | sim | GRUPO_D: lista, Criar alerta, faixa no topo. |
| Configurações > Gerais | Configurações > Gerais (`/config-gerais`) | sim | sim | GRUPO_C: Alterando Bandeira (Gerais), aba Despacho. |
| Configurações > Personalização app passageiro | Configurações > Personalização app passageiro (`/personalizacao-app`) | sim | sim | GRUPO_C: tela nova. |
| Configurações > Carteiras de crédito | Configurações > Carteiras de crédito (`/carteiras-credito`) | sim | quase | Abre a tela de Carteiras (mesma de Financeiro > Créditos), em rota própria. |
| Configurações > Taxas da central | Configurações > Taxas da central (`/taxas-central`) | sim | quase | Taxas da central e ajuste de carteira (ESTADO_PAINEL). |
| Configurações > Despacho | Configurações > Despacho (`/regras-despacho`) | sim | sim | GRUPO_C: DespachoBandeira. |
| Configurações > Transbordos | Configurações > Transbordos (`/transbordos`) | sim | sim | GRUPO_C: DespachoBandeirasParceiras. |
| Configurações > Tarifas e categorias | Configurações > Tarifas e categorias (`/categorias`) | sim | sim | GRUPO_C: Tarifa Categoria, Criar categoria, Editar tarifa. |
| Configurações > Tarifas dinâmicas | Configurações > Tarifas dinâmicas (`/tarifas-dinamicas`) | sim | sim | GRUPO_C. |
| Configurações > Descontos | Configurações > Descontos (`/descontos`) | sim | sim | GRUPO_C: lista e Alterar. |
| Configurações > Integrações | Configurações > Integrações (`/integracoes`) | sim | quase | GRUPO_C: Transações Financeiras. |
| Configurações > NPS | Configurações > NPS (`/config-nps`) | sim | quase | GRUPO_D: ConfiguracaoNPS. |
| Configurações > Termos de uso | Configurações > Termos de uso (`/termos-app`) | sim | sim | GRUPO_C: TermosUso. |
| Cobrança > Último boleto | Cobrança > Último boleto (`/ultimo-boleto`) | sim | sem página de referência | Tela simples feita sobre os dados do painel (carteiras, corridas pagas, cobrança); sem página da Machine para comparar. |
| Cobrança > Demonstrativo Mensal | Cobrança > Demonstrativo Mensal (`/demonstrativo-mensal`) | sim | sim | GRUPO_B. |
| Cobrança > Meus planos | Cobrança > Meus planos (`/meus-planos`) | sim | quase | GRUPO_B. |
| Cobrança > Extrato da central | Cobrança > Extrato da central (`/extrato-central`) | sim | quase | GRUPO_B: Extrato da central. |
| Cobrança > Controle financeiro de centrais | Cobrança > Controle financeiro de centrais (`/controle-centrais`) | sim | quase | GRUPO_B. |
| Avaliações > NPS | Avaliações > NPS (`/avaliacoes`) | sim | quase | GRUPO_D: NPS. |
| Ajuda > Termos de uso | Ajuda > Termos de uso (`/ajuda-termos`) | em construção (outra frente) | não existe | Sem página de referência. Tela em construção por outra frente. |
| Ajuda > Política de privacidade | Ajuda > Política de privacidade (`/juridico`) | sim | quase | Texto jurídico próprio. |
| Ajuda > Central de suporte | Ajuda > Central de suporte (`/central-suporte`) | em construção (outra frente) | não existe | Sem página de referência. Tela em construção por outra frente. |
| Ajuda > Ouvidoria | Ajuda > Ouvidoria (`/ouvidoria`) | em construção (outra frente) | não existe | Sem página de referência. Tela em construção por outra frente. |

## Telas nossas que não são da Machine (ficam em grupos próprios)

| Painel (caminho) | Observação |
|---|---|

| Configurações > Regras de Crédito (`/regras-credito`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Ajuda > Central de Ajuda (`/central-ajuda`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Bot & Totem > Bot de WhatsApp (`/bot`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Bot & Totem > Totens & Preços (`/totem`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Bot & Totem > App do Totem (`/app-totem`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Bot & Totem > Apps e SOS (`/apps`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Bot & Totem > Endereços (`/enderecos`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| CRM > CRM & Engajamento (`/crm`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| CRM > Recuperação de Vendas (`/recuperacao`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| CRM > Funil de Clientes (`/funil-clientes`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| CRM > Mapa de Bairros e Demanda (`/mapa-bairros`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Operação > Análise com IA (`/analise`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Operação > Documentos dos motoristas (`/documentos`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Operação > Destravar Motoristas (`/destravar`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Operação > Veículos (`/veiculos`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Operação > Filiais (`/filiais`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Financeiro > Extrato Geral (`/extrato`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Financeiro > Saques (`/saques`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Financeiro > Recargas (`/recargas`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Financeiro > Relatórios & Stats (`/relatorios`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Conta e plataforma > Dados da Empresa (`/marca`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Conta e plataforma > Painel do dono (`/superadmin`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
| Mais telas > Conta e plataforma > Trocar senha (`/alterar-senha`) | Só existe aqui (CRM, bot, totem, IA, apps ou extra do painel de referência); não existe na Machine. |
