# App com marca própria — o que muda (análise dos APKs do Sistema B)

Análise só de leitura (manifesto e textos do código compilado), feita em 07–08/11/2026.
Nenhuma imagem, texto de marca, chave ou ícone do Sistema B foi copiado para o repositório.

## Conclusão curta

Os apps do Sistema B são **Flutter compilado**: o código Dart vira `lib/arm64-v8a/libapp.so`, com os endereços do
servidor escritos dentro dele. Não é possível "trocar a marca" desses APKs de forma limpa: mudar o binário de
outra empresa e assinar de novo não é o caminho (é software de terceiro e quebra atualizações e a loja).
Para um app com marca própria por empresa é preciso o **código-fonte** do app (projeto Flutter), seu ou licenciado,
e montar a versão de cada empresa com as trocas abaixo.

## O que cada empresa precisa ter diferente

| Item | Onde fica num projeto Flutter | No Sistema B hoje (identificadores, não marca) |
|---|---|---|
| Nome do app na tela | `android/app/src/main/AndroidManifest.xml` (`android:label`) e `ios/Runner/Info.plist` | um nome por app (passageiro e motorista) |
| Pacote (id na loja) | `applicationId` em `android/app/build.gradle` | o pacote do app do passageiro e o pacote do app do motorista |
| Ícone | `android/app/src/main/res/mipmap-*` (ícone adaptativo `mipmap-anydpi-v26/ic_launcher.xml`) | ícone próprio |
| Ícone da notificação | `res/drawable` + meta-data `com.google.firebase.messaging.default_notification_icon` | ícone próprio |
| Cores, logo, tela de abertura | `lib/` (tema) e `android/app/src/main/res/drawable/launch_background.xml` | — |
| URL base da API | constante no código Dart (`lib/`) | `<API do app do Sistema B>` e `/_/motoristas/` |
| Links de termos e privacidade | código Dart | páginas do site do Sistema B |
| Firebase (notificações, banco em tempo real) | `android/app/google-services.json` e `ios/Runner/GoogleService-Info.plist` | projeto Firebase próprio |
| Chave do Google Maps | meta-data `com.google.android.geo.API_KEY` no manifesto | chave própria (restrita ao pacote) |
| Mapbox (rotas no app do motorista) | token no código ou config | token próprio |
| Mercado Pago (cartão no app) | chave pública buscada no servidor (`api_get_mp_key.php`) | conta própria |
| Assinatura do APK | chave de assinatura da empresa (keystore) | — |
| Exigência de Google Play | app do motorista verifica o Google Play ao abrir | decidir se mantém |

## Recomendação para o SaaS

1. Um único projeto de app com um arquivo de configuração por empresa (nome, pacote, cores, ícones, URL base,
   Firebase, chaves de mapa). Uma "receita" de build gera o APK de cada empresa.
2. A URL base aponta para o **seu** servidor (o motor/painel), não para o servidor do Sistema B nem do Sistema A.
3. Chaves de mapa e Firebase ficam **por empresa** e restritas ao pacote dela. Nunca no repositório.
4. O motor já está pronto para isso: não tem marca fixa e recebe as credenciais por empresa.

## Observação de segurança

Os dois APKs do Sistema B trazem uma chave do Google embutida (normal em apps com mapa). Ela não foi copiada.
Se não tiver restrição por pacote no Google Cloud, qualquer pessoa com o APK pode usá-la — vale avisar o dono.
