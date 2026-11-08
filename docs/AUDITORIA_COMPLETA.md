# Auditoria completa e teste de carga (08/11/2026)

Testamos o painel, o motor e os dois apps juntos, no Docker local, com 500 corridas ao mesmo tempo em 2 empresas. Rodamos também o bot, o totem e o CRM juntos. Testamos todas as telas com um navegador automatizado. Cada bug achado foi corrigido com um teste que prova a correção.

**Resultado final: 500 de 500 corridas completas em 26 segundos, 0 erros e 0 problemas na conferência.**

## Como repetir

```bash
docker compose -f scripts/teste/docker-compose.carga.yml -p mob-carga up -d --build
```
```bash
node scripts/teste/carga.mjs http://localhost:8796 500 --extras
```
```bash
docker compose -f scripts/teste/docker-compose.carga.yml -p mob-carga down -v
```

O ambiente de carga é separado do painel normal: outra porta, outros dados e código de login aparecendo na resposta. Nunca use esse ambiente em produção.

Teste das telas (Playwright, instalado em `scripts/`):

```bash
TELAS_EMAIL=... TELAS_SENHA=... node scripts/teste/telas.mjs http://localhost:8790
```

## O que a carga faz e confere

O script `scripts/teste/carga.mjs` monta o cenário e roda tudo ao mesmo tempo:

- **Cenário:** cria 2 empresas e cadastra 250 motoristas em cada. Os 500 passageiros e os 500 motoristas entram pelo código, todos ao mesmo tempo.
- **Corrida completa:** os 500 passageiros pedem a corrida juntos. Cada motorista simulado aceita a oferta, manda texto e áudio no chat, passa por "chegou" e "em andamento" e finaliza. O passageiro dá nota 5.
- **Com `--extras`:** ao mesmo tempo, 50 conversas do bot pedem corrida até o fim, o totem pede 10 corridas e o CRM dispara uma campanha para todos os passageiros.

No fim, o script confere:

- **Corridas certas:** nenhuma perdida, nenhuma duplicada, todas finalizadas e com nota.
- **Motorista certo:** o motorista de cada corrida é quem aceitou.
- **Empresas separadas:** nenhum telefone de uma empresa aparece na outra, e o token de uma empresa não abre a outra (o certo é responder 401).
- **Corridas visíveis:** cada motorista só vê as próprias corridas.

## Números: antes e depois

| | Antes (1ª carga) | Depois (carga final, com bot, totem e CRM) |
|---|---|---|
| Corridas pedidas a tempo | 184 de 500 (316 esgotaram 60 s) | **500 de 500** |
| Corridas que chegaram até a nota | 178 | **500** |
| Tempo para pedir as 500 | mais de 60 s | **3,2 s** |
| Tempo total (pedido até a nota) | 677 s | **26 s** |
| Erros | 2.246 | **0** |
| Problemas na conferência | 336 | **0** |
| "Pedir corrida": tempo típico / 95% dos pedidos | 60 s / 60 s (tempo esgotado) | 1,9 s / 3,0 s |
| Consulta do motorista: típico / 95% | 0,2 s / 42,9 s | 0,4 s / 2,4 s |
| Finalizar corrida: típico / 95% | 0,25 s / 58 s | 2,3 s / 2,4 s |
| Memória do contêiner (máxima) | 147 MB | 167 MB |
| CPU (máxima) | cerca de 100% durante 10 minutos | cerca de 100% só durante os 26 s do pico |

Cargas no meio do caminho, cada uma depois de uma correção:

| Rodada | O que mudou antes dela | Pedidas a tempo | Tempo total | Erros |
|---|---|---|---|---|
| 1 | nada | 184 | 677 s | 2.246 |
| 2 | arquivos lidos da memória | 368 | 107 s | 136 |
| 3 | corridas no banco SQLite | 487 | 66 s | 345 (conexão fechada) |
| 4 | menos acesso a disco e conexão aberta por mais tempo | 500 | 17 s | 0 |
| 5 a 7 | com bot, totem e CRM juntos e o motorista sumido fora das ofertas | 500 | 26 s | 0 |

O painel roda num só processo do Node, então a CPU chega perto de 100% de um núcleo no pico. Isso é esperado. O que importa é que agora o pico dura segundos e nada esgota o tempo.

## Bugs achados e corrigidos

| # | Bug | Como achamos | Correção | Teste que prova |
|---|---|---|---|---|
| 1 | Cada pedido lia e interpretava de novo os arquivos inteiros de sessões, corridas e cadastros. Com muitos motoristas, a CPU travava e os pedidos esgotavam 60 s. | carga | Os arquivos ficam na memória, só para leitura (congelados), e são relidos só quando mudam. Partes do código que alteravam dados sem salvar foram corrigidas: o congelamento as fez quebrar nos testes. | `desempenho.test.ts`: cache só de leitura que percebe mudança de fora |
| 2 | Cada mudança numa corrida regravava o `corridas.json` inteiro da empresa, numa fila única. O tempo crescia muito mais rápido que o número de corridas. | carga e perfil de CPU | As corridas próprias foram para o banco SQLite, uma linha por corrida. O JSON antigo é migrado sozinho e fica guardado como `.migrado`. | `desempenho.test.ts`: migração sem perder nada; 200 pedidos ao mesmo tempo sem perder corrida nem repetir OS |
| 3 | Centenas de "conexão fechada" no meio dos pedidos: o Node fecha conexão parada depois de 5 s. | carga | A conexão parada fica aberta por 65 s, o que também ajuda atrás de proxy. | carga 4 a 7: 0 erros |
| 4 | Acesso ao disco a cada leitura e criação de pasta a cada gravação. | perfil de CPU | O disco é conferido no máximo 1 vez por segundo por arquivo, e cada pasta é criada uma vez. | `desempenho.test.ts` |
| 5 | Cada corrida regravava o cadastro de passageiros mesmo sem mudança. | perfil de CPU | Só grava quando algo muda. | `desempenho.test.ts`: importar igual não regrava |
| 6 | Motorista que fechava o app sem ficar offline continuava "online" por 10 minutos e recebia ofertas. Cada corrida esperava 20 s por motorista sumido, e o motorista de verdade não recebia nada. | teste pelas telas logo depois da carga | Só recebe oferta quem fez algum pedido pelo app nos últimos 90 s ou está com o tempo real aberto. | `desempenho.test.ts`: o motorista sumido não recebe a oferta |
| 7 | Login do painel: entrar com a senha certa também contava como tentativa. Uma central inteira atrás do mesmo IP se trancava depois de 8 logins em 10 minutos. | auditoria | Só o erro conta: 8 por IP e e-mail e 30 por e-mail. | `desempenho.test.ts`: 12 logins certos passam e 8 errados trancam |
| 8 | Atrás de proxy, o painel via todo mundo com o mesmo IP, e o limite de códigos dos apps (30 por hora) travava todos juntos. | auditoria | `CONFIAR_PROXY` faz o painel ver o IP real, e `APPS_CODIGOS_POR_IP` deixa ajustar o limite. | carga, com 1.000 logins |
| 9 | Os limites de tentativa dos apps nunca apagavam entradas antigas, e a memória só crescia. | auditoria | Limpeza periódica. | revisão |
| 10 | O despacho guardava, para sempre, dados de cada corrida já encerrada. | auditoria | Limpeza a cada minuto. | revisão |
| 11 | A tela "Conversas" abria sem título. | teste das telas | Ganhou título próprio. | `telas.mjs` |
| 12 | O app do motorista mostrava "Dúvidas:" vazio quando a empresa não tinha contato de suporte. | teste das telas | O texto só aparece quando há contato. | revisão |

## Telas (navegador automatizado)

- **Painel:** as 32 telas do menu abriram, e o teste clicou nos botões que não apagam nem enviam nada: abas, filtros, "Novo", "Editar" e fechar. Não houve nenhum erro no console, nenhum erro de página e nenhuma resposta 5xx. A única falha encontrada, a tela Conversas sem título, foi corrigida.
- **Apps:** uma corrida inteira foi feita clicando nas telas dos dois apps, sem nenhum erro no console:
  1. login com código;
  2. nome da passageira;
  3. endereços, categoria e pagamento, e o pedido;
  4. o motorista recebe a oferta com "Recusar" e "Aceitar" e aceita;
  5. "Cheguei no embarque", "Iniciar" e "Finalizar" ("Corrida finalizada: R$ 8,00");
  6. a passageira vê "Como foi a viagem com …?", escolhe 5 estrelas e envia a nota, que fica gravada.

  Também abriram sem erro: ficar online e offline, Início, Ganhos, Histórico e Conta.

## Auditoria (o que foi conferido)

- **Isolamento entre empresas:**
  - a empresa sempre vem do login (painel) ou do token (apps);
  - o token de uma empresa não abre a outra;
  - toda tabela do banco tem a coluna da empresa, e toda consulta filtra por ela;
  - a carga com 2 empresas não misturou nada.
- **Travas de duplicidade:**
  - **pedido repetido:** o mesmo `pedidoId` devolve a mesma corrida;
  - **passageiro com corrida aberta:** não consegue abrir outra;
  - **oferta:** só um motorista aceita;
  - **campanha e jornada:** o disparo duplo do CRM é barrado.
- **Banco SQLite com escrita ao mesmo tempo:**
  - há um processo só, e as escritas são síncronas, em transação e com WAL;
  - testado com 200 pedidos ao mesmo tempo, mais 50 cancelamentos simultâneos;
  - outro processo, como o importador de empresa, espera até 5 s pelo banco.
- **Dados perdidos:** em todas as cargas depois das correções, a conferência deu 0. Os pedidos que esgotavam o tempo na carga 1 foram criados no servidor, só que tarde: com o `pedidoId`, o app pode repetir o pedido sem duplicar.
- **Memória:** os mapas que só cresciam (limites de tentativa, eventos guardados, despacho) agora têm limpeza. Na carga final, a memória ficou em 167 MB no máximo.
- **Segurança (já revisada nos PRs #4 e #9 e mantida):**
  - nenhum segredo no código;
  - login dos apps com código que vence e limite de tentativas;
  - token guardado só como hash;
  - áudio conferido pelo começo do arquivo;
  - servidor de WhatsApp só em https público;
  - erros respondem em JSON curto, sem mostrar o caminho dos arquivos.

## Limites conhecidos (não são bugs, mas valem saber)

- **Ofertas que vencem sob carga:** com o servidor no pico, algumas ofertas vencem antes de o motorista simulado responder. O servidor então oferece a corrida a outro motorista, e nenhuma se perde.
- **Login no pico:** o `sessoes.json` dos apps ainda é reescrito inteiro a cada login. Com 1.000 logins ao mesmo tempo, o mais lento levou 7,6 s. Se passar de dezenas de milhares de sessões, vale levar as sessões para o banco.
- **Um processo só:** o painel não roda em vários processos ao mesmo tempo (a memória e o despacho ficam num processo). Para crescer além de um núcleo, o caminho é um processo por grupo de empresas.

## O que só dá para testar com conta real ou celular

- **WhatsApp de verdade:** precisa da Evolution API e do QR. Serve para o bot, o CRM e o código de login dos apps. Até aqui, tudo foi testado no modo simulado.
- **Push:** a notificação no celular precisa do Firebase da empresa.
- **APKs no celular:** GPS em segundo plano, gravação de áudio no microfone de verdade, notificação, câmera e permissões do Android.
- **Sistema A e Sistema B com conta real:** o motor foi testado com respostas simuladas.
- **IA real:** a análise do relatório e as frases livres no bot.
- **OSRM:** a distância pelas ruas, sem ele, é calculada em linha reta × 1,3.
- **Carga atrás do proxy de produção:** nginx ou túnel, com `CONFIAR_PROXY` ligado.

A lista do que depende de você para ligar cada parte real está no `README.md`, na seção "O que depende de você".
