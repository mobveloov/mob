# SOS (botão de pânico): contrato dos apps

Vale para o app do passageiro e para o app do motorista (web e nativo). O servidor é o mesmo dos outros pedidos:
`/api/apps/<empresa>/...`, com o cabeçalho `Authorization: Bearer <token>` da sessão do app.

## Causa do problema que existia

- O botão de pânico do mapa do motorista só mandava uma mensagem de suporte (`/suporte`). Não criava alerta.
- O SOS dentro da corrida gravava um arquivo (`alertas.json`) que só a tela "Apps e SOS" lia. Não chegava ao sino, nem à faixa do painel,
  nem aos outros motoristas, nem por push.
- Não existia aviso aos motoristas próximos.

## O que o servidor faz agora

Ao receber o SOS, o servidor:

1. grava o alerta na tabela `sos_alertas` (SQLite): quem pediu, papel, telefone, posição, endereço (quando dá para achar),
   corrida/OS em andamento, motivo, horário, situação, quem atendeu, observação;
2. mostra no painel em tempo real: sino (urgente, em destaque), faixa vermelha no topo de todas as telas e a tela
   **Corridas > Alertas de segurança** (mapa, dados da pessoa e da OS, Atender, Ligar, Encerrar, histórico). O painel consulta a cada 5 s;
3. avisa os motoristas **online dentro do raio** (Configurações > Gerais > Motorista, "Distância do alerta de pânico", padrão 3 km, `0` desliga)
   por tempo real (evento `sos`), por push (canal `emergencia`, se a empresa tiver Firebase) e na lista de avisos do app;
4. manda o texto ao **WhatsApp de emergência** da empresa (Configurações > Gerais > Suporte), se estiver preenchido;
5. avisa a pessoa que pediu quando a central atende ou encerra (evento `sos_estado` e push).

Situação do alerta: `aberto` -> `atendido` -> `encerrado`. Um alerta fica visível para os motoristas por perto por
"Duração do alerta de pânico" (padrão 30 min) ou até a central encerrar.

## Rotas dos apps

### POST `/sos`
Abre o alerta. Serve para o botão do mapa (sem corrida) e para o SOS dentro da corrida. Se a pessoa tem corrida em andamento
(`a_caminho`, `no_local`, `em_andamento`), o servidor liga o alerta a ela sozinho. Também aceita `corridaId`.

Corpo (tudo opcional):

```json
{ "lat": -23.55, "lng": -46.63, "motivo": "texto curto", "corridaId": "..." }
```

- `lat`/`lng`: posição do GPS. Sem posição, o motorista online usa a última posição conhecida; o passageiro fica sem local.
- `motivo`: até 300 caracteres.
- `corridaId`: id da corrida; precisa ser da própria pessoa (senão 400).
- Repetir o pedido em menos de 2 minutos **não** cria outro alerta: devolve o mesmo (e atualiza a posição).

Resposta 200:

```json
{ "alerta": { "id": "uuid", "situacao": "aberto", "em": "2026-11-20T10:00:00.000Z", "lat": -23.55, "lng": -46.63,
              "endereco": "Rua ...", "os": "123", "atendidoPor": "", "observacao": "", "avisouMotoristas": 2 } }
```

Erros: `400 {"erro": "..."}` (corrida inexistente ou de outra pessoa), `401` (sessão vencida).
O horário `em` segue o padrão do painel (Brasília gravado como UTC).

### POST `/corridas/:id/sos`
Igual ao `/sos` com a corrida no caminho. Mantida para os apps que já usam.

### GET `/sos/meu`
Alertas da própria pessoa nas últimas 24 h (mais novo primeiro), para mostrar "Alerta enviado / atendido / encerrado":

```json
{ "alertas": [ { "id": "uuid", "em": "...", "situacao": "aberto|atendido|encerrado", "atendidoPor": "Ana",
                 "observacao": "(só quando encerrado)", "lat": -23.55, "lng": -46.63, "endereco": "...", "os": "123" } ] }
```

Consultar a cada 5 a 10 s enquanto o alerta estiver aberto ou atendido. O evento `sos_estado` (abaixo) avisa antes.

### GET `/sos/proximos` (só motorista)
Alertas de **outras pessoas** ainda valendo, dentro do raio da posição atual do motorista (a última enviada em `/online` e `/posicao`;
opcionalmente `?lat=..&lng=..`). Sem telefone nem sobrenome. Lista vazia se o raio estiver em 0 ou o motorista estiver offline sem posição.

```json
{ "alertas": [ { "id": "uuid", "papel": "passageiro", "nome": "Paula", "lat": -23.55, "lng": -46.63, "endereco": "...",
                 "em": "...", "distanciaKm": 1.1, "situacao": "aberto",
                 "texto": "Um passageiro pediu ajuda perto de Rua X, a 1,1 km de você." } ] }
```

Consultar a cada 20 s com o motorista online como reserva do tempo real e do push.

### GET `/notificacoes`
A lista de avisos do app. Para o motorista, as emergências por perto vêm no topo, com `"emergencia": true`, `lat`, `lng` e `sosId`
(ajuda quando o push do Firebase não está ligado).

## Eventos em tempo real (SSE `/eventos` ou espera longa `/eventos/espera`)

| Evento       | Quem recebe                  | Dados                                     | O que o app faz                                  |
|--------------|------------------------------|-------------------------------------------|--------------------------------------------------|
| `sos`        | motoristas dentro do raio    | mesmo formato do item de `/sos/proximos`  | tela cheia de emergência com a posição, som e vibração |
| `sos_fim`    | motoristas que viram o `sos` | `{ "id" }`                                | tira o aviso da tela                             |
| `sos_estado` | quem pediu ajuda             | `{ "id", "situacao", "atendidoPor", "observacao" }` | atualiza o cartão "Alerta enviado / atendido / encerrado" |

## Push (Firebase da empresa)

Mesmo canal dos outros avisos (`src/apps/push.ts`; sem conta de serviço da empresa o push fica desligado e valem o tempo real e as consultas).

- Motoristas por perto: título "EMERGÊNCIA perto de você", `canal_id` Android **`emergencia`** (o app nativo deve criar esse canal com
  importância alta, som e vibração), `data`: `{ "tipo": "sos", "sosId": "...", "lat": "-23.55", "lng": "-46.63" }`.
- Quem pediu ajuda: `data.tipo = "sos_estado"` com `sosId` e `situacao`.

## Rotas da central (painel, login do painel)

Prefixo `/api/apps-central`.

| Rota                              | Cargo mínimo | Uso                                                                 |
|-----------------------------------|--------------|---------------------------------------------------------------------|
| GET `/sos?situacao=&limite=`      | qualquer     | lista (`aberto`, `atendido`, `encerrado`, `pendentes`; vazio = todos), com resumo da corrida |
| GET `/sos/resumo`                 | qualquer     | `{ abertos, atendidos, itens[] }` para sino e faixa (consulta a cada 5 s) |
| POST `/sos/:id/atender`           | operador     | marca como atendido e registra quem                                 |
| POST `/sos/:id/encerrar`          | operador     | corpo `{ "observacao": "..." }`; encerra                            |
| GET `/alertas`, POST `/alertas/:id/resolver` | operador | rotas antigas, mantidas (resolver = encerrar)                  |

## Configurações

- Configurações > Gerais > Motorista: "Botão de Pânico Integrado" (liga o botão no app, `regras.motorista.botaoPanico`),
  "Distância do alerta de pânico (km)" (`raioPanicoKm`, padrão 3, 0 desliga), "Duração do alerta de pânico (minutos)" (`duracaoPanicoMin`, padrão 30).
- Configurações > Gerais > Suporte: "WhatsApp de emergência (SOS)" (`suporte.whatsappEmergencia`, só números com DDI e DDD).

## Código

`painel/src/apps/sos.ts` (regras e banco), `painel/src/apps/rotas.ts` (rotas), `painel/src/apps/web/comum/sos.tsx` (app web),
`painel/src/web/telas/corridas/AlertasSeguranca.tsx` e `painel/src/web/sos-vivo.ts` (painel), teste `painel/test/apps-sos.test.ts`.
