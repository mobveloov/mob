# Apps do passageiro e do motorista — lista de funções

Levantamento feito em 08/11/2026, **só de leitura**, nos dois APKs de referência do Sistema B (app do passageiro,
versão 1.5.0, e app do motorista, versão 4.8): manifesto, permissões, nomes das telas e textos do código compilado.
Nenhum código, imagem, som, texto de marca ou chave foi copiado. Os nossos apps são escritos do zero, em React com
Capacitor, e levam a marca de cada empresa (`tenants/<empresa>/brand.json`).

> **Chaves encontradas nos APKs (só aviso):** os dois manifestos e o código compilado têm chaves de API do Google
> (prefixo `AIza…`, uma de mapas no manifesto e outras no código). Não foram copiadas nem anotadas. Elas são do dono
> do Sistema B; se forem de alguém da casa, devem ser trocadas e restritas ao pacote.

## Como ler

- **B** = existe no app de referência do Sistema B (pela tela ou pelo texto).
- **Onde fica no nosso sistema**: arquivo ou rota que faz a função. `API` = `painel/src/apps/` (rotas em
  `/api/apps/<empresa>/...`). `App P` = `painel/src/apps/web/passageiro/`. `App M` = `painel/src/apps/web/motorista/`.
- **Situação**: `pronto` (funciona e tem teste), `parcial` (funciona o básico), `planejado` (ainda não feito).

## O que o Android pede nos apps de referência

| Permissão | Passageiro | Motorista | Para quê | Nos nossos apps |
|---|---|---|---|---|
| Localização (precisa e aproximada) | sim | sim | posição no mapa, embarque | sim (os dois) |
| Localização em segundo plano | — | sim | posição com o app minimizado | sim (motorista) |
| Serviço em primeiro plano (localização, sincronização) | — | sim | manter online com a tela apagada | sim (motorista, pelo plugin de GPS) |
| Microfone (gravar áudio) | sim | sim | mensagem de áudio no chat | sim (os dois) |
| Notificações | sim | sim | push de corrida, chat e status | sim (os dois, com Firebase da empresa) |
| Câmera e galeria | sim | sim | foto de perfil, documentos | planejado |
| Tela cheia / sobre outros apps / desbloquear | — | sim | chamada de corrida por cima de outros apps | planejado |
| Ignorar economia de bateria | — | sim | não perder chamadas | planejado (o app avisa) |
| Alarme exato e iniciar no boot | sim | sim | lembretes e serviço após reiniciar | não usado |

## App do passageiro

| Função | B | Onde fica no nosso sistema | Situação |
|---|---|---|---|
| Entrar pelo telefone com código | sim (identificação + código) | API `POST /entrar/codigo` e `/entrar` (`apps/sessoes.ts`); App P tela Entrar | pronto |
| Entrar com senha | sim | não usamos senha no app: só código por telefone | — |
| Cadastro do passageiro (nome) | sim | primeiro login pede o nome; grava no cadastro **Passageiros** (`cadastros`) | pronto |
| Editar perfil, trocar senha | sim | App P aba Conta (nome); sem senha | parcial |
| Escolher cidade | sim | a empresa já define as cidades em **Endereços** (`enderecos`) | pronto |
| Buscar endereço de embarque e destino | sim | API `GET /enderecos?q=` sobre `buscarEndereco` (CNEFE) | pronto |
| Marcar no mapa / "minha localização" | sim | App P usa o GPS e `enderecoDoPonto` (`GET /enderecos/ponto`) | parcial (sem mapa desenhado; mostra posição em texto e mapa simples) |
| Paradas no caminho | sim | planejado (a corrida própria ainda tem só embarque e destino) | planejado |
| Escolher categoria e ver preço antes | sim | API `GET /estimativa` sobre `rota` + `estimarPreco` | pronto |
| Formas de pagamento (dinheiro, Pix, cartão na maquininha) | sim | API `GET /opcoes`; texto gravado na corrida | pronto |
| Pagar pelo app (cartão salvo, Pix gerado no app) | sim | planejado: precisa de gateway de pagamento da empresa | planejado |
| Carteira e recarga por Pix | sim | planejado (painel: **Carteiras**, aguarda motor) | planejado |
| Cupom de desconto | sim | campo cupom no pedido, regra de `descontoDoCupom` (cadastro **Cupons**) | pronto |
| Pedir corrida | sim | API `POST /corridas` → `criarCorridaPropria` (canal `app`) | pronto |
| Procurando motorista | sim | App P tela de espera + despacho automático (`apps/despacho.ts`) | pronto |
| Motorista a caminho, no local, em viagem | sim | status da corrida em tempo real por SSE (`GET /eventos`) | pronto |
| Ver motorista no mapa (posição ao vivo) | sim | evento `posicao` do motorista da corrida, no App P | pronto (posição; mapa simples) |
| Dados do motorista (nome, carro, placa) | sim | vêm do cadastro **Motoristas** na corrida do app | pronto |
| Chat com o motorista (texto) | sim | API `GET/POST /corridas/:id/chat` (`apps/chat.ts`) | pronto |
| Mensagem de áudio | sim | API `POST /corridas/:id/audio` (arquivo por empresa, limite de tamanho e tipo) | pronto |
| Ligar para o motorista | sim | API devolve o telefone só para quem está na corrida aberta; App P abre o discador | pronto |
| Compartilhar a viagem | sim | App P botão compartilhar (texto com OS, motorista e placa, pelo compartilhamento do aparelho) | parcial |
| Cancelar corrida | sim | API `POST /corridas/:id/cancelar` → `cancelarCorrida` | pronto |
| Avaliar o motorista (nota) | sim | API `POST /corridas/:id/avaliar` → `avaliar` | pronto |
| Comentário e contestação de valor | sim | planejado (painel: **Retorno e ocorrências**) | planejado |
| Histórico de corridas | sim | API `GET /corridas` (só as do passageiro) | pronto |
| Corridas agendadas | sim | planejado (painel: **Programadas** é parcial) | planejado |
| Motoristas favoritos e bloqueados | sim | planejado | planejado |
| Objetos perdidos | sim | planejado (painel já tem o cadastro **Objetos perdidos**) | planejado |
| Indicações (link de indicação) | sim | planejado (painel: **Desafios e indicações**) | planejado |
| Lances de preço dos motoristas | sim (aviso de "lances") | não fazemos: o preço vem da tarifa da categoria | — |
| SOS / emergência | não encontrado no passageiro | API `POST /corridas/:id/sos` (os dois apps), aparece no painel | pronto |
| Notificação push | sim | `apps/push.ts` com o Firebase da própria empresa | pronto (sem chave: desligado) |
| Permissões explicadas antes de pedir | sim | App P tela de permissões | parcial |

## App do motorista

| Função | B | Onde fica no nosso sistema | Situação |
|---|---|---|---|
| Entrar pelo telefone com código | sim (identificação + senha) | API `POST /entrar/codigo` e `/entrar`; só motorista **Ativo** do cadastro | pronto |
| Cadastro em passos (dados, veículo, documentos, foto do rosto) | sim | o cadastro é feito pela central em **Motoristas** e **Veículos** | parcial |
| Em análise / documentos exigidos e vencidos | sim | API `GET /eu` mostra validade da CNH e do licenciamento do cadastro | parcial |
| Enviar documentos e foto | sim | planejado | planejado |
| Meus veículos | sim | dados do veículo do cadastro (`veiculo`, `placa`) | parcial |
| Ficar online e offline | sim | API `POST /online` e `/offline` (`apps/despacho.ts`) | pronto |
| Enviar a posição (GPS) | sim | API `POST /posicao`; App M manda a cada poucos segundos | pronto |
| GPS em segundo plano | sim | App M com plugin de localização em segundo plano (serviço com notificação) | pronto no APK |
| Receber chamada de corrida | sim (som, tela cheia) | oferta para o motorista online **mais perto** (evento `oferta` + push) | pronto |
| Aceitar e recusar chamada | sim | API `POST /ofertas/:id/aceitar` e `/recusar`; sem resposta em 20 s passa ao próximo | pronto |
| Chamada por cima de outros apps | sim | planejado (precisa de permissão de sobreposição) | planejado |
| Fila de corridas (aceitar a próxima durante uma corrida) | sim | não: o motorista em corrida não recebe outra | — |
| Navegação até o embarque e o destino | sim (abre app de navegação externo) | App M abre o app de mapas do aparelho com o endereço (`geo:`/link de rotas) | pronto |
| Cheguei no local | sim | API `POST /corridas/:id/status` → `no_local` | pronto |
| Iniciar e finalizar a viagem | sim | API `POST /corridas/:id/status` → `em_andamento` e `finalizada` (valor da estimativa) | pronto |
| Calcular troco | sim | App M na tela de finalizar | pronto |
| Paradas pedidas pelo passageiro | sim | planejado | planejado |
| Cancelar corrida (motivo) | sim | API `POST /corridas/:id/cancelar` (quem = Motorista) | pronto |
| Taxa de cancelamento | sim | planejado (painel: **Taxas de cancelamento**) | planejado |
| Chat com o passageiro (texto e áudio) | sim | as mesmas rotas do chat; leitura do chat em voz alta: planejado | pronto |
| Ligar para o passageiro e para a central | sim | telefone do passageiro na corrida aberta; telefone da central vem da marca | pronto |
| Dados do passageiro | sim | nome, embarque, destino, pagamento e observação na oferta e na corrida | pronto |
| Bloquear passageiro | sim | planejado (painel: **Punições e bloqueios**) | planejado |
| Avaliar o passageiro | sim | planejado | planejado |
| Ganhos e histórico de ganhos | sim | API `GET /ganhos` (hoje, 7 dias, 30 dias, das corridas próprias finalizadas) | pronto |
| Histórico e detalhes da corrida | sim | API `GET /corridas` (só as do motorista) | pronto |
| Carteira, saque e receber por Pix | sim | planejado (painel: **Carteiras**, aguarda motor) | planejado |
| Conectar conta de pagamento | sim | planejado | planejado |
| Desafios e indicações | sim | planejado (painel: **Desafios e indicações**) | planejado |
| Preferências de corrida (categorias, carro e moto) | sim | categorias habilitadas do cadastro do motorista filtram as ofertas | parcial |
| Notificações (lista) | sim | planejado (painel: **Notificações do app**) | planejado |
| SOS / pânico (sirene) | sim | API `POST /corridas/:id/sos` + alerta na central (`GET /api/apps-central/alertas`) | pronto |
| Diagnóstico (permissões, bateria) | sim | App M tela de permissões avisa o que falta | parcial |
| Termos de uso, fale conosco | sim | textos de suporte da marca (`textos.suporteEmail`, `suporteTelefone`) | parcial |
| Notificação push | sim | `apps/push.ts` com o Firebase da própria empresa | pronto (sem chave: desligado) |

## Painel (o que os apps acrescentam)

| Função | Onde fica | Situação |
|---|---|---|
| Motoristas online no mapa | `GET /api/apps-central/motoristas` (posição, livre ou em corrida) | pronto na API; tela **Mapa de motoristas** pode usar |
| Alertas de SOS | `GET /api/apps-central/alertas` e `POST .../:id/resolver` | pronto na API |
| Corridas do app em **Consultar corridas** | canal "App" das corridas próprias | pronto |
