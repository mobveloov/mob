# Auditoria parcial: FINANCEIRO (menu Financeiro e grupo Cobrança)

Referência: arquivos `.htm` da Machine (prefixos citados). Telas sem arquivo da Machine estão marcadas "sem referência".

| tela (menu) | arquivos Machine usados | igual? (sim/não) | o que faltava | corrigido (arquivo ou teste) |
|---|---|---|---|---|
| Créditos: Carteiras, Recargas e Saques, Extrato | nenhum (a Machine salva não tem estas telas) | sim (sem referência) | não há o que comparar | nada alterado |
| Cartão: Painel, Transações, Saldo da central, Saldo do motorista | nenhum | sim (sem referência) | não há o que comparar | nada alterado |
| Pix > Transações | ebbe6960 | não | filtros Bandeira e Bandeira da corrida, botão Filtrar, placeholder "Nº OS" | `src/web/telas/demais/Pix.tsx`, `src/operacao/pix.ts`, `src/operacao/rotas.ts`; teste `test/auditoria-financeiro.test.ts` |
| Contas a receber: Faturamento por empresa | cfe01c59 | sim | nada (filtros, asteriscos, botões, colunas conferem) | já existia (`src/relatorios/relatorios.ts`) |
| Contas a receber: Faturamento de centro de custo | 9ce39721 | sim | nada | já existia |
| Contas a receber: Faturamento por período | 4848d062 | sim | nada (taxa 20%, valor fixo, categorias, tipos de pagamento, Gerar) | já existia |
| Contas a pagar: Vouchers e tickets por motoristas | 26b6d311 | sim | nada | já existia |
| Contas a pagar: Pagamentos pendentes | 0f967758, 1c60de78, 48b36de5, 6e03c951 | não conferida | a tela é `src/web/telas/corridas/Pendentes.tsx` (grupo Corridas, fora dos meus arquivos) | fica com o grupo Corridas |
| Relatórios > Visão geral | 606e50a1, 7d550375 | não | aviso "Atenção" do topo | `FinanceiroMachine.tsx` (texto honesto: dados vêm do painel, sem citar Pagar.me) |
| Relatórios > Faturamento | 14aed2bd, 6c4f8352, ba11f48f | não | aviso do topo; filtro em "Filtro de pesquisa" com caixas de marcar (10 formas com os nomes da Machine e 3 status, "Todos") e botão Cancelar | `RelatorioFaturamento.tsx`, `src/config/financeiro-visao.ts`; teste `auditoria-financeiro.test.ts` |
| Relatórios > Transações online | 2003202f, 234861a5, 82ce4cd0, ef7839e3 | não | aviso do topo; tipo e repasse em caixas de marcar; paginação de 10 com Primeira/Última e "Exibindo x-y de n"; colunas (a coluna "Repasse" da Machine é a situação Pago/Pendente...) | `FinanceiroMachine.tsx`, `financeiro-visao.ts`, `src/config/rotas.ts`; teste `auditoria-financeiro.test.ts` |
| Estatísticas: OS por motorista (Corrida por motorista) | dfa197f7 (índice) | sim | nada | já existia |
| Estatísticas: OS por empresa / bairro / forma de pagamento / operador / % por motorista | a13d7794, 50d9f27d, 598190d0, fbdee954, caf1ff17 | sim | nada (botões Imprimir/Exportar e asterisco só na forma de pagamento conferem) | já existia |
| Poder público > Km rodados por motorista | 5a11a3e6 | sim | nada | já existia |
| Poder público > Recompensas por indicação | 127f1c58, 723fea38, dcc760c9, ed6f943d | não conferida | a tela está em `telas/cadastro/Indicacoes.tsx` / `crm2` (outro grupo) | fica com o outro grupo |
| Relatórios (índice e Criar modelo) | dfa197f7 | sim | nada (os 9 relatórios padrão e os 3 modelos sugeridos conferem; o formulário do modal não está salvo na Machine) | já existia |
| Extrato Geral, Saques, Recargas, Relatórios & Stats | nenhum | sim (sem referência) | não há o que comparar | nada alterado |
| Cobrança > Extrato da central | 4218862a, 47a0bf80, 968fff9a, 6c08b85d, facc5b1e, d9b3fef6 | não | seletor de central (botões, só com rede); aviso "Relatório gerado com sucesso! / Baixar relatório" ao exportar; item "Exportar" no Mais ações | `FinanceiroMachine.tsx`, `centrais/comum.ts` |
| Extrato da central: cards "Integradores" e "Limite de saldo", "Baixar nota fiscal", detalhe da tarifa por OS | mesmos | não | dependem de limite de crédito da plataforma, integradores e emissão de nota fiscal, que não existem aqui | pendente: serviço externo |
| Cobrança > Controle financeiro de centrais | cd607155 | não | dicas com o texto da Machine; "Exibir extrato" como chave (fixa e marcada na principal); opção "Não permitir" no débito automático; a principal também escolhe o próprio débito | `ControleCentrais.tsx`, `src/centrais/rede.ts`; teste `auditoria-financeiro.test.ts` |
| Cobrança > Demonstrativo Mensal | 4e772c44 | não | linha "Valor corridas" (resumo, não soma duas vezes). Linhas de serviços da Machine (anúncios 1 a 4, rota exibida, Analytics) não existem aqui | `src/centrais/cobranca.ts`; teste `auditoria-financeiro.test.ts` |
| Cobrança > Meus planos | f51178ed, f6d0da94 | não | falta a faixa "Você economizou R$ X em opcionais no mês anterior com o plano Ultra" | pendente: depende do uso de SMS e validação de CPF, que o painel não mede |
| Cobrança > Último boleto | nenhum | sim (sem referência) | boleto real depende da plataforma emitir | nada alterado |

Provas: testes novos em `painel/test/auditoria-financeiro.test.ts` (6 testes); `centrais`, `financeiro-machine`, `pix-pendencias` e `relatorios-vouchers` seguem passando. Não houve prova visual no navegador: conferido pela leitura do código.
