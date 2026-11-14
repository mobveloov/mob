# Comparação: página inicial (Painel) e Mapa de engajamento, Machine x nosso

Referências lidas (só leitura): páginas salvas da Machine (`Machine\197085a8...`, `869e70e2...`, `efe9727e...` = página inicial em estados diferentes; 20 páginas `me-secao` = Mapa de engajamento, Motoristas, Passageiros, filtros, menu Ações, janela de faixas) e as nossas salvas em `Downloads` ("Central UP Corridas ...", "Up Corridas ...").
Legenda: **igual** = feito como na Machine; **adaptado** = mesma função, com a diferença explicada.

## A) Página inicial ("Indicadores")

| # | Bloco da Machine | Antes (nosso) | Agora |
|---|---|---|---|
| 1 | Aviso fixo "Há corridas que podem requerer atenção do operador. Acione a tela de ocorrências..." | não tinha | **igual**: aparece quando há corrida cancelada ou não atendida na última hora; link para Retorno/Ocorrências. Adaptado: não existe "registrar ciência", então some quando a hora passa. |
| 2 | Seletor "Central principal e centrais associadas" | já existia (branch de centrais) | igual |
| 3 | Título "Indicadores" e seletor de bandeira | "Indicadores / Visão geral" | **igual**: título "Indicadores"; o seletor é por cidade (nossa "bandeira") |
| 4 | Subtítulo "Estatísticas da operação" com período próprio: Ontem, Semana passada, Mês passado, Últimos 7 dias, Últimos 30 dias, Personalizado | Hoje, Ontem, Esta semana, Este mês, Mês passado, Ano passado | **igual** (padrão Ontem). Extra nosso: "Hoje" na lista |
| 5 | Corridas solicitadas: legenda só Finalizadas, Canceladas, Não atendidas, com % e quantidade | tinha "Em andamento" e só aparecia ao passar o mouse | **igual** (rodapé sempre visível) |
| 6 | Rodapé: "N corridas foram canceladas por motorista / cliente / central" | texto "canceladas por motorista" | **igual** |
| 7 | Dica "Seu número de corridas finalizadas é considerado alto/baixo. Procure mantê-lo acima de 70%." | "Taxa de finalização" | **igual** (alto a partir de 70%) |
| 8 | Seta de variação com "Comparado com Anteontem: N" ao passar o mouse | variação sem o valor anterior | **igual** (Anteontem/Ontem ou as datas) |
| 9 | Origem das corridas finalizadas: Aplicativo, Maçaneta, Integração, Site (sempre as quatro, mesmo com 0), ordenadas | só as que apareciam | **igual** (mais Central, WhatsApp, Totem quando existirem) |
| 10 | Ganhos gerais com % por forma de pagamento e texto de ajuda | lista com valores em R$ | **igual** (% por forma de pagamento) |
| 11 | Ticket médio (sem seta de variação), Motoristas ativos (sem seta), Corridas por motorista, Passageiros cadastrados (com seta); textos de ajuda da Machine | todos com seta | **igual** (textos e setas como na Machine) |
| 12 | Seção de engajamento na inicial: setas anterior/próximo, nome do indicador (começa em "Tempo online"), régua, cartões Ruim/Aceitável/Bom com conectados e desconectados, explicação, link "Ver mapa de engajamento" | só um botão no topo | **igual** (7 indicadores de motoristas, dados reais) |
| 13 | "Métricas de avaliação" com período próprio (Consolidado, Ontem, Semana passada, Mês passado, Últimos 7, Últimos 30, Personalizado) | não tinha | **igual** |
| 14 | NPS dos passageiros e NPS dos Motoristas: número, escala 0 a 10, % Detratores, Neutros e Promotores | só o gráfico de evolução | **igual**. Origem: nota do passageiro ao motorista (passageiros) e nota do motorista ao passageiro (motoristas); 5 estrelas promove, 4 é neutro, até 3 é detrator |
| 15 | "Comparativos de desempenho" com período próprio (padrão Últimos 7 dias): Total de corridas e Ganhos no período | usava o período do topo | **igual** |
| 16 | Evolução do NPS com "O NPS é calculado da seguinte forma: Promotores – Detratores ÷ Número total de respondentes" | sem o texto | **igual** |
| 17 | Rodapé "Versão 844.p" | não tinha | **igual**: "Versão" com a versão do painel |

Visual: mantivemos o tema do nosso painel (claro e escuro); a Machine só tem o claro. Gráficos em SVG próprio (a Machine usa Chart.js).

## B) Mapa de engajamento

| # | Item da Machine | Antes (nosso) | Agora |
|---|---|---|---|
| 1 | Abas Motoristas, Passageiros, Histórico | tinha as três, mas com mapa | **igual** |
| 2 | Contagem ("43 Motoristas", "6.172 Passageiros") e filtros de motoristas: situação (Ativos, Suspensos, Em análise, Fila de espera, Rejeitados, Inativos, com %; Todos, Limpar, Aplicar) e categoria (Todas as categorias) | só contagem | **igual** |
| 3 | Uma seção por indicador (ícone, nome, barra das 3 faixas, etiqueta "Ruim 74,4%", seta) | cartões laterais + mapa | **igual** (a Machine não tem mapa nesta tela: foi retirado) |
| 4 | Indicadores de motoristas: Tempo online, Hora trabalhada, Corridas, Ausência, Frequência de trabalho, Avaliações, Tempo de casa | 6 indicadores genéricos | **igual**, com os nomes das faixas (Ruim/Aceitável/Bom, Curta/Média/Longa, Esporádico/Recorrente/Dedicado, Novato/Regular/Experiente) e os limites padrão da Machine |
| 5 | Indicadores de passageiros: Solicitações, Frequência de uso, Cancelamento, Estimativas, Avaliações, Tempo de casa | 6 genéricos | **igual** (Baixo/Médio/Alto, Esporádico/Recorrente/Frequente, Novato/Regular/Fiel...) |
| 6 | Dentro da seção: "Como os ... se distribuem", régua com as barras e as duas marcas dos limites (arrastáveis), "O que este número significa" | histograma só na janela | **igual** (textos copiados) |
| 7 | Botão "Ajustar faixas": período (7/15/30/90 dias, semanas para frequência, Personalizado; sem período em Ausência, Avaliações e Tempo de casa), "Bom até / Aceitável até / Ruim acima de" (o último desabilitado), Cancelar e Aplicar | janela única com período global | **igual**, por indicador. Só o administrador salva |
| 8 | Três cartões por indicador: nome, limite ("≤ 8%", "> 8 – 30%"), rosca, número, "% do total"; em motoristas, barra e "conectados / desconectados" | sem | **igual** |
| 9 | Menu "Ações" por faixa. Passageiros: Ver passageiros, Enviar cupom, Enviar notificação. Motoristas: Ver motoristas, Lançar desafio, Enviar notificação, Enviar mensagem, Alterar status | não tinha | **igual**. Adaptado: cupom e desafio saem como notificação com o texto/código (não cria o cupom nem o desafio); notificação e mensagem usam o push e o chat do app; "Alterar status" muda a situação do cadastro (só admin) |
| 10 | Aba Histórico | série dia a dia e mapa | **adaptado**: registro de tudo que foi feito pelas Ações (quando, quem, faixa, ação, pessoas e texto) |
| 11 | Lista "Ver motoristas/passageiros" | não tinha | **igual**: nome, telefone e o valor do indicador (até 500) |

## Fonte dos números (dados reais da empresa)
- Tempo online: segundos do app do motorista (tabela `app_online`), média de horas por dia no período.
- Hora trabalhada: início a fim das corridas finalizadas. Ausência: dias desde o último sinal do app ou corrida.
- Passageiros: cadastro de clientes e corridas pelo telefone; Estimativas: cotações do app que viraram corrida.
- Tudo por empresa (nenhuma função lê outra empresa); testes em `painel/test/engajamento.test.ts` e `painel/test/painel-inicial.test.ts`.

## Pendências conhecidas
- Aviso de ocorrências sem "registrar ciência" (a lista de ocorrências não guarda ciência).
- Tempo online só existe a partir de agora (antes não havia registro; motoristas sem sinal contam zero).
- Cupom e desafio enviados pelo mapa não criam o cupom/desafio: só avisam.
