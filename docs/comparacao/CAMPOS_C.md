# Comparação campo a campo com a Machine, grupo C (segunda passada)

Feito em 20/11/2026. Fonte: as páginas salvas da Machine (só leitura) contra o nosso painel rodando com banco de teste. Formato: `Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei`.

"existia?": sim = já estava no painel; parcial = existia diferente; não = faltava. "igual agora?": sim = rótulo, opções, padrão, limites e texto de ajuda como na Machine.

As 7 páginas de "Alterando Bandeira" são as 7 abas (Motorista, Passageiro, Despacho, Financeiro, Filtros, Formas de pagamento, Recursos Premium). As abas do painel de referência (Geral, Regras do motorista, Preferências, Regras do passageiro, Indicações, Cancelamentos, Maçaneta, Banners, Jurídico) continuam depois das da Machine.

## Tarifas e categorias

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Tarifas e categorias > Lista > Reordenar categorias, Criar categoria | sim | sim | nada |
| Tarifas e categorias > Lista > número, selo "Disponível no aplicativo", nome, descrição, botão Tarifa | sim | sim | nada |
| Tarifas e categorias > Lista > menu de três pontos > Configurações | parcial (chamava "Editar categoria") | sim | renomeado |
| Tarifas e categorias > Lista > menu de três pontos > Duplicar | não | sim | novo: janela "Duplicar categoria" (nome novo, opção de copiar motoristas); servidor copia categoria, tarifa padrão e tarifas extras (`POST /categorias/:id/duplicar`) |
| Tarifas e categorias > Lista > menu de três pontos > Excluir categoria | sim | sim | nada |
| Tarifas e categorias > Detalhes das tarifas > Criar tarifa extra, Tarifa padrão, colunas (Valor tabelado a Parada adicional) | sim | quase | colunas e botões iguais; a Machine usa menu de três pontos e link "Editar" em cada linha, nós usamos ícones (editar, ligar, remover) |
| Criar categoria > Personalizar > Nome * | parcial (60 letras) | sim | limite de 21 letras como na Machine |
| Criar categoria > Personalizar > Descrição * | parcial (120 letras) | sim | limite de 32 letras |
| Criar categoria > Personalizar > Detalhes adicionais (0/140) | sim | sim | nada |
| Criar categoria > Ordem da categoria (lista de 1 a N) | parcial (começava em 1) | sim | agora começa na última posição (total + 1), como a Machine |
| Criar categoria > Ícone da categoria (Selecione, Moto, Táxi, Mulher, Premium, Comum, Entregas, PcD, Diversos, Personalizado) | sim | quase | opções iguais; a Machine abre em "Selecione", nós abrimos em "Comum" (o servidor precisa de um ícone) |
| Criar categoria > Capacidade de pessoas no veículo (1 a 99) | parcial | sim | limite 99; |
| Criar categoria > Não exibir capacidade de pessoas | parcial (desmarcado) | sim | marcado ao criar, como a Machine |
| Criar categoria > Outras configurações > Exibir categoria, Maçaneta, Tarifas dinâmicas, Impulsionamento automático, Valor extra pelo passageiro, Segurança para mulheres, Negocia | sim | sim | nada (textos e estados conferidos) |
| Criar categoria > Preferências de solicitação (3 opções) | sim | sim | nada |
| Criar categoria > Gestão > Vinculação de motoristas (3 opções) | parcial (legenda única) | sim | título "Gestão" separado e a legenda "Vinculação de motoristas" |
| Criar categoria > Voltar, Criar | sim | sim | nada |
| Criar categoria > abas Mais opções, Tarifas & Negociação, Dinâmica, Comissão | sim | n/a | são do painel de referência; ficam além da Machine |
| Editar tarifa > Método de cálculo (nome "Por KM e minuto") | parcial (nome "Por tarifa inicial, km e minuto") | sim | nome igual |
| Editar tarifa > Método selecionado (textos dos 4 métodos) | parcial | sim | texto do "bairro de destino" igual ao da Machine |
| Editar tarifa > Componentes principais > Preço base (R$) * | parcial | sim | rótulo e dica "Valor fixo cobrado ao iniciar qualquer corrida" |
| Editar tarifa > Preço por KM > Variar valor pela distância | não | sim | novo: faixas "Distância até (KM)" e "Valor por KM (R$)", "+ Adicionar nova distância", "A partir de (KM)" (travado) e "Valor por (KM)"; o cálculo da corrida usa a faixa da distância total (servidor e testes) |
| Editar tarifa > Limitar distância máxima da corrida | parcial (campo solto só na tabela de KM) | sim | caixa de marcar com a distância máxima, nos métodos de km e minuto e hora parada |
| Editar tarifa > Preço por minuto (R$) *, Valor mínimo da corrida (R$) * | parcial | sim | rótulos e dicas da Machine |
| Editar tarifa > Tabela de KM (Distância até, Valor fixo, + Adicionar nova faixa, exemplo e aviso de percurso máximo) | sim | sim | nada |
| Editar tarifa > Extras da tarifa > Valor por parada adicional, Bônus de deslocamento (+ "Ver artigo") | sim | quase | o link "Ver artigo" da Machine aponta para o suporte deles; não copiado |
| Editar tarifa > Simulador de tarifa (endereços de partida e destino, "Simular corrida") | não | não | depende do serviço de mapas com chave; ver "Não consegui igualar" |
| Editar tarifa > Cancelar, Editar tarifa | sim | sim | nada |

## Tarifas dinâmicas

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Dinâmicas > guia "Navegue entre as dinâmicas" + Entendi | sim | sim | nada |
| Dinâmicas > abas Automáticas, Manuais, Automações, Legenda (Último cálculo, faixas 1.1 a 1.5...), aviso Beta | sim | sim | nada |
| Dinâmicas > etiqueta da área ("+R$ 5,00", "1.3x") | sim | sim | nada |
| Dinâmicas > lista lateral > busca "Buscar por nome da área" | não | sim | novo |
| Dinâmicas > lista lateral > abas "No embarque N" e "No destino N" | não | sim | campo novo `aplicaEm` na regra (servidor); na janela da regra há "Aplicar quando a área estiver: No embarque / No destino"; o preço da corrida confere o ponto escolhido (embarque ou destino) |
| Dinâmicas > lista lateral > filtro de ordem (nome / maior valor) e Tela cheia | não | sim | botões novos |
| Dinâmicas > lista lateral > botão "Criar dinâmica" | parcial ("Nova regra" no topo) | sim | botão na lista, abre já no lado da aba aberta; o "Nova regra" do topo continua |
| Dinâmicas > cartão "DINÂMICA SEM ÁREA" (fator, chave, editar) | parcial | sim | fator global gravado no servidor (padrão 1,1x, desligado) e somado ao preço das categorias com dinâmica ligada, respeitando a prioridade entre dinâmicas; a aba "Sem área" com horário e demanda continua |
| Dinâmicas > ficha de cada área (N Motoristas livres, Disponível, Perdidas, Fator único) | não | quase | motoristas livres dentro da área (posição ao vivo), corridas pendentes com o ponto na área e corridas não atendidas nas últimas 24 h; o significado exato de "Disponível" e "Perdidas" na Machine foi inferido |
| Dinâmicas > menu de três pontos de cada área | não | parcial | editar, ligar/desligar e remover em ícones |

## Descontos e Alterando Desconto

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Descontos > Alterar (botão) | sim | sim | nada |
| Descontos > colunas Tipo de pagamento, Via site, Via aplicativo (1), Desconto máximo por empresa | sim | sim | nada |
| Descontos > nota "* As quantidades de motoristas..." | sim | sim | nada |
| Alterando Desconto > cada forma (Dinheiro, Débito (máquina), Crédito (máquina), Cartão no app, Pix) > Site > Desconto pelo site (%) | sim | sim | só aceita 2 dígitos (maxlength 2 da Machine) |
| Alterando Desconto > cada forma > Aplicativo > Desconto pelo app #1 (%) | sim | sim | 2 dígitos |
| Alterando Desconto > cada forma > Desconto pelo app #2, #3, #4 | parcial (liberados) | sim | travados, como na Machine (só existe uma versão do app) |
| Alterando Desconto > Voltar, Gravar | sim | sim | nada |
| Alterando Desconto > Desconto máximo por empresa (editável) | sim | n/a | a mais: na Machine vem de outra tela |

## Alteração de dados da OS (AlteraValor)

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Alteração de dados da OS > Qual OS deseja alterar? > Nº OS | sim | sim | nada |
| Alteração de dados da OS > Alterar | sim | sim | nada |
| Alteração de dados da OS > aviso de OS paga pelo app ou carteira | sim | sim | nada |

## Gerais ("Alterando Bandeira")

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Gerais > abas na ordem Motorista, Passageiro, Despacho, Financeiro, Filtros, Formas de pagamento, Recursos Premium | parcial (só Despacho era da Machine) | sim | seis abas novas; as do painel de referência vêm depois (as antigas "Motorista" e "Passageiro" passaram a "Regras do motorista" e "Regras do passageiro") |
| Gerais > (todas as abas) > aviso "Alterações destes dados devem ser feitas com cuidado..." e texto da aba | parcial | sim | em cada aba |
| Gerais > (todas as abas) > Voltar, Gravar | parcial | sim | Gravar grava só a aba aberta |
| Gerais > Despacho > todos os campos (expiração de pendência, distâncias, reenvio, redistribuir agendada, alertas, número da partida, autorização corporativa, despacho por proximidade, cerca, corrida em espera, prioridade das dinâmicas, estimativa, tela de solicitação, área controlada, tipo de despacho, eleição, tentativas, disparos 1º a 6º) | sim | sim | conferido de novo rótulo a rótulo; nada a mudar |
| Gerais > Motorista > Documentos padrão / Documentos adicionais / Adicionar documento | parcial (existia em Regras do motorista) | sim | mesma lista de documentos, agora também nesta aba |

### Gerais > Formas de pagamento

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Gerais > Formas de pagamento > cada forma (Dinheiro, Maquininha de Débito, Maquininha de Crédito, eTicket, Voucher, Cartão no app, Pix, Picpay, Whatsapp) > Ativada/Desativada | não | sim | caixa por forma; Dinheiro, Pix, Cartão no app e maquininhas ligam/desligam os métodos aceitos em Integrações (sincronia no servidor) |
| Gerais > Formas de pagamento > Exibe no aplicativo (app) de passageiros | não | sim | caixa (dinheiro, débitos, crédito, cartão no app, Pix) |
| Gerais > Formas de pagamento > Ordem de exibição (1 a 5) | não | sim | lista |
| Gerais > Formas de pagamento > Observações: Sujeito à taxa da operadora (débito, crédito) | não | sim | caixa |
| Gerais > Formas de pagamento > Pix > tipo (início ou fim da corrida) | não | sim | duas opções com o texto da Machine |
| Gerais > Formas de pagamento > textos de cada forma | não | sim | iguais (o do cartão cita "provedor de pagamentos" no lugar do nome do provedor deles) |

### Gerais > Financeiro

(4 campos de voucher em papel, listados abaixo com as demais linhas geradas.)

### Gerais > Recursos Premium

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Gerais > Recursos Premium > Motorista > Adicionar menu personalizado (Sim/Não, Item 1 e Item 2 com nome e URL) | não | sim | campos e limites (30 e 200 letras) |
| Gerais > Recursos Premium > Motorista > Exibir links nas centrais (lista de centrais) | não | não | ver "Não consegui igualar" |
| Gerais > Recursos Premium > Motorista > Adicionar botão personalizado | não | quase | Sim/Não igual; nome e URL do botão foram inferidos (a página salva não mostra os campos) |
| Gerais > Recursos Premium > Motorista > Adicionar anúncio na tela inicial | não | parcial | Sim/Não e texto; envio de imagens ver "Não consegui igualar" |
| Gerais > Recursos Premium > Passageiro > botão personalizado, "Anuncie aqui" (tela inicial, campanha, direcionar clique), anúncio na tela inicial, campanha no ciclo da corrida | não | parcial | Sim/Não, caixas e textos; imagens e período da campanha ver "Não consegui igualar" |

## Integrações

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Integrações > abas Iza, Nilara, Transações Financeiras, Saque Automático, Marketplace de Integradores | parcial (4 delas faltavam) | sim | abas criadas na ordem da Machine |
| Integrações > Transações Financeiras (Condições, Dados bancários, Configurações de cartão e de Pix, SALVAR) | sim | sim | nada (conferido) |
| Integrações > Saque Automático > Banco selecionado | não | sim | lista Banco Inter / Asaas |
| Integrações > Saque Automático > Definir valores mínimo e máximo (mín. R$ 10, máx. até R$ 1.000) | não | sim | caixa e dois campos com os limites |
| Integrações > Saque Automático > Quem irá pagar a taxa? | não | sim | Motorista / Bandeira |
| Integrações > Saque Automático > Isenção no primeiro saque; Cobrança adicional + valor | não | sim | caixas e campo |
| Integrações > Saque Automático > Permitir apenas chave Pix do tipo CPF | não | sim | caixa |
| Integrações > Saque Automático > Limitar saques diários + Limite (0 a 5) | não | sim | caixa e campo |
| Integrações > Saque Automático > dias da semana habilitados | não | sim | sete caixas |
| Integrações > Saque Automático > Certificado (.crt) e Chave (.key) | não | não | exige conta e contrato no banco; ver "Não consegui igualar" |
| Integrações > Iza, Nilara, Marketplace | não | parcial | aba com status "Desativada" e explicação; a Machine não tem o conteúdo salvo |

## Despacho, Transbordo, Termos, Personalização, Punições, Alertas, Central

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Despacho > texto de abertura, "Sua central está configurada por", tabela Disparo / Tipo de despacho / Onde Toca, linha de Pendência, notas * e ** | sim | sim | conferido, nada |
| Transbordo > texto, "Envia corridas para", "Recebe corridas de" (5 colunas Sim/Não) | sim | sim | conferido, nada |
| Termos de uso > abas Aplicativo passageiro / motorista / Empresa parceira > 3 opções, "Seus Termos de Uso", Voltar, Salvar mudanças | sim | sim | conferido, nada |
| Personalização > Geral (Nome, Cor principal, Veículo no mapa), Tela inicial, Salvar alterações, Voltar | sim | sim | conferido, nada |
| Punições > Gerenciar Punição > Selecione o tempo (15 min a 48 h) * | sim | sim | nada |
| Punições > Gerenciar Punição > Motivo da punição (até 120 letras) | parcial (300) | sim | limite 120 |
| Punições > Gerenciar Punição > abas Nova punição / Histórico, Voltar, Aplicar | sim | sim | nada |
| Alertas para empresas > Criar Alerta, Filtros (Empresa, Conteúdo, Tipo, Status), Filtrar, Limpar filtros | sim | sim | nada |
| Alertas para empresas > colunas ordenáveis (Empresa, Conteúdo, Data de início, Data de término) | parcial (sem ordenar) | sim | clique no título ordena |
| Alertas para empresas > Criar Alerta > Empresa, Tipo *, Conteúdo *, Data de início *, A partir das *, Exibir alerta por * (1 a 750) + Horas/Dias/Semanas, Voltar, Criar | sim | quase | iguais; a data usa o seletor de data do navegador, não máscara de texto |
| Central de notificações > Todos N, "N itens selecionados", Somente não lidas, atualizar, "Tudo em dia!", "Você chegou ao fim..." | sim | sim | nada |

## Não consegui igualar

- **Simulador de tarifa** (Editar tarifa): precisa do serviço de mapas com chave para achar o trajeto entre dois endereços.
- **Tarifas dinâmicas**: o mapa usa os mapas do OpenStreetMap (internet) e mostra as áreas em lista ao lado, não como fichas sobre o mapa; "Disponível" e "Perdidas" foram inferidos.
- **Recursos Premium**: seletor "Exibir nas centrais" (lista de centrais da rede), envio das imagens dos anúncios e da campanha (640x275 e 640x480), período e limite de corridas da campanha, cobranças (valores da Machine; não se aplicam aqui). Os anúncios com imagem continuam em Gerais > Banners.
- **Saque Automático**: envio de certificado e chave e a conta ativa dependem de contrato e conta no banco; o resto grava, mas o saque ainda segue Integrações > Financeiro.
- **Iza, Nilara, Marketplace**: dependem de contrato e chave dos fornecedores; sem conteúdo salvo da Machine.
- **Os apps ainda não leem** a maioria dos campos novos de Gerais (são gravados e entregues na configuração; os apps leem só o que já liam). Formas de pagamento ligam/desligam os métodos aceitos.
- **Janelas Reordenar categorias e Excluir categoria da Machine**: o conteúdo é montado por script e não está nas páginas salvas; mantivemos as nossas (arrastar e confirmar).
- **Ícone "Selecione" como padrão** ao criar categoria (o servidor exige um ícone).

## Conferido no navegador (banco de teste, porta 8873)

Gerais: as 16 abas abrem sem erro (Motorista 184 campos, Passageiro 89, Despacho, Financeiro, Filtros, Formas de pagamento, Recursos Premium). Integrações: 10 abas, Saque Automático com 18 campos. Tarifas e categorias: janela Criar categoria (ordem, limites 21 e 32, Gestão), menu Configurações / Duplicar / Excluir categoria, Editar tarifa com "Variar valor pela distância". Descontos: Alterando Desconto com 15 campos travados (app #2 a #4). Termos de uso, Personalização, Alteração de dados da OS, Alertas, Punições, Transbordo, Despacho e Tarifas dinâmicas abrem com os textos da Machine.

## Testes

`painel/test/dinamica-campos.test.ts` (3 testes: área no embarque ou no destino, dinâmica sem área no preço, prioridade e fator global independentes) e `painel/test/bandeira-campos.test.ts` (6 testes: abas e campos, padrões, validação e permissão, formas de pagamento, tarifa variável e duplicar categoria).

## Linhas geradas: Gerais > Motorista, Passageiro, Financeiro e Filtros

| Item | existia? | igual agora? | o que mudei |
|---|---|---|---|
| Gerais > Motorista > Tempo limite para o motorista ficar offline (campos: tempo_inatividade_taxista_alerta_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Tempo limite para aceitar uma corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Raio dos arredores do endereço de partida (campos: Bloquear chegada na partida fora do raio do endereço) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Fale conosco do aplicativo motorista (campos: Link para "Fale conosco" no aplicativo motorista) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir desconectar motorista após um limite de solicitações chamadas ignoradas | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Limite de solicitações que um motorista pode ignorar antes de ser desconectado da plataforma | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir que o motorista cancele uma corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Reabrir automaticamente corridas canceladas por motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Tempo limite para reabertura após um cancelamento (minutos) (campos: tempo_reabertura_cancelamento_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Habilita a punição por cancelamentos | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Período de controle dos cancelamentos | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Quantidade limite de cancelamentos permitidos no período | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Tempo de punição por exceder o número de cancelamentos (campos: tempo_impedimento_taxista_canc_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir que o motorista cancele a corrida com o motivo "Passageiro não entrou"? (campos: tempo_espera_partida_tempo, tempo_espera_partida_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir corridas agendadas para o motorista (campos: Permitir que o motorista aceite corridas agendadas com antecedência) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Limite de tempo para exibir programadas (campos: limite_tempo_exibicao_programadas_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir que o motorista ligue ou envie SMS para o passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir valor estimado a ser cobrado do passageiro para o motorista durante a corrida. | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir o valor ganho na notificação ao finalizar a corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir o número de corridas solicitadas pelo cliente | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir a foto do passageiro para o motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir o tipo de pagamento antes de iniciar a corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exigir CPF no cadastro do motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Pedir o CNPJ (MEI) no cadastro do motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Pedir e exigir o nome da mãe no cadastro do motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permite informar números de telefone de outros países | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Documentos padrão | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Ano de fabricação mínimo para cadastro de veículos no aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir uma estimativa de dias para a análise dos cadastros no app motorista? (campos: Estimativa para análise (dias)) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir mensagem para motoristas desconectados na tela inicial (campos: mensagem_taxista_desconectado) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Enviar uma mensagem automática quando o motorista estiver em análise durante o cadastro (campos: Título da mensagem, Mensagem) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Enviar uma mensagem automática quando o motorista estiver em fila de espera durante o cadastro (campos: Título da mensagem, Mensagem) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Enviar uma mensagem automática ao ativar motorista durante o cadastro (campos: Título da mensagem, Mensagem) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Enviar uma mensagem automática ao rejeitar motorista durante o cadastro (campos: Título da mensagem, Mensagem) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Inativar automaticamente motoristas sem atuação (campos: Dias sem atuação para inativar (no máximo 365 dias) *) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Enviar notificação automática para motoristas ociosos (campos: Enviar aviso de 7 dias sem finalizar corridas, Título da mensagem *, Mensagem *, Enviar aviso de 15 dias sem finalizar corridas, Enviar aviso de 30 di | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir abrir corrida pelo aplicativo (Maçaneta) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Para abrir uma corrida maçaneta pelo aplicativo, o motorista deve exigir do passageiro: (campos: Endereço de destino) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Categoria padrão para corridas maçaneta | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Tipo de taxímetro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Tipo de cálculo do valor final da corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Parâmetro de recálculo do valor pré-calculado variável | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Margem para o aumento do valor pré-calculado variável | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Margem para a redução do valor pré-calculado variável | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exigir confirmação para mudar status livre/ocupado | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Ordenar pendências por proximidade | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir pendências para motorista secundário | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Bloquear pendências para motoristas em punição | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir o cadastramento de motoristas pelo próprio aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir ao motorista alterar seu cadastro pelo aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir ao motorista escolher o desconto máximo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir ao motorista alterar seus filtros | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir que o motorista cadastre um destino para priorização de corridas (campos: Priorizar motoristas com destino próximo ao destino do passageiro em um raio de até (km)) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Ativar “indique e ganhe” no aplicativo do motorista (campos: Motorista indica passageiros, Prêmio da indicação (passageiro) (R$), tipo_recompensa_indicacao_cliente, Mínimo de solicitações, url_compartilhamento_i | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exigir que o motorista informe o valor final da corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Permitir uma observação após finalizar a corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir botão de pânico | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Distância para exibir o alerta de pânico para os outros motoristas em KM | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Duração do alerta de pânico (minutos) (campos: duracao_alerta_panico_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir botão de ficha técnica durante corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir taxa de aceitação do motorista no aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Mensagens rápidas entre motorista e cliente (campos: msg_P_1, msg_P_2, msg_P_3, msg_P_4) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Mensagens rápidas entre motorista e central (campos: msg_C_1, msg_C_2, msg_C_3, msg_C_4, msg_C_5, msg_C_6) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Formato de exibição da rota | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir rota após aceite | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir distância até o destino | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir tempo até o destino | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir distância até o embarque do passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir tempo até o embarque do passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir a informação de desconto para o motorista | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir valor total do percurso | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir valor por quilômetro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Cálculo considerado para exibir o valor por quilômetro na tela de aceite | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Motorista > Exibir informações secundárias no cartão de oferta | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Fale conosco do aplicativo passageiro (campos: Link para "Fale conosco" no aplicativo passageiro) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exibir CNPJ no aplicativo e e-mail (campos: CNPJ) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Observação obrigatória no aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Solicitações pelo aplicativo devem ir para a pendência | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir escolher um motorista favorito para uma corrida | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Corridas com desconto podem ficar mais baratas do que o valor mínimo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exibir a quantidade de motoristas por desconto | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exigir que o passageiro informe seu CPF durante o cadastro pelo aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exigir CPF para solicitar corridas via aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exigir confirmação de e-mail para usar o aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Enviar resumo da corrida para o passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Tornar obrigatório o cadastro de uma foto de perfil | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exibir motoristas ocupados no app de passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Obrigar o preenchimento do endereço desejado no app | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Aplicar taxa de cancelamento | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Valor da taxa de cancelamento | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Abonar a taxa de cancelamento se estiver dentro do limite de | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Tempo necessário para aplicar a taxa de cancelamento (minutos) (campos: tempo_taxa_cancelamento_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Distância necessária para aplicar a taxa de cancelamento (metros) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Abonar a taxa de cancelamento em casos de atraso para chegar ao ponto de embarque (campos: tolerancia_atraso_taxista_tempo_tempo, tolerancia_atraso_taxista_tempo_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir que o motorista avalie o passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Suspender automaticamente pela avaliação | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Bloquear passageiros com avaliação igual ou inferior a | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir que o motorista possa bloquear um passageiro pelo aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir o cadastro de cartões de terceiros no aplicativo do passageiro | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Exibir mensagem sobre tarifa dinâmica | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir que o passageiro informe um objeto perdido pelo aplicativo | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Conceder créditos para novos usuários (campos: Valor de créditos) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Aplicar desconto automático na primeira corrida (campos: perc_desconto_cupom_primeira_solicitacao, valor_maximo_cupom_primeira_solicitacao) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Aplicar cupom automático para passageiros inativos | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Ativar cashback por corrida (campos: Tipo de cashback, Valor (%), Valor máximo de cashback (R$)) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permite o cadastro de cartão sem corrida finalizada? | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Ativar “indique e ganhe” no aplicativo do passageiro (campos: Valor da recompensa para quem indica (R$), Valor da recompensa para o indicado (R$), Quantidade de corridas que o indicado tem que fazer para liberar  | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir cadastro de telefone internacional | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Permitir passageiro solicitar viagens para terceiros | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Indisponibilizar categorias quando não há motoristas próximos | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Tempo de antecedência que o passageiro pode agendar (campos: tempo_antecedencia_agendamento_passageiro_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Passageiro > Tempo de antecedência que o motorista recebe a corrida (campos: antecedencia_agendamento_app_periodo) | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Financeiro > Exibir a série do voucher | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Financeiro > Obrigar informar a série do voucher | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Financeiro > Obrigar informar o número do voucher | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Financeiro > Validar existência do número do voucher | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de motorista mulher | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de transporte de animais | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de transporte de encomendas | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de transporte de cadeirantes | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de porta-malas grande | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de veículo à disposição | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |
| Gerais > Filtros > Exibir opção de Com retorno | não (só havia campos do painel de referência) | sim | Campo criado com as opções, o valor padrão e o texto de ajuda da Machine; grava no servidor |