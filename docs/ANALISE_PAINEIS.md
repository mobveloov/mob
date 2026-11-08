# Análise dos painéis de referência

Mapa curto do que veio na pasta e do que cada painel de referência tem. Base para o painel único.
Neste repositório os dois sistemas de origem são chamados só de **Sistema A** e **Sistema B**.

## O que tinha na pasta

| Material | O que é |
|---|---|
| Arquivo compactado do Sistema A | 163 páginas salvas do painel do Sistema A, 3 planilhas CSV exportadas e 4 PDFs (termos de uso e privacidade) |
| Arquivo compactado do Sistema B | 47 páginas salvas do painel do Sistema B |
| 2 APKs do Sistema B | App do passageiro (Flutter) e app do motorista (Android nativo) |

Os originais **não foram alterados** e **não vão para o Git** (`.gitignore`): são grandes e têm chaves e dados de passageiros.

## Segredos encontrados (não copiados)

- **Chave do Google Maps** (`AIza...`) em várias páginas salvas dos dois sistemas e dentro de um dos APKs.
- Nenhum token JWT, chave de API de IA ou senha apareceu nos arquivos.
- Nada disso foi copiado para o código. As planilhas têm nomes e telefones reais de passageiros: também ficaram de fora.

**Recomendação:** se essas chaves do Google forem da sua empresa, restrinja por domínio/app no Google Cloud.

## Painel do Sistema A

- **Corridas:** acompanhamento, solicitar corrida, consultar corridas, programadas, retorno e ocorrências, taxas de cancelamento, pagamentos pendentes, objetos perdidos.
- **Cadastro:** motoristas, clientes, empresas conveniadas, plantão, punições, áreas, ruas.
- **Financeiro:** visão geral, faturamento (por período, por empresa, por centro de custo), transações online, Pix, vouchers.
- **Estatísticas:** corridas por motorista, % por motorista, por bairro, por empresa, por forma de pagamento, por operador, km rodados.
- **Comunicação:** conversas, notificações do app, alertas para empresas, mapa de engajamento, mapa de motoristas.
- **Configurações:** gerais, tarifas e categorias, tarifas dinâmicas, descontos, cupons, desafios, indicações, despacho, transbordos, integrações, NPS, termos de uso.

**Ponto forte — Consultar corridas:** filtros completos (OS, central, empresa, categoria, passageiro, endereço, motorista, datas e horas, pagamento, 12 status, urgência, canal), atalhos de tempo, atualização automática e exportação em planilha com cerca de 80 colunas.

## Painel do Sistema B

Dashboard, acompanhamento, solicitar corrida, consultar corridas, programadas, despacho, motoristas, clientes, veículos, empresas, cargos, tarifas, dinâmicas, cupons, desafios, indicações, punições, desbloqueio de motorista, carteiras, saques, recargas, extrato, créditos, pagamentos pendentes, conversas, notificações, NPS, funil de clientes, mapa de bairros, mapa de motoristas, áreas, integrações, objetos perdidos, ocorrências.

**Ponto forte — experiência:** indicadores no topo, filtros agrupados, painel lateral de detalhes, mapa com rastreio ao vivo, chat da corrida, recibo, **auditoria da corrida** (ofertas e linha do tempo) e tema claro/escuro.

Os endereços técnicos de cada sistema ficam na documentação do motor (`docs/MOTOR_*.md`).

## Matriz de funções (painel único)

O painel novo é **um painel só** com a **união** das funções dos dois: onde só um tem, entra; onde os dois têm, fica a melhor versão; no menu só aparece o que já funciona; o resto fica nesta tabela até ficar pronto. As corridas de todas as integrações aparecem juntas, com uma etiqueta de origem opcional.

Esta tabela sai de `painel/src/comum/funcoes.ts` (a mesma lista monta o menu do painel).

| Grupo | Função | Sistema A | Sistema B | Painel novo | O que falta |
|---|---|:-:|:-:|---|---|
| Operação | Painel | sim | sim | ✅ pronto |  |
| Operação | Consultar corridas | sim | sim | ✅ pronto |  |
| Operação | Acompanhamento | sim | sim | ✅ pronto |  |
| Operação | Programadas | sim | sim | 🟡 parcial | Campo 'programada' e data agendada na Corrida do motor. |
| Operação | Solicitar corrida | sim | sim | ⏳ falta | Uso de criarCorrida() do motor pelo painel, com estimativa de preço. |
| Operação | Mapa de motoristas | sim | sim | ⏳ falta | Posição dos motoristas (eventos 'posicao') no motor. |
| Operação | Auditoria da corrida (raio-x) | — | sim | ⏳ falta | Histórico de ofertas e linha do tempo por corrida no motor. |
| Operação | Despacho | sim | sim | ⏳ falta | Leitura e gravação das regras de despacho. |
| Operação | Retorno e ocorrências | sim | sim | ✅ pronto |  |
| Operação | Objetos perdidos | sim | sim | ✅ pronto |  |
| Operação | Taxas de cancelamento | sim | — | ⏳ falta | Taxas de cancelamento cobradas por corrida. |
| Cadastros | Motoristas | sim | sim | ✅ pronto |  |
| Cadastros | Passageiros | sim | sim | ✅ pronto |  |
| Cadastros | Empresas conveniadas | sim | sim | ✅ pronto |  |
| Cadastros | Veículos | — | sim | ✅ pronto |  |
| Cadastros | Áreas | sim | sim | ✅ pronto |  |
| Cadastros | Punições e bloqueios | sim | sim | ✅ pronto |  |
| Financeiro | Faturamento | sim | sim | ✅ pronto |  |
| Financeiro | Pagamentos pendentes | sim | sim | ⏳ falta | Pendências de pagamento no motor. |
| Financeiro | Carteiras, saques e recargas | sim | sim | ⏳ falta | Extrato de carteira, saques e recargas Pix no motor. |
| Financeiro | Cupons e descontos | sim | sim | ✅ pronto |  |
| Financeiro | Tarifas e categorias | sim | sim | ✅ pronto |  |
| Relatórios | Produção dos motoristas | sim | — | ✅ pronto |  |
| Relatórios | Estatísticas | sim | — | ✅ pronto |  |
| Relatórios | Análise com IA | — | — | ✅ pronto |  |
| Relatórios | Funil de passageiros | — | sim | ⏳ falta | Cadastros e primeiro pedido dos passageiros no motor. A recorrência já aparece em Estatísticas. |
| Relatórios | Avaliações (NPS) | sim | sim | ✅ pronto |  |
| Relatórios | Desafios e indicações | sim | sim | ✅ pronto |  |
| Comunicação | Conversas | sim | sim | ⏳ falta | Mensagens (eventos 'mensagem') e envio no motor. |
| Comunicação | Notificações do app | sim | sim | ⏳ falta | Envio de notificação push no motor. |
| CRM | Campanhas | — | — | 🗓️ fase seguinte | Fase 3 do docs/PLANO_FASES.md: campanhas, segmentos, cupons e envio em lote com ritmo. |
| CRM | Jornadas e gatilhos | — | — | 🗓️ fase seguinte | Fase 3 do docs/PLANO_FASES.md (precisa dos eventos de status do motor). |
| CRM | Público e listas | — | — | 🗓️ fase seguinte | Fase 3 do docs/PLANO_FASES.md (passageiros das corridas + cadastro do motor). |
| Atendimento | Bot de WhatsApp | — | — | 🗓️ fase seguinte | Fase 4 do docs/PLANO_FASES.md: pedido de corrida pelo WhatsApp, um número por empresa. |
| Atendimento | Totem | — | — | 🗓️ fase seguinte | Fase 5 do docs/PLANO_FASES.md: tela de pedido no totem com a marca da empresa. |
| Configurações | Marca e aparência | sim | — | ✅ pronto |  |
| Configurações | Integrações | sim | sim | ✅ pronto |  |
| Configurações | Usuários | sim | sim | ✅ pronto |  |

**Como ler:** ✅ pronto = funciona no painel próprio, sem chave nenhuma. 🟡 parcial = funciona, com o que falta na coluna. ⏳ falta = ainda não aparece no menu. 🗓️ fase seguinte = em construção nas sessões de CRM, bot e totem (`docs/PLANO_FASES.md`).

### Melhor versão quando os dois têm

| Função | Ficou assim |
|---|---|
| Consultar corridas | Filtros completos e atalhos de tempo do Sistema A + indicadores no topo, gaveta de detalhes e linha do tempo do Sistema B + análise de IA embutida no exportar |
| Painel | Indicadores do Sistema B + leituras da "Visão geral" do Sistema A + alertas calculados |
| Acompanhamento | Ao vivo a cada 20 s, com corridas recentes (Sistema B) e em aberto (Sistema A) |
| Motoristas | "Corrida por motorista", "% de OS" e "Km rodados" do Sistema A numa tabela só |
| Estatísticas | Estatísticas do Sistema A + distâncias, dinâmica, descontos e qualidade dos dados |
| Tema | Claro/escuro do Sistema B, agora com a marca de cada empresa |

### Lacunas pedidas ao motor (sessão `motor-mob`)

Na Corrida: distância do motorista no aceite, fator/tipo de dinâmica, avaliação (nota e comentário), cupom e desconto, nome da tarifa, operador, programada (e data agendada), estimativa de valor. Também: posição dos motoristas, histórico de ofertas (raio-x), passageiros, conveniadas, veículos, áreas, punições, pendências de pagamento, carteira, cupons, tarifas dinâmicas, desafios, ocorrências, objetos perdidos, conversas e notificações.
