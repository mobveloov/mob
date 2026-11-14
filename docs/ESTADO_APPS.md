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

Ordem combinada (situação em 13/11, ramo `apps-igual-prints`):

1. [feito] Todos os prints vistos e listados: `docs/APPS_PRINTS_REFERENCIA.md`.
2. [em andamento] Refazer cada tela igual ao print. Passageiro conferido lado a lado: Login, Início, Para onde vamos?, Opções, Procurando, Motivo do cancelamento, Minha Conta, Editar Perfil, Suas Viagens, Carteira, Crie sua conta. Motorista refeito por outra sessão (commit 6377ee0 e seguintes), ainda NÃO conferido lado a lado.
3. [feito] Motorista: mapa em camada própria (`.mapa-m` com isolation), opções acima do mapa.
4. [feito] Rota pelas ruas: `enderecos/externo.ts` (OSRM), rota `/api/apps/<empresa>/rota`, `comum/rota.ts` (hook), nos dois mapas. O app nunca desenha linha reta; sem rota, não desenha. OSRM público só para teste (`OSRM_URL` para o próprio; `OSRM_PUBLICO=0` desliga).
5. [feito] Endereços: CNEFE primeiro, Nominatim (OpenStreetMap) quando não acha, usando a posição da pessoa. O ambiente de teste monta o CNEFE (`CNEFE_PASTA`).
6. [feito] Mapa claro com ruas e nomes nos dois apps (escuro só no tema escuro do motorista).
7. [em andamento] Testes (152 passando), APKs novos e página de download, PR.
8. [falta] Tabela tela por tela final (referência x nosso x situação).

Também feito (14/11): sons originais e permissões do Android por função (`docs/SONS_E_PERMISSOES.md`), ícone flutuante nativo do motorista, Meus Cupons, Meus Cartões, Filtrar Data, selo de min/km, chat e acompanhar viagem do passageiro. Tabela completa em `docs/TABELA_TELAS.md`.

Falta: conferir no aparelho (o emulador não abriu nesta rodada), passos 2 a 5 do cadastro e a tela de senha do motorista, botão de QR da carteira (não se sabe o que ele faz), conferir os seletores de data e hora e a tela Cidade, reconstruir o `mob-painel` (sessão do painel).

## Já pronto de antes (não refazer)

- Servidor: contas com senha, aprovação de motorista, valor oferecido e contra-oferta, opcionais, rota editável, corridas abertas, maçaneta com taxímetro, ganhos por período, suporte, fotos, download de APK. Testes em `painel/test/apps*.test.ts`.
- Chamada do motorista: o servidor manda `valorBruto`, `taxaCentral`, `valorLiquido`, `ganhoPorKm` e `tabelaLiquido`; a tela mostra o líquido grande e o bruto e a taxa menores.
- Comissão: vem de `painel/src/config/comissao.ts` (painel).

## Avisos

- Nada de marca de terceiro no código, nas telas ou nos commits. Prints de referência ficam fora do Git.
- Não mexer em `src/web/App.tsx`, `comum/funcoes.ts`, `servidor/index.ts` e `web/estilo.css` sem combinar com a sessão do painel.
- Falta aplicar a opção "Negociação" por categoria (hoje o valor oferecido e a contra-oferta valem para todas).
