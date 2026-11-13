# Estado dos apps (passageiro e motorista) — 13/11/2026

Arquivo de passagem de bastão: o que está pronto, onde está e o que falta. Atualize ao fim de cada etapa.

## Onde está cada coisa

- **`main` (3b626ef):** já tem os apps v2 (PR #16): servidor (`painel/src/apps/`), telas (`painel/src/apps/web/`), página `/apps/baixar/` e `scripts/publicar-apks.mjs`.
- **Ramo de trabalho agora:** `apps-igual-prints`, na pasta `J:\Usuarios\Rafael\Downloads\mob-v2-integracao` (worktree). Parte do `main`. Ainda sem PR.
- **Ramos antigos já juntados** (podem ser apagados depois): `apps-v2`, `apps-v2-servidor`, `apps-v2-passageiro`, `apps-v2-motorista`.
- **Ambiente de teste (Docker):** contêiner `mob-apps-teste` (porta 8795) e túnel `mob-apps-teste-tunel-1`. O endereço do túnel sai de `docker logs mob-apps-teste-tunel-1`. Subir de novo: `docker compose -f docker-compose.apps-teste.yml -p mob-apps-teste up -d --build painel`. O `mob-painel` (porta 8790) é da sessão do painel: não mexer.
- **CNEFE neste computador:** `D:\CNEFE_Brasil` (o `mob-painel` já monta). O ambiente de teste ainda sobe **sem** ele: falta `CNEFE_PASTA=D:/CNEFE_Brasil` e escolher a cidade da UP em Endereços.
- **Ferramentas neste computador:** Node em `C:\Users\Rafael\AppData\Local\nvm\v22.20.0` (fora do PATH), JDK 21 em `C:\Users\Rafael\.jdks\jdk-21.0.13+9`, Android SDK em `C:\Users\Rafael\AppData\Local\Android\Sdk`, emulador `VeloovTest`. O `docker` precisa de `DOCKER_CONFIG` apontando para uma pasta com `config.json` vazio (o auxiliar de credenciais do Windows falha).

## Pedido em andamento (o usuário reprovou os apps v2)

Reclamações: o app do passageiro "nada vê com os prints"; no motorista o mapa fica por cima das opções; o trajeto vai em linha reta;
na tela de destino aparece "Base de endereços (CNEFE) não configurada"; mapa escuro e sem ruas.

Ordem combinada:

1. [feito] Ver todos os prints e listar cada tela: `docs/APPS_PRINTS_REFERENCIA.md`.
2. [falta] Refazer cada tela dos dois apps igual ao print, conferindo com captura nossa ao lado da referência.
3. [falta] Motorista: botões e opções **por cima** do mapa. Causa achada: o CSS novo tirou o `isolation: isolate` do mapa, e as camadas do Leaflet (z-index 400+) cobrem tudo.
4. [falta] Rota pelas ruas (OSRM; público só para teste, configurável), desenhada no pedido e no acompanhamento; distância e tempo do preço pela rota.
5. [falta] Endereços: ligar o CNEFE da UP; sem resultado, buscar no Nominatim.
6. [falta] Mapa claro com ruas e nomes nos dois apps (no motorista, mapa escuro só se ele escolher o tema escuro).
7. [falta] Testes, APKs novos da UP na página de download, PR.
8. [falta] Tabela tela por tela (referência x nosso x situação) para a sessão principal.

## Já pronto de antes (não refazer)

- Servidor: contas com senha, aprovação de motorista, valor oferecido e contra-oferta, opcionais, rota editável, corridas abertas, maçaneta com taxímetro, ganhos por período, suporte, fotos, download de APK. Testes em `painel/test/apps*.test.ts`.
- Chamada do motorista: o servidor manda `valorBruto`, `taxaCentral`, `valorLiquido`, `ganhoPorKm` e `tabelaLiquido`; a tela mostra o líquido grande e o bruto e a taxa menores.
- Comissão: vem de `painel/src/config/comissao.ts` (painel).

## Avisos

- Nada de marca de terceiro no código, nas telas ou nos commits. Prints de referência ficam fora do Git.
- Não mexer em `src/web/App.tsx`, `comum/funcoes.ts`, `servidor/index.ts` e `web/estilo.css` sem combinar com a sessão do painel.
- Falta aplicar a opção "Negociação" por categoria (hoje o valor oferecido e a contra-oferta valem para todas).
