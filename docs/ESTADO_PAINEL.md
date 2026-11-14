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
