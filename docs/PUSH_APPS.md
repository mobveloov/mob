# Push e avisos dos apps (CRM para motorista e passageiro)

Contrato entre o painel (CRM, Notificações app), o servidor e os apps. Código: `painel/src/apps/avisos.ts`,
`painel/src/apps/push.ts`, `painel/src/crm/canal-app.ts`. Teste: `painel/test/push-apps.test.ts`.

## Por que a mensagem do dono não chegou (causas achadas)

1. O CRM só tinha o canal WhatsApp. Campanhas, jornadas e gatilhos nunca falavam com o app.
2. A tela "Notificações app" só colocava o aviso na caixa do app quando o envio era "para todos" e sem filtro.
   Envio individual ou filtrado dependia só do push do sistema.
3. O push do sistema (FCM) fica desligado sem a conta de serviço do Firebase. O app nem registra o aparelho
   (`push: false` em `/api/apps/<empresa>/marca`), e o envio devolvia "0 aceitos" sem avisar ninguém.
4. A caixa do app não tinha lido/não lido nem status para o CRM.

Agora toda mensagem da central grava na caixa da pessoa (sempre) e tenta o push do sistema (se houver chave).

## Fluxo

1. A central envia (CRM: campanha, jornada ou gatilho com canal **Push do app**; ou Comunicação > Notificações app).
2. O servidor acha a pessoa pelo telefone (motorista: cadastro de motoristas; passageiro: cadastro de clientes).
   Sem cadastro: o item vira **falha** com o motivo "Esse telefone não está no cadastro do app."
3. Grava em `app_avisos` (estado `enviada`), emite o evento de tempo real `aviso` e tenta o FCM.
4. O app (aberto) busca `GET /avisos` na hora do evento e a cada 20 s. Buscar marca como `entregue`.
5. A pessoa abre o aviso (`POST /avisos/lidos`): `lida`. O CRM mostra cada etapa.

Travas do CRM no canal app: pausa geral, janela de horário e opt-in da Governança (a mensagem espera na fila
fora da janela). Não valem para o app: ritmo, teto diário e descadastro do WhatsApp.
Régua de reativação, comportamentais e fidelidade seguem só no WhatsApp (pendente).

## API dos apps (token da sessão do app)

| Rota (`/api/apps/<empresa>`) | O que faz |
|---|---|
| `POST /push` `{token}` | Registra o token do aparelho (FCM). Fica em `DADOS_DIR/empresas/<id>/apps/push.json`, até 5 por pessoa. |
| `GET /avisos` | `{avisos:[{id,titulo,texto,estado,push,em,...}], naoLidos}`. Marca `enviada` como `entregue`. |
| `GET /avisos/contagem` | `{naoLidos}` (consulta curta para o sino). |
| `POST /avisos/lidos` `{ids:[...]}` ou `{todos:true}` | Marca como lida. Só os avisos da própria pessoa. |
| Evento SSE/espera `aviso` | `{id,titulo,texto,em}`: o app atualiza a lista e o contador. |

## Situação de cada aviso

`estado`: `enviada` (gravada na caixa), `entregue` (o app buscou), `lida`, `falha`.
`push` (push do sistema, app fechado): `enviado`, `sem_chave` (modo simulado), `sem_aparelho`, `falha`.
Tabela `app_avisos` (`origem`, `origem_id`, `envio_ref` = id da linha do histórico do CRM).

## No painel

- CRM > Comunicação > Notificações: cada linha do canal "Push do app" mostra Enviada / Entregue no app / Lida / Falha,
  datas e a situação do push do sistema.
- CRM > Comunicação > Histórico de Disparos > aba **Push do app**.
- Comunicação > Notificações app: a coluna de status mostra quantas pessoas, entregues, lidas e se o push do
  sistema está pendente de chave.
- Campanhas, Jornadas e Gatilhos: campo **Canal** (WhatsApp ou Push do app).

## Push do sistema (FCM, API HTTP v1) e o que o dono precisa fornecer

Sem chave tudo funciona **dentro do app** (modo simulado: o aviso fica como "Push do sistema pendente de chave").
Para tocar no celular com o app fechado o dono precisa de um projeto Firebase (console.firebase.google.com):

1. **Conta de serviço** (Configurações do projeto > Contas de serviço > Gerar nova chave privada): arquivo JSON.
   O servidor lê, nesta ordem: `FIREBASE_SERVICO_<EMPRESA>` (caminho ou JSON), `DADOS_DIR/empresas/<id>/apps/firebase-servico.json`,
   `FCM_CONTA_SERVICO_JSON` (caminho ou JSON, vale para todas as empresas). Nunca vai para o Git.
2. **google-services.json** de cada app (passageiro e motorista) para gerar os APKs com push
   (`FIREBASE_GOOGLE_SERVICES_PASSAGEIRO` / `FIREBASE_GOOGLE_SERVICES_MOTORISTA`, ver `docs/APPS.md`).
   Sem ele o aparelho não consegue um token.

O motorista precisa também da permissão de notificações do Android (tela de permissões do app).

## Teste

`npx tsx --test test/push-apps.test.ts`: campanha no canal app, motorista recebe, marca lida, CRM mostra "lida";
isolamento entre pessoas e empresas; janela de horário da Governança; falha sem cadastro; gatilho; Notificações app
individual; FCM simulado com a conta de serviço na variável.
