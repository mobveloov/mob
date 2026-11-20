# Apps para iPhone (iOS)

Situação em 20/11/2026. Resposta à pergunta: "e os apps para iOS?".

Em termos de código, nada de iOS existe ainda. Os apps do passageiro e do motorista são feitos para Android (APK, com Capacitor). Este documento mostra o que dá para fazer já, o que falta e o caminho para a App Store.

## 1. Resumo

- Hoje não há app para iPhone. Quem tem iPhone usa o link no Safari e instala um atalho na tela inicial (PWA).
- O PWA não exige conta Apple e pode ficar pronto logo. Mas tem limites fortes no iPhone: GPS e avisos com o app fechado não funcionam bem.
- Um app de loja exige conta Apple paga, um Mac ou um serviço de build na nuvem, e a revisão da Apple. Pode levar semanas.
- Há riscos de regra: a Apple pode não aceitar um app de corrida feito para uma empresa só. Isso precisa ser decidido antes.
- Recomendação: corrigir e liberar o PWA agora. Decidir a App Store depois, com os custos e prazos claros.

## 2. O que dá para fazer agora (sem conta Apple)

### Como instalar no iPhone

Use o Safari. Outros navegadores no iPhone não fazem esse atalho.

Antes de começar: o iPhone precisa de iOS 16.4 ou mais novo (Ajustes > Geral > Sobre). Para o aviso (push) funcionar, essa versão é obrigatória.

**Passageiro**

1. Abra o link do app no Safari. Em produção: `https://<endereço-do-painel>/apps/passageiro/?empresa=<id>`. Enquanto não há domínio, use o endereço de teste que o dono receber.
2. Toque no botão Compartilhar (quadrado com seta para cima).
3. Role e toque em "Adicionar à Tela de Início".
4. Confirme o nome e toque em "Adicionar".
5. Abra pelo ícone novo. Quando pedir a localização, escolha "Ao Usar o App".

**Motorista**

Os mesmos passos, com o link `https://<endereço-do-painel>/apps/motorista/?empresa=<id>`. Permita a localização "Ao Usar o App". Se o app pedir notificações, permita também.

### O que funciona

| Item | Situação |
|---|---|
| Ícone na tela inicial e abrir em tela cheia | Funciona. Hoje o nome sai errado (ver seção "O que falta"). |
| Mapa, pedir corrida, acompanhar a viagem | Funciona com o app aberto. |
| GPS | Só com o app aberto e com a permissão dada. |
| Chat por texto | Funciona com o app aberto. |
| Chat por áudio e gravação | Funciona se der permissão do microfone. Testar em aparelho real. |
| Aviso (push) de nova corrida ou mensagem | Só no iOS 16.4+, só com o app instalado na tela inicial, e só se a pessoa permitir. O som é o padrão do iPhone, não o som do app. |
| Tela sempre acesa | Pode funcionar no Safari atual. Testar. Se não funcionar, a tela apaga. |

### O que não funciona ou é limitado

- **GPS em segundo plano:** quando o app sai da frente (tela bloqueada ou outro app aberto), o iPhone para a página. O motorista deixa de enviar a posição, e o passageiro deixa de ver o carro andar. O Android tem um serviço próprio para isso (`PosicaoService.java`). No iPhone, o PWA não tem equivalente.
- **Corrida chegando com o app fechado:** só por push. Não há toque de chamada longo como no Android.
- **Sons e voz:** tocam só com o app aberto e depois de um toque na tela. O iPhone bloqueia som automático.
- **Vibração:** o iPhone não vibra em páginas web.
- **Gravação das corridas:** só com o app na frente. Se a tela bloquear, a gravação para. Vídeo, em especial, não é confiável no PWA.
- **Dados guardados:** o Safari pode apagar dados de sites que ficam muito tempo sem uso. O login pode precisar ser refeito. Conferir a regra atual da Apple.
- **Sem loja:** a pessoa não acha o app na App Store. Precisa do link.
- **Sem offline:** o app não abre sem internet, porque não há service worker.

### O que falta no PWA (conferido no código)

1. Os dois apps (`painel/src/apps/web/passageiro/index.html` e `motorista/index.html`) não têm `<link rel="manifest">`. Só têm viewport e cor do tema.
2. O título de ambos é só "App". No iPhone, o nome do ícone sai "App" para os dois.
3. Não há `apple-touch-icon` (PNG de 180×180, sem transparência). Sem ele, o iPhone usa uma imagem genérica.
4. Faltam `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` e `apple-mobile-web-app-status-bar-style`.
5. O único manifest que existe é do painel (`painel/src/servidor/index.ts`, rota `/manifest.webmanifest`). Ele tem `start_url: "/"`, então abre o painel, e não o app. Tem um só ícone de 512 px. Se a empresa não tiver ícone, a lista fica vazia.
6. Não há tela de abertura (splash) para iOS. Sem ela, aparece uma tela branca por um instante. É opcional.
7. Não há service worker. Não é preciso para instalar no iPhone, mas sem ele não há uso sem internet.

**Plano de correção (Claude faz, o dono confere no iPhone):**

- Um manifest para cada app e para cada empresa, com `start_url` e `scope` do próprio app, nome curto ("Passageiro" e "Motorista"), ícones de 192 e 512 px.
- Um `apple-touch-icon` de 180 px gerado no build de `dist-apps`, a partir do ícone da empresa (`arquivos.iconeApp`), sem transparência.
- As meta tags de iOS nos dois `index.html`.
- Atenção: mexer em `servidor/index.ts` precisa ser combinado com a sessão do painel, conforme `docs/ESTADO_APPS.md`.

## 3. Caminho de app de loja (App Store)

### Contas e custos

- **Conta Apple Developer:** US$ 99 por ano (conferir no site da Apple, o valor pode mudar).
- **Pessoa física:** o cadastro é mais rápido. O nome do vendedor na loja é o seu nome.
- **Empresa:** precisa de número D-U-N-S (pedido gratuito, mas pode levar dias) e da verificação da empresa. Conferir no site da Apple.
- **Mac ou build na nuvem:** iOS não compila no Windows. Opções:
  - Mac próprio ou emprestado (sem custo novo, ou com custo de compra).
  - Xcode Cloud: vem com a conta de desenvolvedor, com cota mensal (conferir).
  - Codemagic: plano gratuito com limite, depois pago (conferir).
  - GitHub Actions com máquina macOS: cobrado por minuto em repositório privado (conferir).
  - Ionic Appflow: pago (conferir).
- **Assinatura do app:** certificados e perfis. A nuvem pode gerar com uma chave da App Store Connect.
- **Tempo:** cadastro, configuração e testes levam dias de trabalho do dono e de Claude.

### O que muda no código (Capacitor iOS)

- Criar a plataforma: `npx cap add ios` gera a pasta `ios/`. Compilar exige Xcode (Mac) ou a nuvem. Hoje `scripts/build-app-proprio.mjs` só cria Android.
- **Bundle ID** (equivale ao pacote do Android): escolher junto com o Android, por exemplo `br.com.upcorridas.passageiro`. Não muda depois de publicar.
- **Info.plist** (textos de permissão). Sem eles, o app fecha ao pedir a permissão:
  - `NSLocationWhenInUseUsageDescription`: localização ao usar o app.
  - `NSLocationAlwaysAndWhenInUseUsageDescription`: localização sempre (motorista).
  - `UIBackgroundModes` com `location` (motorista).
  - `NSCameraUsageDescription`: fotos de documento e do veículo.
  - `NSMicrophoneUsageDescription`: chat por áudio e gravação das corridas.
  - `NSPhotoLibraryUsageDescription`: se a foto vier da galeria.
  - Notificações não têm texto no Info.plist. São pedidas na hora.
- **Plugins:** `@capacitor-community/background-geolocation` (motorista) suporta iOS, mas conferir a versão. `@capacitor/push-notifications` funciona com APNs.
- **Sem igual no iOS:** o serviço do Android que mantém o GPS com a tela apagada não tem equivalente. No iOS, o GPS em segundo plano usa o modo "Location updates", e a Apple exige justificativa clara na revisão.

### Push (APNs pelo Firebase da empresa)

1. No Apple Developer, criar o App ID com "Push Notifications" e criar uma chave APNs (arquivo `.p8`).
2. No Firebase da empresa, adicionar um app iOS com o mesmo bundle ID e enviar a chave `.p8` (com o Key ID e o Team ID).
3. Baixar o `GoogleService-Info.plist` e colocar no projeto iOS. Hoje o Android usa `tenants/<empresa>/firebase/google-services-<app>.json`. A pasta do iOS segue a mesma lógica.
4. O servidor (`painel/src/apps/push.ts`) já envia pelo Firebase. Falta testar o token de iPhone.

### GPS em segundo plano

- Ligar o modo "Location updates" (`UIBackgroundModes`).
- Pedir a permissão "Sempre" com uma explicação antes.
- Na revisão, explicar por que precisa: o motorista online e em corrida precisa ser localizado.
- Se a Apple não aceitar, o motorista só fica localizado com o app aberto.

### TestFlight (teste antes da loja)

- Testadores internos: até 100 pessoas da equipe, com conta no App Store Connect (conferir).
- Testadores externos: até 10.000 pessoas, com uma revisão beta mais leve que a da loja (conferir).
- O build sobe pela nuvem ou pelo Xcode.

### Revisão da App Store

Pontos que a Apple costuma cobrar neste tipo de app (conferir as diretrizes atuais):

- **Exclusão de conta dentro do app**, se houver cadastro. O motorista tem (Menu > excluir conta, em `painel/src/apps/web/motorista/Menu.tsx`). **O passageiro não encontrei no código.** Precisa ser feito para as duas lojas.
- **Login com Apple:** só é exigido se houver login de terceiros (Google, Facebook etc.). O login atual é por telefone com código, então não se aplica. Conferir.
- **A Apple precisa conseguir entrar.** O código de login chega pelo WhatsApp e não aparece em produção. Sem uma conta de teste com acesso, a revisão pode travar.
- **Política de privacidade** em endereço público, e os "rótulos de privacidade" (localização, telefone, áudio, gravação).
- **Gravação de áudio e vídeo das corridas:** avisar, pedir consentimento e explicar no texto de revisão. A LGPD também exige. O texto de consentimento precisa de revisão jurídica (já anotado em `docs/ESTADO_APPS.md`).
- **Mapas e rotas:** o OSRM público (`router.project-osrm.org`) serve só para teste. Para loja, usar servidor próprio. Conferir a licença do OpenStreetMap e do CNEFE para uso comercial.
- **Distribuição:** esta é a dúvida maior. Um app de corrida feito para uma empresa só pode ser recusado como app público. Alternativas: distribuição privada (app sem listagem) ou apps personalizados pelo Apple Business Manager. Conferir as regras atuais antes de enviar.

### Prazos típicos

- Cadastro de pessoa física: costuma ser rápido, em dias.
- Cadastro de empresa: pode levar dias ou semanas, por causa do D-U-N-S e da verificação.
- Revisão da App Store: costuma sair em 1 a 2 dias. Pode passar de 7 dias quando a Apple pede ajustes. Conferir.
- Ciclo completo (cadastro, configuração, TestFlight, primeira revisão): conte semanas, não dias, se houver rejeição.

## 4. Passos

1. **(Dono)** Testar o PWA no próprio iPhone, com a versão atual, e dizer o que achou.
2. **(Claude)** Corrigir o PWA: manifest por app, `apple-touch-icon`, meta tags, nomes "Passageiro" e "Motorista". Combinar com a sessão do painel antes de mexer em `servidor/index.ts`.
3. **(Dono)** Decidir se a conta será de pessoa física ou de empresa. Se for empresa, pedir o D-U-N-S.
4. **(Dono)** Criar a conta Apple Developer e pagar a anuidade (conferir o valor no site da Apple).
5. **(Dono)** Escolher o build na nuvem (Codemagic, Xcode Cloud ou GitHub Actions) ou um Mac, e criar a conta.
6. **(Claude)** Incluir a plataforma iOS no `scripts/build-app-proprio.mjs`, com Info.plist e `UIBackgroundModes`, e a configuração do build na nuvem.
7. **(Dono)** Criar o App ID e a chave APNs no Apple Developer. Subir a chave no Firebase da empresa e baixar o `GoogleService-Info.plist`.
8. **(Claude)** Ligar o push de iOS em `push.ts` e testar o token.
9. **(Claude)** Incluir a exclusão de conta no app do passageiro, igual à do motorista.
10. **(Dono)** Definir a conta de teste para a revisão, com acesso que a Apple consiga usar.
11. **(Dono)** Criar o app no App Store Connect: ícones, prints, política de privacidade, rótulos de privacidade e texto de revisão.
12. **(Dono, com Claude)** Subir o build pelo TestFlight, convidar testadores e testar o checklist.
13. **(Dono)** Decidir a forma de distribuição (pública ou privada) antes de enviar para revisão.
14. **(Dono envia; Claude ajusta)** Enviar para revisão e responder a Apple. Claude ajusta o que for pedido.

## 5. Riscos e recomendação

- **GPS com o app fechado:** no iPhone não é garantido. Sem a versão de loja com a justificativa aprovada, o motorista fica pior que no Android.
- **Regra da Apple para app de uma empresa só:** pode atrasar ou impedir a loja pública. Decidir antes de pagar.
- **Custo e tempo:** US$ 99 por ano, mais o serviço de build, mais dias de configuração. Sem Mac, depende de nuvem com cota ou plano pago.
- **Dois caminhos a manter:** PWA e app de loja. O app de loja usa o mesmo código web (Capacitor), então o trabalho extra é menor.
- **Prazo sem data firme:** a revisão pode demorar. Avisar isso antes de prometer uma data.

**Recomendação:**

1. Agora: corrigir e liberar o PWA (sem custo). Quem tem iPhone instala pelo Safari.
2. Depois de testar o PWA com motoristas e passageiros reais, decidir se vale a App Store.
3. Se decidir: conta Apple, build na nuvem, TestFlight primeiro e só depois a revisão pública (ou privada, conforme a regra vigente).
