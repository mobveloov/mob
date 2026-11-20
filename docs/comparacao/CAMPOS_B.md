# Campos do grupo B (Financeiro): segunda passada, nível de campo

Data: 20/11/2026. Fonte: páginas salvas da Machine (estrutura HTML: abas, rótulos, campos, opções, colunas, botões) comparadas com o painel nosso aberto no navegador com banco de teste.
Formato: `Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei`.
"Conferido no navegador" = abri a tela logado (Playwright, texto da página) e li os campos depois da mudança.

## Visão geral do financeiro
- Visão geral > Título e botão Exportar relatório | sim | sim | nada
- Visão geral > Período (Hoje, Ontem, Semana passada, Mês passado, Últimos 7 dias, Últimos 30 dias, Personalizado; padrão Últimos 7 dias) | sim | sim | nada
- Visão geral > Cartões Faturamento total, Ganhos líquidos, Total recebido, Saques dos motoristas, Total do próximo repasse (com dica) | sim | sim | nada
- Visão geral > Recargas Pix, Corridas pagas no App, Tendência de saques, links "Ver detalhes" e "Ver histórico de saques" | sim | sim | nada
- Visão geral > Faixa "dados a partir de 01/01/2026, sem Pagar.me" | não | não | não se aplica (ver Não consegui igualar)
- Conferido no navegador: sim.

## Extrato da central
- Extrato > Nome da central, Recarregar saldo, abas Mensal/Por período/Hoje, Mais ações (Exportar CSV), Ordenar por, Colapsar tudo | sim | sim | nada
- Extrato > Cartões Saldo inicial, Total de entradas, Total de saídas, Saldo final; título Movimentações (data por extenso); texto vazio | sim | sim | nada
- Extrato > Cartões "Em uso do limite", "Integradores", "Limite de saldo" | não | não | depende do limite de crédito com a plataforma (ver Não consegui igualar)
- Conferido no navegador: sim.

## Extrato de transações online
- Mais filtros (tipo, status, data de repasse), período, Exportar CSV, busca por ID da transação, cartões, colunas Data e Hora, Data de repasse, ID, Tipo, Forma de pagamento, Repasse, Valor líquido | sim | sim | nada
- Tabela > Coluna Status e botão Marcar | não existe na Machine | extra nosso | mantido (chargeback e estorno)
- Conferido no navegador: sim.

## Demonstrativo Mensal
- Bandeira, Competência, Dias ativos, Exportar, colunas Descrição/Quantidade/Valor unitário/Débitos/Créditos, Total a pagar | sim | sim | nada
- Competência > opções | Machine lista só meses fechados; nós listamos 12 meses | mantido
- Conferido no navegador: sim.

## Faturamento de centro de custo / por empresa / por período / Km rodados / Vouchers e tickets
- Todos > Filtros (Data inicial, Data final, Empresa, Forma de pagamento, Motorista, Número da viatura, Nome, Taxa cobrada, Valor fixo, Valor fixo por corrida, Categorias ativas, Tipos de pagamento, Nome do motorista), Filtrar/Gerar, Limpar filtros, Exportar, Imprimir | sim | sim | nada (já conferido na 1ª passada)
- Todos > Cabeçalho de coluna clicável (ordena, clica de novo inverte, seta ▲▼) | não | sim | criado em `Relatorio.tsx`; o servidor já ordenava, o CSV passou a respeitar a ordem (`csvDoRelatorio`)
- Faturamento por período > Categorias ativas > dica "Filtre apenas por categorias atualmente ativas..." | não | sim | dica adicionada abaixo do campo
- Faturamento por período > Tipos de pagamento | sim | quase | temos 2 opções a mais (Cartão na maquininha, Saldo da carteira) porque existem nas nossas corridas
- Conferido no navegador: sim (clique em "Modelo" no Km rodados mostrou ▲ e depois ▼).

## Relatório de faturamento
- Mais filtros, período, Exportar CSV, 5 cartões, tabela (Data e Hora, Ordem de serviço, Forma de pagamento, Valor, Taxa da central, Status), Primeira/←/números/→/Última | sim | sim | nada
- Busca > placeholder "Buscar por número da OS" | tinha outro texto | sim | texto trocado
- Busca > botão de lupa ao lado do campo | não | sim | adicionado
- Conferido no navegador: sim.

## Gestão de pendências de pagamentos
- Abas Todos/Pagamento insuficiente/Taxa de cancelamento, período, busca, Mais filtros, Exportar, "Filtrando por", cartões Pendente/Processando/Resolvido/Abonado | sim | sim | nada (aba "Pix no app" e botão Registrar pendência são extras nossos)
- Vazio > "Não encontramos nenhum resultado..." com botões Editar filtro e Limpar filtro | só o texto | sim | botões adicionados
- Mais filtros > conteúdo (Machine: não aparece na captura) | temos "Nome do motorista" | não verificável | ver Não consegui igualar
- Conferido no navegador: sim.

## Gestão de taxas de cancelamento
- Linha de abas Todos/Pendentes/Repassados/Resolvidos/Abonados | não (só cartões) | sim | linha de abas criada, ligada ao mesmo filtro dos cartões
- Vazio > Editar filtro / Limpar filtro | só o texto | sim | botões adicionados
- Período, Buscar motorista, Exportar, Filtrando por, cartões, colunas | sim | sim | nada
- Botão "Mais filtros" e botão de pessoa ao lado de "Buscar motorista" | não | não | conteúdo não aparece na captura (ver Não consegui igualar)
- Conferido no navegador: sim.

## Transação com Pix
- Buscar por OS, Período (10 opções), Nome/VTR do motorista, Exportar, colunas | sim | sim | nada
- Filtros > Situação do Pagamento (Paga, Estornada, Processando, Em disputa, Chargeback) | era lista de uma opção | sim | agora caixas de marcar, várias ao mesmo tempo (servidor aceita lista com "|", `operacao/pix.ts`)
- Filtros > Bandeira e Bandeira da corrida | não | não | ver Não consegui igualar
- Conferido no navegador: sim (5 caixas).

## Controle financeiro de centrais, Meus planos
- Busca "Buscar por central...", colunas Central/Exibir extrato/Débito automático/Conta online, selo Principal, opções Não permitir/Usar conta desta central/Usar conta da central principal | sim | sim | nada
- Meus planos > chamada "Precisa expandir sua empresa?", Abrir uma central associada, plano, Sua categoria, Tarifa por corrida, Cobrança fixa, Taxas, Incluso, Serviços adicionais | sim | sim | nada
- Meus planos > "Você economizou R$ ... em opcionais" | não | não | precisa de uso real dos serviços
- Conferido no navegador: sim.

## Entrega de voucher / Faixas de Vouchers / Criando Faixa
- Entrega de voucher > VTR/Nome, OS Compradas, Obter OS Pendentes, Limpar filtros, colunas, Registrar Entrega | sim | sim | nada
- Faixas > Empresa *, Série, Número inicial, Número final, Filtrar, Limpar filtros, Criar Faixa de Vouchers | sim | sim | nada
- Faixas > tabela > coluna Empresa | existia sempre | igual à Machine | agora só aparece quando nenhuma empresa foi escolhida no filtro
- Criando Faixa > Bandeira *, Empresa *, Série, Número inicial *, Número final *, Voltar, Criar | sim | sim | nada
- Conferido no navegador: sim.

## Cupons
- Abas Resgatável e Automático | era seletor "Tipo de cupom" com Todos | sim | agora abas; abre em Resgatável
- Automático > Situação (Todos/Ativo/Inativo) e campo Pesquisar | não | sim | criados (filtram os dois cartões)
- Exportar > Impressão (PDF) e Planilha (CSV) | sim | sim | nada
- Cartões PRIMEIRA CORRIDA e DE VOLTA (Automático, Ativo/Inativo, Cupom utilizado, Limite de uso) | sim | sim | nada
- Criar cupom > Código, Descrição, Tipo, Valor, Teto Máx, Cidade, Cliente VIP, Nome VIP, Início, Expiração, Mínimo corrida, Limite total, Usos por cliente | sim | não verificável | a janela de criar não veio na captura da Machine; mantida a nossa
- Conferido no navegador: sim.

## Recompensas por indicação
- Abas Motoristas/Clientes, período, Tipo do usuário, Status, Exportar, 8 colunas | sim | sim | nada
- Busca > placeholder "Pesquisar recompensado" | outro texto | sim | trocado
- Paginação > números 1 2 3 ... | só ← e → com contador | sim | botões numerados
- Cabeçalho clicável (ordenar) | não | não | falta ordenar no servidor desta tela
- Conferido no navegador: sim.

## Taxas da central (4 capturas)
- Cartão "Taxa por corrida" com recolher/expandir e botão Automações | eram duas abas | sim | virou cartão com cabeçalho; "Automações" é botão
- Aviso "Ao criar várias taxas..." e texto "Taxa da central" | sim | sim | nada
- Lista > Interruptor liga/desliga de cada taxa | não | sim | campo `ativa` guardado; taxa desligada não cobra (`config/taxas.ts`); teste novo `taxas-ativa.test.ts`
- Lista > Taxa, Quem paga, Categorias, Tipos de pagamento, seta | sim | sim | nada
- Criar taxa > Nome * (dica) | sim | sim | limite caiu de 60 para 21 e emoji é removido (igual Machine); vale no servidor
- Janela > abas Configurações e Aplicações | sim | sim | nada
- Configurações > Valores da taxa (#, De, Até, Cobrar, Valor, Adicionar outra faixa, "1 de 10 faixas") | sim | sim | nada
- Configurações > Quem irá pagar (Passageiro/Motorista) | sim | sim | acrescentado o aviso "Versão mínima no app Motorista: 24.9" no Passageiro
- Configurações > Simulador de taxa (3 cartões) | sim | sim | valor limitado a R$ 0,01 até R$ 999,99
- Aplicações > Categorias e Forma de pagamento com "Selecionar todos" | sim | sim | nada
- Rodapé > Salvar, Cancelar, Excluir taxa | sim | sim | nada
- Automações > conteúdo | só texto vazio | não verificável | ver Não consegui igualar
- Conferido no navegador: sim (cartão, botão Automações, janela Criar taxa, aviso, simulador).

## Não consegui igualar
- Faixa de aviso da Pagar.me (Visão geral, Extrato online, Relatório de faturamento): não existe gateway aqui.
- Cartões "Em uso do limite", "Integradores", "Limite de saldo" e lançamento "Cobrança em débito automático (Pagar.me)" no Extrato da central: dependem do limite de crédito com a plataforma e da Pagar.me.
- "Você economizou R$ ... em opcionais" (Meus planos): exige uso real dos serviços cobrados.
- Taxas da central > Automações: a captura só mostra o botão, o conteúdo não foi salvo; mantive uma tela explicativa.
- Taxas de cancelamento e Pendências > "Mais filtros" e botão de pessoa: conteúdo não aparece nas capturas.
- Cupons > janela Criar cupom: não veio nas capturas.
- Transação com Pix > Bandeira e Bandeira da corrida: só fazem sentido com central e associadas (transbordo) ligadas aos pagamentos; não ligado.
- Recompensas > ordenar por coluna: falta no servidor desta tela.
- Seletor de datas: a Machine usa campo de texto com máscara e calendário; nós usamos o calendário do navegador.
