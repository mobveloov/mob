# Estado do painel (13/11/2026, fim do dia)

## No main do GitHub (sem PR aberto)
- **PR #15:** painel no formato do painel de referência (o "88"): menu no topo, tema escuro, Indicadores, e as telas de Cadastro, Corridas, Financeiro, Comunicação, Config, Avaliações e Ajuda. 51 telas, comissão da central, revisão final feita.
- **PR #16:** apps v2 (passageiro e motorista iguais aos de referência, com mapa, valor líquido na chamada, página /apps/baixar/ e scripts/publicar-apks.mjs).
- Antes: CRM, bot, totem, endereços (CNEFE), banco SQLite, apps, motor 3.2, UP Corridas como empresa 1.
- **Testes:** 148 no painel e 73 no motor, todos passando. Carga de 500 corridas com bot, totem e CRM: 0 erros.
- **No ar:** `https://up.veloov.com` (Docker do computador + túnel da Cloudflare). Apps de teste em `stadium-bedroom-repair-december.trycloudflare.com/apps/baixar/` (muda se o contêiner do túnel reiniciar).

## MUDANÇA DE DIREÇÃO (pedido do usuário)
A base agora é o painel **Machine** (completo, com dados). Do "88" entra só o que a Machine não tem. Mais CRM, bot, totem, Lélio e apps (abas a mais).
Faltam muitas coisas no painel nosso, por exemplo o **Mapa de engajamento** da Machine.
Também é preciso trazer as **casas** (endereços) do banco do mobveloov que não estão no CNEFE, como base extra de endereços do mob (arquivo de correções importável), sem ligar os dois sistemas. Fonte só para leitura: `D:\mobveloov-git\vps\cnefe\correcoes\`.

### Passos combinados
1. **Pente fino** (uma passada com o Fable): tabela `docs/PENTE_FINO_MACHINE_88.md` com função | Machine | 88 | nosso | falta, cobrindo telas, abas, campos, colunas, filtros, botões, mapas, gráficos e relatórios. Mandar a tabela resumida à sessão principal ANTES de construir.
2. **Construir** o que falta da Machine, tela por tela, igual a ela; depois o que só o 88 tem (Sonnet constrói, Haiku faz o mecânico).
3. **Casas:** importar o arquivo de correções como base extra de endereços (`painel/src/enderecos`).
4. Comparar cada tela com a da Machine no navegador, testes, carga, PRs, Docker.

### Onde estão as fontes (só leitura, não vão para o Git)
- Machine, 163 telas com dados: `Machine.rar` (já extraído na pasta `scratchpad\origmachine\Machine`, índice em `origmachine\indice.txt`).
- Painel de referência, 46 telas sem dados: `88pop.com.br.zip` (extraído em `scratchpad\orig88`, resumo em `orig88\resumo.md`; servir com `python -I -m http.server 8820` dentro de `orig88\88pop.com.br`).
- Três telas do Editar Motorista da Machine, e as telas salvas em `J:\Usuarios\Rafael\Downloads\Central UP Corridas (13_11_2026 ...).html` (Machine) e `Up Corridas (13_11_2026 ...).html` (o nosso). 5 MB cada: leia por partes.
- `scratchpad` = `C:\Users\Rafael\AppData\Local\Temp\claude\3fa4f47eab034a00\79073165-21d8-43f0-93ac-622662cf1729\scratchpad`.

## Financeiro no formato da Machine (branch machine-finext)
- **Visão geral do financeiro**, **Extrato da central** e **Extrato de transações online** (menu Financeiro › Relatórios), com dados reais da empresa: corridas, carteira e saques. Rotas em `/api/config/visao-geral`, `/extrato-central`, `/transacoes-online` (código em `painel/src/config/financeiro-visao.ts`).
- Exportar (CSV) com proteção contra injeção de fórmula (apóstrofo em células que começam com `=`, `+`, `-` ou `@`).
- **Recarregar saldo** só registra o pedido e o valor (sem gateway); o admin confirma ou cancela. Chargeback e estorno são marcações do admin, sem mexer na carteira. Leitura segue aberta a quem está logado e escrita só do admin, como o resto do financeiro.
- Teste: `painel/test/financeiro-machine.test.ts`.
- **Relatórios e Vouchers** (branch machine-relvou): índice de Relatórios com "Criar modelo"; Faturamento por empresa, por centro de custo e por período; Vouchers e tickets por motoristas; OS por motorista, empresa, bairro, forma de pagamento, operador e % por motorista; Km rodados. Todos com período, paginação de 10 e Exportar CSV (apóstrofo contra fórmula). Faixa de Vouchers (Cadastro › Gestão) e Entrega de voucher (Corridas). Código em `painel/src/relatorios/` (API em `/api/relatorios`) e `painel/src/web/telas/relatorios/`. As corridas ganharam empresa conveniada, centro de custo e nº do voucher (Nova Solicitação); voucher exige faixa da empresa e não repete. Bairro vem do texto do endereço de embarque; operador, de quem criou a corrida pelo painel (App, WhatsApp e Totem aparecem como o próprio canal). Teste: `painel/test/relatorios-vouchers.test.ts`.

## Pix, pendências, taxas, alertas e sino no formato da Machine (branch machine-pixalr)
- **Transação com Pix** (Financeiro › Pix): uma linha por corrida paga com Pix; situação Paga, Estornada, Processando, Em disputa ou Chargeback. Sem gateway: nasce da corrida e o admin registra à mão (`operacao/pix.ts`, `/api/operacao/pix`).
- **Pagamentos pendentes** (Gestão de pendências): tipos Pagamento insuficiente (registro manual do admin), Taxa de cancelamento e Pix no app (nasce de Pix estornado ou com chargeback); situações Pendente, Processando, Resolvido, Abonado (`operacao/pendencias.ts`). Baixar ou abonar taxa devolve o valor realmente debitado (corrigido).
- **Taxas de cancelamento** (Corridas): abas Taxas, Pendentes, Repassados, Resolvidos, Abonados; Repassado aparece como Processando na gestão de pendências.
- **Alertas para empresas** (Comunicação): listar com filtros e criar (tipo, início, duração); admin e operador criam e encerram; ativos aparecem como faixa no topo (`config/alertas.ts`).
- **Central de notificações** (sino): avisos montados do que está pendente, leitura por pessoa, "Somente não lidas" (`config/central-notificacoes.ts`).
- Exportar CSV com proteção de fórmula em Pix, pendências e taxas. Só admin muda situação. Teste: `painel/test/pix-pendencias.test.ts`.

## Plantão, Ruas, Áreas, Funil de Clientes e Mapa de Bairros (branch machine-plarua)
- **Áreas** (Cadastro › Gestão): lista com filtro por nome, prioridade de 1 a 5 (em áreas sobrepostas vale a maior), cor, **área de risco/bloqueio** com horários programados (sem horário, o bloqueio é contínuo; faixa pode virar a meia-noite) e Visão geral no mapa (Mapa/Satélite, Gravar a vista neste navegador). Bloqueio impede **solicitar corrida** com embarque dentro da área (`corridas/index.ts`) e **tira a corrida do despacho** (`apps/despacho.ts`). No despacho, a ordem ficou: favorito, plantão, nível, motorista dentro da mesma área do embarque, e depois fila virtual ou distância.
- **Plantão** (Cadastro › Gestão): lista com filtros de data e hora, Criar, Gerenciar (datas, horas, Vtr/Motorista, Adicionar Motorista). Motorista escalado em plantão em vigor passa na frente no despacho.
- **Ruas** (Cadastro › Gestão): regras de via (nome de exibição, nome no mapa opcional, traçado desenhado no mapa). Trocam o nome da rua nos endereços achados pelo ponto e pela busca (`enderecos/index.ts`). Só o admin grava.
- **Funil de Clientes** e **Mapa de Bairros e Demanda** (Corridas, do painel 88): usam corridas e passageiros reais. Sem registro de "visitou o app", o funil começa nos cadastros e nas solicitações (Solicitadas, Tiveram motorista, Embarcaram, Concluíram), com abandono por etapa, corridas e leads incompletos (cadastrados que nunca pediram). O mapa agrupa por bairro do endereço de embarque, com filtros por situação, desertos, lista de passageiros, CSV, XML e copiar telefones.
- Código: servidor em `painel/src/areas/` (API em `/api/areas`), telas em `painel/src/web/telas/areas/` e `cadastro/Areas.tsx`. Teste: `painel/test/plantao-ruas-areas.test.ts`.
## Centrais (branch machine-centr)
- **Modelo:** uma empresa pode ser central principal e ter centrais associadas (só um nível). Vínculos, códigos, controle financeiro, plano e serviços ficam em `dados/centrais.json` (`painel/src/centrais/rede.ts`). Cada central continua sendo uma empresa isolada.
- **Isolamento:** a central consultada vem de `?central=ID` e só vale se for a própria empresa ou uma associada dela; senão 404 igual ao de central inexistente. A principal NÃO entra no painel da associada: vê só controle, plano, demonstrativo (quando o débito é da principal) e o extrato se a associada permitir, sem nomes de pessoas. Só o papel plataforma troca de empresa (X-Empresa), como antes. Operador não acessa nada de cobrança; tudo é admin.
- **Telas** (menu novo "Cobrança", `painel/src/web/telas/centrais/`): Controle financeiro de centrais (exibir extrato = consentimento da associada; débito automático e conta online = decisão da principal), Meus planos (Essencial, Plus, Ultra, serviços adicionais, categoria de bonificação da rede só para a principal), Demonstrativo Mensal (por central e competência, Exportar CSV com apóstrofo contra fórmula) e o seletor "Central principal e centrais associadas" no topo (só quando há rede; muda só o que as telas de Cobrança mostram).
- **Abrir uma central associada:** admin da principal cria a empresa nova (e o primeiro admin, opcional). Ligar uma empresa existente e desfazer vínculo: só a plataforma.
- **Sem gateway:** nada é cobrado; valores dos planos são exemplos nossos. API em `/api/centrais` (`painel/src/centrais/rotas.ts`). Teste: `painel/test/centrais.test.ts`.

## O que a revisão final apontou e ainda falta (pequeno e independente)
- **Comissão da central** nunca é debitada da carteira; os relatórios mostram receita só prevista (`config/comissao.ts`).
- **Saldo mínimo** existe em duas configurações (Regras de Crédito e gestão do motorista); só a da gestão vale no despacho.
- **Operador** ainda mexe em punições e veículos; nos cadastros genéricos isso é só de admin (`gestao/motoristas.ts`).
- **Saque:** `pedirSaque` ignora o bloqueio de saque do motorista e as regras de Integrações (`apps/extras.ts`).
- **Desafios** automáticos ignoram hora, faixa de corridas e situação definidas no painel.
- **Editar OS** finaliza ou cancela sem os efeitos da carteira e apaga a coordenada ao trocar o endereço.
- **Fila virtual** ordena pela hora em que o motorista ficou online, não por "livre desde".
- **Notificação agendada** pode sair duas vezes; **disparo para todos** segura o pedido por minutos.
- **Financeiro** soma só os 2.000 lançamentos mais recentes do período (`config/financeiro.ts`).
- **Consultar corridas e NPS** (branch machine-corrnps): a consulta roda direto no banco (`operacao/consulta.ts`, só a página pedida) quando não há sistema nem planilha ativos (os dados de exemplo não entram nessa lista; escolha a fonte "exemplo" para vê-los). Com outra fonte conectada volta o caminho antigo (junta na memória) e os filtros novos valem só para as corridas próprias. Nº externo, central de chamada e da corrida só aparecem em corridas criadas com esses campos. NPS: notas de 1 a 5 (5 promotor, 4 neutro, até 3 detrator).
- **Planilhas** (Empresas, Recuperação, Histórico): injeção de fórmula em células que começam com `=`, `+`, `-` ou `@`.
- **Desempenho** com milhares de corridas: relatórios, desafios, indicações e o Monitoramento.
- **Clique duplo** em "Confirmar" de crédito do motorista lança duas vezes.
- **Segurança de conta:** trocar o e-mail sem pedir a senha atual; trocar a senha não derruba as outras sessões.
- **Sem uso ainda:** NPS dos apps, descontos automáticos no preço, vários campos de Regras de Despacho, senha de login dos apps, banners nos apps, cargos finos da Equipe.


## Outras sessões e regras
- **Apps** (`local_18a941e0...`): dona dos apps v2; falta a opção "Negociação" por categoria.
- **Sessão principal** (`local_5851c421...`): coordena e fala com o usuário.
- Pastas `mob-igual-*` e `mob-v2-*` (git worktree) são sobras e podem ser removidas (`git worktree remove`).
- Regra de modelos: Sonnet constrói, Haiku faz o mecânico, Fable só para a passada de auditoria e para bug difícil. Tudo em português.


## Andamento da construção (atualizado 13/11/2026)
- **No main:** Mapa de engajamento; Visão geral do financeiro + Extrato da central + Transações online; Consultar corridas (filtros, Exportar) + NPS; Descontos (matriz por forma de pagamento) + Integrações (Transações financeiras); **Casas corrigidas** (base extra de endereços, `npm run importar-casas`). 183 testes passando.
- **Em andamento (ramos machine-*):** Tarifa + Dinâmica (inclui ligar a matriz de descontos ao preço); Relatórios + Vouchers; Pix, pendências, taxas de cancelamento, alertas e central de notificações.
- **Falta:** cadastros completos (motorista, empresa, categoria, nova solicitação), Plantão e Ruas, telas de centrais (Controle financeiro, Meus planos, Demonstrativo, seletor), Funil de Clientes e Mapa de Bairros e Demanda (do 88), comparação tela a tela no navegador, carga de 500 corridas, Docker.
- **Pendente de arquivo:** o arquivo completo das casas (só há 400 linhas de exemplo); o usuário precisa exportar do servidor.

## Cadastros completos de Motorista e Empresa (branch machine-cadmot)
- **Motorista (Alterando Motorista):** todos os campos da Machine: relação, tipo de vínculo, sexo, avaliação, indicado por, documentos (CNH, residência, antecedentes, alvará, foto) com enviar, trocar, excluir, aprovar e rejeitar; status com última mudança, logado (Deslogar), livre/ocupado, impedido até, motivo da punição, última corrida e atividade; categorias, aceita pagamento para e aceita exigência para (ficam no perfil do app, que o despacho já lê); veículos com ano de exercício, UF e cidade de emplacamento, RENAVAM, licenciamento, cor e veículo próprio; endereço completo; dados internos (3 observações) e dados bancários. Excluir manda para a lixeira (Deletado).
- **Lista de motoristas:** filtros novos por relação e validade do licenciamento (e CNH com "vencida há mais de 30 dias"), seleção em massa com alteração em massa (situação, relação, cidade), Exportar CSV (proteção de fórmula).
- **Sensível:** chave Pix e dados bancários só o admin grava; o operador vê a conta mascarada. Validações em português: CPF e CNPJ com dígitos verificadores, e-mail, telefone com DDD, CEP, UF, placa, RENAVAM; CPF não repete na empresa. Só valida o que mudou (cadastro antigo com dado ruim ainda abre).
- **Empresa (Criar/Alterando Empresa):** bandeira, CPF ou CNPJ (alternar), número do contrato, razão social, endereço, situação (Ativo, Suspenso, Aguardando ativação, Deletado), permitir especificar motorista, categorias e pagamentos permitidos com desconto de cada um, observação para o motorista e dados extras. Filtros por nome, documento e situação, última solicitação e Exportar. Só admin grava; excluir = situação Encerrada (histórico mantido).
- **Nova Solicitação respeita a empresa:** situação diferente de Ativa, categoria e pagamento fora da lista e motorista específico (quando "Não") são recusados pelo servidor. Pendente: aplicar o desconto por pagamento no cálculo do preço e mostrar a observação para o motorista no app.
- Código: `painel/src/gestao/validacao.ts`, `gestao/empresas.ts`, `gestao/motoristas.ts`, telas `MotoristaJanela.tsx`, `Motoristas.tsx`, `Empresas.tsx`. Testes: `painel/test/cadastro-motorista-empresa.test.ts` e `empresa-solicitacao.test.ts`.

### Atualização (13/11/2026, noite)
- **Também no main:** Pix, pendências, taxas de cancelamento, alertas e central de notificações; Relatórios e Vouchers; Tarifa (Editar tarifa) e Dinâmica; matriz de descontos já entra no preço da corrida. 203 testes passando.
- **Em andamento (ramos machine-*):** cadmot (motorista e empresa), cadcat (categoria e nova solicitação), plarua (Plantão, Ruas, Áreas, Funil de Clientes, Mapa de Bairros), centr (telas de centrais).
- **Depois:** comparar tela a tela com a Machine no navegador, carga de 500 corridas, Docker, up.veloov.com.

## Página inicial e Mapa de engajamento iguais à Machine (branch machine-painel)
- Comparação bloco a bloco em `docs/COMPARACAO_PAINEL_INICIAL.md`. Página inicial com períodos por bloco, NPS de passageiros e motoristas, engajamento e comparativos; Mapa de engajamento com os indicadores, faixas, régua, filtros e ações da Machine (sem mapa, como na Machine).
- Testes: `painel/test/painel-inicial.test.ts` e `painel/test/engajamento.test.ts`.

### Atualização (14/11/2026)
- **Tudo no main:** todas as 15 prioridades do pente fino, telas de centrais, Plantão/Ruas/Áreas, Funil de Clientes, Mapa de Bairros, cadastros de motorista, empresa, categoria e solicitação, Painel inicial e Mapa de engajamento no formato da Machine, casas corrigidas (`npm run importar-casas`).
- **Carga corrigida:** 500 corridas em 31 a 43 s, 0 erros (antes 85 a 122 s e até 288 erros). Números em `docs/AUDITORIA_COMPLETA.md`. 253 testes passando.
- **Docker refeito** com o main; `up.veloov.com` responde.
- **Falta:** comparar mais telas lado a lado com a Machine (imagem), "Enviar mais de um carro" no despacho, desconto da empresa por forma de pagamento no preço, observação da empresa para o motorista no app, passos 2 a 5 do cadastro do motorista no app (sessão dos apps), teste dos APKs em aparelho, arquivo completo das casas (exportar do servidor), valores reais dos planos das centrais.

## Menu lateral e foto da empresa (branch worktree-agent-a4657717dc85a0595, 14/11/2026)
- **Menu lateral** é o menu principal (como no painel de referência do dono): 240 px, recolhe para só ícones (preferência em `localStorage` `menuLateral`), 6 grupos coloridos (Operação laranja, Bot & Totem azul, Clientes verde, Gestão roxo, Configuração rosa, Ajuda lima), item ativo destacado, claro e escuro. Abaixo de 1024 px vira a gaveta do celular, com o mesmo menu. As abas do topo saíram: o topo tem só empresa, central, sino, tema e perfil.
- Arranjo dos itens em `painel/src/comum/menu-lateral.ts` (ids e rotas continuam os de `funcoes.ts`; blocos recolhíveis Corridas, Frota, Financeiro, Cobrança e Regras e integrações). Tela em `painel/src/web/menu/MenuLateral.tsx`. Teste: `painel/test/menu-lateral.test.ts`.
- **Foto da empresa:** Marca e aparência > Foto da empresa (enviar, trocar, remover). Servidor `painel/src/servidor/foto-empresa.ts` (`/api/empresa/foto`, só admin, PNG/JPG/WEBP até 2 MB, confere a assinatura do arquivo), guardada em `marca.arquivos.fotoEmpresa`. Aparece no menu lateral, no topo e na barra do celular. Teste: `painel/test/foto-empresa.test.ts`.
## Comparação tela a tela com a Machine (14/11/2026)

Cada tela da Machine foi lida e comparada com a nossa, com banco de teste próprio. Detalhe completo (inclusive "o que ainda difere") em `docs/comparacao/GRUPO_A.md` a `GRUPO_E.md`. "quase" = igual com diferença pequena listada. Também: barra do topo igual nos temas claro e escuro (gaveta do celular segue o tema, cor de destaque legível no claro, troca sem piscar) e a etiqueta NOVO foi removida de todo lugar.

| Grupo | Tela | Igual? | O que corrigi (resumo) |
|---|---|---|---|
| A | Consultar corridas | quase | Título "Consultar corridas"; botão "Filtro"; "Exportar relatório" (planilha); texto "Atualizando automaticamente" / "Atualização automática… |
| A | Corrida por motorista | sim | Nada a mudar: filtros (data inicial, data final, nome do motorista, Filtrar, Limpar filtros), Imprimir e colunas OS, Voucher, Data, Viatura,… |
| A | Corridas programadas | quase | Tela refeita: filtros Central chamada, Empresa, Nº OS, Categoria, nome do passageiro, Nome/VTR do motorista, data inicial e final, forma de… |
| A | Solicitar corrida | quase | Título "Solicitar nova corrida"; formulário numa coluna na ordem da Machine: buscar cliente via Telefone/CPF, telefone de cadastro, telefone para… |
| A | Operação (Acompanhamento) | quase | Título "Acompanhamento" e subtítulo "Corridas Pendentes de Atendimento"; filtros Nome do passageiro, Telefone, Nome/VTR do motorista, Endereço de… |
| A | Chat | quase | Abas Motoristas e Empresas; "Criar conversa" (escolhe a pessoa e abre a conversa); item "Mensagem Geral" no topo da lista (envia aviso a todos);… |
| A | Objetos perdidos | quase | Abas Abertos e Finalizados; período (Hoje, Ontem, Últimos 7 e 30 dias, todos, personalizado); "Mais filtros" (motorista, OS, passageiro); colunas… |
| A | Mapa de motoristas | quase | Título "Mapa de motoristas" com "Atualizando automaticamente"; Cadastros ativos, Conectados agora e Desconectados com %; Livres, A caminho,… |
| A | Cliente | quase | Título "Clientes"; botões Criar Estabelecimento, Criar Cliente e Exportar (CSV seguro); filtros Nome, Telefone, CPF, E-mail, período de… |
| A | CadastroPassageiro Cliente | quase | Janela "Cadastro de passageiro": Informações gerais (Bandeira, Tipo, Status), Dados pessoais (Nome, Telefone, CPF), "Campos com * são… |
| A | Notificações | quase | Tela "Notificações app" com o texto da Machine, botão "Nova notificação", filtros Destinatário (Todos, Clientes App, Motoristas), datas, Título,… |
| A | Leme (Painel inicial) | sim | Conferido no navegador: Indicadores, Estatísticas da operação, Corridas solicitadas, origem das finalizadas, Ganhos gerais, Ticket médio,… |
| A | Motorista (lista) | quase | Título "Motoristas"; botões Criar e Exportar; abas Todos, Ativos, Suspensos, Em análise, Fila de espera, Rejeitados, Inativos, Deletados (com… |
| A | Alterando Motorista | quase | Conferido item a item (feito antes pelo ramo machine-cadmot): versão do app, taxa de aceitação, total de corridas, Geral e Cerca eletrônica,… |
| A | Empresa (lista) | quase | Botões Criar Empresa e Exportar relatório na ordem da Machine; sem subtítulo extra; colunas Nome fantasia, CPF/CNPJ, Status da empresa primeiro;… |
| A | Create Empresa | quase | Conferido: Bandeira, CPF/CNPJ com troca, Número do contrato, Razão social, Nome fantasia, endereço, UF, Cidade, Bairro, CEP, Status e última… |
| B | tela | igual? | o que corrigi |
| B | Visão geral do financeiro | quase | Textos das dicas dos cartões iguais aos da Machine; dicas também nos títulos dos gráficos; "Total do próximo repasse" foi para o fim (depois da… |
| B | Extrato da central | quase | Nome da central logo abaixo do título; botão "Mais ações" com Exportar CSV (rota nova `/extrato-central/csv`); título "Movimentações" com o dia ou… |
| B | Extrato de transações online | quase | Período padrão Hoje; botão "Mais filtros" abre tipo, status e data de repasse; busca por ID da transação acima da tabela; "Ver detalhes" em… |
| B | Demonstrativo Mensal | sim | Nada a mudar: Bandeira, Competência, Dias ativos, Exportar, tabela Descrição/Quantidade/Valor unitário/Débitos/Créditos, Total a pagar,… |
| B | Faturamento de centro de custo | sim | Só o botão Imprimir no topo (sem Exportar), datas sem asterisco, rótulo "Filtros", texto "Nenhum resultado encontrado." |
| B | Faturamento por empresa | quase | Botões Exportar e Imprimir, asteriscos em Data inicial, Data final e Empresa, rótulo "Filtros", vazio como na Machine |
| B | Faturamento por período | sim | Só o botão Exportar no topo, datas sem asterisco, "Gerar", rótulo "Filtros" |
| B | Relatório de faturamento | sim (tela nova) | Não existia. Criada: 5 indicadores (bruto, taxa da central, ticket médio, não atendidas, canceladas), período, Mais filtros (status e forma de… |
| B | Relatório de Km rodados | sim | Só o botão Exportar, datas sem asterisco, rótulo "Filtros" |
| B | Gestão de pendências de pagamentos | quase | Período padrão Hoje (como a Machine); lista de períodos da Machine; linha "Filtrando por" sempre visível (Todos e o período) |
| B | Gestão de taxas de cancelamento | quase | Data no formato "dd/mm/aaaa - hh:mm"; "Passageiro" acima do nome; linha "Filtrando por: Período: ... até ..."; lista de períodos da Machine |
| B | Transação com Pix | quase | Período padrão Hoje com a lista da Machine (inclui Últimos 14 dias, novo no servidor); "Nome/VTR do motorista" busca também pela viatura; rótulo… |
| B | Controle financeiro de centrais | quase | Nada: colunas, dicas e opções já batiam |
| B | Meus planos | quase | Nada: Plano, categoria de bonificação, tarifa, cobrança fixa, taxas, incluso, serviços adicionais já batiam |
| B | Vouchers e tickets por motoristas | sim | Exportar e Imprimir, datas sem asterisco, rótulo "Filtros" |
| B | Entrega de voucher | sim | Nada: VTR/Nome, OS Compradas, Obter OS Pendentes, Limpar filtros, tabela e Registrar Entrega já batiam |
| B | FaixaVoucherEmpresa (Faixas de Vouchers) | sim | Filtro "Empresa *" com asterisco |
| B | Create FaixaVoucherEmpresa (Criando Faixa de Vouchers) | sim | Campo "Bandeira *" antes de Empresa (lista com o nome da central) |
| B | Cupons | quase | Tela refeita no formato da Machine: botão "Criar cupom", filtro de tipo (Resgatável, Automático, Todos), Exportar (Impressão e Planilha CSV, rota… |
| C | Tarifa Categoria | Config › Tarifas e categorias | quase |
| C | Dinamica TarifaCategoria | Config › Tarifas dinâmicas | quase |
| C | EditarTarifaExtra TarifaCategoria | Tarifas e categorias › Tarifa › Editar tarifa | sim |
| C | Create Categoria | Tarifas e categorias › Criar categoria | quase |
| C | Descontos | Config › Descontos | quase |
| C | Alterando Desconto | Descontos › Alterar | sim |
| C | AlteraValor (Alteração de dados da OS) | Corridas › Alteração de dados da OS (nova) | quase |
| C | Alterando Bandeira (Gerais) | Config › Gerais do App › aba Despacho (nova) | parcial |
| C | Integracoes Bandeira | Config › Integrações › Transações Financeiras | quase |
| C | DespachoBandeira Bandeira | Config › Despacho | sim |
| C | DespachoBandeirasParceiras Bandeira (Transbordo) | Config › Transbordos | quase |
| C | TermosUso Bandeira | Config › Termos de uso | quase |
| C | Personalização | Config › Personalização app passageiro (nova) | parcial |
| C | Up Corridas | Painel (Indicadores) | quase |
| C | Punicao Qrt | Cadastro › Punições › Gerenciar Punição | sim |
| C | Recompensas Indicacao | Financeiro › Estatísticas › Recompensas por indicação (nova) | quase |
| D | Area (lista de Áreas) | quase | Título "Áreas" e o texto da Machine; botões "Criar Área" e "Visão Geral" (antes eram abas); filtro na lateral ("Filtros", Nome, Filtrar, Limpar… |
| D | Create Area (Criando Área) | quase | Título "Criando Área" (na edição, "Alterando Área"); "Campos com * são obrigatórios."; faixa "Clique na área para entrar ou sair do modo de… |
| D | VisaoGeral Area | quase | Virou uma tela própria ("Visão Geral") aberta pelo botão; Mapa/Satélite; botões Voltar e Gravar no rodapé, como na Machine. |
| D | Plantao (lista) | sim | Título e texto da Machine (inclusive "tem prioridade nas filas"); botão "Criar Plantão"; filtros Data Inicial, Hora Inicial, Data Final, Hora… |
| D | Create Plantao | sim | "Criando Plantão" com Data Inicial *, Hora Inicial, Data Final *, Hora Final, Voltar e Criar; a ação Editar abre a mesma tela como "Alterando… |
| D | GerenciaPlantao Plantao | sim | Datas e horas só para ler (como na Machine; para mudar usa-se Editar); "Vtr / Motorista" (busca com 2+ letras), "Adicionar Motorista", Voltar;… |
| D | Ruas | quase | Sem regras: tela com "O que são regras de via?", o texto da Machine (tirei a frase a mais) e o botão "Criar nova regra". Com regras: lista e botão… |
| D | Mapa de engajamento | sim (já estava) | Nada: já foi comparado e igualado antes (ver docs/COMPARACAO_PAINEL_INICIAL.md, parte B). |
| D | Alerta (lista) | sim | Filtros na lateral: Empresa, Conteúdo do alerta, Tipo de alerta (Urgente, Atenção, Aviso em caixas de marcar), Status (Ativo marcado de início,… |
| D | Create Alerta | sim | Já era igual; só ajustei o limite de "Exibir alerta por" a 750 e tirei o rótulo "Unidade" (a Machine só tem o número e Horas/Dias/Semanas). |
| D | CentralNotificacoes Alerta | sim (já estava) | Nada novo: sino com "Central de notificações", Todos, "Somente não lidas", seleção e "Tudo em dia!" já existiam. |
| D | Create Notificacao | quase | Nova tela "Criando Notificação" (botão "Nova notificação" em Comunicação › Notificações Push): "Para agora" / "Agendar" (data e hora de envio e o… |
| D | ConfiguracaoNPS Avaliacao | quase | Título "Configurações NPS" com dois blocos, "NPS para passageiros" e "NPS para motoristas": "Ativar pesquisa de NPS ...", o texto da Machine,… |
| D | NPS Avaliacao | quase | Título "Net Promoter Score"; abas Passageiros e Motoristas (nessa ordem, no alto); período e tipo na barra; "Mais filtros" abre "Filtro de… |
| D | Desafios | sim | Tela vazia com "Comece a criar desafios agora mesmo" e "Clique em "Novo desafio" abaixo para começar." com o botão verde. |
| D | Desafios dos motoristas | quase | Título "Desafios"; botão verde "Novo desafio"; abas Motoristas e Clientes; barra com Período, Status (Todos, Ativos, Aguardando, Cancelados,… |
| E | Estatística por bairro | igual, com adaptação | Filtros numa coluna à esquerda (Data inicial, Data final, Filtrar, Limpar filtros) e tabela à direita. Título sem texto de apoio. "Exibindo 1-10… |
| E | Estatística por empresa | igual, com adaptação | Mesmo formato da tela acima. Colunas Empresa, Corridas, Valor, Porcentagem. Valor em reais |
| E | Estatística por forma de pagamento | igual, com adaptação | Mesmo formato. Colunas Forma de pagamento, Corridas, Porcentagem. Asterisco (*) nas datas só nesta tela, como na Machine |
| E | Estatísticas por motorista | igual, com adaptação | Mesmo formato. Colunas ID ("viatura - nome"), Corridas, Porcentagem, ordenadas do maior para o menor |
| E | Estatísticas por operador | igual, com adaptação | Mesmo formato. Botões Exportar (CSV) e Imprimir. Colunas Operador, FINALIZADAS, CANC PASS, CANC MOTORISTA, CANC OPE, N/ATEND, TOTAIS. Tirei a… |
| E | Relatorio (índice de Relatórios) | igual, com adaptação | "Relatórios padrão" em cartões numerados de 1 a 9, na ordem e com os nomes da Machine (o 1 abre Motoristas; os outros abrem em outra aba, como… |
| E | Página inicial (Painel) | igual, com adaptação | Nada novo: já estava igual (ver `docs/COMPARACAO_PAINEL_INICIAL.md`). Conferi de novo no navegador: aviso de atenção, períodos, corridas… |
| E | Menu do topo | igual, com adaptação | Grupos na ordem: Painel, Cadastro, Corridas, Financeiro, Comunicação, Configurações (era "Config"), Avaliações, Ajuda. Submenus como na Machine:… |
| E | Menu do usuário | igual, com adaptação | "Alterar Senha" virou "Trocar senha" e "Sair do Sistema" virou "Sair" (menu do topo e menu do celular). Sino de notificações antes do nome, como… |

## Barra do topo em qualquer zoom (14/11/2026)
- A barra mede o espaço e manda os grupos que não cabem para o menu "Mais" (sem quebrar linha nem sobrepor); logo, sino, tema e perfil ficam inteiros à direita. Conferido em 1920, 1536, 1366, 1280, 1100 e 1024, nos temas claro e escuro.
- As telas de Corridas seguiam um tema escuro fixo (título sumia no claro); agora seguem o tema do painel.
- Teste de navegador das telas: 82 telas, 1 aviso (`/bot` sem título no teste; conferir).
- Em andamento (agentes, 14/11): taxas da central e carteira; cargos, filiais e superadmin; menu lateral e foto da empresa; segurança; CRM/Bot/Totem do mobveloov.

## Taxas da central e ajuste de carteira (branch worktree-agent-a538efdd5eef532ee, 14/11/2026)
- **Taxas da central** (Config › Taxas da central, aba "Taxa por corrida", igual às capturas da Machine): nome (aparece no extrato), até 10 faixas de valor (porcentagem ou valor fixo), quem paga (motorista ou passageiro), categorias, formas de pagamento e simulador. Só admin grava; cada central (empresa) tem as suas. Aba "Automações" ainda sem conteúdo (a captura não mostra). Código: `comum/taxas.ts` (conta, também usada no simulador), `config/taxas.ts`, rotas `/api/config/taxas`, tela `web/telas/demais/TaxasCentral.tsx`.
- **Efeito:** com ao menos uma taxa do motorista, elas substituem a comissão da categoria em `calcularComissao` (motorista Personalizado ou Isento continua valendo). Ao finalizar a corrida (app do motorista) a taxa do motorista é debitada da carteira dele, com o nome da taxa no extrato. A do passageiro: sai da carteira dele se pagou com saldo, do motorista se recebeu em dinheiro, máquina ou Pix, e de ninguém no cartão no app. `estimarPreco` devolve `taxaServico` (o app ainda não mostra). Não passa por "Editar OS" do painel.
- **Carteiras:** ajuste manual (`ajustarCarteira`, em `apps/extras.ts`) com motivo obrigatório (5 letras ou mais), chave única por clique (clique duplo não lança duas vezes), só admin, valor até R$ 10.000, débito não deixa saldo negativo, pessoa precisa existir. As duas rotas (`/api/config/carteiras/:papel/:chave/ajuste` e `/api/apps-central/carteiras/lancar`) usam a mesma função. O histórico mostra quem e quando. O app lê o mesmo saldo. Teste: `painel/test/taxas-carteira.test.ts`.
