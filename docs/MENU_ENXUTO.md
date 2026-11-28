# Menu enxuto: de 101 telas para 31 entradas

O menu lateral tinha 101 itens. Agora são **31 entradas**; telas do mesmo assunto viraram **abas internas** de uma entrada.
Nenhuma função foi perdida: cada tela é o mesmo componente de antes, só que dentro de uma aba.

## Como funciona

- Cada entrada tem uma rota (ex.: `/motoristas`). A aba vem do parâmetro `?aba=<id da função>` (ex.: `/motoristas?aba=punicoes`).
  A primeira aba permitida abre sem parâmetro.
- **Rotas antigas continuam abrindo.** Toda rota e todo apelido antigo (`/punicoes`, `/clientes`, `/estatisticas`...) redireciona para a entrada na aba certa, mantendo os outros parâmetros (ex.: `/historico?motorista=Ana`).
- **Permissões:** a aba só aparece se o cargo mínimo da tela original permitir; a entrada só aparece se ao menos uma aba for permitida. O servidor continua sendo quem manda (nada mudou na API).
- **Módulos (recursos) desligados** escondem a aba; a entrada some se não sobrar nenhuma (ex.: sem o módulo Filiais, "Equipe e filiais" fica só com a equipe).
- **Busca (Ctrl K):** uma linha por aba, com o caminho "Grupo > Entrada > Seção". Acha o nome novo (da entrada e da aba) e o nome antigo da tela (ex.: "Marca e aparência", "Personalização app motorista"), e abre na aba certa.
- **Apps:** um item só. Ao abrir, a escolha **Passageiro | Motorista | Totem**; cada seção mostra suas abas.
- Onde está o código: `src/comum/menu-lateral.ts` (entradas e abas), `src/web/telas/abas/EntradaAbas.tsx` (contêiner e redirecionamento),
  `src/web/Autenticado.tsx` (rotas), `src/web/menu/` (menu e busca). `src/comum/funcoes.ts` não mudou: continua sendo a lista das funções (id, rota, cargo mínimo, apelidos).
- Testes: `test/menu-lateral.test.ts` (toda função alcançável, rotas antigas, cargos, módulos, busca) e `test/menu-machine.test.ts` (itens da Machine alcançáveis).

## Antes e depois

| Grupo | Entrada nova (rota) | Abas (seção: aba) | Ids antigos (cada um abre com `?aba=<id>`) |
|---|---|---|---|
| Painel | **Painel** (`/`) | Painel | `painel` |
| Cadastro | **Equipe e filiais** (`/equipe`) | Minha equipe; Filiais | `equipe`, `filiais` |
| Cadastro | **Motoristas** (`/motoristas`) | Motoristas; Punições; Destravar Motoristas; Veículos; Desafios | `motoristas`, `punicoes`, `destravar`, `veiculos`, `desafios` |
| Cadastro | **Clientes** (`/passageiros`) | Clientes; Consulta de cartões | `passageiros`, `consulta-cartoes` |
| Cadastro | **Empresas** (`/empresas`) | Empresas | `empresas` |
| Cadastro | **Cupons e passes** (`/cupons`) | Cupons; Passe Livre; Recompensas por indicação | `cupons`, `passe-livre`, `indicacoes` |
| Cadastro | **Vouchers** (`/faixas-vouchers`) | Faixa de Vouchers; Entrega de voucher | `faixas-vouchers`, `entrega-voucher` |
| Cadastro | **Áreas e ruas** (`/areas`) | Áreas; Plantão; Ruas; Endereços | `areas`, `plantao`, `ruas`, `enderecos` |
| Corridas | **Solicitar nova corrida** (`/solicitar`) | Solicitar nova corrida | `solicitar` |
| Corridas | **Acompanhamento e mapas** (`/monitoramento`) | Acompanhamento; Mapa de motoristas; Mapa de engajamento; Mapa de Bairros e Demanda | `monitoramento`, `mapa`, `engajamento`, `mapa-bairros` |
| Corridas | **Consultar corridas** (`/historico`) | Consultar corridas; Consultar programadas; Alteração de dados da OS; Taxas de cancelamento; Objetos perdidos; Gravações | `historico`, `programadas`, `alterar-os`, `taxas-cancelamento`, `objetos`, `gravacoes` |
| Financeiro | **Pagamentos** (`/carteiras`) | Créditos: Carteiras de crédito; Créditos: Recargas e Saques; Créditos: Extrato; Créditos: Recargas; Créditos: Saques; Créditos: Extrato Geral; Cartão: Painel de Controle; Cartão: Transações; Cartão: Saldo da Central; Cartão: Saldo do Motorista; Pix: Transações | `carteiras`, `creditos-recargas-saques`, `creditos-extrato`, `recargas`, `saques`, `extrato`, `cartao-painel`, `cartao-transacoes`, `cartao-saldo-central`, `cartao-saldo-motorista`, `transacao-pix` |
| Financeiro | **Faturamento e contas** (`/faturamento-empresa`) | A receber: Faturamento por empresa; A receber: Faturamento de centro de custo; A receber: Faturamento por período; A pagar: Vouchers e tickets por motoristas; A pagar: Pagamentos pendentes | `faturamento-empresa`, `faturamento-centro-custo`, `faturamento-periodo`, `vouchers-motoristas`, `pagamentos-pendentes` |
| Financeiro | **Relatórios** (`/visao-geral`) | Resumo: Visão geral; Resumo: Relatórios & Stats; Resumo: Faturamento; Resumo: Transações online; Modelos: Relatórios; Poder público: Km rodados por motorista | `visao-geral`, `relatorios`, `relatorio-faturamento`, `extrato-online`, `indice-relatorios`, `km-rodados` |
| Financeiro | **Estatísticas de OS** (`/os-motorista`) | OS por motorista; OS por empresa; OS por bairro; OS por forma de pagamento; OS por operador; % de OS por motorista | `os-motorista`, `os-empresa`, `os-bairro`, `os-pagamento`, `os-operador`, `os-percentual-motorista` |
| Comunicação | **WhatsApp** (`/conversas`) | Conversas; Bot de WhatsApp | `conversas`, `bot` |
| Comunicação | **Alertas e avisos** (`/alertas-seguranca`) | Alertas de segurança; Retorno e Ocorrências; Notificações app; Alertas para empresas | `alertas-seguranca`, `ocorrencias`, `notificacoes`, `alertas-empresas` |
| Configurações | **Configurações gerais** (`/config-gerais`) | Gerais | `config-gerais` |
| Configurações | **Tarifas e taxas** (`/categorias`) | Tarifas e categorias; Tarifas dinâmicas; Taxas da central | `categorias`, `tarifas-dinamicas`, `taxas-central` |
| Configurações | **Despacho** (`/regras-despacho`) | Despacho; Transbordos | `regras-despacho`, `transbordos` |
| Configurações | **Descontos e regras** (`/descontos`) | Descontos; Regras de Crédito; Carteiras de crédito; NPS; Termos de uso | `descontos`, `regras-credito`, `carteiras-credito`, `config-nps`, `termos-app` |
| Configurações | **Integrações e empresa** (`/integracoes`) | Integrações; Marca e aparência | `integracoes`, `marca` |
| Configurações | **Apps** (`/aplicativos`) | Passageiro: Personalização do app; Motorista: Personalização do app; Motorista: Documentos dos motoristas; Motorista: Online e SOS; Totem: Totens & Preços; Totem: App do Totem | `personalizacao-app`, `personalizacao-motorista`, `documentos`, `apps`, `totem`, `app-totem` |
| Cobrança | **Cobrança da plataforma** (`/ultimo-boleto`) | Último boleto; Demonstrativo Mensal; Meus planos; Extrato da central; Controle financeiro de centrais | `ultimo-boleto`, `demonstrativo-mensal`, `meus-planos`, `extrato-central`, `controle-centrais` |
| Avaliações | **Avaliações (NPS)** (`/avaliacoes`) | NPS | `avaliacoes` |
| Ajuda | **Ajuda e suporte** (`/central-suporte`) | Central de suporte; Central de Ajuda; Ouvidoria | `central-suporte`, `central-ajuda`, `ouvidoria` |
| Ajuda | **Termos e privacidade** (`/ajuda-termos`) | Termos de uso; Política de privacidade | `ajuda-termos`, `juridico` |
| CRM | **CRM e recuperação** (`/crm`) | CRM & Engajamento; Recuperação de Vendas; Funil de Clientes | `crm`, `recuperacao`, `funil-clientes` |
| Mais | **Análise com IA** (`/analise`) | Análise com IA | `analise` |
| Mais | **Painel do dono** (`/superadmin`) | Painel do dono | `superadmin` |
| Mais | **Trocar senha** (`/alterar-senha`) | Trocar senha | `alterar-senha` |


Os ids antigos que já eram a primeira aba abrem a entrada sem parâmetro (ex.: `/motoristas`); as rotas antigas das outras abas redirecionam (ex.: `/punicoes` vira `/motoristas?aba=punicoes`).
O apelido `/config-gerais?aba=despacho` continua valendo: Configurações gerais ficou como entrada própria porque a tela já usa `?aba=` por dentro.

## O que ficou de fora do agrupamento (e por quê)

- **Painel, Solicitar nova corrida, Empresas, Configurações gerais, Análise com IA, Painel do dono, Trocar senha, Avaliações (NPS)**: entradas de uma tela só (sem barra de abas).
- Os itens de menu do usuário (Trocar senha) seguem também no menu da conta, no topo.
- Os grupos "Bot & Totem" e "Mais telas" deixaram de existir: Bot virou aba de WhatsApp; Totem e App do Totem, abas de Apps.
