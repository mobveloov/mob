# Apps no iPhone: o que o código permite (para a seção do `docs/IOS.md`)

Nada aqui depende de conta Apple. É só o que o código dos apps (`painel/src/apps/web/`) permite hoje e o que falta para instalar como PWA no iPhone.

## Já serve

- Os dois apps são páginas React comuns (`/apps/passageiro/` e `/apps/motorista/`), com caminhos relativos e HTTPS pelo domínio do painel. Abrem no Safari.
- `meta theme-color` é ajustado pela marca da empresa (`comum/ui.tsx`).
- O login, a API e o tempo real (SSE) funcionam no navegador. O app lembra o token em `localStorage`.
- Tema claro/escuro e ping de "último contato" funcionam igual no navegador.

## Falta para instalar na tela de início (Adicionar à Tela de Início)

1. **Manifest** por app e por empresa (`/apps/<app>/manifest.webmanifest`): `name`, `short_name`, `start_url` com `?empresa=<id>`, `display: "standalone"`, `background_color`, `theme_color`, e ícones 192/512 (o recorte oficial está em `tenants/<empresa>/assets/icone-*.png`). O painel já serve um manifest próprio em `/manifest.webmanifest`; o dos apps seria irmão dele.
2. **Ícone do iOS**: `<link rel="apple-touch-icon" href="...">` de 180×180 (o iOS ignora o manifest para o ícone). Sem isso ele tira uma foto da página.
3. **Tela cheia**: `<meta name="apple-mobile-web-app-capable" content="yes">` e `apple-mobile-web-app-status-bar-style`. Os apps já usam `env(safe-area-inset-*)`.
4. **Service worker** mínimo (só cache do esqueleto e página offline); sem ele o iOS ainda instala, mas abre sem rede em branco.

## O que não funciona no PWA do iPhone (limites do Safari)

- Notificação push só no iOS 16.4+ e só com o app instalado na tela de início; o som de chamada insistente do motorista e o serviço em primeiro plano de GPS **não existem** no PWA. O app do motorista no iPhone depende de app nativo (conta Apple) para receber chamadas com a tela apagada.
- Tela sempre ligada (Wake Lock) existe no Safari 16.4+, mas só com a página visível.
- Gravação por `MediaRecorder` funciona no iOS 14.3+, mas em MP4 (o servidor hoje aceita WebM e MP4? conferir `TIPOS` em `apps/gravacoes.ts` antes de liberar).

## Resumo

Para o **passageiro**, o PWA é viável com manifest, ícone `apple-touch-icon` e service worker. Para o **motorista**, o PWA serve para consultar ganhos e cadastro, mas não para receber chamadas em segundo plano.
