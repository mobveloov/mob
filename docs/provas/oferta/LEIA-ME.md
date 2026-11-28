# Oferta com app fechado e tela bloqueada (emulador Android 14, APK do motorista)

Teste feito em 28/11/2026: processo do app morto (`kill -9`, sem "parar à força"), tela apagada (estado Asleep). Disparo do push de dados da oferta (mesmo formato do servidor: `tipo=oferta`, `titulo`, `texto`, `ofertaId`) pelo receptor do Firebase (`com.google.android.c2dm.intent.RECEIVE`, com adb root).

Resultado medido (dumpsys):
- antes: `pidof` vazio, `mWakefulness=Asleep`
- depois: processo novo, `mWakefulness=Awake`, foco em `MainActivity`, notificação id 4712, canal `oferta3` (importância 4 = máxima), categoria `call`, `flags` com FLAG_INSISTENT (toque Sony Xperia em laço).
- captura: `oferta-app-fechado-tela-bloqueada.png` (aviso "Nova corrida" aparecendo com a tela acesa pelo push).

O que o emulador NÃO prova: o som tocando (sem alto-falante aqui), a tela cheia de verdade sobre o bloqueio com senha e fabricantes (Xiaomi, Samsung). Isso está no `docs/ROTEIRO_APARELHO_REAL.md` (passos 4 e 5).
Servidor: `painel/src/apps/despacho.ts` + `push.ts` mandam FCM v1 só de dados, `priority=high`, `ttl=45s` (conferido pela sessão do painel na produção: token do motorista aceito, validate_only 200).
Mudança deste PR: "Chamada em tela cheia" (Android 14) passou a ser permissão ESSENCIAL na tela de permissões do primeiro uso.
