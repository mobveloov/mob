# Funções do painel que afetam os apps: inventário completo e teste (21/11/2026)

Percorre o **menu inteiro do painel** (100 itens, de `src/comum/menu-lateral.ts`) e diz, item a item, se muda algo no app do motorista ou do passageiro, como foi testado e o resultado. "Teste automático" = chama as mesmas funções do painel e confere a resposta que o app recebe (`painel/test/`). Cada tela do painel tem captura em `docs/provas/painel/`. O comportamento dos apps foi provado em navegador 412x915 (`docs/provas/apps-final/`) e nos testes; o que só vale em aparelho real está em `docs/ROTEIRO_APARELHO_REAL.md`.

Legenda do resultado: **ok** = testado; **pendente** = tem efeito no app e ainda falta teste ou implementação; **sem efeito** = não aparece nos apps; **depende do dono** = precisa de chave externa (Firebase, Mercado Pago/Pix).

**Limite desta rodada:** a coluna "Comportamento na Machine" não foi preenchida por item. Só há documentos de comparação já no repositório (`docs/PENTE_FINO_MACHINE_88.md`, `docs/AUDITORIA_IGUAL_ORIGINAIS.md`, `docs/APPS_COMPARACAO.md`); não abri o APK da Machine para conferir cada tela.

| Grupo > bloco > tela | Efeito no nosso app | Como foi testado | Resultado | Captura do painel (1280x800) |
|---|---|---|---|---|
| Painel > Painel | Sem efeito direto (resumo do painel) | - | sem efeito | [captura](provas/painel/painel.jpg) |
| Cadastro > Minha equipe | Sem efeito no app (usuários do painel) | - | sem efeito | [captura](provas/painel/equipe.jpg) |
| Cadastro > Cupons | Passageiro vê os cupons ativos (/cupons) e aplica no pedido; desativado, some | apps-painel.test.ts: cupom criado e desativado | ok | [captura](provas/painel/cupons.jpg) |
| Cadastro > Passe Livre | Ofertas de passe criadas no painel aparecem no app; a compra debita o saldo e o passe fica vigente | apps-painel.test.ts "onda 1": oferta aparece, compra de R$ 20 com crédito de R$ 50 deixa +30 e passe vigente | ok | [captura](provas/painel/passe-livre.jpg) |
| Cadastro > Empresas | Empresa conveniada: corrida faturada (pagamento da empresa), observação para o motorista | apps-pendentes.test.ts: a observação da empresa conveniada chega ao motorista na chamada | ok | [captura](provas/painel/empresas.jpg) |
| Cadastro > Faixa de Vouchers | Sem rota própria nos apps (voucher é do painel/financeiro) | - | sem efeito | [captura](provas/painel/faixas-vouchers.jpg) |
| Cadastro > Gestão de áreas > Áreas | Área de atuação/cerca: define onde o motorista recebe corrida | apps-pendentes.test.ts: área de bloqueio impede o pedido do passageiro dentro dela | ok | [captura](provas/painel/areas.jpg) |
| Cadastro > Gestão de áreas > Plantão | Motorista em plantão tem prioridade na chamada | apps-despacho.test.ts (nível plantão no desempate) | ok | [captura](provas/painel/plantao.jpg) |
| Cadastro > Motoristas | Status (bloqueado/ativo), categorias, veículo, documentos, endereço: o app lê e grava os mesmos campos | apps-painel.test.ts: bloqueio e reativação; veículo do cadastro em Meus veículos; apps-campos-unificados.test.ts | ok | [captura](provas/painel/motoristas.jpg) |
| Cadastro > Punições | Motorista punido fica sem receber corrida | apps-extras.test.ts (bloqueios), não repeti | ok | [captura](provas/painel/punicoes.jpg) |
| Cadastro > Clientes > Clientes | Cadastro do passageiro (nome, telefone) e bloqueio; o app lê e grava | apps-painel.test.ts (cadastro nos dois papéis); bloqueio em apps.test.ts | ok | [captura](provas/painel/passageiros.jpg) |
| Cadastro > Clientes > Consulta de cartões | Sem efeito direto no app (cartão é do financeiro) | - | sem efeito | [captura](provas/painel/consulta-cartoes.jpg) |
| Cadastro > Ruas | Ruas/trechos: correção de nome de via na busca de endereço do app | enderecos-correcoes.test.ts (painel); busca no app: provas em docs/evidencias | ok | [captura](provas/painel/ruas.jpg) |
| Cadastro > Desafios | Desafio criado no painel aparece no menu **Desafios** do motorista (selo) e na **Conta do passageiro** (indicação), com abas Ativos/Concluídos/Expirados e progresso; meta batida paga o prêmio (automático) ou fica em análise (manual); vencido vai para Expirados; filtra por categoria do motorista | apps-painel.test.ts (desafios: ativo, concluído, em análise, expirado); prova visual 412x915: docs/evidencias/desafios-motorista-1 e 2, desafios-passageiro-1 a 3. Falta: "participar" (não existe campo de adesão) e aviso ao criar o desafio | ok | [captura](provas/painel/desafios.jpg) |
| Corridas > Solicitar nova corrida | Corrida criada pelo painel chega ao motorista (despacho) e ao passageiro | apps-painel.test.ts: "painel → app: cancelar e mudar status" e corrida do app no painel | ok | [captura](provas/painel/solicitar.jpg) |
| Corridas > Acompanhamento | Mostra corridas do app (status em tempo real) | apps-painel.test.ts (corrida do app aparece no painel) | ok | [captura](provas/painel/monitoramento.jpg) |
| Corridas > Retorno e Ocorrências | Sem rota própria no app (retorno e ocorrência são do painel) | - | sem efeito | [captura](provas/painel/ocorrencias.jpg) |
| Corridas > Alertas de segurança | SOS do app aparece em Alertas de segurança | apps-sos.test.ts (SOS do app chega à central e aos motoristas); e2e: SOS do passageiro chega à central e ao motorista (apps-e2e.mjs, captura e2e-*-sos) | ok | [captura](provas/painel/alertas-seguranca.jpg) |
| Corridas > Consultar corridas | Corrida feita no app aparece aqui com linha do tempo e motivo | apps-painel.test.ts (histórico, no-show, desistência) | ok | [captura](provas/painel/historico.jpg) |
| Corridas > Mapa de motoristas | Posição dos motoristas online do app aparece no mapa do painel | apps-despacho.test.ts (motoristasOnline) | ok | [captura](provas/painel/mapa.jpg) |
| Corridas > Consultar programadas | Passageiro agenda; a corrida só é oferecida perto da hora | apps-extras.test.ts (agendamento) | ok | [captura](provas/painel/programadas.jpg) |
| Corridas > Taxas de cancelamento | Taxa cobrada do passageiro que cancela depois da tolerância; aviso no app | apps-extras.test.ts (taxa de cancelamento) | ok | [captura](provas/painel/taxas-cancelamento.jpg) |
| Corridas > Relatórios | Sem efeito no app (relatórios) | - | sem efeito | [captura](provas/painel/indice-relatorios.jpg) |
| Corridas > Alteração de dados da OS | Alteração da OS pelo painel reflete no app (valor, status) | apps-painel.test.ts (status do painel chega ao app) | ok | [captura](provas/painel/alterar-os.jpg) |
| Corridas > Entrega de voucher | Sem rota própria no app | - | sem efeito | [captura](provas/painel/entrega-voucher.jpg) |
| Corridas > Objetos perdidos | Objetos perdidos: sem tela no app hoje | Conferido: não existe tela de objetos perdidos nos apps (nem na Machine do app); o painel registra a ocorrência | sem efeito | [captura](provas/painel/objetos.jpg) |
| Corridas > Mapa de engajamento | Sem efeito no app (mapa de demanda) | - | sem efeito | [captura](provas/painel/engajamento.jpg) |
| Financeiro > Créditos > Carteiras de crédito | Saldo e extrato do app vêm da carteira; crédito manual do painel entra no app | apps-painel.test.ts (recarga de saldo do motorista) | ok | [captura](provas/painel/carteiras.jpg) |
| Financeiro > Créditos > Recargas e Saques | Pedido de saque do app aparece aqui; recarga confirmada entra no saldo | apps-extras.test.ts (saques) e apps-painel.test.ts (recarga) | ok | [captura](provas/painel/creditos-recargas-saques.jpg) |
| Financeiro > Créditos > Extrato | Extrato do app = extrato do painel | apps-painel.test.ts (extrato mostra o depósito) | ok | [captura](provas/painel/creditos-extrato.jpg) |
| Financeiro > Cartão > Painel de Controle | Sem tela de cartão no app (pagamento por cartão do app depende do provedor) | Depende de chave externa (Mercado Pago) | depende do dono | [captura](provas/painel/cartao-painel.jpg) |
| Financeiro > Cartão > Transações | idem | - | depende do dono | [captura](provas/painel/cartao-transacoes.jpg) |
| Financeiro > Cartão > Saldo da Central | idem | - | depende do dono | [captura](provas/painel/cartao-saldo-central.jpg) |
| Financeiro > Cartão > Saldo do Motorista | idem | - | depende do dono | [captura](provas/painel/cartao-saldo-motorista.jpg) |
| Financeiro > Pix > Transações | Recarga Pix: o app mostra instrução; baixa automática depende do provedor | Depende de chave externa (Pix/Mercado Pago) | depende do dono | [captura](provas/painel/transacao-pix.jpg) |
| Financeiro > Contas a receber > Faturamento por empresa | Sem efeito no app | - | sem efeito | [captura](provas/painel/faturamento-empresa.jpg) |
| Financeiro > Contas a receber > Faturamento de centro de custo | Sem efeito no app | - | sem efeito | [captura](provas/painel/faturamento-centro-custo.jpg) |
| Financeiro > Contas a receber > Faturamento por período | Sem efeito no app | - | sem efeito | [captura](provas/painel/faturamento-periodo.jpg) |
| Financeiro > Contas a pagar > Vouchers e tickets por motoristas | Sem efeito no app | - | sem efeito | [captura](provas/painel/vouchers-motoristas.jpg) |
| Financeiro > Contas a pagar > Pagamentos pendentes | Sem efeito no app | - | sem efeito | [captura](provas/painel/pagamentos-pendentes.jpg) |
| Financeiro > Relatórios > Visão geral | Sem efeito no app | - | sem efeito | [captura](provas/painel/visao-geral.jpg) |
| Financeiro > Relatórios > Faturamento | Sem efeito no app | - | sem efeito | [captura](provas/painel/relatorio-faturamento.jpg) |
| Financeiro > Relatórios > Transações online | Sem efeito no app | - | sem efeito | [captura](provas/painel/extrato-online.jpg) |
| Financeiro > Estatísticas > OS por motorista | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-motorista.jpg) |
| Financeiro > Estatísticas > OS por empresa | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-empresa.jpg) |
| Financeiro > Estatísticas > OS por bairro | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-bairro.jpg) |
| Financeiro > Estatísticas > OS por forma de pagamento | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-pagamento.jpg) |
| Financeiro > Estatísticas > OS por operador | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-operador.jpg) |
| Financeiro > Estatísticas > % de OS por motorista | Sem efeito no app | - | sem efeito | [captura](provas/painel/os-percentual-motorista.jpg) |
| Financeiro > Poder público > Km rodados por motorista | Sem efeito no app | - | sem efeito | [captura](provas/painel/km-rodados.jpg) |
| Financeiro > Recompensas por indicação | Indique e ganhe: código, desafio de indicação e prêmio na carteira | apps-extras.test.ts (indicação e prêmio) | ok | [captura](provas/painel/indicacoes.jpg) |
| Comunicação > Conversas | Chat de suporte do app e conversa da corrida | apps-v2.test.ts (suporte), chat em apps.test.ts | ok | [captura](provas/painel/conversas.jpg) |
| Comunicação > Notificações app | Aviso do painel chega ao app (caixa de avisos e push do sistema) | Servidor com a chave do Firebase instalada (OAuth do Google 200 e FCM v1 aceitou a credencial: 400 INVALID_ARGUMENT só pelo token falso); APKs com o plugin de push. Chegada no aparelho: só em celular | ok | [captura](provas/painel/notificacoes.jpg) |
| Comunicação > Alertas para empresas | Sem efeito no app | - | sem efeito | [captura](provas/painel/alertas-empresas.jpg) |
| Configurações > Gerais | Motivos de cancelamento, documentos obrigatórios, contatos, preferências, banners, indicação: o app lê de /config | apps-painel.test.ts (documentos e motivos) ; banners/contatos: sem teste | ok | [captura](provas/painel/config-gerais.jpg) |
| Configurações > Personalização app passageiro | Cores, nome, marca, veículo no mapa, recursos e ordem do passageiro | personalizacao-app.test.ts (servidor) + visual no navegador (início do passageiro) | ok | [captura](provas/painel/personalizacao-app.jpg) |
| Configurações > Personalização app motorista | Aba nova do painel para o motorista: cor/logo; app lê /personalizacao | Servidor: sessão do painel; motorista lê cor e logo (visto no navegador) | ok | [captura](provas/painel/personalizacao-motorista.jpg) |
| Configurações > Carteiras de crédito | Botões Adicionar/Retirar, aviso de saldo baixo e saldo mínimo para receber corrida seguem o painel | apps-painel.test.ts "onda 1": saque desligado esconde Retirar, aviso vem do painel, sem saldo mínimo não recebe oferta e com crédito recebe | ok | [captura](provas/painel/carteiras-credito.jpg) |
| Configurações > Taxas da central | Taxas do motorista e do passageiro por nome no extrato e no detalhe | apps-painel.test.ts (taxas) | ok | [captura](provas/painel/taxas-central.jpg) |
| Configurações > Despacho | Modo (proximidade, geral, fila), limite, tentativas, pendência, vários carros | apps-despacho.test.ts e despacho-varios-carros.test.ts; pendência (tempo do painel, padrão 10 min): apps-painel.test.ts "pendência…" e prova visual 412x915 em docs/evidencias/pendencia-* (aba Pend. do motorista com aviso; pop-up "Não há nenhum motorista disponível" no passageiro depois do tempo). Sem motorista online a corrida também vence e é cancelada | ok | [captura](provas/painel/regras-despacho.jpg) |
| Configurações > Transbordos | Transbordo entre cidades/categorias na escolha do motorista | apps-pendentes.test.ts: desligado, motorista de outra cidade não é chamado; ligado, é | ok | [captura](provas/painel/transbordos.jpg) |
| Configurações > Tarifas e categorias | Tarifa, nome, ícone, extras da categoria: estimativa e lista do passageiro | apps-painel.test.ts (tarifa muda a estimativa) | ok | [captura](provas/painel/categorias.jpg) |
| Configurações > Tarifas dinâmicas | Tarifa dinâmica global (multiplicador) muda a estimativa do passageiro; desligada, volta | apps-painel.test.ts "onda 1": multiplicador 1,5 sobe a estimativa. Dinâmicas por área/horário/demanda: sem teste | ok | [captura](provas/painel/tarifas-dinamicas.jpg) |
| Configurações > Descontos | Desconto por regra aplicado à estimativa do passageiro | apps-pendentes.test.ts: a matriz por forma de pagamento baixa o valor da estimativa que o passageiro vê | ok | [captura](provas/painel/descontos.jpg) |
| Configurações > Integrações | Chaves (Google, WhatsApp, Firebase): o Firebase liga o push dos apps | Firebase configurado: marca.push = true em produção, google-services nos dois APKs. Pix/cartão: sem chave | ok | [captura](provas/painel/integracoes.jpg) |
| Configurações > NPS | Etiquetas da avaliação e quando pedir a nota | apps-v2.test.ts (etiquetas) | ok | [captura](provas/painel/config-nps.jpg) |
| Configurações > Termos de uso | Termos aparecem ao entrar conforme o modo (mostrar / não mostrar) | apps-v2.test.ts (termos) | ok | [captura](provas/painel/termos-app.jpg) |
| Configurações > Regras de Crédito | Comissão por faixa de valor (substitui a da categoria) | config-financeiro.test.ts (servidor); extrato do app usa a mesma função (apps-painel.test.ts) | ok | [captura](provas/painel/regras-credito.jpg) |
| Cobrança > Último boleto | Sem efeito no app | - | sem efeito | [captura](provas/painel/ultimo-boleto.jpg) |
| Cobrança > Demonstrativo Mensal | Sem efeito no app | - | sem efeito | [captura](provas/painel/demonstrativo-mensal.jpg) |
| Cobrança > Meus planos | Sem efeito no app | - | sem efeito | [captura](provas/painel/meus-planos.jpg) |
| Cobrança > Extrato da central | Sem efeito no app | - | sem efeito | [captura](provas/painel/extrato-central.jpg) |
| Cobrança > Controle financeiro de centrais | Sem efeito no app | - | sem efeito | [captura](provas/painel/controle-centrais.jpg) |
| Avaliações > NPS | Nota e comentário do passageiro entram aqui; média no perfil do motorista | apps-painel.test.ts (nota) e apps.test.ts | ok | [captura](provas/painel/avaliacoes.jpg) |
| Ajuda > Termos de uso | Texto dos termos exibido no app | apps-v2.test.ts | ok | [captura](provas/painel/ajuda-termos.jpg) |
| Ajuda > Política de privacidade | Política de privacidade exibida no app | apps-pendentes.test.ts: o texto escrito no painel é o que o app mostra | ok | [captura](provas/painel/juridico.jpg) |
| Ajuda > Central de suporte | Contatos de suporte no app (Fale conosco) | apps-pendentes.test.ts: telefone/e-mail do painel chegam ao app e a conversa de suporte funciona | ok | [captura](provas/painel/central-suporte.jpg) |
| Ajuda > Ouvidoria | Sem efeito no app | - | sem efeito | [captura](provas/painel/ouvidoria.jpg) |
| Ajuda > Central de Ajuda | Sem efeito no app | - | sem efeito | [captura](provas/painel/central-ajuda.jpg) |
| Bot & Totem > Bot de WhatsApp | Sem efeito no app (WhatsApp) | - | sem efeito | [captura](provas/painel/bot.jpg) |
| Bot & Totem > Totens & Preços | Sem efeito no app | - | sem efeito | [captura](provas/painel/totem.jpg) |
| Bot & Totem > App do Totem | Sem efeito no app | - | sem efeito | [captura](provas/painel/app-totem.jpg) |
| Bot & Totem > Apps e SOS | Apps e SOS: lista de alertas e distribuição do APK; página de download | Download conferido em up.veloov.com; SOS: veja alertas-seguranca | ok | [captura](provas/painel/apps.jpg) |
| Bot & Totem > Endereços | Cidades atendidas, casas importadas, busca e número da casa no app | casas-importacao.test.ts, apps-painel; prova em produção: docs/evidencias/numero-casa-api-producao.txt | ok | [captura](provas/painel/enderecos.jpg) |
| CRM > CRM & Engajamento | Push do CRM ao app (caixa de avisos + notificação); registra eventos do app (cotou, pediu, finalizou) | Servidor/CRM: testes da sessão do painel; push real: chave instalada, APKs com plugin; entrega no aparelho só em celular | ok | [captura](provas/painel/crm.jpg) |
| CRM > Recuperação de Vendas | O app registra cada cotação do passageiro (radar de intenções) para a Recuperação de Vendas | apps-pendentes.test.ts: cada cotação do passageiro entra no radar | ok | [captura](provas/painel/recuperacao.jpg) |
| CRM > Funil de Clientes | Sem efeito no app (análise) | - | sem efeito | [captura](provas/painel/funil-clientes.jpg) |
| CRM > Mapa de Bairros e Demanda | Sem efeito no app (análise) | - | sem efeito | [captura](provas/painel/mapa-bairros.jpg) |
| Mais telas > Operação > Análise com IA | Sem efeito no app | - | sem efeito | [captura](provas/painel/analise.jpg) |
| Mais telas > Operação > Documentos dos motoristas | Documento enviado pelo motorista aparece para aprovar; recusado volta ao app com o motivo | apps-diagnostico-documentos.test.ts e apps-painel.test.ts (documentos em WebP) | ok | [captura](provas/painel/documentos.jpg) |
| Mais telas > Operação > Destravar Motoristas | Sem tela no app (ação administrativa que derruba a corrida presa) | - | sem efeito | [captura](provas/painel/destravar.jpg) |
| Mais telas > Operação > Veículos | Meus veículos do motorista = cadastro Veículos do painel | apps-painel.test.ts (veículo do cadastro aparece no app) | ok | [captura](provas/painel/veiculos.jpg) |
| Mais telas > Operação > Filiais | Cidade/filial do passageiro e do motorista e cidades atendidas na busca | apps-pendentes.test.ts: as cidades atendidas do painel são as que o app lista (tela Cidades do app fora do escopo) | ok | - |
| Mais telas > Financeiro > Extrato Geral | idem Financeiro > Extrato | apps-painel.test.ts | ok | [captura](provas/painel/extrato.jpg) |
| Mais telas > Financeiro > Saques | Saque pedido no app aparece e é resolvido aqui | apps-extras.test.ts | ok | [captura](provas/painel/saques.jpg) |
| Mais telas > Financeiro > Recargas | Recarga confirmada entra no saldo do app | apps-painel.test.ts | ok | [captura](provas/painel/recargas.jpg) |
| Mais telas > Financeiro > Relatórios & Stats | Sem efeito no app | - | sem efeito | [captura](provas/painel/relatorios.jpg) |
| Mais telas > Conta e plataforma > Marca e aparência | Nome, logo e cores da empresa nos apps (/marca) | Visto no navegador (logo e cores nos dois apps); personalizacao-app.test.ts | ok | [captura](provas/painel/marca.jpg) |
| Mais telas > Conta e plataforma > Painel do dono | Sem efeito no app | - | sem efeito | [captura](provas/painel/superadmin.jpg) |
| Mais telas > Conta e plataforma > Trocar senha | Sem efeito no app | - | sem efeito | [captura](provas/painel/alterar-senha.jpg) |

**Contagem:** 100 itens do menu: **53 ok**, **0 pendentes**, **42 sem efeito no app**, **5 dependem do dono**. As 101 telas do menu abriram com conteúdo, sem erro de console nem 5xx (`docs/provas/painel/resultado.json`, script `scripts/teste/painel-capturas.mjs`).

## O que o dono precisa fazer para o push e o pagamento funcionarem

1. **Firebase: FEITO em 21/11.** Chave instalada no servidor de produção (`/dados/empresas/up-corridas/apps/firebase-servico.json`, com permissão 600, arquivo novo: nada foi sobrescrito); `google-services` embutido nos dois APKs; o motorista inclui o serviço nativo que mostra a chamada em tela cheia a partir do push só de dados. Só dá para provar em celular real: chamada com o app fechado e a tela bloqueada, o token chegando ao servidor depois do login, o CRM e o SOS tocando no aparelho. Passo a passo original, para outra empresa: criar o projeto no Firebase; baixar `google-services.json` de cada app (pacotes em `tenants/up-corridas/brand.json`) para `tenants/up-corridas/firebase/google-services-motorista.json` e `google-services-passageiro.json`; gerar a chave de conta de serviço e salvar como `/dados/empresas/up-corridas/apps/firebase-servico.json`; gerar os APKs de novo.
2. **Pix e cartão (Mercado Pago ou outro provedor):** criar a conta do provedor e entregar as credenciais; o app já mostra a instrução de recarga e o painel já tem as telas de cartão.
