# Segurança do painel e do servidor (14/11/2026)

Resumo técnico das tarefas 2 e 3 do bloco do dono (anti-download/anti-clonagem e auditoria). Branch: `seguranca-painel`.

Regra de ouro: o que protege os dados é o servidor exigir login em toda rota. O escudo do navegador e o filtro de
robôs só atrapalham a cópia casual da tela.

## 1. Anti-download e anti-clonagem

### Build (painel/vite.config.ts)
- `build.sourcemap: false` (nenhum `.map` é gerado).
- Minificação `esbuild` com `drop: ["console", "debugger"]` e `legalComments: "none"` (sem comentários). Só vale em
  `vite build`; no `vite dev` nada muda.
- Conferido: o `dist/` não tem `.map`, nem `console.`, nem `sourceMappingURL`.

### Nada de tela antes do login
- `src/web/App.tsx` virou só a "porta": sessão, tema, escudo e a tela de entrada.
- Menu, rotas internas e todas as telas foram para `src/web/Autenticado.tsx`, carregado com `lazy(() => import(...))`
  só depois que `/api/sessao` devolve um usuário. O totem também é carregado sob demanda.
- Conferido no navegador: sem login, a página baixa só `index-*.js` e o CSS da entrada; `Autenticado-*.js` só aparece
  depois do login. Quem baixar a URL recebe só a tela de entrada.
- Limite conhecido: o cliente da API (`src/web/api.ts`) fica no pacote da entrada (a tela de login precisa dele), então
  os nomes dos caminhos `/api/...` aparecem lá. Eles não dão acesso a nada sem login.

### Escudo (src/web/useSecurityShield.ts, ligado no App)
- Só em produção (`import.meta.env.PROD`).
- Bloqueia Ctrl/Cmd+S, U, P; F12; Ctrl+Shift+I/J/C (e Cmd+Alt+I/J/C); botão direito; arrastar; seleção de texto.
  Continuam livres: campos (`input`, `textarea`, `select`, `contenteditable`), tabelas e o que tiver `data-permitir-copia`.
- Sai de iframe de terceiros (`window.top`); se não conseguir, esvazia a página.
- Trava o domínio: usa `marca.dominios` da empresa (nunca um domínio fixo no código). Lista vazia = não trava.
  Fora da lista, vai para o primeiro domínio. `localhost` e IP nunca travam (acesso local e de suporte).
- Não se aplica a apps: não roda dentro de Capacitor/WebView, em `file:`/`capacitor:` nem em `/apps/*`, e o escudo só é
  ligado no App do painel (os apps têm o próprio código).

### Servidor (src/servidor/protecao.ts)
- Só nas páginas do painel (HTML e arquivos do front), não na API:
  403 para User-Agent com HTTrack, Wget, curl, WebCopier, Teleport, SiteSucker, Offline Explorer, WebStripper, Scrapy,
  python-requests, Go-http-client.
- Cabeçalhos nas páginas: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` (arquivos com hash em `/assets` ficam com
  cache de 1 ano, `immutable`).
- Fora do filtro (de propósito): tudo em `/api` (apps, `/api/apps/*`, webhooks, Evolution, integrações), `/manifest.webmanifest`
  e `/apps/*` (apps no navegador).
- Docker e túnel: o Dockerfile e o docker-compose não têm `HEALTHCHECK`, e nenhum script de `scripts/` usa curl/wget no
  painel, então nada recebe 403. Mesmo assim foi criada `GET /api/saude` (pública, devolve `{ ok: true }`, sem dado nenhum)
  para quem quiser monitorar.
- Na API: `X-Content-Type-Options: nosniff` e `Referrer-Policy: no-referrer` em todas as respostas, e
  `Cache-Control: no-store` nas respostas depois do login.

## 2. Auditoria

### Chaves e segredos
- Nenhuma variável `VITE_*` existe no projeto nem no `.env.example`. O front não lê `process.env`.
- As chaves (IA, Evolution, integrações) ficam em `dados/` (fora do Git) ou no ambiente do servidor; a API só devolve
  "preenchida ou não" (`••••••`). Um teste varre `src/web` e `src/apps/web` atrás de chaves, JWTs, `service_role`, `VITE_*`
  com nome de segredo e `process.env`.

### Todas as rotas exigem login (469 rotas listadas)
Método: `test/rotas-util.ts` lê a pilha do Express e lista toda rota registrada (caminho completo e método). O teste
`seguranca.test.ts` chama cada uma SEM login e exige 401/403. As únicas exceções estão numa lista escrita no teste, cada
uma com o motivo:

| Rota pública | Motivo |
| --- | --- |
| `GET /api/saude` | verificação de saúde, sem dado |
| `GET /api/publico/marca`, `GET /api/publico/arquivo/:empresa/:nome`, `GET /manifest.webmanifest` | marca da tela de entrada, logo, PWA (só imagens validadas; CSP `sandbox`) |
| `POST /api/configurar` | primeiro acesso; devolve 409 se já existe usuário |
| `POST /api/entrar`, `POST /api/sair` | login (com limite de tentativas) |
| `POST /api/bot/webhook/:empresa/:segredo` | webhook da Evolution (segredo na URL, 404 se errado) |
| `/api/totem/publico/:empresa/:local` e `/entrar` | tela do totem (nome do local) e senha com limite; o resto exige a chave do aparelho |
| `/api/apps/:empresa/...` de entrada (entrar, entrar/codigo, marca, cidades, conta/*, apks, acompanhar/:codigo) | login dos apps e link público de acompanhar |

Todo o resto passa por `exigirLogin` (cookie assinado) ou `exigirApp` (token do app, por empresa). Se alguém criar uma
rota nova sem proteção, o teste falha.

### Cargos
- Cargos hoje: `plataforma`, `admin`, `operador`. A API recusa por cargo (não só o menu): conferido com um operador real em
  10 rotas de administrador (criar/remover usuário, marca, integrações, chaves de IA, planilhas, equipe, empresas) e na
  tentativa do operador virar admin editando o próprio cargo.
- Corrigido: `GET /api/gestao/equipe` (lista de usuários e cargos) estava aberta ao operador; agora é só do admin, como o
  menu.
- `X-Empresa` (trocar de empresa) só vale para `plataforma`; para os outros é ignorado (testado).

### Isolamento entre empresas
- A empresa de cada pedido vem SEMPRE do usuário logado (`req.ctx.empresaId`). Nenhuma rota autenticada lê empresa de
  `query`, `body` ou `params` (conferido por busca no código); só `/api/publico` e `/api/apps/:empresa` usam a empresa da
  URL, e os apps exigem um token que só vale naquela empresa.
- Testes: token da empresa B tentando listar, buscar, editar e apagar registro da empresa A → não vê nada e não altera
  (404/400/403); `X-Empresa` e `?empresa=` forjados não trocam de empresa; token de app inventado → 401; empresa na
  URL com `..` → 404; imagem de outra empresa/`..%2f` → 404.

### Força bruta no login (src/servidor/sessao.ts)
Janela de 10 minutos, só erro conta. Estourou, vem 429 e nem a senha certa entra até as tentativas velhas saírem da janela
(bloqueio temporário, sem estado a limpar):
- 8 erros por IP + e-mail;
- 30 erros por e-mail, vindos de qualquer IP (ataque distribuído contra uma conta);
- 60 erros por IP, com e-mails diferentes (um IP testando várias contas) — NOVO.
- Também: e-mail inexistente agora gasta o mesmo tempo de uma senha errada (não deixa descobrir quais e-mails têm conta);
  e-mail com mais de 200 letras é cortado (chave do contador); corpo do login acima de 1 MB → 413.
- Troca de senha usa o mesmo limite. Totem: 8 tentativas por IP e local. App: limitador próprio do código por telefone.
- Atrás de proxy/túnel é preciso `CONFIAR_PROXY=1` (já está no docker-compose) para o IP ser o real.

### XSS e injeção
- O banco usa SQL parametrizado (`prepare(...).run(?)`); as buscas dos cadastros e das corridas filtram em memória.
- Testado com `<script>`, `"><img onerror>`, `' OR '1'='1`, `UNION SELECT`, bytes nulos, `{{7*7}}` e texto de 5 mil letras em
  10 buscas/listagens: nenhuma deu erro 500, devolveu HTML, mostrou pilha ou caminho de arquivo.
- Toda resposta de dados é JSON com `nosniff`; relatórios, recibo e a página de acompanhar escapam o texto (`esc()`); o relatório
  aparece num `iframe sandbox`; imagem enviada só aceita `image/*`, e a entrega leva `CSP: sandbox`.
- Respostas de erro não mostram caminho de arquivo nem pilha.

## 3. Arquivos
Criados:
- `painel/src/servidor/protecao.ts` (filtro de robôs, cabeçalhos, entrega do painel compilado)
- `painel/src/web/useSecurityShield.ts` (escudo)
- `painel/src/web/Autenticado.tsx` (menu e telas, carregado depois do login)
- `painel/test/seguranca.test.ts`, `painel/test/rotas-util.ts`
- `docs/SEGURANCA.md`

Alterados:
- `painel/vite.config.ts` (sem sourcemap, sem console/comentários)
- `painel/src/web/App.tsx` (só a porta de entrada + escudo), `painel/src/web/main.tsx` (totem sob demanda)
- `painel/src/servidor/index.ts` (cabeçalhos da API, `/api/saude`, no-store depois do login, entrega do painel, login sem pista de tempo)
- `painel/src/servidor/sessao.ts` (limite por IP, constantes exportadas)
- `painel/src/gestao/rotas.ts` (`GET /equipe` só do admin)

## 4. O que ficou pendente
1. Matriz de cargos como na Machine (ADMIN Mestre, ADMIN, Gestor, Operador): hoje o operador ainda lê telas financeiras
   (carteiras, extratos, faturamento, saques) e algumas configurações, como o menu mostra. Quando a tarefa de cargos
   fechar, aplicar a mesma matriz nestas rotas e acrescentar casos no `seguranca.test.ts`.
2. Os limites de login ficam na memória do processo (zeram se o servidor reiniciar e não somam entre várias réplicas).
3. CSP completa (`script-src`/`style-src`) não foi ligada: o painel usa fontes do Google e mapas; só `frame-ancestors` foi pedido.
4. O filtro de User-Agent só barra robôs honestos; quem troca o User-Agent passa. Por isso o login em toda rota é a defesa real.
5. Isolamento entre empresas do lado dos apps (token de motorista/passageiro de uma empresa lendo outra) foi conferido
   pela construção do código (a sessão do app guarda a empresa e a URL é comparada), mas sem teste com sessão de app real.
6. A maioria das exportações em CSV já neutraliza fórmulas de planilha; não conferi uma por uma se todas usam o mesmo
   auxiliar (`src/servidor/util.ts`). Vale um teste que percorra todas as rotas de exportar com um valor começando em `=`.
7. Um erro assíncrono sem tratamento no bot (`/api/bot/conversas/:id/responder` com id inexistente) vira
   `unhandledRejection`; em produção o processo só registra e segue, mas o ideal é tratar a rota.
