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
