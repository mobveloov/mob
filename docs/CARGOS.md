# Cargos do painel

O painel tem quatro cargos, como na Machine. Quem está em cima faz tudo o que os de baixo fazem.

| Cargo (tela) | Valor guardado no usuário | Quem é |
|---|---|---|
| **ADMIN Mestre** | `plataforma` | Dono da plataforma. Entra em qualquer empresa e tem o painel do dono. |
| **ADMIN** | `admin` | Administrador da empresa (na Machine aparece como "ADM GLOBAL"). |
| **Gestor** | `gestor` (novo) | Gestão do dia a dia: cadastros, regras, marketing e o financeiro de motoristas. |
| **Operador** | `operador` | Despacha e acompanha corridas. |

Ordem: Operador < Gestor < ADMIN < ADMIN Mestre. O código está em `painel/src/comum/cargos.ts`.

## De onde veio

Nas telas da Machine aparecem dois cargos no menu do usuário: "ADM GLOBAL" e "Gestor". Comparando os menus:

- O **Gestor** da Machine não tem: Contas a receber (faturamento por empresa, por centro de custo e por período), Pagamentos pendentes, os relatórios do Financeiro (visão geral, faturamento, transações online), as Estatísticas (OS por motorista, empresa, bairro, forma de pagamento, operador e % por motorista) e Recompensas por indicação. Tem Cobrança, Personalização do app e as Configurações.
- O **ADM GLOBAL** tem tudo isso.
- A Machine tem "Estatísticas por operador", mas nenhuma tela dela mostra o cargo Operador nem o ADMIN Mestre. O Operador aqui é o que já existia, só que sem financeiro, regras e equipe. O ADMIN Mestre é o dono da plataforma (papel `plataforma`).

Diferenças de propósito do nosso painel: **Integrações** (guardam chaves) e **Equipe** ficam só com ADMIN; **Análise com IA** também.

## Migração (ninguém perde acesso)

- Os valores já guardados continuam valendo: `plataforma` = ADMIN Mestre, `admin` = ADMIN, `operador` = Operador. Nenhum usuário foi mudado de cargo.
- `gestor` é um valor novo, só dado na tela Equipe.
- Na subida, `migrarCargos()` (em `servidor/dados.ts`) confere todo mundo: cargo que não é reconhecido vira Operador. Ninguém é apagado, e rodar de novo não muda nada.
- O login é o mesmo (e-mail e senha).
- O que mudou para quem já era **Operador**: perdeu o menu e a API de Financeiro, Cadastro > Gestão (cupons, empresas, áreas, punições, desafios, faixa de vouchers, filiais), Configurações, Cobrança, CRM e Marca. Continua com despacho, corridas, motoristas, passageiros, veículos, plantão, conversas, notificações, avaliações, bot, totem, endereços e apps.

## Como é aplicado

1. **Menu:** cada função de `painel/src/comum/funcoes.ts` tem `minimo` (cargo mínimo; sem ele, qualquer cargo). O menu e as rotas do painel só existem para quem pode. Quem digita o endereço de uma tela proibida vê "Página não encontrada".
2. **Servidor:** o porteiro `exigirCargoDaRota` (`servidor/sessao.ts`) olha cada pedido da API na tabela `REGRAS_API` (`comum/cargos.ts`) e responde **403** se o cargo é baixo, mesmo com requisição forjada. Além disso, as rotas continuam com as próprias guardas (`exigirPapel`, que agora respeita a ordem dos cargos: `exigirPapel("admin", "operador")` deixa passar Operador e todos acima).
3. **Cabeçalho `X-Empresa`:** só o ADMIN Mestre troca de empresa. Para os outros ele é ignorado.
4. **Equipe:** o ADMIN dá os cargos ADMIN, Gestor ou Operador. Ninguém dá ADMIN Mestre, ninguém muda o próprio cargo e o ADMIN Mestre não é alterado pela equipe.

Testes: `painel/test/cargos.test.ts` (matriz, 403 por cargo com requisição forjada, equipe e migração).

## Matriz de funções do menu

"sim" = vê e usa. A API segue o mesmo piso (veja abaixo).

| Grupo | Função | Operador | Gestor | ADMIN | ADMIN Mestre |
|---|---|---|---|---|---|
| Painel | Painel | sim | sim | sim | sim |
| Cadastro | Motoristas | sim | sim | sim | sim |
| Cadastro | Destravar Motoristas | sim | sim | sim | sim |
| Cadastro | Passageiros | sim | sim | sim | sim |
| Cadastro | Veículos | sim | sim | sim | sim |
| Cadastro | Equipe | não | não | sim | sim |
| Cadastro | Cupons | não | sim | sim | sim |
| Cadastro | Empresas | não | sim | sim | sim |
| Cadastro | Áreas | não | sim | sim | sim |
| Cadastro | Plantão | sim | sim | sim | sim |
| Cadastro | Ruas | não | sim | sim | sim |
| Cadastro | Punições | não | sim | sim | sim |
| Cadastro | Desafios | não | sim | sim | sim |
| Cadastro | Indicações | não | não | sim | sim |
| Cadastro | Filiais | não | sim | sim | sim |
| Cadastro | Faixa de Vouchers | não | sim | sim | sim |
| Corridas | Nova Solicitação | sim | sim | sim | sim |
| Corridas | Recuperação de Vendas | sim | sim | sim | sim |
| Corridas | Monitoramento | sim | sim | sim | sim |
| Corridas | Mapa Real-Time | sim | sim | sim | sim |
| Corridas | Histórico | sim | sim | sim | sim |
| Corridas | Retorno/Ocorrências | sim | sim | sim | sim |
| Corridas | Programadas | sim | sim | sim | sim |
| Corridas | Pagamentos pendentes | não | não | sim | sim |
| Corridas | Taxas de cancelamento | sim | sim | sim | sim |
| Corridas | Objetos Perdidos | sim | sim | sim | sim |
| Corridas | Mapa de engajamento | sim | sim | sim | sim |
| Corridas | Funil de Clientes | não | sim | sim | sim |
| Corridas | Mapa de Bairros e Demanda | não | sim | sim | sim |
| Corridas | Entrega de voucher | sim | sim | sim | sim |
| Financeiro | Visão geral do financeiro | não | não | sim | sim |
| Financeiro | Extrato da central | não | sim | sim | sim |
| Financeiro | Extrato de transações online | não | não | sim | sim |
| Financeiro | Transação com Pix | não | sim | sim | sim |
| Financeiro | Relatórios | não | não | sim | sim |
| Financeiro | Faturamento por empresa | não | não | sim | sim |
| Financeiro | Faturamento de centro de custo | não | não | sim | sim |
| Financeiro | Faturamento por período | não | não | sim | sim |
| Financeiro | Vouchers e tickets por motoristas | não | sim | sim | sim |
| Financeiro | OS por motorista | não | não | sim | sim |
| Financeiro | OS por empresa | não | não | sim | sim |
| Financeiro | OS por bairro | não | não | sim | sim |
| Financeiro | OS por forma de pagamento | não | não | sim | sim |
| Financeiro | OS por operador | não | não | sim | sim |
| Financeiro | % de OS por motorista | não | não | sim | sim |
| Financeiro | Km rodados por motorista | não | sim | sim | sim |
| Financeiro | Carteiras | não | sim | sim | sim |
| Financeiro | Extrato Geral | não | sim | sim | sim |
| Financeiro | Saques | não | sim | sim | sim |
| Financeiro | Recargas | não | sim | sim | sim |
| Financeiro | Relatórios & Stats | não | não | sim | sim |
| Comunicação | Conversas | sim | sim | sim | sim |
| Comunicação | Notificações Push | sim | sim | sim | sim |
| Comunicação | Alertas para empresas | sim | sim | sim | sim |
| Config | Gerais do App | não | sim | sim | sim |
| Config | Regras de Crédito | não | sim | sim | sim |
| Config | Categorias | não | sim | sim | sim |
| Config | Tarifas Dinâmicas | não | sim | sim | sim |
| Config | Descontos | não | sim | sim | sim |
| Config | Regras de Despacho | não | sim | sim | sim |
| Config | Transbordos | não | sim | sim | sim |
| Config | Integrações | não | não | sim | sim |
| Config | Configuração NPS | não | sim | sim | sim |
| Config | Termos de Uso App | não | sim | sim | sim |
| Cobrança | Demonstrativo Mensal | não | sim | sim | sim |
| Cobrança | Meus planos | não | sim | sim | sim |
| Cobrança | Controle financeiro de centrais | não | sim | sim | sim |
| Avaliações | Avaliações | sim | sim | sim | sim |
| Ajuda | Jurídico & Leis | sim | sim | sim | sim |
| Ajuda | Central de Ajuda | sim | sim | sim | sim |
| Mais | Campanhas | não | sim | sim | sim |
| Mais | Jornadas | não | sim | sim | sim |
| Mais | Público | não | sim | sim | sim |
| Mais | Bot de WhatsApp | sim | sim | sim | sim |
| Mais | Totem | sim | sim | sim | sim |
| Mais | Análise com IA | não | não | sim | sim |
| Mais | Apps e SOS | sim | sim | sim | sim |
| Mais | Documentos dos motoristas | sim | sim | sim | sim |
| Mais | Endereços | sim | sim | sim | sim |
| Mais | Painel do dono | não | não | não | sim |
| Mais | Marca e aparência | não | sim | sim | sim |

(Telas de apoio, como a lista de categorias na Nova Solicitação, continuam legíveis para quem despacha. Gravar nelas é do Gestor para cima.)

## Matriz da API (resumo do piso por caminho)

| Caminho | Cargo mínimo |
|---|---|
| `/superadmin/*`, `POST /empresas` | ADMIN Mestre |
| `/usuarios`, `/gestao/equipe`, `/integracoes`, `/ia`, `/planilhas`, `/relatorio`, `/perguntar` | ADMIN |
| `/relatorios/relatorio/*` (faturamento, OS por...), `/operacao/pendencias`, `/config/visao-geral`, `/config/transacoes-online`, `/config/relatorios/*` | ADMIN |
| Gravar em `/config/carteiras`, `/config/saques`, `/config/extrato-central`, `/config/recargas`, `/apps-central/carteiras` e `/saques` | ADMIN |
| `/config/integracao-financeira`, `/config/pagamentos`, `/gestao/config-creditos`, `/gestao/indicacoes` | ADMIN |
| `/relatorios/relatorio/vouchers-motoristas` e `km-rodados`, `/operacao/pix`, leitura de carteiras e extratos | Gestor |
| `/gestao/cupons`, `areas`, `desafios`, `empresas`, `punicoes`; gravar em `/areas/ruas`; `/areas/funil`, `/areas/bairros` | Gestor |
| Gravar em `/config/*` (gerais, crédito, categorias, tarifas, descontos, despacho, NPS, termos), gravar em `/marca`, `/centrais/*` (menos `/seletor`), `/crm/*`, `/filiais/*` (menos `/filiais/opcoes`) | Gestor |
| Todo o resto (corridas, motoristas, passageiros, veículos, monitoramento, conversas, notificações, plantão, etc.) | Operador |

## Filiais

Cadastro > Gestão > Filiais (Gestor para cima): nome, cidade, endereço, responsável, telefone e ativa. Motoristas e usuários da equipe se ligam a **uma** filial. A corrida guarda a filial de quem pediu na central; sem ela, vale a do motorista que atender. O Histórico e todos os relatórios têm filtro por filial. **Operador e Gestor ligados a uma filial só enxergam as corridas dela** no Histórico e nos relatórios, mesmo mandando outro filtro; ADMIN e ADMIN Mestre veem tudo. Cada empresa só vê as próprias filiais (testes em `painel/test/filiais.test.ts`).

Ainda não restringido por filial: Monitoramento, Mapa em tempo real, Programadas e telas de cadastro (a restrição vale no Histórico e nos relatórios).

## Painel do dono (ADMIN Mestre)

Mais > Painel do dono: empresas (criar com o primeiro ADMIN, suspender, reativar, entrar como a empresa), planos e recursos por empresa (liga e desliga módulos: CRM, bot, totem, análise com IA, engajamento, apps e carteiras, centrais e cobrança, filiais), marca e domínio, uso e faturamento do mês (corridas, receita bruta, tarifas e valor a pagar à plataforma, com CSV) e centrais e franquias. **Empresa suspensa não entra** no painel nem nos apps (o dono continua entrando para dar suporte). Nada é apagado. A empresa do dono não pode ser suspensa. Módulo desligado some do menu e a API responde 403. Testes em `painel/test/superadmin.test.ts`.
