# Pente fino: Machine (base) x 88 x nosso painel

Tarefa só de leitura e comparação. Nenhum código do painel foi alterado. Direção nova: o painel passa a ser igual ao painel Machine (base completa); do painel 88 entra só o que a Machine não tem. Nada de chaves, tokens, URLs de produção ou dados de clientes foi copiado para este arquivo.

Fontes: 163 páginas salvas da Machine (73 títulos únicos, extraídos por script: títulos, colunas, rótulos, campos, botões, gráficos e mapas), resumo das 46 telas do 88 e o código do nosso painel (menu em `painel/src/comum/funcoes.ts`, telas em `painel/src/web/telas/{cadastro,corridas,demais}` e `painel/src/web/paginas`, API em `painel/src/{servidor,gestao,operacao,config,apps,enderecos}`). Contexto: `docs/AUDITORIA_IGUAL_ORIGINAIS.md` (a auditoria anterior usou o 88 como base; nosso menu e nossas telas hoje imitam o 88, por isso a distância até a Machine é grande).

Legenda: ✔ já temos equivalente com o essencial; parcial = existe a tela, mas faltam campos, filtros, colunas, gráficos ou ações; ✘ não existe.

## Contagens (73 títulos únicos da Machine)

| Situação | Quantidade |
|---|---|
| Telas da Machine (títulos únicos) | 73 |
| Já temos (✔) | 9 |
| Parciais | 43 |
| Faltando (✘) | 21 |

Observações de contagem: os 73 títulos incluem formulários (Criar/Alterar), telas auxiliares e duas versões do Painel ("Leme" e "Up Corridas", esta com seletor de central principal e associadas). Do menu da Machine, três itens não têm página salva: Retorno e Ocorrências, Gerais e Política de privacidade; foram comparados só pelo nome (nossas telas Ocorrências, Gerais do App e Jurídico existem). Em "Já temos" entram só telas em que não achei diferença relevante de campos e colunas.

## As 15 prioridades

1. **Mapa de engajamento** (novo, nada parecido hoje): mapa com abas Motoristas, Passageiros e Histórico; seis indicadores (solicitações, frequência de uso, cancelamento, estimativas, avaliações, tempo de casa) com classificação Bom, Aceitável e Ruim; "Ajustar faixas" (período e limites bom/aceitável/ruim); mapa de filtro e mapa do aplicativo; atalho no Painel ("Ver mapa de engajamento").
2. **Visão geral do financeiro**: três gráficos (Recargas Pix de motoristas e passageiros; Corridas pagas no app, cartão x Pix; Saques e tendência de saques), seletor de período e Exportar relatório.
3. **Consultar corridas**: incluir os filtros que faltam (nº externo da OS, central de chamada, central da corrida, empresa, CPF e telefone do passageiro, urgência, "corridas que geraram cashback", horas), atalhos 15 min a 4 h (2 h e 3 h também) e Exportar relatório.
4. **Extrato**: Extrato da central (saldo, Recarregar saldo, Ver detalhes, Mensal/Por período/Hoje, total de entradas e saídas, dias recolhíveis, ordenar) e Extrato de transações online (tipos Saque, Transferência, Pagamento, Recarga empresa/passageiro/motorista, Repasse; status Pago, Pendente, Chargeback, Estornado, Cancelado; data de repasse; busca por ID; Exportar CSV).
5. **NPS**: nota NPS com Total de avaliações, Promotores, Neutros e Detratores, filtros de período, tipo, e-mail e telefone, "O que é NPS?" e Exportar; Configuração NPS separada para passageiros e motoristas (já temos o essencial).
6. **Tarifa**: tela "Editar tarifa" (tarifa padrão, método de cálculo com "Por tabela de KM" e faixas, componentes principais, extras como parada adicional e bônus de deslocamento) e lista de categorias com Detalhes das tarifas.
7. **Dinâmica**: mapa com áreas manuais e automáticas, automações, legenda, interruptor por área e prioridade entre dinâmicas (maior valor, manual, automática, sem área).
8. **Descontos**: matriz por forma de pagamento (Dinheiro, Débito, Crédito, Cartão no app, Pix) x Desconto pelo site e pelo app #1 a #4, e desconto máximo por empresa. Hoje temos descontos por campanha, que é outro modelo.
9. **Integrações**: dados bancários do recebedor (banco, agência, conta, correntista, CNPJ), plano, "Quem irá receber?" (Motorista, Central, Dividido), taxa de cartão, configurações de cartão e de Pix, "Atualizar cadastro". Hoje só temos Mercado Pago e Pix.
10. **Relatórios da Machine**: índice de Relatórios (com "Criar modelo"), Faturamento por empresa, por centro de custo e por período, OS por forma de pagamento, por empresa, por bairro, por operador, % de OS por motorista, Corrida por motorista e Km rodados por motorista.
11. **Vouchers**: Faixas de Vouchers (listar e criar), Entrega de voucher e Vouchers e tickets por motoristas.
12. **Pix e pendências**: Transação com Pix (por OS, situação Paga, Estornada, Processando, Em disputa, Chargeback), Gestão de pendências de pagamentos (tipos e situações Processando, Resolvido, Abonado) e Gestão de taxas de cancelamento (Taxas, Pendentes, Repassados, Resolvidos, Abonados).
13. **Cadastros completos**: motorista (dados bancários, aceita pagamento para, exigências, tipo de vínculo, relação prioritário/secundário, última atividade, upload de documentos, alteração em massa, validade do licenciamento), empresa (contrato, categorias e pagamentos permitidos, desconto, observação para motorista, endereço, dados extras), categoria (capacidade, impulsionamento automático, valor extra do passageiro, segurança para mulheres, solicitações imediatas x agendadas, vinculação de motoristas) e Nova solicitação (informação antes/depois do aceite e interna, enviar mais de um carro, valor final livre ou prefixado, exigências).
14. **Alertas para empresas** (listar e criar, com tipo Urgente/Atenção/Aviso, duração e status) e **Central de notificações** (sino no topo, "somente não lidas").
15. **Plantão** (listar, criar, gerenciar com motoristas) e **Ruas** (regras de via), mais área de risco/bloqueio e prioridade em Áreas.

**Decisão do usuário (13/11): vamos ter centrais, então estas entram no escopo, logo depois das 15:** Controle financeiro de centrais, Meus planos, Demonstrativo Mensal (cobrança da plataforma por central) e o seletor "Central principal e centrais associadas".

## Tabela 1: telas da Machine (73)

Colunas: Função | Machine (o que a tela tem) | 88 | Nosso | Falta.

### Painel e Cadastro

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Painel (Leme) | Indicadores: corridas solicitadas, origem das finalizadas, ganhos gerais, ticket médio, motoristas ativos, corridas por motorista, passageiros cadastrados, NPS passageiros e motoristas; comparativos (total de corridas, ganhos, evolução do NPS); filtros Ontem, Consolidado, Últimos 7 dias; 8 gráficos | ✔ igual | ✔ | Só o atalho "Ver mapa de engajamento" |
| Painel (Up Corridas) | Igual ao Painel, com seletor "Central principal e centrais associadas" | ✔ | parcial: temos cidades, não centrais associadas | Seletor de centrais associadas |
| Motoristas (lista) | Filtros nome, CPF, nº da viatura, placa, telefone, e-mail, ano do veículo, cadastro, relação, categorias, validade da CNH e do licenciamento; "9 opções selecionadas"; seleção em massa | ✔ (filtros e colunas Perfil, Veículo, Nível, Carteira, Situação, Diagnóstico) | parcial | Relação prioritário/secundário, validade do licenciamento, alteração em massa |
| Alterando Motorista | Versão do app, taxa de aceitação (100 ofertas), total de corridas, documentos (CNH, residência, antecedentes, alvará) com envio, status, última mudança, logado, livre/ocupado, impedido até, motivo da punição, última corrida e atividade, categorias, aceita pagamento para, exigências, dados do veículo (placa, modelo, ano, RENAVAM, licenciamento), dados bancários opcionais, Excluir | ✔ (modo fantasma, nível, chave PIX) | parcial: janela com Geral, Veículos, Financeiro, Documentos, Cerca, Créditos | Dados bancários, aceita pagamento/exigências, vínculo, última atividade, UF/cidade de emplacamento |
| Punições (Gerenciar Punição) | Tempo de 15 min a 48 h e motivo | ✔ | ✔ | Nada relevante (temos horas e dias) |
| Clientes (lista) | Filtros nome, telefone, CPF, e-mail, nascimento, cadastro, avaliação, status (Ativo, Suspenso, Aguardando ativação, Aguardando deleção, Deletado, Suspenso por nota, Bloqueado), tipo, cartões ativos e não validados | ✔ (outros filtros) | parcial | Datas, avaliação média, status extras, tipo, cartões |
| Cadastro de passageiro | Central, tipo de cliente (Maçaneta etc.), status, nome, telefone, CPF, observação | ✔ | parcial | Tipo de cliente, observação interna, CPF |
| Empresas (lista) | Filtros nome fantasia, CPF/CNPJ, status (Ativo, Suspenso, Deletado, Aguardando ativação) | ✔ | parcial | Filtro por CNPJ, status Deletado e Aguardando |
| Criar Empresa | Bandeira, CNPJ, nº do contrato, razão social, endereço completo, situação cadastral, permitir especificar motorista, categorias e pagamentos permitidos, desconto, observação para o motorista, dados extras | ✔ (menos campos) | parcial | Contrato, endereço/CEP, categorias e pagamentos, desconto, permitir especificar motorista |
| Cupons | Filtro, "Ver cupons parceiros?", Criar cupom, Exportar | ✔ | parcial | Cupons parceiros, Exportar |
| Área (lista) | Filtro por nome | ✔ (áreas por cidade) | parcial | Filtro e lista no formato da Machine |
| Criando Área | Nome, prioridade, mapa para desenhar, área de risco/bloqueio, medidor 500 m, atalhos do teclado | ✔ (desenho no mapa) | parcial | Prioridade, área de risco/bloqueio |
| Visão geral de Áreas | Mapa com todas as áreas, Mapa/Satélite, Gravar | ✘ | parcial: temos MapaAreas | Satélite, gravar a visão |
| Plantão (lista) | Filtros data e hora inicial e final | ✘ | ✘ | Tela inteira |
| Criando Plantão | Data e hora inicial e final | ✘ | ✘ | Tela inteira |
| Gerenciar Plantão | Datas, horas, vtr/motorista, Adicionar Motorista | ✘ | ✘ | Tela inteira |
| Faixas de Vouchers (lista) | Filtros empresa, série, nº inicial e final | ✘ | ✘ | Tela inteira |
| Criando Faixa de Vouchers | Bandeira, empresa, série, nº inicial e final | ✘ | ✘ | Tela inteira |
| Ruas (regras de via) | Lista, "Criar nova regra", explicação "O que são regras de via?" | ✘ | ✘ (Endereços/CNEFE é outra coisa) | Tela inteira |
| Desafios (vazio) | "Comece a criar desafios agora mesmo", Novo desafio | ✔ | ✔ | Nada |
| Desafios dos motoristas | Filtros período, status, tipo; busca; Novo desafio | ✔ (mais completo: BI, aprovação) | ✔ | Nada |
| Recompensas por indicação | Período, tipo do usuário, status, busca, Exportar | ✔ (dashboard com embaixadores) | parcial: temos Indicações | Filtro por tipo/status, Exportar |

### Corridas

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Solicitar nova corrida | Buscar cliente por telefone/CPF; nome; agendar; informação antes e depois do aceite e interna; pagamentos (Dinheiro, Crédito, Débito, Pix); categoria; enviar mais de um carro; só para o motorista X; partida com número, complemento, favoritar; destino e paradas; referência; valor estimado, final livre ou prefixado; mapa e satélite | ✔ (menos opções) | parcial | Informações do motorista, múltiplos carros, valor final livre/prefixado, exigências, favoritar |
| Acompanhamento (Operação) | Filtros passageiro, telefone, motorista, partida, empresa; "Corridas pendentes de atendimento" | ✔ | ✔ | Nada relevante |
| Consultar corridas | Nº OS e externo, central de chamada, central da corrida, empresa, categoria, passageiro (nome, telefone, CPF), partida, motorista, datas e horas, pagamento (10 formas), status (Distribuindo ... Em and...), urgência, "corrida via", cashback; atalhos 15 min a 4 h; Exportar | ✔ (filtros avançados, detalhe com Raio-X, repasses, chat) | parcial | Filtros listados ao lado, 2 h e 3 h |
| Corridas programadas | Filtros central, empresa, OS, categoria, passageiro, motorista, datas, pagamento, status (Distribuída, Aguardando, Cancelada, Erro) | ✔ | parcial | Filtros e status de distribuição |
| Mapa de motoristas | Gráfico de condutores, busca, lista (Motorista, Status, Categorias, Ações), Estatísticas, filtro de categorias, Opções | ✔ (Mapa Real-Time) | parcial | Gráfico de condutores, ações por linha |
| Taxas de cancelamento | Taxas, Pendentes, Repassados, Resolvidos, Abonados; filtros OS, motorista, cliente, período; Exportar | ✔ (Pendências) | parcial | Estados Repassado e Resolvido, Exportar |
| Alteração de dados da OS | Campo "Qual OS deseja alterar?" | ✔ (edição na janela da corrida) | parcial | Tela de busca por OS |
| Objetos perdidos | Filtros motorista, OS, passageiro, período | ✔ | ✔ | Nada |
| Entrega de voucher | Obter OS pendentes, selecionar, Registrar entrega | ✘ | ✘ | Tela inteira |
| Mapa de engajamento | Mapa Motoristas/Passageiros/Histórico, 6 indicadores com faixas, Ajustar faixas | ✘ | ✔ feito (painel/src/engajamento e web/telas/engajamento) | Pronto |
| Retorno e Ocorrências | Só no menu (página não salva) | ✔ | ✔ (Ocorrências) | Conferir quando houver a página |

### Financeiro

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Visão geral do financeiro | Recebimentos e fluxo de caixa; gráficos Recargas Pix, Corridas pagas no App (cartão x Pix), Saques e tendência; período; Exportar | parcial (Fluxo de Caixa) | parcial: Extrato Geral com cartões e histórico, sem esses 3 gráficos | 3 gráficos e Exportar |
| Extrato da central | Saldo, Recarregar saldo, Ver detalhes, Mensal/Por período/Hoje, entradas e saídas por dia, colapsar, ordenar | parcial | parcial | Recarregar saldo, visão por dia recolhível, ordenar |
| Extrato de transações online | Período, tipos (Saque, Transferência Asaas, Pagamento, Recarga empresa/passageiro/motorista, Repasse), status (Pago, Pendente, Chargeback, Estornado, Cancelado), data de repasse, ID, Exportar CSV | parcial (Recargas, Saques) | parcial | Tipos, status, repasse, ID, CSV |
| Transação com Pix | Por OS, período, central, motorista, situação (Paga, Estornada, Processando, Em disputa, Chargeback) | ✘ | ✘ | Tela inteira |
| Gestão de pendências de pagamentos | Tipos (Pagamento insuficiente, Taxa de cancelamento, Pix no app), situações (Pendente, Processando, Resolvido, Abonado), regularização | ✔ (Pendências) | parcial | Tipos e situações extras |
| Gestão de taxas de cancelamento | Ver linha acima (Corridas) | | | |
| Relatório de faturamento | Lista por OS, período, 10 formas de pagamento, status (Finalizada, Cancelada, Não atendida), busca por OS, CSV | parcial (Faturamento) | parcial | Filtros por status e OS, CSV completo |
| Faturamento por empresa | Datas, empresa, pagamento, motorista, viatura | ✘ | parcial: Empresas tem Relatório e Fatura do mês | Relatório completo |
| Faturamento de centro de custo | Datas, empresa | ✘ | ✘ | Tela inteira |
| Faturamento por período | Gerar: nome, taxa %, valor fixo, valor fixo por corrida, tipos de pagamento, categoria | ✘ | parcial: faturamento por dia | Gerador com taxas |
| Vouchers e tickets por motoristas | Datas, nome, viatura | ✘ | ✘ | Tela inteira |
| Demonstrativo Mensal | Bandeira, competência, dias ativos, débitos e créditos, Exportar | ✘ | ✘ | Tela inteira (baixa prioridade) |
| Controle financeiro de centrais | Por central: exibir extrato, débito automático, conta online | ✘ | ✘ | Tela inteira (baixa) |
| Meus planos | Plano da central, tarifas, serviços adicionais | ✘ | ✘ | Tela inteira (baixa) |

### Relatórios e estatísticas

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Relatórios (índice) | Lista de relatórios, "Criar modelo" | parcial (Relatórios & Stats) | parcial | Índice e modelos |
| Corrida por motorista | Datas, motorista | parcial (Produção dos motoristas) | parcial | Filtro e colunas iguais |
| Relatório de Km rodados | Datas, motorista | ✘ | ✘ | Tela inteira |
| Estatística por bairro | Datas | ✘ (88 tem Mapa de bairros) | ✘ | Tela inteira |
| Estatística por empresa | Datas | ✘ | ✘ | Tela inteira |
| Estatística por forma de pagamento | Datas | parcial | parcial: Financeiro tem "Por forma de pagamento" | Tela própria |
| Estatísticas por motorista | Datas | ✔ (Produção) | parcial | Colunas iguais |
| Estatísticas por operador | Datas | ✘ | ✘ | Tela inteira |

### Comunicação

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Chat | Abas Motoristas, Empresas, Conversas; Criar conversa; Mensagem Geral | ✔ (Conversas, sem empresas) | parcial | Aba Empresas, Criar conversa |
| Notificações app (lista) | Destinatário, datas, título, mensagem | ✔ | parcial | Filtros de histórico |
| Criando Notificação | Agendar ou "agora", título, mensagem, destinatário, filtros por corridas, cadastro, gênero, categorias, status | ✔ (mais: recorrência) | parcial | Filtros de segmentação |
| Alertas para empresas (lista) | Empresa, conteúdo, tipo, status | ✘ | ✘ | Tela inteira |
| Criar Alerta | Empresa, tipo, conteúdo, início, duração | ✘ | ✘ | Tela inteira |
| Central de notificações (sino) | Lista, "Somente não lidas" | ✘ | ✘ | Sino e painel |

### Configurações, avaliações e ajuda

| Função | Machine | 88 | Nosso | Falta |
|---|---|---|---|---|
| Alterando Bandeira (Gerais da central) | Tempo de expiração de pendência, distâncias, reenvio automático, alertas para operadores, número do endereço de partida, autorização automática corporativa, despacho por proximidade, cerca eletrônica, corrida em espera, prioridade das dinâmicas, tipo de estimativa, observação obrigatória | parcial (Gerais do App, Despacho) | parcial | Campos acima fora de Gerais e Despacho |
| Despacho | Despacho por proximidade: Disparo, tipo, onde toca | ✔ (mais completo, funil de ciclos) | ✔ | Nada |
| Transbordo | Envia para e recebe de; repassa PF e PJ, exibe pendentes e programadas | parcial (relatório) | parcial: só relatório | Parceiras e regras de repasse |
| Tarifas e categorias | 15 categorias, valor tabelado, preço base, km, minuto, hora parada, bônus de deslocamento, mínimo, parada adicional, Reordenar, Criar | ✔ | ✔ | Nada relevante |
| Criar categoria | Ordem, ícone, capacidade, exibir, maçaneta, dinâmicas, impulsionamento, valor extra, segurança para mulheres, Negocia, solicitações imediatas x agendadas, vinculação de motoristas | ✔ (menos) | parcial | Itens citados na prioridade 13 |
| Editar tarifa (extra) | Tarifa padrão, método de cálculo (tabela de KM, faixas), componentes, parada adicional, bônus de deslocamento | ✔ (Tabela Escalonada) | parcial | Edição por faixa de KM, extras como na Machine |
| Tarifas dinâmicas | Mapa com áreas manuais e automáticas, automações, legenda, slider | ✔ (mapa, gatilho) | parcial | Automáticas, legenda, prioridade |
| Descontos | Tabela por tipo de pagamento, via site, via aplicativo, máximo por empresa | parcial (página não salva) | feito: matriz por pagamento x site/app #1 a #4 e teto por empresa (aba "Por forma de pagamento"; campanhas mantidas) | A matriz ainda não é aplicada no cálculo do preço das corridas (`percentualDaMatriz` está pronta) |
| Alterando Desconto | Por forma de pagamento: site e app #1 a #4 | ✘ | ✘ | Edição da matriz |
| Integrações | Transações financeiras, condições, dados bancários, cartão, Pix, plano, destino, taxa | parcial (só Mercado Pago) | feito: aba "Transações financeiras" com dados bancários (só admin, mascarados), plano, quem recebe, taxa de cartão e Pix; Mercado Pago mantido | "Atualizar cadastro" só registra o pedido; não há provedor real conectado |
| Configuração NPS | Ativar ou desativar para passageiros e para motoristas | ✔ (mais) | ✔ | Nada |
| Avaliações (NPS) | Nota NPS, total, promotores, neutros, detratores, filtros, Exportar, "O que é NPS?" | parcial | parcial | Promotores/neutros/detratores, filtros, Exportar |
| Termos de uso | Aplicativo passageiro, motorista, empresa parceira; padrão, próprio ou não mostrar | parcial | parcial | Escolha padrão/próprio, aba empresa |
| Personalização | Nome, cor principal, veículo no mapa, marca, estilo da tela, recursos, pré-visualização | ✘ | parcial: Marca e aparência | Estilo da tela, veículo no mapa, preview |
| Política de privacidade (Ajuda) | Só no menu | ✔ | ✔ (Jurídico) | Nada |
| Trocar senha / Sair | Menu do usuário | ✔ | ✔ | Nada |

## Tabela 2: o que o 88 tem e a Machine não

Mantemos como "extra" no menu "Mais" ou onde já estão.

| Função do 88 | Machine | Nosso | Decisão |
|---|---|---|---|
| Destravar Motoristas | ✘ | ✔ | Manter |
| Veículos como tela própria | ✘ (só dentro do motorista) | ✔ | Manter |
| Equipe (cargos e permissões) | ✘ (só trocar senha) | ✔ | Manter |
| Recuperação de Vendas (Radar de Intenções) | ✘ | ✔ | Manter |
| Funil de Clientes (conversão) | ✘ | ✘ | Entrar, se quiserem; nada hoje |
| Mapa de Bairros e Demanda | ✘ | ✘ | Entrar, junto com Estatística por bairro |
| Carteiras por usuário, com adicionar e retirar | ✘ | ✔ | Manter |
| Gestão de Saques (aprovação) | ✘ | ✔ | Manter |
| Recargas e entradas | ✘ | ✔ | Manter |
| Regras de Crédito e comissão por faixa | ✘ | ✔ | Manter |
| Taxa personalizada ou isento por motorista | ✘ | ✔ | Manter |
| Bônus de primeiro cadastro, mensagens rápidas, gestão de documentos, simulador de custo, firewall anti-spam de convites, bloqueio por rejeição (fila fria), maçaneta | ✘ | ✔ (Gerais do App) | Manter |
| Programa de Indicações (3 tipos) e Dashboard de embaixadores | parcial (só recompensas) | ✔ | Manter |
| Agendamento Inteligente (recorrente) de notificações | ✘ (só agendar um disparo) | ✔ | Manter |
| NPS: contestações de taxa, denúncias, Resetar Recusas, feedback nas lojas | ✘ | ✔ | Manter |
| Produção dos Motoristas (faturamento, ticket, comissão) | parcial | ✔ | Manter |
| Desafios: relatório BI, aprovação de recompensa, maçaneta | ✘ | ✔ | Manter |
| Corrida: Raio-X, histórico de repasses, chat, rastreamento | ✘ | ✔ | Manter |
| Central de Ajuda com tutoriais em vídeo | ✘ | ✔ | Manter |
| Motorista: modo fantasma, nível, diagnóstico, prioridade de toque, chave Pix | ✘ | ✔ | Manter |
| Categoria: negociação (leilão), tabela escalonada, bônus de compensação | parcial (Negocia) | ✔ | Manter |
| Tarifa dinâmica: gatilho de alta demanda | ✘ | ✔ | Manter |

Extras só nossos (fora das duas referências), mantidos em "Mais": CRM, Bot de WhatsApp, Totem, Análise com IA, Apps e SOS, Documentos dos motoristas, Endereços (CNEFE), Marca e aparência.

## Próximo passo sugerido

Reorganizar o menu pelo da Machine (Painel, Cadastro, Corridas, Financeiro, Comunicação, Configurações, Ajuda), manter as telas do 88 e nossas como itens extras, e construir as prioridades 1 a 15 na ordem acima.
