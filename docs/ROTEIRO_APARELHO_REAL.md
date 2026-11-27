# Roteiro de teste no celular (o que só vale em aparelho real)

O que dá para provar no computador já foi provado: veja `docs/provas/apps-final/` (capturas 412x915) e `scripts/teste/apps-e2e.mjs` (27 verificações automáticas).
Abaixo, só o que depende do Android de verdade (push do Google, tela bloqueada, "sobre outros apps"). Faça nesta ordem, com o app novo instalado. Se algo falhar, mande foto ou vídeo e diga o número do passo.

Antes de começar (motorista): abra o app, entre, toque em **Permissões do aparelho** (Menu › Configurações) e libere **Localização o tempo todo**, **Notificações**, **Exibir sobre outros apps** e **Sem restrição de bateria**.

## Motorista

1. **Abertura.** Feche o app (deslize para fora dos recentes) e abra. Deve aparecer a imagem de abertura do painel em tela cheia, sem círculo "Carregando". No segundo início ela aparece na hora.
2. **Voz real.** Com internet, abra o app e espere 10 segundos (ele baixa as frases). Menu › Configurações › Voz dos avisos › **Ouvir exemplo**: deve falar com a voz neural do painel (feminina ou masculina, como está na Personalização do app). A linha "Voz em uso" mostra "Voz ... do painel (neural)". Ligue o modo avião e toque de novo: a frase guardada continua falando. Frase nunca baixada, sem internet: só o toque (sem voz robótica).
3. **Toque de chamada.** Peça uma corrida de outro celular (app do passageiro). Com o app aberto, o toque **Sony Xperia** toca em laço até aceitar ou recusar. Toque em **Recusar**: o som para na hora.
4. **App em segundo plano.** Volte para a tela inicial do celular (app minimizado) e peça outra corrida: a chamada abre por cima, com som em laço.
5. **App fechado + tela bloqueada.** Feche o app, bloqueie a tela e peça uma corrida: a tela acende e a chamada aparece em tela cheia, com o Xperia em laço (precisa do push; o Firebase já está ligado).
6. **Ícone flutuante.** (já provado no emulador Android: `docs/provas/apps-final/nativo-bolha-motorista.png`; confira no seu aparelho) Online, minimize o app: a bolha aparece com o ícone INTEIRO (quadrado de cantos arredondados, "UP" e boneco completos, sem corte). Toque nela: o app abre.
7. **Tela sempre ligada.** Fique online parado por 3 minutos: a tela não apaga.
8. **Duas chamadas seguidas.** Deixe duas corridas tocando: uma não cobre a outra.

## Passageiro

9. **Abertura** igual ao passo 1 (imagem do app do passageiro).
10. **Aceite com som.** Peça uma corrida e deixe o app aberto: quando o motorista aceitar, toca o som do aceite e fala "Seu motorista está a caminho". Repita com o app minimizado: chega a notificação com som.
11. **Placa.** Na tela "Motorista a caminho" aparecem a placa (ABC-1D23, por exemplo) e o veículo, sem corte, e a folha de baixo mostra Ligar e Chat inteiros.
12. **Foto.** A foto do motorista é redonda. Toque nela: abre grande.
13. **Push do CRM.** No painel, mande uma mensagem pelo CRM para o seu número. Com o app aberto: pop-up no meio da tela. Com o app fechado: notificação do sistema; ao tocar, o app abre e o aviso está no sininho.
14. **SOS.** Durante a corrida, toque em SOS: o painel mostra o alerta e o motorista por perto vê o aviso.
15. **Número da casa.** Em "Para onde você vai?", escolha uma rua sem número: o app pede o número e o endereço fica "Rua X, 123".
