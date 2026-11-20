# Campos de Corridas: Consultar corridas, Histórico da OS e Trajeto da OS

Fonte: quatro capturas da referência (lista com a janela de detalhe aberta, a mesma com a conversa aberta, "Histórico da OS" e "Trajeto da OS").
Formato: Tela > Aba > Campo/Botão | existia? | igual agora? | o que mudei. Todos os dados vêm das corridas reais dos apps.

## Consultar corridas (lista)

| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Título "Consultar corridas" | sim | sim | |
| Botão Filtro | sim | sim | |
| Botão Exportar relatório | sim | sim | |
| Botão Analisar via IA (cabeçalho) | sim (nome do assistente da marca) | sim | segue o nome da marca |
| Interruptor "Atualizando automaticamente / Atualização automática pausada" | sim | sim | |
| "Exibindo as últimas" 15 min, 30 min, 1 h, 2 h, 3 h, 4 h | sim | sim | o padrão passou de "Hoje" para "4 horas", como na referência ("Hoje" continua no fim, é nosso) |
| Texto "Exibindo 1-N de N resultados" | não | sim | criado acima da tabela |
| Coluna Alerta (hora da solicitação com segundos) | parcial (era só o ícone) | sim | mostra a hora "hh:mm:ss" |
| Duas colunas de ícone (alerta e canal) | não | sim | triângulo de alerta e ícone de celular para corridas via App e Maçaneta |
| Colunas Nº OS, Partida, Passageiro, Motorista, Empresa, Status | sim | sim | ausência mostra "---"; a hora saiu de baixo do número da OS |
| Clique na linha abre o detalhe | janela | sim | agora abre **embaixo da própria linha** (clicar de novo fecha), com seta de voltar |
| Cores do status (aberta, finalizada) | sim | sim | |
| Total, Finalizadas, Canceladas, Ativas (cartões) | sim (nosso) | extra nosso | mantido |

### Janela de filtro "Filtro de pesquisa"

| Campo | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Número da OS, Número externo da OS | sim | sim | |
| Central chamada, Central da corrida | sim | sim | opções = centrais da empresa |
| Empresa, Categoria | sim | sim | |
| Nome, Telefone, CPF do passageiro | sim | sim | |
| Endereço de partida, Nome/VTR/Placa do motorista | sim | sim | |
| Data inicial, Hora inicial, Data final, Hora final | sim | sim | |
| Forma de pagamento (Dinheiro, Débito (máquina), Crédito (máquina), eTicket, Voucher, Cartão no app, Pix, Picpay, Whatsapp, Pix no app) | sim | sim | |
| Status | ordem e lista diferentes | sim | agora exatamente: Distribuindo, Aguardando aceite, Aguardando liberação, A caminho, Não atendida, Cancelada, Em andamento, Finalizada, Pendente, Em espera, Pagamento pendente, Em negociação (as variações "cancelada pelo passageiro/motorista" saíram da lista; continuam valendo por URL) |
| Urgência (6 opções), Corrida via (App, Site, Maçaneta) | sim | sim | |
| "Corridas que geraram cashback" | sim | sim | |
| Botões Filtrar, Limpar filtros, Cancelar | sim | sim | |

## Consultar corridas > Detalhes da corrida (sob a linha)

| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Título "Detalhes da corrida", Nº OS, Status | parcial | sim | refeito |
| Botões Trajeto, Histórico | não | sim | abrem as páginas novas abaixo |
| Botão Criar cópia | não (existia "Reenviar") | sim | abre Solicitar nova corrida já preenchida (`?copiar=`) |
| Botão Enviar recibo | não | sim, com diferença | janela com o resumo e "Enviar por WhatsApp" (link do aparelho) e "Copiar texto". Por e-mail depende de serviço de e-mail externo |
| Botão Exportar recibo | sim (Imprimir recibo) | sim | |
| Botão Alterar OS | sim (Editar) | sim | |
| **Informações da chamada**: Momento da solicitação, Bandeira da chamada, Categoria, Tarifa, Nome do passageiro, Telefone do passageiro, Telefone de cadastro, Local de embarque, Destino informado, Forma de pagamento, Motorista especificado, Distância e Tempo previstos, Valor previsto sem descontos, Desconto aplicado, Valor previsto com desconto | parcial | sim | servidor devolve o bloco `machine` em `GET /api/operacao/corridas/:id` |
| **Informações do aceite**: Motorista, Telefone, Momento do aceite, Bandeira da corrida, Distância e Tempo do aceite ao embarque (previsão) | parcial | sim | previsão vem da distância da chamada enviada ao motorista que ganhou (tempo estimado a 25 km/h) |
| **Informações do início de corrida**: chegada registrada pelo motorista, chegada registrada pelo GPS, início, distância e tempo realizados até o embarque | não | sim | realizado = soma dos pontos de GPS gravados; chegada pelo GPS = primeiro ponto a até 120 m do embarque |
| **Informações de encerramento**: momento, local, distância e tempo realizados, valor sem desconto, "Desconto de N%", valor final, ganhos do motorista, taxa de serviço | parcial | sim | ganhos e taxa vêm da comissão da central (`resumoDeGanho`) |
| **Informações de controle**: Corrida via, Sistema operacional, Tipo de despacho inicial, Houve eleição | não | sim | corrida passou a guardar o sistema do aparelho (Android, iOS ou Web) pelo pedido do app |
| Link "Conversa entre o motorista e o passageiro" | era "Mensagem" | sim | janela "Conversa entre o motorista e o passageiro": nome em negrito, texto e hora (Brasília), botão Voltar, com áudio e mídia |
| Ações da central (Rastrear, Reenviar, Auditoria, Ver lances, Cancelar), repasses, cancelamento, observação | sim (nosso) | extra nosso | mantido numa faixa abaixo |

## Histórico da OS (log da solicitação)

Abre pelo botão Histórico (`/historico?log=<id>`); botão Voltar.

| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Título "Histórico da OS N" | não | sim | página nova |
| Linhas "hh:mm:ss - descrição" (Consultando motoristas por proximidade; Foram encontrados N motoristas em até X km) | não | sim | o motor grava essas linhas a cada rodada do despacho |
| Tabela: VTR, Nome, Recebeu, Rejeitou, Candidatou-se, Priorizado por destino definido, Distância em linha reta (ajuda), Distância com rota (ajuda), Tempo para chegar, Vencedor | não | sim | feita das ondas reais; rota e tempo pelo serviço de rotas (sem ele, estimativa pela linha reta) |
| Hora, tipo, descrição, usuário e canal de cada evento | não | sim (além da referência) | cada linha mostra o tipo, quem fez e o canal |
| Eventos gravados | não | sim | criada, consulta do despacho, chamada enviada a cada motorista, aceita, recusada, sem resposta, encerrada por outro aceite, motorista offline, atribuída, a caminho, chegou, iniciou, finalizou, cancelou (com quem e motivo), voltou a procurar, não atendida, mudança de valor e de pagamento (de/para e quem), alteração da OS, avaliações |
| Corridas antigas (sem eventos) | não | sim | linha do tempo montada do histórico e das ondas, com aviso |

Servidor: tabela `corrida_eventos` (máx. 500 por corrida), `GET /api/operacao/corridas/:id/log`. Gravação em `corridas/index.ts` (toda mudança de corrida) e `apps/despacho.ts` (chamadas).

## Trajeto da OS

Abre pelo botão Trajeto (`/historico?trajeto=<id>`); botão Voltar.

| Item | Existia? | Igual agora? | O que mudei |
|---|---|---|---|
| Título "Trajeto da OS N" | não | sim | |
| Mapa com o percurso | só posição ao vivo | sim | polilinha real dos pontos de GPS do app do motorista (laranja até o embarque, verde na corrida), marcadores A (aceite), I (embarque), F (fim), paradas combinadas numeradas e pontos de parada detectados (90 s ou mais parado). Usa o componente de mapa existente do painel |
| Mapa / Satélite, atalhos, termos do Google | não | não | a referência usa o mapa do Google; aqui é o mapa do painel (sem chave de terceiros) |
| Etapas: A Aceite pelo motorista (Horário, Distância, Duração), I Início da corrida (Horário, Distância, Duração), F Final da corrida (Horário) | não | sim | distância e duração reais dos pontos gravados |
| Total percorrido, previsto e nº de pontos | não | extra nosso | |

Servidor: tabela `corrida_pontos`; o app do motorista já enviava posições (`POST /posicao`), agora gravadas enquanto a corrida está a caminho, no local ou em andamento. Ignora ponto parado (menos de 8 m), no máximo 2 500 pontos por corrida (depois simplifica por Douglas-Peucker) e devolve no máximo 1 500 para desenhar. `GET /api/operacao/corridas/:id/trajeto`.

## Não consegui igualar

- Mapa do Google (Mapa/Satélite/atalhos de teclado): trocado pelo mapa do painel; outro agente cuida dos tiles.
- Enviar recibo por e-mail: precisa de serviço de e-mail externo; entreguei WhatsApp e copiar texto.
- "Priorizado por destino definido" sempre "Não" (o despacho não tem essa regra ainda).
- "Motorista especificado" sempre "Não" (o pedido do app não escolhe motorista).
- Sistema operacional das corridas antigas aparece "---".
- Tempo para chegar na tabela do log usa a estimativa por linha reta quando não há serviço de rotas.

## Conferido no navegador

Servidor de teste na porta 8903, corridas simuladas de ponta a ponta pelos apps (pedido, chamada, recusa, aceite, conversa, a caminho, chegou, iniciou, finalizou, posições de GPS): lista, abertura da linha, os cinco blocos, janela de conversa, Enviar recibo, Alterar OS, filtro (todos os campos e opções), Histórico da OS e Trajeto da OS com o percurso desenhado.
