# Campos do Grupo E (segunda passada, nível de campo)

Telas: Estatísticas (bairro, empresa, forma de pagamento, motorista, operador), Relatórios (índice), aviso "Relatório gerado com sucesso!", página inicial "Indicadores", barra de cima, Meus planos.
Referências lidas (só leitura): páginas salvas "Estatística por ...", "Relatorio", "Up Corridas" / "Up Corridas - Leme" (5 estados da página inicial) e as duas "Meus planos". Formato: Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei.

## Estatísticas (as cinco têm o mesmo molde)
| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Estatística por bairro > Título e botão Imprimir | sim | sim | nada |
| Estatística por bairro > Filtros > Data inicial / Data final (padrão: 1º ao último dia do mês) | sim | sim | nada (campo de data do navegador no lugar do calendário próprio da Machine) |
| Estatística por bairro > Filtrar / Limpar filtros | sim | sim | nada |
| Estatística por bairro > "Exibindo 1-10 de N resultados." | sim | sim | nada |
| Estatística por bairro > Colunas Bairro, Cidade, Partidas, Porcentagem (ordenam ao clicar) | sim | sim | nada |
| Estatística por bairro > Paginação ← 1 2 3 → (10 por página) | sim | sim | nada |
| Estatística por empresa > Colunas Empresa, Corridas, Valor, Porcentagem; vazio "Nenhum resultado encontrado." | sim | sim | nada |
| Estatística por empresa > Imprimir fica desligado quando não há resultado (a Machine desliga) | não | sim | Imprimir desligado sem resultados (vale nas cinco telas) |
| Estatística por forma de pagamento > Asterisco (*) em Data inicial/final | sim | sim | nada |
| Estatística por forma de pagamento > Colunas Forma de pagamento, Corridas, Porcentagem | sim | sim | nada |
| Estatísticas por motorista > Colunas ID, Corridas, Porcentagem | sim | sim | nada |
| Estatísticas por operador > Exportar + Imprimir; colunas Operador, FINALIZADAS, CANC PASS, CANC MOTORISTA, CANC OPE, N/ATEND, TOTAIS | sim | sim | nada |
| Estatísticas por operador > Exportar mostra o aviso verde "Relatório gerado com sucesso!" | não (baixava direto) | sim | usa o novo aviso (ver abaixo) |
| Todas > Tela pequena (até 480 px): tabela vira cartões com o nome da coluna ao lado do valor | não | sim | CSS novo (`data-rotulo` nas células) |
| Todas > Rodapé "Versão" | sim | sim | nada |

## Relatórios
| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Relatórios > "Relatórios padrão" 1 a 9 com os nomes e a ordem da Machine | sim | sim | nada |
| Relatórios > "Modelos de relatórios personalizados" > Criar modelo; colunas Nome do relatório, Criado por; menu de três pontos | sim | sim | nada |
| Relatórios > Modelos > Janela Criar modelo (campos) | parcial | não dá igual | a janela não veio salva (só o tamanho, 44 x 40 rem); mantive Nome, Relatório-base, Empresa, Forma de pagamento |
| Aviso "Relatório gerado com sucesso! / O arquivo está pronto para download" com Baixar relatório e fechar (X), faixa verde fixa embaixo; azul "Gerando relatório..." enquanto gera | não | sim | componente novo `AvisoRelatorio` (cores #14B65C e #33A3C9 da Machine). Usado em Exportar dos relatórios (faturamento, vouchers, Km rodados, operador). Fica pronto para Consultar corridas e Extrato da central, que são de outros grupos |

## Página inicial "Indicadores"
| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Seletor "Central principal e centrais associadas" | adaptado | adaptado | o nosso é por cidade ("Todas as cidades"); a rede de centrais tem o seletor da barra de cima |
| Faixa de alertas críticos (banner global) com título, descrição, botão de ação e "Ver mais N alertas" / "Ver menos" | não (só um aviso fixo) | sim | `BannerGlobal`: junta os alertas para empresas vigentes e o aviso de ocorrências; vermelho para Urgente, amarelo para os demais; aparece em todas as telas |
| Aviso de ocorrências (texto e link "tela de ocorrências") | sim | sim | passou a fazer parte da faixa global |
| Faixa "certificado do saque automático / Renovar integração" | não | não dá | depende do certificado do banco/Pix da plataforma (chave externa) |
| Faixa "fatura mensal" | não | não | não há fatura emitida pelo painel; o Demonstrativo Mensal é só consulta |
| Cartão "Precisa de uma visão mais avançada da operação?" + botão "Ver dados avançados" | não | sim | cartão antes de "Métricas de avaliação", leva a Relatórios & Stats (a Machine abre um produto externo dela) |
| Estatísticas da operação (período, 3 cartões, 4 cartões, textos de ajuda, setas "Comparado com ...") | sim | sim | nada |
| Engajamento (Tempo online, setas, Ver mapa de engajamento, Como os motoristas se distribuem, Ajustar faixas, O que este número significa, Ruim/Aceitável/Bom, Ações, conectados/desconectados) | sim | sim | nada |
| Métricas de avaliação (período: Consolidado, Ontem, Semana passada, Mês passado, Últimos 7, Últimos 30, Personalizado; NPS passageiros e motoristas com 0 a 10 e % ) | sim | sim | nada |
| Comparativos de desempenho (Total de corridas, Ganhos no período, Evolução do NPS e texto do cálculo) | sim | sim | nada |
| Origem / Ganhos gerais: nomes das formas de pagamento | adaptado | adaptado | mostramos o que está gravado (Cartão no app, Cartão na maquininha); a Machine separa Débito e Crédito |

## Barra de cima e menu do usuário
| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Sino de notificações (painel com lista, marcar como lida) | sim | sim | nada |
| Nome do usuário e cargo; menu com "Trocar senha" e "Sair" | sim | sim | nada |
| Seletor de empresa/central | sim | sim | nada (mantido além da Machine: tema e "Conectado como") |
| "Ver mais N alertas" | não | sim | na faixa global (acima) |
| Link "Atualizações" (central de novidades da Machine) | não | não | não existe central de novidades nossa; fica fora |

## Meus planos
| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Chamada "Precisa expandir sua empresa?" + "Abrir uma central associada" | sim | sim | nada |
| Título "Central principal - Plano X" com coroa (Ultra) | parcial | sim | título no topo, coroa roxa no Ultra |
| Seletor de central (botão com lista "Central principal", "6120 - ...") | select | sim | virou botão com lista |
| "Sua categoria" com gema e nome; "Você recebe N% de bonificação" com ajuda (?); "sobre a tarifa da plataforma nesta faixa"; "Bonificação recebida este mês" | parcial | sim | cartão de destaque novo; janela "Como funciona a bonificação" com a tabela das faixas |
| Barra de progresso; "N corridas finalizadas pela rede em Setembro, Outubro e Novembro"; "Faltam N para Safira" | não | sim | barra e textos novos |
| "Tarifa por corridas finalizadas" (R$ fixo + % do valor bruto) e teto | parcial | sim | fórmula em duas caixas e aviso do teto |
| "Cobrança fixa mensal" com texto "É cobrado todos os meses..." | parcial | sim | texto igual |
| "Taxas": Taxa Pix, Taxa de saque via pix | parcial | sim | dois quadros |
| "Incluso sem custo adicional" em lista com marca | sim | sim | marcas verdes em duas colunas |
| "Você economizou R$ X em opcionais no mês de ... com o plano Ultra!" | não | não dá | depende da tabela de preços dos opcionais da Machine |
| "Serviços adicionais" com (?) "Cobrado no último dia de cada mês..." | parcial | sim | dica (?) e preços como na Machine; mantive o interruptor de ativar |
| Planos disponíveis / Escolher | extra nosso | extra | mantido (a Machine usa janela de upgrade) |

## Não consegui igualar
- Certificado do saque automático e fatura mensal na faixa de alertas: dependem de integração bancária/cobrança real.
- Janela "Criar modelo": a página salva não traz o conteúdo (é montada por script).
- Link "Atualizações": não temos central de novidades.
- Economia em opcionais do plano Ultra: sem a tabela de preços deles.
- Calendário próprio de datas (usamos o do navegador); Débito e Crédito separados nos ganhos.
- Menu lateral: nomes "OS por ..." (menu) são de outro agente; os títulos das telas seguem "Estatística por ...".

## Conferido no navegador
Teste local (porta 8875, banco temporário): Estatística por bairro e demais telas (filtros, colunas, páginas), Relatórios, Indicadores com a faixa global, Meus planos (sem rede). Resultado na seção abaixo.

Resultado: conferido no navegador (porta 8875, banco temporário, com 40 corridas): Estatística por bairro/operador (filtros, colunas, paginação, Exportar mostra a faixa verde "Relatório gerado com sucesso! O arquivo está pronto para download" com Baixar relatório), Relatórios (9 padrão + modelos sugeridos), Indicadores (todas as seções) e Meus planos (cartões, serviços, planos). A faixa de alertas só aparece quando há alerta vigente ou ocorrência na última hora. Sem erro de página no console.
