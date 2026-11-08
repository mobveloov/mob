# Motor — o que foi testado (07 e 08/11/2026)

## Ferramentas instaladas (08/11/2026)

Liberado pelo usuário. Tudo de fonte oficial e fora do repositório:

| Ferramenta | Origem | Pasta | Conferência |
|---|---|---|---|
| Node.js 26.13.0 LTS (zip win-x64) | nodejs.org/dist | `%USERPROFILE%\ferramentas\node-v26.13.0-win-x64` | SHA-256 bate com `SHASUMS256.txt` oficial |
| TypeScript 5.9.3 + @types/node 24 | npm (registro oficial) | `%USERPROFILE%\ferramentas\ts` | — |

Não instalei mitmproxy, jadx nem apktool: os apps do Sistema B são Flutter (jadx não lê o código Dart), e ver o
tráfego cifrado exigiria desligar a checagem de certificado do app — isso é contornar a proteção, então não fiz.

Comandos com essas ferramentas:

```bash
"$USERPROFILE/ferramentas/ts/node_modules/.bin/tsc" -p motor/tsconfig.json --typeRoots "$USERPROFILE/ferramentas/ts/node_modules/@types"
"$USERPROFILE/ferramentas/node-v26.13.0-win-x64/node" --test --experimental-strip-types motor/test/*.test.ts
```

## Resultado da versão 3.2 (08/11/2026, pendências da auditoria)

- `tsc` oficial (modo estrito): **sem erros**, no motor e no painel.
- Node 26: **80 testes, 73 passaram, 0 falharam, 7 pulados** (os de API real sem credencial).
- Deno 2.9.7: **73 passaram, 0 falharam**.
- Painel: **74 testes passaram** com o motor novo.
- Testes novos em `sistema-a-pendencias.test.ts`, todos com respostas simuladas no formato da documentação:
  - filtros de corridas por empresa, passageiro e pagamento;
  - filtro de motoristas por situação, com viatura e foto;
  - criar corrida com paradas, cupom e empresa;
  - cancelar e despachar programada;
  - tarifas;
  - webhooks cadastrados;
  - dinâmica geral;
  - respostas do Sistema B para o que ele não tem.

### O que ainda depende de conta real

- **Sistema A**: tudo que fala com o servidor. Isso inclui conferir que a resposta real bate com a documentação,
  testar a assinatura `Signature-V2` com um webhook verdadeiro e testar as escritas (criar e cancelar corrida,
  cancelar e despachar programada). Para as escritas, o melhor caminho é usar o ambiente de **homologação** do Sistema A.
- **Sistema B**: tudo que usa o painel com sessão (cookie), e mapear cancelar ou despachar programada.

## Resultado da versão 3.1 (08/11/2026, auditoria do Sistema A)

- O que mudou está em `MOTOR_AUDITORIA_SISTEMA_A.md`. As correções foram testadas **só com respostas simuladas**,
  montadas com os formatos e códigos de erro da documentação pública. Nada foi testado com conta real.
- `tsc` oficial (modo estrito): **sem erros**.
- Node 26: **69 testes, 62 passaram, 0 falharam, 7 pulados** (os de API real sem credencial).
- Deno 2.9.7: **62 passaram, 0 falharam**.
- Testes novos em `sistema-a.test.ts`: limite de 100, trava de 31 dias, filtro sem `U`, erros de permissão com
  HTTP 400, motoristas com 404 código 56, categorias com local, aviso no erro 500 ao criar, fases `AN`/`AP`/`AW`,
  `will_reopen` e formatos antigos do webhook.

## Resultado da versão 2.1 (08/11/2026, funções extras)

- `tsc` oficial (modo estrito): **sem erros**.
- Node 26: **60 testes, 55 passaram, 0 falharam, 5 pulados** (os de API real sem credencial).
- Deno 2.9.7: **55 passaram, 0 falharam**.
- Teste real sem credencial da empresa: **3 passaram** (os mesmos da 2.0).
- Funções novas testadas **só com respostas simuladas** (`motor/test/extras.test.ts`):
  - Sistema A: formatos da OpenAPI oficial (estimativa, programadas, posições, rastreio, detalhes, chat, clientes,
    empresas, extrato, cupons, dinâmicas, punições, áreas).
  - Sistema B: formatos lidos do JavaScript das páginas salvas do painel (estimativa, programadas, raio-x, chat, rastreio,
    passageiros, carteiras, cupons, dinâmicas, punições, veículos). **Podem ter diferenças** com a resposta real.
- Para conferir de verdade, `contrato-real.test.ts` agora chama todas as leituras extras de cada integração
  configurada (só leitura). Precisa das credenciais.

## Resultado da versão 2 do motor (08/11/2026)

- `tsc` oficial (modo estrito): **sem erros**.
- Node 26: **48 testes, 43 passaram, 0 falharam, 5 pulados** (os pulados são os de API real sem credencial).
- Deno 2.9.7: **43 passaram, 0 falharam**.
- Teste real (`MOTOR_TESTE_REAL=1`, só leitura, sem credencial da empresa): **3 passaram** —
  Sistema A recusa chave falsa (403 → `SEM_AUTORIZACAO`); painel do Sistema B sem sessão ("Acesso negado" → `SEM_AUTORIZACAO`);
  categorias públicas do Sistema B (cidade 1). **2 pulados**: Sistema A com chave real e painel do Sistema B com cookie.
- Servidor HTTP ligado de verdade no Node (`/v1/saude` respondeu `{"ok":true,"versao":"2.0.0"}`); o teste
  automático confere que o log não leva corpo nem credencial.
- Novos testes: várias empresas ao mesmo tempo sem misturar credenciais, duas integrações do mesmo tipo,
  `semDado` explícito, capacidades com motivo, filtro do painel, rotas HTTP e códigos de erro.

---

# Primeira rodada (07/11/2026)

Legenda: **RODOU** = executado de verdade nesta máquina · **LEITURA** = só análise de arquivo/código.

## Ambiente

- Windows 11. Android SDK instalado, um emulador Android local (Android 14, x86_64 com tradução ARM, **sem Google Play**).
- Havia dois `adb` diferentes (`C:\adb`, versão antiga, e o do SDK). O emulador chamava o antigo e ficava "offline".
  Solução: rodar com o `adb` do SDK primeiro no PATH.
- **Não há Node.js** nesta máquina. O motor foi compilado e testado com **Deno 2.9.7** (roda TypeScript direto).
  Os testes usam `node:test`, então também rodam no Node 22+.

## APKs do Sistema B

| O quê | Como | Resultado |
|---|---|---|
| Abrir os APKs | RODOU | São pacotes divididos: `base.apk` + `split_config.*`. `adb install` direto falha; `adb install-multiple` funciona. |
| Instalar no emulador | RODOU | App do passageiro (versão 1.5.0) e app do motorista (versão 4.8) instalados. |
| Abrir app do passageiro | RODOU | Abre (Flutter + Firebase) e chega na tela de **Login**. Parei aí: não criei conta nem entrei sem credencial sua. |
| Abrir app do motorista | RODOU | Mostra "Something went wrong — Check that Google Play is enabled". O app exige Google Play; o emulador não tem. **Não contornei** essa trava. |
| Ver chamadas de rede | RODOU (parcial) | Gravei o tráfego do emulador. Até a tela de login o app do passageiro **não falou com o servidor do Sistema B** (só Google/Firebase). As chamadas do Sistema B só acontecem depois do login. Conteúdo HTTPS não foi aberto (seria preciso quebrar a proteção do app). |
| Lista de endpoints | LEITURA | Tirada do código compilado (`libapp.so`): ~60 endpoints em `a API do app do Sistema B/_/app/` e ~60 em `/_/motoristas/`. Lista em `MOTOR_ENDPOINTS.md`. |
| Busca de segredos nos APKs | LEITURA | 1 chave de API do Google em cada APK. **Não copiada.** |

## Painel do Sistema B (páginas salvas)

| O quê | Como | Resultado |
|---|---|---|
| Endpoints, campos e estados | LEITURA | Tirados do JavaScript de `consultar_corridas`, `solicitar_corrida`, `motoristas`. |
| `consultar_corridas_api.php?acao=listar` sem login | RODOU | HTTP 200 `{"success":false,"msg":"Acesso negado"}` → motor traduz para `SEM_AUTORIZACAO`. |
| `_/app/get_cidades.php` sem login | RODOU | HTTP 200, lista de cidades. |
| `_/app/get_categorias_ativas.php` com `cidade_id=1` | RODOU | HTTP 200, lista de categorias com tarifas. Usado pelo motor em `categorias()`. |
| Listar/detalhar/cancelar/criar com sessão real | **NÃO TESTADO** | Falta o cookie de uma sessão sua (`SISTEMA_B_COOKIE`). |
| Resposta de `criar_corrida` | **NÃO CONFIRMADO** | Não criei corrida de verdade. O motor procura o número em `id`, `id_corrida`, `corrida_id` ou `data.id`. |

## Sistema A

| O quê | Como | Resultado |
|---|---|---|
| Arquivos da pasta | LEITURA | Páginas salvas do painel, CSVs, termos. Sem documentação de API. |
| Documentação oficial | LEITURA | Documentação pública do Sistema A e OpenAPI v2 (baixado e lido). |
| `GET /configuracoes/categorias` sem chave | RODOU | HTTP 400 `{"success":false,"errors":[{"code":"B1","message":"Chave da api não informada."}]}` → motor: `SEM_AUTORIZACAO`. |
| Mesmo pedido com chave falsa | RODOU | HTTP 403 → motor: `SEM_AUTORIZACAO`. |
| API v1 sem credencial | RODOU | HTTP 401 "Access credentials are invalid". |
| Corridas, motoristas, criar, cancelar com chave real | **NÃO TESTADO** | Falta `SISTEMA_A_API_KEY`, `SISTEMA_A_USUARIO`, `SISTEMA_A_SENHA`. |
| Assinatura do webhook (`Signature-V2`) | **NÃO CONFIRMADO** | Feita como a documentação descreve (HMAC-SHA512 com a chave). Conferir com um webhook real. |
| Campo `fase` (motorista chegou) | **NÃO CONFIRMADO** | Só vem para centrais habilitadas pelo Sistema A. |

## Testes automáticos do motor

```bash
deno test -A --no-check motor/test/
```

(No Node 22+: `node --test --experimental-strip-types motor/test/*.test.ts`.)

| Arquivo | O que cobre |
|---|---|
| `sistema-a.test.ts` | pedidos montados (URL, api-key, Basic Auth, corpo), tradução de corrida/motorista/categoria, erros 400/401/422/429/503/rede, webhooks status/posição/mensagem/parada, assinatura |
| `sistema-b.test.ts` | formulário do painel, cookie, fuso horário, status 0–11, sessão vencida (JSON e HTML), criar/cancelar, motoristas, categorias, pagamentos |
| `motor.test.ts` | "todas" juntando fontes, falha parcial vira aviso, escolha da fonte pelo id, observador de eventos |
| `contrato-real.test.ts` | contra as APIs reais, só leitura; roda com `MOTOR_TESTE_REAL=1` |

Resultado em 07/11/2026:

- `deno check` (TypeScript estrito): **sem erros**.
- Testes com fetch falso: **35 passaram, 0 falharam** (4 do teste real ficaram de fora nessa rodada).
- Teste real (`MOTOR_TESTE_REAL=1`, `SISTEMA_B_CIDADE_ID=1`): **2 passaram** (Sistema A recusa chave falsa; categorias do Sistema B),
  **2 pulados** por falta de credencial (Sistema A com chave real; painel do Sistema B com cookie).
- Os testes acharam 2 erros que foram corrigidos: ordenação de datas com fusos diferentes e erro de id sem prefixo
  que escapava fora da promessa.

## Para completar os testes reais

1. Sistema A: peça ao suporte (ou gere no painel > Integrações) a **chave de API** e o **usuário/senha de integração**.
2. Sistema B: entre no painel no navegador e copie o cookie `PHPSESSID`.
3. Preencha o `.env` (nunca faça commit dele) e rode:

```bash
MOTOR_TESTE_REAL=1 deno test -A --no-check motor/test/contrato-real.test.ts
```

O teste real só lê. Nunca cria nem cancela corrida.
