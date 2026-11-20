# Funções do painel que afetam os apps: o que foi testado (20/11/2026)

Cada linha: o que se muda no painel, o efeito esperado no app, como foi testado e o resultado. "Teste automático" = chama as mesmas funções que o painel usa e confere a resposta que o app recebe (arquivos em `painel/test/`). **Nada disto foi conferido abrindo o painel e o app lado a lado num aparelho.** As linhas "não testado" ficam como pendência declarada, não como aprovadas.

| Função do painel | Efeito esperado no app | Testado como | Resultado |
|---|---|---|---|
| Categorias: tarifa (valor do km) | A estimativa do passageiro muda na hora | `apps-painel.test.ts` "tarifa da categoria muda a estimativa" (km de R$ 2 para R$ 4 e volta) | Passou |
| Categorias: tarifa dinâmica | Estimativa com acréscimo | Não testado de ponta a ponta (existe `dinamica-campos.test.ts`, só do cadastro) | Pendente |
| Taxas da central (motorista e passageiro) | Extrato do motorista lista cada taxa; detalhe do passageiro mostra a taxa e o total pago | `apps-painel.test.ts` "taxas da central" (inclui mudar a taxa e ver o extrato mudar; bruto − taxas = líquido) | Passou |
| Despacho: proximidade, primeiro a aceitar (geral), fila virtual, limite de motoristas, tentativas, pendência, vários carros | Quem recebe a chamada, quando e quantos | `apps-despacho.test.ts` (10 testes) e `despacho-varios-carros.test.ts` | Passou |
| Despacho: raio e tempo de tela | Distância máxima da chamada e segundos para aceitar | Coberto parcialmente em `apps-despacho.test.ts` (variáveis de teste); o campo do painel em si não foi mudado | Parcial |
| Documentos obrigatórios (Gerais › Motorista) | App lista os obrigatórios, bloqueia a conclusão do cadastro sem eles | `apps-painel.test.ts` (lista do `/config` e `/documentos` seguem o painel) e os testes de cadastro da sessão do painel (`/cadastro/concluir`) | Passou |
| Formas de pagamento | Lista de pagamentos oferecida ao passageiro | Não testado (o `/config` expõe `formasDePagamento`; falta mudar no painel e conferir) | Pendente |
| Cupons | Cupom criado aparece para o passageiro; desativado, some | `apps-painel.test.ts` "cupom criado/desativado" | Passou |
| Passe Livre | Passageiro/motorista com passe sem taxa | Não testado | Pendente |
| Carteira: recarga | Depósito confirmado pela central entra no saldo e no extrato do app e aparece em Recargas | `apps-painel.test.ts` "recarga de saldo do motorista" | Passou |
| Carteira: saque | Pedido do app aparece para a central; resolvido, o app mostra a situação | `apps-extras.test.ts` (saques) | Passou (teste da fase anterior) |
| Personalização (cores, marca, veículo no mapa, recursos, ícone do topo) | Apps leem `/personalizacao` e aplicam sem APK novo | `personalizacao-app.test.ts` (servidor, sessão do painel). Lado do app: leitura ao entrar, a cada 60 s e ao voltar; o motorista usa cor, nome e logo do topo | Servidor: passou. Visual no app: visto só no navegador (início do passageiro e do motorista) |
| Termos de uso | Aparecem conforme o modo configurado | `apps-v2.test.ts` (termos) | Passou (teste da fase anterior) |
| Avisos e notificações, CRM push | Aviso chega ao app com o app aberto (tempo real) e, com Firebase, com o app fechado | Tempo real: `apps-despacho/extras`. Push: só com Firebase da empresa (hoje **não configurado**: o APK sai sem o plugin de push) | Push real: não testável sem Firebase |
| Bloqueio de motorista (status Bloqueado) e reativação | O app é barrado e volta ao reativar | `apps-painel.test.ts` "motorista bloqueado no painel perde o acesso" | Passou |
| Punições | Motorista punido não recebe corrida | `apps-extras.test.ts` (bloqueios) | Passou (fase anterior); não repeti |
| Áreas e cerca eletrônica | Corrida fora da área / motorista fora da cerca | Não testado | Pendente |
| Agendamento | Corrida agendada só é oferecida perto da hora | `apps-extras.test.ts` | Passou (fase anterior) |
| Motivos de cancelamento | Listas de motivos do app vêm do painel; "passageiro não apareceu" cancela de vez | `apps-painel.test.ts` (lista igual à do painel; no-show) | Passou |
| Preferências de corrida (exigências) | Opções que o passageiro pede e o motorista filtra | `apps-extras.test.ts`, `apps-v2.test.ts` | Passou (fase anterior) |
| SOS | Alerta gravado com posição, nome e telefone, e aviso aos motoristas por perto | `apps-painel.test.ts` "SOS" (gravação e permissão); aviso em tempo real aos vizinhos: não conferi a chegada ao outro app | Gravação: passou. Entrega aos vizinhos e push: pendente |
| Gravação das corridas | Motorista envia, só a central abre, retenção automática | `apps-painel.test.ts` "gravação da corrida" | Passou |
| Fotos e documentos em WebP | Tudo que entra pelos apps e pelo painel fica em WebP (qualidade 80, até 1600 px) | `apps-painel.test.ts` "fotos enviadas pelos apps viram WebP" (perfil e CNH) | Passou. Foto pelo painel e do chat: mesma função, sem teste próprio |

## O que o dono precisa fazer para o push funcionar (CRM, alerta e chamada com o app fechado)

1. Criar um projeto no Firebase (console.firebase.google.com) e adicionar dois apps Android com os pacotes `br.com.upcorridas.motorista` e o do passageiro (campo `app.passageiro.pacote` do `brand.json`).
2. Baixar o `google-services.json` de cada app para `tenants/up-corridas/firebase/google-services-motorista.json` e `google-services-passageiro.json` (fora do Git).
3. Em Configurações do projeto › Contas de serviço, gerar uma chave privada e salvar como `/dados/empresas/up-corridas/apps/firebase-servico.json` no servidor (ou na variável `FIREBASE_SERVICO_UP_CORRIDAS`).
4. Gerar os APKs de novo. O build já inclui o serviço nativo que mostra a chamada em tela cheia a partir do push de alta prioridade (compilado e validado com um Firebase de teste; nunca rodou com push real).
