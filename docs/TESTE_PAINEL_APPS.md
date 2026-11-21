# Funções do painel que afetam os apps: inventário completo e teste (21/11/2026)

Percorre o **menu inteiro do painel** (100 itens, de `src/comum/menu-lateral.ts`) e diz, item a item, se muda algo no app do motorista ou do passageiro, como foi testado e o resultado. "Teste automático" = chama as mesmas funções do painel e confere a resposta que o app recebe (`painel/test/`). **Nenhuma linha foi conferida com painel e app lado a lado num aparelho.**

Legenda do resultado: **ok** = testado; **pendente** = tem efeito no app e ainda falta teste ou implementação; **sem efeito** = não aparece nos apps; **depende do dono** = precisa de chave externa (Firebase, Mercado Pago/Pix).

**Limite desta rodada:** a coluna "Comportamento na Machine" não foi preenchida por item. Só há documentos de comparação já no repositório (`docs/PENTE_FINO_MACHINE_88.md`, `docs/AUDITORIA_IGUAL_ORIGINAIS.md`, `docs/APPS_COMPARACAO.md`); não abri o APK da Machine para conferir cada tela.

| Grupo > bloco > tela | Efeito no nosso app | Como foi testado | Resultado |
|---|---|---|---|
| Painel > Painel | Sem efeito direto (resumo do painel) | - | sem efeito |
| Cadastro > Minha equipe | Sem efeito no app (usuários do painel) | - | sem efeito |
| Cadastro > Cupons | Passageiro vê os cupons ativos (/cupons) e aplica no pedido; desativado, some | apps-painel.test.ts: cupom criado e desativado | ok |
| Cadastro > Passe Livre | Ofertas de passe criadas no painel aparecem no app; a compra debita o saldo e o passe fica vigente | apps-painel.test.ts "onda 1": oferta aparece, compra de R$ 20 com crédito de R$ 50 deixa +30 e passe vigente | ok |
| Cadastro > Empresas | Empresa conveniada: corrida faturada (pagamento da empresa), observação para o motorista | Sem teste de ponta a ponta | pendente |
| Cadastro > Faixa de Vouchers | Sem rota própria nos apps (voucher é do painel/financeiro) | - | sem efeito |
| Cadastro > Gestão de áreas > Áreas | Área de atuação/cerca: define onde o motorista recebe corrida | Sem teste (nenhum teste de app cita área) | pendente |
| Cadastro > Gestão de áreas > Plantão | Motorista em plantão tem prioridade na chamada | apps-despacho.test.ts (nível plantão no desempate) | ok |
| Cadastro > Motoristas | Status (bloqueado/ativo), categorias, veículo, documentos, endereço: o app lê e grava os mesmos campos | apps-painel.test.ts: bloqueio e reativação; veículo do cadastro em Meus veículos; apps-campos-unificados.test.ts | ok |
| Cadastro > Punições | Motorista punido fica sem receber corrida | apps-extras.test.ts (bloqueios), não repeti | ok |
| Cadastro > Clientes > Clientes | Cadastro do passageiro (nome, telefone) e bloqueio; o app lê e grava | apps-painel.test.ts (cadastro nos dois papéis); bloqueio em apps.test.ts | ok |
| Cadastro > Clientes > Consulta de cartões | Sem efeito direto no app (cartão é do financeiro) | - | sem efeito |
| Cadastro > Ruas | Ruas/trechos: correção de nome de via na busca de endereço do app | enderecos-correcoes.test.ts (painel); busca no app: provas em docs/evidencias | ok |
| Cadastro > Desafios | Tela "Indique e ganhe/Desafios" do motorista lê os desafios ativos e o progresso | apps-extras.test.ts (desafios) | ok |
| Corridas > Solicitar nova corrida | Corrida criada pelo painel chega ao motorista (despacho) e ao passageiro | apps-painel.test.ts: "painel → app: cancelar e mudar status" e corrida do app no painel | ok |
| Corridas > Acompanhamento | Mostra corridas do app (status em tempo real) | apps-painel.test.ts (corrida do app aparece no painel) | ok |
| Corridas > Retorno e Ocorrências | Sem rota própria no app (retorno e ocorrência são do painel) | - | sem efeito |
| Corridas > Alertas de segurança | SOS do app aparece em Alertas de segurança | sos.ts e testes da sessão do painel; avisos aos motoristas por perto: sem teste meu | pendente |
| Corridas > Consultar corridas | Corrida feita no app aparece aqui com linha do tempo e motivo | apps-painel.test.ts (histórico, no-show, desistência) | ok |
| Corridas > Mapa de motoristas | Posição dos motoristas online do app aparece no mapa do painel | apps-despacho.test.ts (motoristasOnline) | ok |
| Corridas > Consultar programadas | Passageiro agenda; a corrida só é oferecida perto da hora | apps-extras.test.ts (agendamento) | ok |
| Corridas > Taxas de cancelamento | Taxa cobrada do passageiro que cancela depois da tolerância; aviso no app | apps-extras.test.ts (taxa de cancelamento) | ok |
| Corridas > Relatórios | Sem efeito no app (relatórios) | - | sem efeito |
| Corridas > Alteração de dados da OS | Alteração da OS pelo painel reflete no app (valor, status) | apps-painel.test.ts (status do painel chega ao app) | ok |
| Corridas > Entrega de voucher | Sem rota própria no app | - | sem efeito |
| Corridas > Objetos perdidos | Objetos perdidos: sem tela no app hoje | Sem teste; sem tela no app | pendente |
| Corridas > Mapa de engajamento | Sem efeito no app (mapa de demanda) | - | sem efeito |
| Financeiro > Créditos > Carteiras de crédito | Saldo e extrato do app vêm da carteira; crédito manual do painel entra no app | apps-painel.test.ts (recarga de saldo do motorista) | ok |
| Financeiro > Créditos > Recargas e Saques | Pedido de saque do app aparece aqui; recarga confirmada entra no saldo | apps-extras.test.ts (saques) e apps-painel.test.ts (recarga) | ok |
| Financeiro > Créditos > Extrato | Extrato do app = extrato do painel | apps-painel.test.ts (extrato mostra o depósito) | ok |
| Financeiro > Cartão > Painel de Controle | Sem tela de cartão no app (pagamento por cartão do app depende do provedor) | Depende de chave externa (Mercado Pago) | depende do dono |
| Financeiro > Cartão > Transações | idem | - | depende do dono |
| Financeiro > Cartão > Saldo da Central | idem | - | depende do dono |
| Financeiro > Cartão > Saldo do Motorista | idem | - | depende do dono |
| Financeiro > Pix > Transações | Recarga Pix: o app mostra instrução; baixa automática depende do provedor | Depende de chave externa (Pix/Mercado Pago) | depende do dono |
| Financeiro > Contas a receber > Faturamento por empresa | Sem efeito no app | - | sem efeito |
| Financeiro > Contas a receber > Faturamento de centro de custo | Sem efeito no app | - | sem efeito |
| Financeiro > Contas a receber > Faturamento por período | Sem efeito no app | - | sem efeito |
| Financeiro > Contas a pagar > Vouchers e tickets por motoristas | Sem efeito no app | - | sem efeito |
| Financeiro > Contas a pagar > Pagamentos pendentes | Sem efeito no app | - | sem efeito |
| Financeiro > Relatórios > Visão geral | Sem efeito no app | - | sem efeito |
| Financeiro > Relatórios > Faturamento | Sem efeito no app | - | sem efeito |
| Financeiro > Relatórios > Transações online | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > OS por motorista | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > OS por empresa | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > OS por bairro | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > OS por forma de pagamento | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > OS por operador | Sem efeito no app | - | sem efeito |
| Financeiro > Estatísticas > % de OS por motorista | Sem efeito no app | - | sem efeito |
| Financeiro > Poder público > Km rodados por motorista | Sem efeito no app | - | sem efeito |
| Financeiro > Recompensas por indicação | Indique e ganhe: código, desafio de indicação e prêmio na carteira | apps-extras.test.ts (indicação e prêmio) | ok |
| Comunicação > Conversas | Chat de suporte do app e conversa da corrida | apps-v2.test.ts (suporte), chat em apps.test.ts | ok |
| Comunicação > Notificações app | Aviso do painel chega ao app (caixa de avisos e push) | Testes da sessão do painel (aviso/push do CRM); chegada em aparelho depende de Firebase | depende do dono |
| Comunicação > Alertas para empresas | Sem efeito no app | - | sem efeito |
| Configurações > Gerais | Motivos de cancelamento, documentos obrigatórios, contatos, preferências, banners, indicação: o app lê de /config | apps-painel.test.ts (documentos e motivos) ; banners/contatos: sem teste | ok |
| Configurações > Personalização app passageiro | Cores, nome, marca, veículo no mapa, recursos e ordem do passageiro | personalizacao-app.test.ts (servidor) + visual no navegador (início do passageiro) | ok |
| Configurações > Personalização app motorista | Aba nova do painel para o motorista: cor/logo; app lê /personalizacao | Servidor: sessão do painel; motorista lê cor e logo (visto no navegador) | ok |
| Configurações > Carteiras de crédito | Botões Adicionar/Retirar, aviso de saldo baixo e saldo mínimo para receber corrida seguem o painel | apps-painel.test.ts "onda 1": saque desligado esconde Retirar, aviso vem do painel, sem saldo mínimo não recebe oferta e com crédito recebe | ok |
| Configurações > Taxas da central | Taxas do motorista e do passageiro por nome no extrato e no detalhe | apps-painel.test.ts (taxas) | ok |
| Configurações > Despacho | Modo (proximidade, geral, fila), limite, tentativas, pendência, vários carros | apps-despacho.test.ts e despacho-varios-carros.test.ts | ok |
| Configurações > Transbordos | Transbordo entre cidades/categorias na escolha do motorista | Sem teste de app (transbordoOk em despacho.ts) | pendente |
| Configurações > Tarifas e categorias | Tarifa, nome, ícone, extras da categoria: estimativa e lista do passageiro | apps-painel.test.ts (tarifa muda a estimativa) | ok |
| Configurações > Tarifas dinâmicas | Tarifa dinâmica global (multiplicador) muda a estimativa do passageiro; desligada, volta | apps-painel.test.ts "onda 1": multiplicador 1,5 sobe a estimativa. Dinâmicas por área/horário/demanda: sem teste | ok |
| Configurações > Descontos | Desconto por regra aplicado à estimativa do passageiro | descontos-integracao.test.ts (servidor); no app: sem teste | pendente |
| Configurações > Integrações | Chaves (Google, WhatsApp, Firebase): só o Firebase muda o app (push) | Depende de chave externa (Firebase) | depende do dono |
| Configurações > NPS | Etiquetas da avaliação e quando pedir a nota | apps-v2.test.ts (etiquetas) | ok |
| Configurações > Termos de uso | Termos aparecem ao entrar conforme o modo (mostrar / não mostrar) | apps-v2.test.ts (termos) | ok |
| Configurações > Regras de Crédito | Comissão por faixa de valor (substitui a da categoria) | config-financeiro.test.ts (servidor); extrato do app usa a mesma função (apps-painel.test.ts) | ok |
| Cobrança > Último boleto | Sem efeito no app | - | sem efeito |
| Cobrança > Demonstrativo Mensal | Sem efeito no app | - | sem efeito |
| Cobrança > Meus planos | Sem efeito no app | - | sem efeito |
| Cobrança > Extrato da central | Sem efeito no app | - | sem efeito |
| Cobrança > Controle financeiro de centrais | Sem efeito no app | - | sem efeito |
| Avaliações > NPS | Nota e comentário do passageiro entram aqui; média no perfil do motorista | apps-painel.test.ts (nota) e apps.test.ts | ok |
| Ajuda > Termos de uso | Texto dos termos exibido no app | apps-v2.test.ts | ok |
| Ajuda > Política de privacidade | Política de privacidade exibida no app | Sem teste próprio | pendente |
| Ajuda > Central de suporte | Contatos de suporte no app (Fale conosco) | Sem teste próprio | pendente |
| Ajuda > Ouvidoria | Sem efeito no app | - | sem efeito |
| Ajuda > Central de Ajuda | Sem efeito no app | - | sem efeito |
| Bot & Totem > Bot de WhatsApp | Sem efeito no app (WhatsApp) | - | sem efeito |
| Bot & Totem > Totens & Preços | Sem efeito no app | - | sem efeito |
| Bot & Totem > App do Totem | Sem efeito no app | - | sem efeito |
| Bot & Totem > Apps e SOS | Apps e SOS: lista de alertas e distribuição do APK; página de download | Download conferido em up.veloov.com; SOS: veja alertas-seguranca | ok |
| Bot & Totem > Endereços | Cidades atendidas, casas importadas, busca e número da casa no app | casas-importacao.test.ts, apps-painel; prova em produção: docs/evidencias/numero-casa-api-producao.txt | ok |
| CRM > CRM & Engajamento | Push do CRM ao app (caixa de avisos + notificação); registra eventos do app (cotou, pediu, finalizou) | Servidor/CRM: testes da sessão do painel; chegada em aparelho depende de Firebase | depende do dono |
| CRM > Recuperação de Vendas | O app registra cada cotação do passageiro (radar de intenções) para a Recuperação de Vendas | Código: /estimativa chama registrarCotacao; sem teste próprio | pendente |
| CRM > Funil de Clientes | Sem efeito no app (análise) | - | sem efeito |
| CRM > Mapa de Bairros e Demanda | Sem efeito no app (análise) | - | sem efeito |
| Mais telas > Operação > Análise com IA | Sem efeito no app | - | sem efeito |
| Mais telas > Operação > Documentos dos motoristas | Documento enviado pelo motorista aparece para aprovar; recusado volta ao app com o motivo | apps-diagnostico-documentos.test.ts e apps-painel.test.ts (documentos em WebP) | ok |
| Mais telas > Operação > Destravar Motoristas | Sem tela no app (ação administrativa que derruba a corrida presa) | - | sem efeito |
| Mais telas > Operação > Veículos | Meus veículos do motorista = cadastro Veículos do painel | apps-painel.test.ts (veículo do cadastro aparece no app) | ok |
| Mais telas > Operação > Filiais | Cidade/filial do passageiro e do motorista e cidades atendidas na busca | enderecos-correcoes e casas-importacao (cidades); escolha de cidade no app sem teste | pendente |
| Mais telas > Financeiro > Extrato Geral | idem Financeiro > Extrato | apps-painel.test.ts | ok |
| Mais telas > Financeiro > Saques | Saque pedido no app aparece e é resolvido aqui | apps-extras.test.ts | ok |
| Mais telas > Financeiro > Recargas | Recarga confirmada entra no saldo do app | apps-painel.test.ts | ok |
| Mais telas > Financeiro > Relatórios & Stats | Sem efeito no app | - | sem efeito |
| Mais telas > Conta e plataforma > Marca e aparência | Nome, logo e cores da empresa nos apps (/marca) | Visto no navegador (logo e cores nos dois apps); personalizacao-app.test.ts | ok |
| Mais telas > Conta e plataforma > Painel do dono | Sem efeito no app | - | sem efeito |
| Mais telas > Conta e plataforma > Trocar senha | Sem efeito no app | - | sem efeito |

**Contagem:** 100 itens do menu: **41 ok**, **10 pendentes**, **41 sem efeito no app**, **8 dependem do dono**.

## O que o dono precisa fazer para o push e o pagamento funcionarem

1. **Firebase (push com o app fechado, CRM, chamada em tela cheia):** criar o projeto no Firebase; baixar `google-services.json` de cada app (pacotes em `tenants/up-corridas/brand.json`) para `tenants/up-corridas/firebase/google-services-motorista.json` e `google-services-passageiro.json`; gerar a chave de conta de serviço e salvar como `/dados/empresas/up-corridas/apps/firebase-servico.json`; gerar os APKs de novo.
2. **Pix e cartão (Mercado Pago ou outro provedor):** criar a conta do provedor e entregar as credenciais; o app já mostra a instrução de recarga e o painel já tem as telas de cartão.
