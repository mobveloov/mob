# Voz dos apps gerada no servidor

O speechSynthesis do aparelho é robótico. Agora o servidor gera a voz (mp3) e o app só toca o arquivo.

## Contrato para o app

- Rota pública (sem login), igual às outras públicas de `/api/apps/<empresa>/`:
  - `GET  /api/apps/<empresa>/voz?texto=...&voz=feminina|masculina&velocidade=1&app=passageiro|motorista`
  - `POST /api/apps/<empresa>/voz` com JSON `{ "texto", "voz", "velocidade", "app" }`
- `voz`, `velocidade` e `app` são opcionais. Sem eles valem os da Personalização do app (`app` padrão: `passageiro`). `velocidade` vai de 0,7 a 1,5 (passos de 0,05).
- Resposta 200: `Content-Type: audio/mpeg` (mp3), `Cache-Control: public, max-age=86400`, `ETag` (o navegador manda `If-None-Match` e recebe 304), `X-Voz-Motor: gemini|edge|cache`.
- O texto tem no máximo **200 caracteres** (depois de tirar `<`, `>`, controles e espaços repetidos).
- Códigos:

| código | significado | o que o app faz |
|---|---|---|
| 200 | mp3 | toca |
| 204 | voz desligada na Personalização desse app | só o toque |
| 400 | texto vazio | só o toque |
| 413 | texto maior que 200 caracteres | só o toque (ou encurtar) |
| 429 | limite por IP (cabeçalho `Retry-After`) | só o toque |
| 503 | nenhum motor conseguiu (sem chave do Gemini e sem rede para o Edge); JSON `{erro, motivo:"sem_motor"}` | só o toque |
| 404 | empresa inexistente ou suspensa | só o toque |

- O JSON público da personalização (`GET /api/apps/<empresa>/personalizacao` e `/personalizacao-motorista`) traz o campo `voz`:
  `{ ligada, motor, genero, velocidade, app, url, formato: "audio/mpeg", maxCaracteres: 200 }`. Se `voz.ligada` for falso, nem chamar a rota.
- Sugestão no app: pedir o mp3 e tocar com `new Audio(url)`; se falhar ou passar de ~3 s, usar só o toque (não voltar para o speechSynthesis robótico, a não ser que o dono queira).

## Motores (ordem automática)

1. **Gemini TTS**, se houver chave do Gemini nas Integrações (`GEMINI_API_KEY` da empresa ou da plataforma, a mesma que o bot de voz usa). Modelo de `IA_ROTA_VOZ` (padrão `gemini-2.5-flash-preview-tts`), voz Kore (feminina) ou Orus (masculina). O Gemini devolve PCM/WAV e o servidor converte para mp3.
2. **Edge neural** (`pt-BR-FranciscaNeural` feminina, `pt-BR-AntonioNeural` masculina), sem chave, pacote `msedge-tts`. Velocidade pelo parâmetro `rate`.
3. Nenhum: 503.

A empresa pode forçar `gemini` ou `edge` na Personalização (nesse caso não há queda para o outro).

## O que funciona no contêiner Alpine

O Dockerfile usa `node:22-alpine` com `npm ci`. As duas dependências novas são JS puro, sem binário nativo, sem ffmpeg e sem compilar nada:

- `msedge-tts` 2.x: depende só de `ws`, `axios`, `buffer`, `isomorphic-ws` e `stream-browserify` (todos JS puro). Fala por WebSocket (saída 443) com o serviço de leitura do Edge.
- `@breezystack/lamejs`: codificador MP3 em JS (usado só para converter o WAV do Gemini).

Verificado aqui (Windows, Node 22.20): o Edge devolveu mp3 real em ~1,4 s com as duas vozes e velocidades diferentes; o mp3 vindo do Gemini foi testado com `fetch` falso (WAV -> mp3 pelo lamejs). **Não rodei o Docker de produção**: a conclusão para o Alpine vem de as dependências serem JS puro (nada de glibc). O que depende do ambiente é a rede: o contêiner precisa sair para `speech.platform.bing.com` (Edge) e/ou `generativelanguage.googleapis.com` (Gemini). O Edge é um serviço não oficial da Microsoft e pode mudar sem aviso: por isso a chave do Gemini é o caminho estável e o Edge é o reserva.

## Segurança

- Rota pública, mas o único destino de rede é o dos motores fixos (sem URL vinda do cliente: sem SSRF).
- O nome do arquivo de cache é só `sha256(texto, voz, velocidade, motor)` (40 hex) em `<dados>/empresas/<empresa>/apps/voz/`: nada do cliente entra em caminho (sem path traversal). Escrita atômica (arquivo temporário + rename), permissão 0600.
- Limites (variáveis opcionais): `APPS_VOZ_POR_IP` (120 pedidos por 10 min por empresa+IP), `APPS_VOZ_NOVAS_POR_IP` (20 frases novas por 10 min; o que já está no cache não conta), `APPS_VOZ_NOVAS_POR_EMPRESA` (300 novas por hora, protege a cota da chave), `APPS_VOZ_MAX_ARQUIVOS` (3000 por empresa; passando disso apaga 10% dos mais antigos). Mp3 até 2 MB.
- Pedidos iguais ao mesmo tempo geram uma vez só.

## Painel

Configurações > Personalização (app passageiro e app motorista) > "Voz dos avisos": voz ligada, motor (automático, Gemini, Edge), voz feminina/masculina, velocidade e "Gerar frases fixas agora". Os valores gravam no mesmo "Salvar alterações" (campo `voz` da personalização). Ao mudar a voz, o servidor pré-gera as frases fixas em segundo plano (`preGerarFrases(empresaId, app?)`, sem segurar a resposta). Rota de gestor: `POST /api/config/voz/pre-gerar` com `{app?, aguardar?}` (sem `aguardar` responde 202).

Frases fixas pré-geradas (lidas de `painel/src/apps/web`, só leitura): passageiro: "Seu motorista está a caminho.", "Seu motorista está no local.", "Sua corrida começou. Boa viagem.", "Corrida finalizada.", "Sua corrida foi cancelada.", "Não há nenhum motorista disponível no momento."; motorista: "Você está chegando ao local de embarque.", "Você está chegando ao destino.", "Você está chegando à parada 1..5.". As instruções de navegação ("Em 200 metros, vire à direita") são dinâmicas: geram na primeira vez e ficam no cache.

Testes: `painel/test/voz-servidor.test.ts` (motor falso injetável; o do Gemini usa `fetch` falso).
