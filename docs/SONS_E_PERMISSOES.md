# Sons, permissões e ícone flutuante dos apps

## Sons

Os sons dos apps são **originais do projeto**: sintetizados por `scripts/gerar-sons.mjs` (ondas senoidais com envelope), sem usar arquivo de outro app. Para trocar por sons da empresa, basta substituir os `.wav` em `painel/src/apps/web/comum/sons/` (mesmos nomes) ou mudar as notas do script e rodar:

```bash
node scripts/gerar-sons.mjs
```

| Arquivo | Quando toca |
|---|---|
| `chamada.wav` | corrida nova para o motorista (repete enquanto o aviso insistente está ligado) |
| `mensagem.wav` | mensagem nova no chat |
| `aceite.wav` | confirmação (corrida aceita) |
| `alerta.wav` | aviso insistente |
| `cancelado.wav` | corrida cancelada |

No build do APK os mesmos arquivos viram recursos do Android (`res/raw`) e os canais de notificação "corridas" e "chat" usam `chamada` e `mensagem` como som. Isso vale quando o push (Firebase) da empresa estiver ligado e o servidor mandar a notificação com o canal certo.

## Permissões do Android

Cada permissão tem um uso no app (nada declarado "por garantia"). O build (`scripts/build-app-proprio.mjs`) acrescenta ao manifesto:

| Permissão | Passageiro | Motorista | Para quê |
|---|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | sim | sim | falar com o servidor e saber se há rede |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | sim | sim | partida no mapa, posição do motorista |
| `ACCESS_BACKGROUND_LOCATION` | não | sim | continuar mandando a posição online com a tela apagada |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | não | sim | o GPS em segundo plano roda como serviço com aviso na barra |
| `CAMERA` | sim | sim | foto do perfil e documentos |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | sim | sim | áudio no chat |
| `POST_NOTIFICATIONS`, `VIBRATE` | sim | sim | avisos e vibração |
| `WAKE_LOCK` | sim | sim | manter a tela ligada na corrida |
| `SYSTEM_ALERT_WINDOW` | não | sim | ícone flutuante por cima de outros apps |
| `USE_FULL_SCREEN_INTENT` | não | sim | abrir a chamada com a tela bloqueada |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | não | sim | pedir para o app ficar fora da economia de bateria |

Se houver outra permissão que um app de referência peça e a UP também precise, diga qual função a usa e acrescente em `build-app-proprio.mjs` (lista `perms`).

## Ícone flutuante (motorista)

Plugin nativo em `scripts/nativo/` (`FlutuantePlugin.java`, `FlutuanteService.java`, `MainActivity.java`), copiado para o projeto Android só no app do motorista. Com o motorista online, a opção "Ícone Flutuante" ligada em Configurações e o app minimizado, aparece uma bolinha com o ícone do app por cima dos outros apps; tocar nela traz o app de volta. Ao ligar a opção, o app leva o motorista à tela do Android para liberar "Exibir sobre outros apps"; o Diagnóstico mostra se está liberado. A chamada também abre por cima da tela bloqueada (`showWhenLocked`).
