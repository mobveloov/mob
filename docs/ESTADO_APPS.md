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

## Rodada de 14/11 (tarde): corrida que "não aparece no painel", passageiro, carteira do motorista, sons

### 1. Corrida do app que não aparece no painel — causa e prova

**Causa: são dois servidores separados, cada um com o seu banco.** Os APKs de teste falam com o contêiner `mob-apps-teste`
(porta 8795 e o túnel `trycloudflare`, volumes `mob-apps-teste_apps-teste-*`). O painel que o dono costuma abrir é o
`mob-painel` (porta 8790, volumes `mob_painel-*`). Nenhum dos dois enxerga o banco do outro.

Prova (consulta ao SQLite de cada contêiner, `corridas_proprias`):

| Servidor | Corridas de `up-corridas` | A corrida de teste do app (OS 100008, finalizada, R$ 10,06) |
|---|---|---|
| `mob-apps-teste` (8795, o do app) | OS 100004 a 100008 | **está lá**, e `historico()` do painel desse mesmo servidor devolve ela (canal "App", R$ 10,06) |
| `mob-painel` (8790) | só OS 100001 | **não está** |

Ou seja, o código não perde a corrida: ela só aparece no painel **do mesmo servidor que o app usa**. Para ver a corrida do app,
abra o painel pelo endereço do túnel (ou `http://localhost:8795`), com um usuário daquele servidor (ex.: `admin@upcorridas.teste`).
Em produção isso some, porque haverá um servidor só (um domínio, um banco).

Garantias novas (`painel/test/apps-painel.test.ts`, 5 testes): passageiro pede, motorista aceita e finaliza → a corrida está no
Histórico do painel (status, valor igual ao do app, canal App, busca por OS e filtro "hoje"); o painel cancela → o app mostra
"cancelada"; cadastro de passageiro e de motorista feito no app aparece em Clientes e Motoristas do painel (motorista novo fica
"Aguardando aprovação").

### 2. Mesma pessoa como passageiro e motorista (feito)
`conferirContato` só barra telefone/e-mail repetido dentro do **mesmo** papel. Falta: o painel mostrar as duas fichas ligadas.

### 3. Passageiro (feito, `painel/src/apps/web/passageiro/`)
- Motorista no mapa em tempo real depois do aceite, com o caminho dele até o embarque pelas ruas (OSRM), refeito enquanto anda
  (`Mapa.tsx`, prop `alvoCarro`); em viagem, a rota embarque→destino.
- Carros e motos livres por perto (ícone por tipo), atualizando a cada 8 s, no início, na escolha do ponto, nas opções e na busca
  (`GET /api/apps/<empresa>/motoristas-perto`, só tipo e posição, sem dados pessoais).
- Número das casas no mapa com zoom alto (`GET /enderecos/casas`, base CNEFE do município da empresa). As sugestões de endereço já
  trazem o número. **Falta** a importação da tabela `casas` do mobveloov (pedido do dono): precisa da exportação da VPS.
- Histórico: lista e detalhe com data, origem, destino, distância, tempo, valor, forma de pagamento, motorista e status.

### 4. Motorista: Atividades, Histórico de ganhos e Carteira (feito, `motorista/Atividades.tsx`)
Cada corrida mostra valor da corrida, comissão da central, líquido, OS, categoria e km; toque abre "Informações da corrida".
Totais de hoje, semana e mês (líquido), taxa de aceitação (tabela `app_ofertas`, últimas 100 ofertas), carteira com saldo,
histórico e saque. A comissão sai das regras do painel (`calcularComissao`).

### 5. Sons e voz (feito)
Sons originais regerados (`node scripts/gerar-sons.mjs`): chamada forte em rajadas, aceite, alerta, cancelado e **buzina**.
O passageiro ouve o som e uma voz (voz do aparelho) em cada marco: a caminho, **buzina + "Seu motorista está no local"**,
corrida começou, finalizada, cancelada. A notificação push de "motorista no local" usa o canal `chegada` (som da buzina).
O motorista toca o som de aceite ao aceitar. Não baixei áudios de terceiros (licença): os sons são sintetizados no repositório.

### 6. Telas do motorista da Machine (capturas em `apk machine motorista`, 13 imagens)

| Tela da Machine | Igual? | O que corrigi / o que falta |
|---|---|---|
| Abertura (arte UP "Motorista") | não | Falta a arte da UP em alta resolução (só temos a captura). |
| Mapa conectado (barra Mapa / Conectado / Corridas, valor do dia, sino) | em parte | Valor do dia abre Atividades. Falta: pílula com logo + menu, botão vermelho ⚠, mapa escuro com nomes de ruas. |
| Mapa com faixa de aviso e "Desconectar" | não | Falta a faixa de banner e o botão vermelho Desconectar (hoje é PARAR). |
| Taxa de aceitação | sim | Tela nova com detalhamento (ofertas, aceitas, rejeitadas, ignoradas) e perguntas. |
| Carteira (saldo, Adicionar, Retirar) | em parte | Saldo, Adicionar/Retirar e histórico feitos. Sem "Limite mínimo" e "Passe Livre" (regras da Machine que não existem aqui). |
| Carteira (histórico, rolagem) | sim | Lista com seta, data, valor, descrição e OS. |
| Informações da corrida (topo) | sim | "Você ganhou" (líquido), R$/km, duração, distância, passageiro, data, embarque/destino, OS, situação, via. |
| Informações da corrida (rodapé) | em parte | "Seus ganhos" com valor, comissão e líquido; "Recebimento". Sem "Taxa de serviço + custo fixo" (a central cobra só comissão). |
| Histórico de ganhos (lista) | sim | Hora, valor, categoria · km, embarque, destino; toque abre os detalhes. |
| Histórico de ganhos (resumo do dia) | sim | Barras Seg a Dom, ganho por km, corridas, tempo online, horas, forma de pagamento, filtro de dia. |
| Atividades (Hoje/Semanal/Mensal) | sim | Perfil, abas, Histórico, Carteira, Taxa de aceitação, indicação. |
| Atividades (rolagem, pergunta de indicação) | em parte | Falta a pesquisa "Qual a chance de indicar" e "Minhas indicações". |

### 7. Ainda pendente (pedidos novos do dono, não feitos nesta rodada)
Despacho igual à Machine (modo geral, vários motoristas ao mesmo tempo, `oferta_encerrada` para os outros) e os testes de aceite
simultâneo/cancelamento; ganho por km/minuto/hora na oferta; gravação das corridas (LGPD); segurança da API dos apps; importação
das `casas` do mobveloov; testes em aparelho; ver `docs/PEDIDOS_DO_DONO_2026-11-14.md`.

### 8. Navegação, folhas, cancelamento e tela ligada (14/11, noite)
- **GPS do próprio app** (motorista): `GET /api/apps/<empresa>/navegacao` devolve a rota pelas ruas (OSRM) com a instrução de cada curva em português;
  o app mostra "em 200 m, vire à direita na Rua X", avisa por voz a ~300 m e ~50 m, recalcula se sair da rota (mais de 60 m) e mostra o que falta.
  Em Configurações › Navegador Padrão: "GPS do app (passo a passo)" (padrão), Google Maps ou Waze; a escolha fica salva.
- **Passageiro**: motorista indo até ele em tempo real com a linha pelas ruas; em viagem, a rota até o destino. Botões de tema (claro/escuro) e de
  atualizar localização no mapa (início, opções, procurando e acompanhar); etiquetas "Seu Local de Partida" e "Destino" não se sobrepõem mais aos pinos.
  O botão de localização saiu do topo do "Acompanhar viagem".
- **Painéis de baixo com 3 alturas** (recolhido, meio, aberto), por toque ou arrastando, lembrando a última (passageiro: `FolhaBaixo`; motorista: folha da corrida).
- **Cancelar/desistir** no app do motorista com lista de motivos (a lista vem de Config › Gerais do App), aviso das regras e botão visível no topo da folha.
  Desistir devolve a corrida a `procurando`, o painel mostra o motivo no histórico e quem desistiu não recebe a mesma de novo (teste ponta a ponta).
- **Tela sempre acesa**: Wake Lock na web (refeito ao voltar ao app) e flag nativa no APK do motorista; opção "Manter a tela ligada" nos Ajustes (padrão ligado,
  vale online ou em corrida); o passageiro mantém acesa enquanto acompanha. **Falta**: serviço em primeiro plano com notificação para GPS e tempo real com a tela
  apagada ou o app em segundo plano (hoje o GPS do WebView pode parar em segundo plano).

### 9. Despacho da Machine, segurança e GPS em segundo plano (14/11, noite)
Testes novos: `painel/test/apps-despacho.test.ts` (10) e `painel/test/apps-seguranca.test.ts` (4).

| Caso | Resultado |
|---|---|
| Modo geral (primeiro a aceitar): 3 motoristas tocam juntos (limite 3, a 4ª não toca); um aceita e leva | passa |
| Quem não aceitou: a chamada fecha na hora, `oferta_encerrada` com aviso "Corrida já aceita por outro motorista", o som para | passa |
| Aceite simultâneo de dois motoristas | passa (um 200, o outro 400 "já aceita") |
| Mais próximo: um motorista por vez; recusa passa ao seguinte | passa |
| Fila virtual: quem está online há mais tempo recebe primeiro | passa |
| Motorista aceita e desiste: volta a procurar, toca para outro, quem desistiu não recebe a mesma de novo | passa |
| Passageiro cancela com chamadas tocando: todos os toques param | passa |
| Ninguém aceita: respeita "máx. tentativas"; sem pendência vira não atendida | passa |
| Tempo em pendência: espera sem chamar ninguém e avisa o passageiro | passa |
| Fora do raio e categoria diferente não tocam | passa |
| Aceitar próxima corrida (motorista em viagem perto do destino) só com a regra ligada | passa |
| Toda rota privada dos apps recusa sem token e com token falso/enorme | passa |
| Token de uma empresa não vale na outra; passageiro não usa rota do motorista e vice-versa | passa |
| 5 códigos errados travam; entradas inválidas (objeto, texto, telefone enorme) dão erro 4xx sem derrubar o servidor | passa |
| Nome com HTML (`<img onerror>`) não é guardado | passa |

Campos do despacho que estavam mortos e agora valem: `limiteMotoristas`, `prioritarios`/`notificarGrupo` (modo geral), `maxTentativas`, `tempoPendencia`,
`permitirProxima`/`distanciaProxima`. `secundarios` e `reserva` ainda não são usados separadamente (o nível do motorista já ordena a fila).
Ganho por km, minuto e hora aparecem na chamada e na corrida do motorista.
GPS com a tela apagada: serviço em primeiro plano nativo (`PosicaoService.java`, notificação "Você está online") manda a posição ao servidor a cada ~15 s com o motorista
online. **Compila no APK, mas ainda não foi testado num aparelho.** Falta ainda: gravação das corridas (áudio e vídeo), importação das `casas` do mobveloov,
cabeçalhos anti-clonagem do painel (arquivo `servidor/index.ts` é da sessão do painel).

### 10. Gravação das corridas (14/11, noite) — `painel/src/apps/gravacoes.ts`
- **Motorista:** em corrida, o app grava o **áudio** (Opus ~24 kbps) ou o **vídeo** (480p, 15 quadros, ~500 kbps, só se a empresa liberar) em pedaços de 60 s e envia ao servidor; o que não foi enviado fica
  na fila e sai quando a rede volta. Ajustes: "Gravar as corridas (áudio)" e "Gravar também o vídeo"; se a empresa tornar obrigatório, vale sempre. Aparece "● Gravando" na tela da corrida.
- **Passageiro:** vê "Esta corrida é gravada" no acompanhar viagem (a corrida traz `gravada: true`).
- **Servidor:** `POST /corridas/:id/gravacao` (só o motorista da corrida), `GET /gravacao/config`. Fica em `DADOS_DIR/empresas/<id>/apps/gravacoes/<corrida>/`.
  Configuração por empresa em `ajustes.json › gravacao` (`ativa`, `obrigatoria`, `video`, `dias`; padrão: ativa, opcional, só áudio, 30 dias).
- **Central (painel, só cargo admin):** `GET /api/apps-central/gravacoes[?corrida=]`, `GET /api/apps-central/gravacoes/:corrida/:parte` (cada abertura registra quem viu em `acessos`),
  `POST /api/apps-central/gravacoes/:corrida/guardar` (impede apagar). **Falta a tela no painel** (sessão do painel) e uma tela de configuração para `ajustes.json › gravacao`.
- **Retenção:** apaga sozinho depois de `dias`, menos corrida com SOS/ocorrência ou marcada para guardar (roda de hora em hora no ciclo do despacho).
- **Falta:** guardar uma cópia no celular, enviar só no Wi-Fi (hoje envia em qualquer rede) e o texto de consentimento do motorista/LGPD revisado por jurídico. Teste: `apps-painel.test.ts` (8º).

### 11. Opções da corrida e fichas ligadas (19/11)
- App do motorista, durante a corrida: **Avisar problema** (lista de motivos; vai para o chat de suporte da central com a OS), **Compartilhar** (resumo da corrida), além de cancelar/desistir com motivos, SOS, ligar, chat, rota completa, editar rota (inclui paradas), cheguei, iniciar e finalizar.
- Painel: `GET /api/apps-central/pessoas/<telefone>` devolve a ficha de passageiro e a de motorista da mesma pessoa (`doisPapeis`), para a tela do painel mostrar as duas ligadas (tela é da sessão do painel).
- PR #18 sem conflitos com o `main` de 19/11 (verificado com `git merge-tree`).

### 12. Cancelamento por culpa do passageiro
Motivo do motorista que e culpa do passageiro ("Passageiro nao apareceu", "Passageiro pediu para cancelar"...) cancela a corrida de vez (status cancelada, motivo no painel), mesmo com o motorista a caminho: nao volta para "procurando" nem e reofertada. O passageiro ve "Corrida cancelada: voce nao apareceu" (app e notificacao) e pede outra se quiser. So desistencia do motorista por outro motivo volta para a fila. Teste: apps-painel.test.ts.

### 13. Taxas da central no extrato
Extrato do motorista: cada corrida traz `taxas` (uma linha por taxa de Config > Taxas da central, com o nome do painel; sem taxas configuradas, uma linha "Comissao da central"), total de taxas e liquido; o resumo do periodo traz `taxasPorNome`. Passageiro: detalhe da corrida com cada taxa dele e "Total pago". Tudo lido da configuracao (config/taxas.ts e comissao.ts), sem valores fixos. Teste: apps-painel.test.ts.
