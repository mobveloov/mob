# Apps: tudo vem dos dados do painel

Regra do dono: o painel é a única fonte da verdade. O que o passageiro e o motorista veem nos apps vem da API do servidor
(`/api/apps/<empresa>/...`, arquivos `painel/src/apps/*.ts` e `painel/src/config/*`). Mudou no painel, o app reflete ao abrir ou ao voltar para o app, sem gerar APK novo.

Como os apps leem as regras: `GET /config` (cargo do app: passageiro ou motorista) devolve as regras de Configurações › Gerais, Categorias e Pagamentos.
No código dos apps, o gancho `useConfigDoPainel()` (`painel/src/apps/web/comum/ui.tsx`) busca isso uma vez e atualiza quando o app volta para a tela.
Sem resposta do servidor, a tela fica neutra (sem lista inventada).

Legenda: **ok** = já vem do painel; **trocado** = estava fixo e foi trocado nesta rodada; **pendente** = ainda fixo, com a proposta; **outro agente** = em andamento por outro agente; **n/a** = só rótulo de interface, sem valor de negócio.

## Passageiro

| Item do app | De onde vem no painel (rota e tela) | Situação |
|---|---|---|
| Nome, logo, ícone, cores, fonte e tema | `GET /marca` · Mais › Marca e aparência | ok |
| Categorias (nome, descrição, ordem) | `GET /opcoes` · Configurações › Tarifas e categorias | ok |
| Preço "a partir de" e estimativa por corrida | `GET /estimativa` (tarifa da categoria, dinâmica, descontos) · Tarifas e categorias / Tarifas dinâmicas / Descontos | ok |
| Taxas da central cobradas do passageiro (taxa de serviço, taxas) | `/estimativa` e corrida · Configurações › Taxas da central | ok |
| Capacidade de pessoas da categoria (antes 1 para moto, 4 para carro) | `GET /config` › categorias › capacidade · Tarifas e categorias | trocado |
| Ícone carro ou moto (antes pelo nome "moto") | `GET /config` › categorias › tipoFisico · Tarifas e categorias | trocado |
| Texto "Viagem de carro/moto" quando a categoria não tem descrição | removido: mostra só a descrição da categoria | trocado |
| Ocultar capacidade da categoria | `GET /config` › categorias › ocultarCapacidade · Tarifas e categorias | trocado |
| Aba "Agendar" por categoria | `GET /config` › categorias › permiteAgendamento · Tarifas e categorias | trocado |
| Formas de pagamento da tela de pedido (antes lista fixa de 4) | `GET /opcoes` ← métodos ligados em Configurações › Integrações (Pagamentos) | trocado |
| Pagamentos aceitos no pedido (validação no servidor) | mesma lista do item acima | trocado |
| Texto de "Meus Cartões" (listava as formas de pagamento no texto) | `GET /opcoes` · Integrações | trocado |
| Cartão no app (Mercado Pago) | Integrações › Cartão no app existe no painel, mas o app não tem a tela de cartão | pendente (proposta: tela de cartão no app quando a integração estiver ligada) |
| Opcionais da corrida (porta-malas, etc.) | `GET /opcionais` · Gerais › Preferências (tipo exigência) | ok |
| Lista de opcionais de reserva dentro do app (ids diferentes dos do servidor) | removida: sem resposta do servidor, não mostra o botão Opcionais | trocado |
| Agendamento: antecedência mínima (era 15 min fixo no app e no servidor) | `GET /config` › passageiro › agendamentoMinutos · Gerais › Regras do passageiro | trocado |
| Agendamento: prazo máximo (era 30 dias fixo) | `GET /config` › passageiro › agendamentoDias · Gerais › Regras do passageiro | trocado |
| Paradas: ligar/desligar e limite (era 3 fixo) | `GET /config` › passageiro › paradasAtivo e limiteParadas · Gerais › Regras do passageiro (o servidor também confere) | trocado |
| Editar rota durante a corrida (botão) | `GET /config` › passageiro › editarRota · Gerais › Regras do passageiro (o servidor também confere) | trocado |
| Destino livre ("a combinar") | Gerais › Regras do passageiro › Destino livre; o app ainda exige destino | pendente (proposta: liberar o pedido sem destino quando ligado) |
| CPF obrigatório no cadastro do passageiro | Gerais › Regras do passageiro › CPF obrigatório; o app não pede CPF | pendente (proposta: campo CPF no cadastro quando ligado) |
| Aviso de alta demanda (tarifa dinâmica) | Gerais › Regras do passageiro › Aviso de alta demanda; o app não mostra o pop-up | pendente (proposta: a rota de estimativa devolver "dinâmica ativa" e o app avisar) |
| Bônus de boas-vindas | Gerais › Regras do passageiro; creditado no servidor | ok |
| Cidades do cadastro | `GET /cidades` · Cadastro › Filiais / áreas atendidas | ok |
| Cupons e descontos | `GET /cupons` · Configurações › Descontos / cadastro de cupons | ok |
| Motivos de cancelamento (e lista de reserva no app) | `GET /motivos-cancelamento` · Gerais › Cancelamento; lista de reserva removida do app | trocado |
| Taxa de cancelamento e mensagem | resposta da corrida · Gerais › Cancelamento e categoria | ok |
| Etiquetas ao avaliar o motorista (boas e ruins) | `GET /etiquetas-avaliacao` ← Gerais › Regras do passageiro (antes só um arquivo de ajustes sem tela) | trocado |
| Assuntos da reclamação depois da corrida (antes lista fixa) | `GET /config` › assuntosDeOcorrencia ← opções do campo Assunto de Retorno e ocorrências | trocado |
| Termos de uso e privacidade (antes só o texto "Termos de Uso" sem conteúdo) | `GET /termos/:tipo` (pública) · Configurações › Termos de uso | trocado |
| Telefone, e-mail e WhatsApp da central (Ajuda) | `GET /marca` e `GET /contatos` · Marca e aparência / Gerais › Suporte | ok |
| Avisos e notificações | `GET /notificacoes` · Comunicação › Notificações | ok |
| Indique e ganhe, campanhas e prêmios | `GET /desafios` · Gerais › Indicações | ok |
| Carteira e saldo | `GET /carteira` · Financeiro › Carteiras | ok |
| Status e rótulos da corrida (statusTexto) | resposta da corrida (texto montado no servidor) | n/a |
| Banners | Gerais › Banners; o app do passageiro não mostra banner | pendente (proposta: `GET /banners` e faixa na tela inicial) |
| Gêneros (Masculino, Feminino, Outro, Prefiro não dizer) | opções de cadastro, sem valor de negócio | n/a |
| Passo da oferta de preço (R$ 0,50) e faixa (80% a 300% da estimativa) | Categoria › Negociação existe no painel (negociacao), o app usa valores próprios | pendente (proposta: ler `negociacao` da categoria em `/config` e usar no cartão de preço) |
| Velocidade média 25 km/h para estimar a chegada do motorista, quando o servidor não manda | cálculo de reserva, o servidor manda o tempo quando tem posição | n/a |
| Horário de Brasília nos agendamentos | regra técnica | n/a |
| Cores do mapa (rota preta, marcadores) | desenho do mapa | n/a |
| Textos de tela ("Voltar", "SOLICITAR", "Opções para você", etc.) | rótulos de interface | n/a |

## Motorista

| Item do app | De onde vem no painel (rota e tela) | Situação |
|---|---|---|
| Nome, logo, ícone, cores | `GET /marca` · Marca e aparência | ok |
| Valor da chamada (bruto, taxa, líquido) e tempo para aceitar | oferta do servidor · Categorias (comissão), Taxas da central, Despacho (tempo de tela) | ok |
| Raio e regras de despacho | Configurações › Despacho (o ambiente pode sobrepor) | ok |
| Ganhos, taxas por corrida e extrato | `GET /ganhos` · Taxas da central / Comissão | ok |
| Taxa de aceitação (porcentagem) | `GET /aceitacao` (últimas 100 ofertas, regra no servidor) | ok |
| Texto de ajuda da taxa de aceitação ("últimas 100", como se calcula) | texto explicativo no app | pendente (proposta: gravar o número de ofertas no resultado de `/aceitacao` e montar o texto com ele) |
| Mensagens rápidas do chat (e lista de reserva no app) | `GET /mensagens-rapidas` · Gerais › Regras do motorista; lista de reserva removida do app | trocado |
| Motivos de cancelamento (e lista de reserva no app) | `GET /motivos-cancelamento` · Gerais › Cancelamento; lista de reserva removida | trocado |
| Problemas na corrida (botão "avisar problema"; antes lista fixa de 6) | `GET /config` › motorista › problemasNaCorrida · Gerais › Regras do motorista | trocado |
| Avisos de conduta no mapa ("ATENÇÃO MOTORISTA", 7 linhas fixas) | `GET /config` › motorista › avisosDeConduta · Gerais › Regras do motorista | trocado |
| Botão de pânico (ajuda à central) | `GET /config` › motorista › botaoPanico · Gerais › Regras do motorista | trocado |
| Valor mínimo do saque (era R$ 10,00 fixo no app e no servidor) | `GET /carteira` › saque.minimo · Integrações › Pagamentos › Saque | trocado |
| Saque ligado ou desligado | `GET /carteira` › saque.ativo (o servidor recusa se desligado) · Integrações › Pagamentos › Saque | trocado |
| Taxa fixa do saque | Integrações › Pagamentos › Saque › taxa fixa; o saque ainda não desconta | pendente (proposta: descontar a taxa ao pedir e mostrar no app) |
| Valor mínimo da recarga (era R$ 10,00 fixo) | `GET /carteira` › recargaRegras.minimo · Integrações › Pagamentos › Recarga | trocado |
| Recarga ligada/desligada | Integrações › Pagamentos › Recarga › motorista; o pedido de recarga vai pelo chat da central e não tem esse liga/desliga | pendente (proposta: decidir se o liga/desliga vale para o pedido pelo chat ou só para recarga automática) |
| Gravação das corridas: ligada, obrigatória, vídeo e dias (antes só um arquivo sem tela) | `GET /gravacao/config` · Gerais › Regras do motorista › Gravação das corridas | trocado |
| Dias que a cópia fica no celular (3 e 7 dias) | política local do aparelho, em `gravador.ts` | pendente (proposta: devolver em `/gravacao/config` e ler no app) |
| Passe Livre (ofertas, preço, vigência) | `GET /passe-livre` · Configurações › Passe Livre | ok |
| Carteira, saldo e extrato | `GET /carteira` · Financeiro › Carteiras | ok |
| Indique e ganhe, desafios | `GET /desafios` · Gerais › Indicações | ok |
| Notificações | `GET /notificacoes` · Comunicação | ok |
| Preferências de corrida (formas de pagamento e filtros) | `GET /preferencias` ← Gerais › Preferências e Integrações (formas de pagamento ligadas) | ok |
| Contatos (WhatsApp, telefone, site, termos, privacidade) | `GET /contatos` · Marca e aparência / Gerais › Suporte | ok |
| Termos de uso e política de privacidade (sem link na marca) | `GET /termos/:tipo` · Configurações › Termos de uso | trocado |
| Corrida Maçaneta (liga/desliga, dados pedidos ao passageiro, categorias) | Gerais › Maçaneta e Categorias › maçaneta; o app mostra sempre | pendente (proposta: `GET /config` já traz `macaneta`; esconder o botão se desligado, depois de decidir o padrão para quem já usa) |
| Editar valor final, confirmar taxas, editar rota do motorista | Gerais › Regras do motorista; o app não usa essas chaves | pendente (proposta: ler de `/config` e liberar os botões na tela da corrida) |
| Mapa de navegação e distância de recálculo | Gerais › Regras do motorista; o app usa valores próprios | pendente (proposta: ler `mapaNavegacao` e `distanciaRecalculo` de `/config`) |
| Validade da contra-oferta (60 s) e nova oferta (2 min) | constantes do servidor, sem tela | pendente (proposta: campos em Despacho) |
| Bônus de cadastro do motorista | Gerais › Regras do motorista; creditado no servidor | ok |
| Banners | Gerais › Banners; o app do motorista não mostra | pendente (proposta: igual ao do passageiro) |
| Cadastro do motorista: campos, passos, veículo, documentos obrigatórios, diagnóstico | rotas `/cadastro`, `/documentos`, `/veiculos` (`perfil.ts`) · Gerais › Documentos | outro agente |
| Cores de veículo, UFs, gêneros, passos do cadastro | opções de formulário (cadastro do motorista) | outro agente |
| Chat com a central e histórico | `GET /suporte` · Comunicação › Conversas | ok |
| Canais de origem da corrida ("Aplicativo", "Maçaneta", "Totem", "WhatsApp", "Central") | rótulos do canal da corrida | n/a |
| Tema, navegador, sons, vibração, voz (ajustes do aparelho) | preferência de cada pessoa, guardada no aparelho | n/a |
| Versão do app, ícones e textos de tela | rótulos de interface | n/a |

## Resumo desta rodada

- Itens que estavam fixos e foram trocados: veja as linhas "trocado" acima (listas de pagamento, saque, recarga, agendamento, paradas, editar rota, capacidade, ícone, avisos, problemas, botão de pânico, etiquetas, assuntos, termos, gravação, listas de reserva).
- Telas novas no painel (Configurações › Gerais): em "Regras do passageiro" (antecedência e prazo do agendamento, etiquetas de avaliação); em "Regras do motorista" (gravação das corridas, avisos de conduta, problemas na corrida).
- Rota nova no servidor: `GET /termos/:tipo` (pública). Campos novos em `/carteira`: `saque` e `recargaRegras`. Campo novo em `/config`: `assuntosDeOcorrencia`.
- Itens "pendente" têm a proposta na própria linha.
