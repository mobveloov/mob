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
