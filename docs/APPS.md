# Apps do passageiro e do motorista

Apps próprios, escritos do zero em React com Capacitor, com a marca de cada empresa. Ficam em cima das corridas
próprias (`painel/src/corridas`) e dos cadastros (`painel/src/cadastros`): funcionam sem nenhum sistema externo.
A lista de funções, comparada com os apps de referência do Sistema B, está em [APPS_FUNCOES.md](APPS_FUNCOES.md).

## Onde fica cada parte

| Parte | Arquivo |
|---|---|
| API dos apps (`/api/apps/<empresa>/...`) | `painel/src/apps/rotas.ts` |
| Login pelo telefone com código | `painel/src/apps/sessoes.ts` |
| Online e offline, oferta ao mais perto, aceitar e recusar, vigia de mudanças, ganhos, SOS | `painel/src/apps/despacho.ts` |
| Tempo real (SSE) | `painel/src/apps/eventos.ts` |
| Chat com texto e áudio | `painel/src/apps/chat.ts` |
| Push com o Firebase da empresa | `painel/src/apps/push.ts` |
| Telas do app do passageiro | `painel/src/apps/web/passageiro/` |
| Telas do app do motorista | `painel/src/apps/web/motorista/` |
| Peças comuns (API, áudio, GPS, push, chat) | `painel/src/apps/web/comum/` |
| Tela do painel "Apps e SOS" | `painel/src/web/apps/AppsCentral.tsx` |
| Build dos APKs | `scripts/build-app-proprio.mjs` (chamado por `scripts/build-app-empresa.mjs --app=...`) |
| Testes | `painel/test/apps.test.ts` |

## Como a corrida anda

1. **Passageiro** entra pelo telefone (código de 6 dígitos pelo WhatsApp da empresa), escolhe embarque e destino
   (`buscarEndereco`, `enderecoDoPonto`), vê o preço de cada categoria (`rota` + `estimarPreco`) e pede.
   A corrida é uma corrida própria com canal `app`. Também aparece em **Consultar corridas**.
2. **Despacho**: qualquer corrida "procurando" da empresa (do app, da central, do bot ou do totem) é oferecida ao
   motorista **online, livre e mais perto** do embarque (até `APPS_RAIO_KM`, com a categoria habilitada no cadastro).
   O motorista tem `APPS_OFERTA_SEGUNDOS` (20 s) para aceitar. Se recusar ou deixar passar, a oferta vai para o
   próximo, e ele só recebe a mesma corrida de novo 2 minutos depois.
3. **Motorista** aceita (`atribuirMotorista`), chega (`no_local`), inicia (`em_andamento`) e finaliza (`finalizada`,
   com o valor da estimativa ou o que ele digitar). Se desistir antes de chegar, a corrida volta para a busca.
4. **Tempo real**: cada app abre `GET /eventos` (SSE). Eventos: `oferta`, `oferta_encerrada`, `corrida`, `posicao`
   (do motorista, só para o passageiro da corrida) e `chat`. Um vigia confere as corridas a cada 2 s, então mudanças
   feitas pela central (cancelar, trocar motorista) também chegam aos apps.
5. **Chat**: abre quando o motorista aceita e fecha quando a corrida termina. Texto até 1.000 caracteres. Áudio:
   `audio/webm`, `ogg`, `mp4/m4a`, `aac`, `mpeg` ou `wav`, conferido pelo começo do arquivo. Limite de
   `APPS_AUDIO_MAX_KB` (1.024 KB), 60 áudios e 500 mensagens por corrida. Os arquivos ficam em
   `DADOS_DIR/empresas/<id>/apps/chat/`, e só quem está na corrida baixa o áudio.
6. **Ligação**: o telefone do outro lado só aparece enquanto a corrida está aberta. O app abre o discador do aparelho.
7. **Avaliação e SOS**: o passageiro dá a nota (`avaliar`). O SOS dos dois apps grava um alerta, que aparece na
   tela **Apps e SOS** do painel.

## Segurança e isolamento

- O token do app vale só para a empresa em que foi criado. Usado em outra empresa, recebe 401. No servidor só fica
  o hash do token.
- Motorista só entra se estiver **Ativo** no cadastro. Se for desativado, perde o acesso na hora. Passageiro
  bloqueado ou suspenso não entra.
- Cada corrida, chat e áudio só aparece para o passageiro dono e para o motorista atribuído.
- Limites: 5 pedidos de código por telefone por hora, 5 tentativas por código, código vale 10 minutos.
- CORS aberto só em `/api/apps` (o app Android roda em `https://localhost`). Não há cookie, só o token no cabeçalho.
- `APPS_MOSTRAR_CODIGO=1` devolve o código na resposta, para teste. **Não vale com `NODE_ENV=production`.**

## Push (Firebase da própria empresa)

Nada de chave no Git. Cada empresa usa o projeto Firebase dela, e um projeto atende os dois apps.

- **Servidor** (enviar): a conta de serviço do Firebase em `FIREBASE_SERVICO_<EMPRESA>` (caminho do JSON ou o
  próprio JSON) ou no arquivo `DADOS_DIR/empresas/<id>/apps/firebase-servico.json`.
- **App** (receber): o `google-services.json` de cada app em `FIREBASE_GOOGLE_SERVICES_PASSAGEIRO` /
  `FIREBASE_GOOGLE_SERVICES_MOTORISTA` (caminho) ou em `tenants/<empresa>/firebase/google-services-<app>.json`
  (pasta no `.gitignore`).
- Sem esses arquivos o push fica desligado. Com o app aberto, tudo segue pelo tempo real.

## GPS em segundo plano (motorista)

No APK do motorista, o plugin de localização em segundo plano mantém um serviço com notificação fixa
("Você está online") enquanto ele estiver online, mesmo com o app minimizado. No navegador, só com a aba aberta.

## Rodar e testar

```bash
cd painel && npm test && npx tsc --noEmit
```

No navegador, com a API rodando (`npm run dev:api`) e `APPS_MOSTRAR_CODIGO=1`:

```bash
cd painel && npm run dev:apps
```

Abra `http://localhost:5174/passageiro/?empresa=<id>` e `http://localhost:5174/motorista/?empresa=<id>`.
Depois do `npm run build:apps`, o servidor também serve os apps em `/apps/passageiro/` e `/apps/motorista/`
(veja as ligações abaixo).

## Gerar os APKs

Precisa de Node 20+, `npm install` em `painel/` e `scripts/`, JDK 21 (`JAVA_HOME`) e Android SDK (`ANDROID_HOME`).

```bash
node scripts/build-app-empresa.mjs exemplo --app=passageiro --apk
```

```bash
node scripts/build-app-empresa.mjs exemplo --app=motorista --apk
```

Saem em `build/apps/exemplo-passageiro/exemplo-passageiro-teste.apk` e `build/apps/exemplo-motorista/exemplo-motorista-teste.apk`.
Para o emulador falar com a API do computador: `APP_URL_API=http://10.0.2.2:8787`. Em produção, a API vem de
`app.urlApi` (ou `app.urlPainel`) do `brand.json`, sempre com https. O AAB da loja usa `--aab` e a assinatura da
empresa (`APP_KEYSTORE`, `APP_KEYSTORE_SENHA`, `APP_KEY_ALIAS`, `APP_KEY_SENHA`).

No `brand.json` (todos opcionais):

```json
"app": {
  "nome": "Exemplo Mobi", "pacote": "test.exemplo.painel", "urlPainel": "https://painel.exemplo.test",
  "empresaId": "exemplo", "urlApi": "https://painel.exemplo.test",
  "passageiro": { "nome": "Exemplo Mobi", "pacote": "test.exemplo.passageiro" },
  "motorista": { "nome": "Exemplo Motorista", "pacote": "test.exemplo.motorista" }
}
```

## UP Corridas (empresa 1)

```bash
node scripts/build-app-empresa.mjs up-corridas --app=passageiro --apk
```

```bash
node scripts/build-app-empresa.mjs up-corridas --app=motorista --apk
```

- Marca: `tenants/up-corridas/brand.json`, com amarelo `#FFC400`, preto e branco. O ícone sai de
  `tenants/up-corridas/assets/icone.png`. Quando a arte oficial for salva nesse caminho, basta gerar de novo.
- Pacotes: sem `app.passageiro` e `app.motorista` no `brand.json`, ficam `br.com.upcorridas.passageiro` e
  `br.com.upcorridas.motorista`. Os nomes ficam "UP Corridas" e "UP Corridas Motorista". **Confirme antes de publicar:**
  o pacote não muda depois que o app vai para a loja.
- API: `app.urlPainel` (`https://painel.upcorridas.com.br`, ainda a confirmar). Enquanto esse endereço não responder,
  o app abre e mostra "Sem conexão com a central".

## Ligações nos arquivos comuns (para a sessão Base)

Estes três arquivos são da sessão Base. As linhas abaixo ligam os apps no painel.

### `painel/src/servidor/index.ts`

```ts
// junto dos outros imports de rotas
import { rotasApps, rotasAppsCentral } from "../apps/rotas.ts";
import { iniciarApps } from "../apps/despacho.ts";

// ANTES de app.use("/api", exigirLogin), junto de /api/bot e /api/totem:
// Apps do passageiro e do motorista: login próprio pelo telefone (token).
app.use("/api/apps", rotasApps);

// DEPOIS do exigirLogin, junto de /api/enderecos:
app.use("/api/apps-central", rotasAppsCentral);

// ANTES do bloco "Produção: serve o painel compilado":
// Apps do passageiro e do motorista no navegador (npm run build:apps): /apps/passageiro/?empresa=<id>
const distApps = path.resolve("dist-apps");
if (fs.existsSync(distApps)) app.use("/apps", express.static(distApps));

// dentro de if (process.env.NODE_ENV !== "test"), depois do setInterval de encerrarSemMotorista:
// Despacho dos apps: oferta ao motorista mais perto, vence ofertas e avisa mudanças (a cada 2 s).
iniciarApps();
```

### `painel/src/web/App.tsx`

```tsx
import AppsCentral from "./apps/AppsCentral";
// dentro de <Routes>, antes da rota "*":
<Route path="/apps" element={<AppsCentral />} />
```

### `painel/src/comum/funcoes.ts`

```ts
// em FUNCOES, no grupo "Operação" (depois de "mapa"):
{ id: "apps", grupo: "Operação", nome: "Apps e SOS", rota: "/apps", emA: true, emB: true, situacao: "pronto" },
```

Para o Docker servir os apps em `/apps/`, o `Dockerfile` pode rodar `npm run build:apps` junto do `npm run build`.
