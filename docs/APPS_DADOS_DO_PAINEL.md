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
| Cartão no app (Mercado Pago) | `GET /config` › pagamentos.cartaoApp · Integrações › Cartão no app. A tela "Meus Cartões" mostra "cartão indisponível" quando ligado e "empresa não oferece" quando desligado | ok (com limite real: cobrar cartão exige o SDK do Mercado Pago no app nativo e chaves de produção; o app web não tokeniza cartão) |
| Opcionais da corrida (porta-malas, etc.) | `GET /opcionais` · Gerais › Preferências (tipo exigência) | ok |
| Lista de opcionais de reserva dentro do app (ids diferentes dos do servidor) | removida: sem resposta do servidor, não mostra o botão Opcionais | trocado |
| Agendamento: antecedência mínima (era 15 min fixo no app e no servidor) | `GET /config` › passageiro › agendamentoMinutos · Gerais › Regras do passageiro | trocado |
| Agendamento: prazo máximo (era 30 dias fixo) | `GET /config` › passageiro › agendamentoDias · Gerais › Regras do passageiro | trocado |
| Paradas: ligar/desligar e limite (era 3 fixo) | `GET /config` › passageiro › paradasAtivo e limiteParadas · Gerais › Regras do passageiro (o servidor também confere) | trocado |
| Editar rota durante a corrida (botão) | `GET /config` › passageiro › editarRota · Gerais › Regras do passageiro (o servidor também confere) | trocado |
| Destino livre ("a combinar") | `GET /config` › passageiro › destinoLivre · Gerais › Regras do passageiro (o servidor também exige destino quando desligado; padrão ligado, como era) | trocado |
| CPF obrigatório no cadastro do passageiro | `GET /regras-cadastro` (pública) · Gerais › Regras do passageiro; o campo CPF aparece e o servidor exige | trocado |
| Aviso de alta demanda (tarifa dinâmica) | `GET /estimativa` › dinamica · Gerais › Regras do passageiro › Aviso de alta demanda + Tarifas dinâmicas | trocado |
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
| Banners (passageiro: tela inicial e entrada) | `GET /banners?tipo=app\|login` e imagem · Gerais › Banners | trocado |
| Gêneros (Masculino, Feminino, Outro, Prefiro não dizer) | opções de cadastro, sem valor de negócio | n/a |
| Negociação de preço por categoria (desconto máximo, liga/desliga) | `GET /config` › categorias › negociacao · Tarifas e categorias › Negociação (o servidor também confere; padrão ligado para quem nunca salvou). O passo de R$ 0,50 do botão − e + é só o tamanho do toque | trocado |
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
| Texto de ajuda da taxa de aceitação ("últimas N") | `GET /aceitacao` › janela | trocado |
| Mensagens rápidas do chat (e lista de reserva no app) | `GET /mensagens-rapidas` · Gerais › Regras do motorista; lista de reserva removida do app | trocado |
| Motivos de cancelamento (e lista de reserva no app) | `GET /motivos-cancelamento` · Gerais › Cancelamento; lista de reserva removida | trocado |
| Problemas na corrida (botão "avisar problema"; antes lista fixa de 6) | `GET /config` › motorista › problemasNaCorrida · Gerais › Regras do motorista | trocado |
| Avisos de conduta no mapa ("ATENÇÃO MOTORISTA", 7 linhas fixas) | `GET /config` › motorista › avisosDeConduta · Gerais › Regras do motorista | trocado |
| Botão de pânico (ajuda à central) | `GET /config` › motorista › botaoPanico · Gerais › Regras do motorista | trocado |
| Valor mínimo do saque (era R$ 10,00 fixo no app e no servidor) | `GET /carteira` › saque.minimo · Integrações › Pagamentos › Saque | trocado |
| Saque ligado ou desligado | `GET /carteira` › saque.ativo (o servidor recusa se desligado) · Integrações › Pagamentos › Saque | trocado |
| Taxa fixa do saque | `GET /carteira` › saque.taxaFixa · Integrações › Pagamentos › Saque; descontada do Pix (o saque guarda `taxa`), o app mostra quanto recebe | trocado (a tela Saques do painel ainda mostra o valor cheio) |
| Valor mínimo da recarga (era R$ 10,00 fixo) | `GET /carteira` › recargaRegras.minimo · Integrações › Pagamentos › Recarga | trocado |
| Recarga ligada/desligada | Integrações › Pagamentos › Recarga controla a recarga automática por gateway (Pix/cartão), que o app não faz; o pedido de depósito pelo chat com a central fica sempre disponível e o mínimo vem do painel | ok (motivo real: depende de gateway de pagamento) |
| Gravação das corridas: ligada, obrigatória, vídeo e dias (antes só um arquivo sem tela) | `GET /gravacao/config` · Gerais › Regras do motorista › Gravação das corridas | trocado |
| Dias que a cópia fica no celular | `GET /gravacao/config` › diasNoAparelho · Gerais › Regras do motorista › Gravação | trocado |
| Passe Livre (ofertas, preço, vigência) | `GET /passe-livre` · Configurações › Passe Livre | ok |
| Carteira, saldo e extrato | `GET /carteira` · Financeiro › Carteiras | ok |
| Indique e ganhe, desafios | `GET /desafios` · Gerais › Indicações | ok |
| Notificações | `GET /notificacoes` · Comunicação | ok |
| Preferências de corrida (formas de pagamento e filtros) | `GET /preferencias` ← Gerais › Preferências e Integrações (formas de pagamento ligadas) | ok |
| Contatos (WhatsApp, telefone, site, termos, privacidade) | `GET /contatos` · Marca e aparência / Gerais › Suporte | ok |
| Termos de uso e política de privacidade (sem link na marca) | `GET /termos/:tipo` · Configurações › Termos de uso | trocado |
| Corrida Maçaneta (liga/desliga, dados pedidos ao passageiro, categorias) | `GET /config` › macaneta · Gerais › Maçaneta (nunca salvo = ligada; só desliga quando o painel salva desligado; o servidor confere) | trocado |
| Editar valor final, confirmar taxas | `GET /config` › motorista · Gerais › Regras do motorista (o servidor usa o valor combinado quando a edição está desligada; padrão ligado, como era) | trocado |
| Mapa de navegação e distância de recálculo | `GET /config` › motorista › mapaNavegacao e distanciaRecalculo · Gerais › Regras do motorista | trocado (o passo a passo em tela só existe no app nativo: no navegador abre o Google Maps/Waze) |
| Validade da contra-oferta (padrão 60 s) e nova oferta (padrão 2 min) | `GET /config` › motorista › contraofertaSegundos e reofertaMinutos · Gerais › Regras do motorista › Chamadas e negociação | trocado |
| Bônus de cadastro do motorista | Gerais › Regras do motorista; creditado no servidor | ok |
| Banners (motorista: menu lateral) | `GET /banners?tipo=app` · Gerais › Banners | trocado |
| Cadastro do motorista: campos, passos, veículo, documentos obrigatórios, diagnóstico | rotas `/cadastro`, `/documentos`, `/veiculos` (`perfil.ts`) · Gerais › Documentos | outro agente |
| Cores de veículo, UFs, gêneros, passos do cadastro | opções de formulário (cadastro do motorista) | outro agente |
| Chat com a central e histórico | `GET /suporte` · Comunicação › Conversas | ok |
| Canais de origem da corrida ("Aplicativo", "Maçaneta", "Totem", "WhatsApp", "Central") | rótulos do canal da corrida | n/a |
| Tema, navegador, sons, vibração, voz (ajustes do aparelho) | preferência de cada pessoa, guardada no aparelho | n/a |
| Versão do app, ícones e textos de tela | rótulos de interface | n/a |

## Os 6 restantes

Na primeira rodada contei 36 itens fixos e 30 trocados. Os 14 que ficaram "pendente" se juntam em 6 famílias; todas foram feitas agora:

1. **Maçaneta** (liga/desliga, dados do passageiro, categorias): o app e o servidor respeitam Gerais › Maçaneta; nunca salvo = ligada. Antes: botão e menu sempre à mostra no app do motorista.
2. **Negociação de preço por categoria**: o cartão de preço do passageiro e os botões − e + da chamada do motorista seguem a categoria (liga/desliga e percentuais). Antes: faixa de 80% a 300% fixa em `Opcoes.tsx` e limite ×3 em `despacho.ts`.
3. **Regras do passageiro que o app ignorava**: CPF no cadastro, destino livre e aviso de alta demanda (antes sem campo no app).
4. **Regras do motorista que o app ignorava**: editar valor final, confirmar taxas, mapa de navegação e distância de recálculo (antes 60 m fixo em `Navegacao.ts`).
5. **Banners** de Gerais › Banners na entrada, na tela inicial do passageiro e no menu do motorista.
6. **Valores de dinheiro e tempo no código**: taxa fixa do saque, validade da contra-oferta (60 s), nova oferta (2 min), dias da cópia da gravação (3 e 7), janela da taxa de aceitação (100) e a tela de cartão.

Limites reais que sobraram (não são falta de ligação com o painel):
- **Cobrança por cartão no app**: precisa do SDK do Mercado Pago no aplicativo nativo e de chaves de produção; hoje a tela diz "cartão indisponível".
- **Navegação passo a passo em tela e gravação em segundo plano**: dependem do aplicativo nativo (GPS em segundo plano); o app web só abre o navegador externo.
- **Cadastro do motorista**: outro agente.

## Resumo desta rodada

- Itens que estavam fixos e foram trocados: veja as linhas "trocado" acima (listas de pagamento, saque, recarga, agendamento, paradas, editar rota, capacidade, ícone, avisos, problemas, botão de pânico, etiquetas, assuntos, termos, gravação, listas de reserva).
- Telas novas no painel (Configurações › Gerais): em "Regras do passageiro" (antecedência e prazo do agendamento, etiquetas de avaliação); em "Regras do motorista" (gravação das corridas, avisos de conduta, problemas na corrida).
- Rota nova no servidor: `GET /termos/:tipo` (pública). Campos novos em `/carteira`: `saque` e `recargaRegras`. Campo novo em `/config`: `assuntosDeOcorrencia`.
- Não há mais linha "pendente"; o que depende de aplicativo nativo ou de gateway está explicado na própria linha.
