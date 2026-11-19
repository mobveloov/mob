# Pedidos do dono — 14/11/2026 (fila de trabalho)

Escrito em português do Brasil. Cada sessão pega a sua parte, faz commits pequenos e marca aqui o que terminou
(`[x]`). Se passar de 90% de contexto, grave o estado neste arquivo antes de seguir.

## Sessão do PAINEL (src/web, painel/src/servidor, config)

- [x] **Taxas da central**: faltam as telas para configurar as taxas pagas por motoristas e por passageiros
      (referência: capturas `Up Corridas - Taxas Bandeira (14_11_2026 09：14：30 / 09：15：06 / 09：15：16 / 09：15：28).html`
      em `J:\Usuarios\Rafael\Downloads`). Compare com a Machine e deixe igual.
- [x] **Carteira de crédito**: tela para editar (creditar/debitar, com motivo e histórico) a carteira de motoristas e
      de passageiros. O app lê o mesmo saldo.
- [x] **Menu lateral igual ao do arquivo** `J:\Usuarios\Rafael\Downloads\MobVeloov (14_11_2026 10：56：04).html`:
      mesmo estilo e separação por cores.
- [x] **Foto da empresa** nas configurações da empresa (perfil), igual à da UP Corridas nesse arquivo.
- [x] **Cargos como na Machine**: ADMIN Mestre, ADMIN, Gestor e Operador, com funções limitadas por cargo. Pesquise
      na Machine o que cada cargo pode e aplique no painel E no servidor (a API também tem que recusar).
- [x] **Filiais** cadastradas dentro do painel de cada empresa.
- [x] **Superadmin** (dono da plataforma): lista de empresas (criar, suspender, entrar como a empresa), planos e
      recursos, marca e domínio, uso e faturamento, centrais/franquias.
- [~] **CRM, Bot e Totem** (parcial: ver "O que ainda falta" em ESTADO_PAINEL.md): copiar EXATAMENTE como está no mobveloov (repo `D:\mobveloov-git`, é o que funciona),
      tirando só a integração com a Machine, que no `mob` já é nativa.
- [x] **Barra de cima em qualquer zoom** (100%, 90%, 80%; 1920 a 1024) e título "Corridas" legível; remover o "NOVO".
- [x] **Segurança do painel** (ver bloco abaixo, tarefas 2 e 3). Feito no branch `seguranca-painel`; resumo e pendências em docs/SEGURANCA.md.

## Sessão dos APPS (painel/src/apps, painel/src/apps/web)

- [ ] **Cadastros e corridas não aparecem no painel**: além das corridas finalizadas, o cadastro de motorista feito
      no app também não apareceu. Achar a causa com prova, corrigir e testar: cadastro de motorista e de passageiro,
      corrida, finalização, carteira e histórico, tudo refletindo nos dois sentidos.
- [ ] **Mesma pessoa, dois papéis**: o mesmo telefone, e-mail e CPF pode ser passageiro E motorista. Um cadastro não
      pode bloquear o outro; o painel mostra as duas fichas ligadas.
- [ ] **Ganho por km/minuto** no app do motorista (como Gigu e similares): na oferta e na corrida, mostrar quanto a
      corrida paga por km, por minuto e por hora, além do bruto e do líquido.
- [ ] **Sons reais** (tarefa 1 do bloco abaixo).
- [ ] **Gravar as corridas** no app do motorista, guardar na nuvem e no celular, em formato e qualidade que gastem
      pouco espaço (sugestão: áudio Opus de baixa taxa; mostrar aviso ao passageiro e ao motorista, pedir
      consentimento e definir por quanto tempo guardar — LGPD).
      **Atualização do dono:** também deve ter opção de gravar VÍDEO (câmera do celular do motorista), além do
      áudio. A finalidade é a SEGURANÇA DO MOTORISTA (calúnia, acusações, conflitos). No app do passageiro, avisar
      de forma clara, antes e durante a corrida, que "esta corrida é gravada" (ele fica ciente). NÃO escrever o motivo
      nem "para a segurança do motorista" no app do passageiro: só o aviso de que há gravação. Motorista liga/desliga por corrida ou por configuração da empresa (a central pode tornar obrigatório).
      Qualidade baixa e leve (ex.: vídeo 480p, ~500 kbps, áudio Opus), compressão no celular antes de enviar, envio
      só no Wi-Fi ou quando der, guardar no celular e na nuvem, apagar sozinho depois de X dias, a menos que haja
      ocorrência. Acesso às gravações só para a central (cargos altos), com registro de quem viu. Mostrar no painel
      uma lista de gravações por corrida.
- [ ] Já pedidos antes: mapa do motorista aceito, carros por perto, número das casas (tabela `casas` importada do
      mobveloov), histórico com detalhe, carteira do motorista, telas iguais às capturas, despacho igual à Machine
      e testes de cancelamento/aceite.
- [ ] **Segurança da API dos apps** (tarefa 3 abaixo).

## Bloco enviado pelo dono (executar sem pedir confirmação)

Atue como engenheiro sênior e especialista em AppSec nos apps e no painel. Valide o build ao final.

### Tarefa 1 — sons reais no lugar dos bipes sintetizados
1. Criar `public/sounds/` (ou a pasta estática do projeto).
2. Baixar áudios reais livres (mp3/ogg) de fontes abertas, como Kenney Interface Sounds, Wikimedia Commons ou
   Mixkit/Pixabay, **conferindo a licença**. Se o download falhar, gerar por script arquivos polifônicos de boa
   qualidade (marimba/kalimba, harmônicos, ataque suave, decaimento exponencial), nunca onda seca.
3. `SoundManager` com `preload="auto"` e 4 arquivos:
   - `driver_new_ride`: chamada urgente e encorpada, em loop durante a oferta; para na hora (`pause()` +
     `currentTime = 0`) ao aceitar, recusar ou expirar.
   - `ride_accepted`: chime limpo de 2 notas subindo (passageiro, quando o motorista aceita).
   - `driver_arrived`: alerta duplo nítido (passageiro, quando o motorista chega). Também falar
     "Seu motorista está no local" e tocar buzina forte.
   - `ride_canceled`: tom curto e discreto.
4. Desbloquear o áudio no primeiro toque (autoplay do Chrome/Safari) e sincronizar o toque da oferta com
   `navigator.vibrate([500,200,500,200,500])`, parando com `navigator.vibrate(0)`.

### Tarefa 2 — anti-download e anti-clonagem do painel
1. Build: `sourcemap: false` em produção; minificação agressiva sem `console.*`, sem comentários.
2. Módulo `useSecurityShield`, ligado só em produção: bloquear Ctrl+S, Ctrl+U, Ctrl+P, F12, Ctrl+Shift+I/J/C,
   botão direito, arrastar e seleção de texto (exceto inputs e tabelas de dados); travar o domínio oficial; sair de
   iframe de terceiros.
3. Nada de rota interna, menu ou dashboard no DOM antes do token válido (quem baixar a URL recebe só o login).
4. Servidor: responder 403 para User-Agents de HTTrack, Wget, curl, WebCopier, Teleport, SiteSucker, Offline
   Explorer, WebStripper, Scrapy, python-requests e Go-http-client **nas páginas do painel** (não nas rotas de API
   que os apps e as integrações usam, nem no Evolution/webhooks). Cabeçalhos em todas as respostas do painel:
   `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.
   Observação do coordenador: isso dificulta cópia casual; o que protege de verdade é o servidor exigir login em
   toda rota de dados. Não quebrar os apps (WebView/Capacitor) nem o PWA.

### Tarefa 3 — auditoria de segurança do painel e do backend
1. Chaves privadas (service role, tokens da Evolution, banco, chaves de API) nunca no front nem em `VITE_*`.
2. Toda rota de API exige autenticação e checa o cargo; nada de dados de motorista, passageiro ou financeiro sem
   permissão; isolamento entre empresas (token de uma empresa não lê a outra). Teste com requisição forjada.
3. Limite de tentativas (força bruta) no login, sanitização contra XSS e injeção nas buscas e listagens.
4. Entregar resumo técnico com os arquivos criados e alterados, e o build sem erros.

## Quem faz o quê (sessão do painel, 14/11)

Todos são agentes Sonnet 5.5, cada um no próprio worktree e ramo, sem mexer nos mesmos arquivos. Quem mescla é a sessão do painel.

| Tarefa | Agente | Ramo | Situação |
|---|---|---|---|
| Taxas da central + carteira de crédito | taxas-carteira | worktree-agent-a538efdd5eef532ee | em andamento |
| Cargos, filiais e superadmin | cargos-filiais-superadmin | worktree-agent-a1a2562b7d9420c54 | em andamento |
| Menu lateral (igual ao MobVeloov) + foto da empresa | menu-lateral | worktree-agent-a4657717dc85a0595 | em andamento |
| Segurança do painel e da API | seguranca | worktree-agent-a7161959705b31c5f | em andamento |
| CRM, Bot e Totem (cópia exata do mobveloov) | crm-bot-totem | worktree-agent-a5eb39a3ed6da876e | em andamento |

Revisão final e bug difícil: só com Fable 5.2, no fim, depois da mesclagem.

## Navegação e mapa nos apps (pedido do dono, depois do teste no celular)

Prints do teste: motorista "a caminho" (1,5 km, "Siga até local de embarque") e passageiro "Acompanhar viagem".
- [ ] **Escolher o GPS** no app do motorista: Waze, Google Maps, outro instalado. E TAMBÉM o **GPS nativo do app**:
      navegação passo a passo dentro do próprio app (rota pelas ruas, instrução "vire à direita em X metros",
      recalcula se sair da rota, voz opcional), sem precisar abrir outro app. O motorista escolhe e a escolha fica salva.
- [ ] **Passageiro vê a rota do motorista indo até ele**, em tempo real: linha da rota pelas ruas, carro andando,
      tempo e distância atualizando. Depois do embarque, a rota até o destino.
- [ ] **Botão de tema do mapa** (claro/escuro) dentro dos apps, no mapa, nos dois apps. Lembra a escolha.
- [ ] **Botão "atualizar localização em tempo real"** (centralizar na minha posição e voltar a seguir), nos dois apps.
- [ ] Corrigir no print do passageiro: sobreposição do rótulo "Destino"/"Seu Local de Partida" com os pinos, e a
      etapa do aviso de status do topo ("Motorista a caminho") cobrindo o mapa.
- [ ] **Painel de baixo que recolhe** nos dois apps (motorista e passageiro): a "folha" com as informações (motorista,
      embarque, valor, OS etc.) tem a barrinha no topo, mas hoje, mesmo tocando nela, fica sempre expandida e não dá
      para recolher. Tem que arrastar/tocar para recolher (mostra só o essencial: status e botão principal) e expandir
      de novo, com 2 ou 3 alturas (recolhida, meio, aberta), liberando o mapa. O botão de localização não pode ficar
      em cima da hora/barra de status.

## Opções da corrida no app do motorista (pedido do dono)
- [ ] O app do motorista NÃO tem o botão de cancelar a corrida. Tem que ter TODAS as opções disponíveis durante a
      corrida (como o app da Machine/88): cancelar (com lista de motivos, configurável no painel, e aviso das
      regras/taxas), ligar, chat, ver rota completa, editar rota, avisar problema, compartilhar/segurança (SOS),
      "cheguei ao local", iniciar, finalizar, adicionar parada se a empresa permitir. Ao cancelar, a corrida volta
      para "procurando" e é oferecida a outros motoristas dentro das regras do despacho; quem cancelou não recebe a
      mesma de novo. Aparece no painel (motivo e quem cancelou). Conferir nas capturas de `apk machine motorista`
      quais opções existem e copiar todas.

## Tela do celular desliga com o app aberto (bug relatado no teste)
- [ ] Nos apps (principalmente o do motorista, e o do passageiro durante a corrida) a tela do celular apaga sozinha
      mesmo com o app aberto. Manter a tela acesa: motorista online ou em corrida, e passageiro acompanhando a
      viagem (Wake Lock: no Capacitor, plugin de keep-awake / `android:keepScreenOn`; na web, `navigator.wakeLock`
      com pedido de novo ao voltar para o app). Opção em Ajustes "Manter a tela ligada" (padrão ligado durante a
      corrida). Também garantir que o GPS e o tempo real continuem com a tela apagada ou o app em segundo plano
      (serviço em primeiro plano com notificação). Testar no aparelho.

## Estado (14/11, tarde)
- [x] Barra de cima em qualquer zoom, título legível, sem "NOVO".
- [x] Taxas da central e carteira de crédito (mesclado no main).
- [x] Cargos (ADMIN Mestre, ADMIN, Gestor, Operador), filiais e painel do dono/superadmin (mesclado).
- [x] Menu lateral igual ao MobVeloov + foto da empresa (mesclado).
- [x] Segurança do painel e da API (mesclado; docs/SEGURANCA.md).
- [ ] CRM, Bot e Totem copiados do mobveloov: agente retomado depois do limite de 5h.
- [ ] Depois: suíte completa, teste de telas no navegador, Docker, push, revisão final (Fable 5.2) e tabela "tela | igual à Machine? | diferença".
- Suíte no main antes do CRM/Bot/Totem: 364 de 364 testes.

## Push parcial feito (15/11)
- main publicado (6ad8110) e Docker refeito (up.veloov.com 200). Revisão final feita com Sonnet 5.5 (o Fable 5.2 pediu créditos de uso); 8 achados corrigidos.
- Pendências de CRM/Bot/Totem/Painel: ver seção "O que ainda falta" em docs/ESTADO_PAINEL.md; agentes Sonnet portando.
