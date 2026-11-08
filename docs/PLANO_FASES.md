# Plano em fases

O painel do `mob` nasce com tudo junto: painel, consulta de corridas com IA, CRM, bot de WhatsApp e totem. Tudo é **multiempresa e white-label**, usa **o motor** para os dois sistemas de origem e tem **backend e configuração próprios** (nada aponta para a infraestrutura do projeto anterior). O projeto anterior é só referência de leitura das regras de negócio.

## Fases

| Fase | O que entrega | Situação |
|---|---|---|
| 1b. Sistema próprio | Corridas próprias (preço por tarifa, motorista, status, cancelar) e 11 cadastros com editar/criar/excluir; funciona sem chave nenhuma | ✅ feito |
| 1. Base | Painel, login, multiempresa, marca, integrações, motor ligado, app por empresa | ✅ feito (falta trocar JSON por banco, item 1.4) |
| 2. Corridas + IA | Consultar corridas, acompanhamento, motoristas, financeiro, estatísticas, análise com IA embutida no exportar | ✅ feito |
| 3. CRM | Público, listas, segmentos, campanhas, cupons, jornadas e gatilhos, envio em lote com ritmo e fila, relatórios, análise com IA | 🗓️ próxima |
| 4. Bot de WhatsApp | Pedido de corrida pelo WhatsApp, status, conversa com o motorista, conversas no painel; um número por empresa | 🗓️ depois do CRM (pode correr em paralelo) |
| 5. Totem | Tela de pedido de corrida com a marca da empresa, PWA e APK | 🗓️ em paralelo com a 4 |

### Fase 1 — falta

- **1.4 Banco de dados.** Trocar os JSON de `painel/src/servidor/dados.ts` por **PostgreSQL** (próprio do `mob`), mantendo as mesmas funções. Toda tabela com `empresa_id` e toda consulta filtrada por ele. Variável `DATABASE_URL`. Fila de envio (CRM e bot) também no banco.
- **1.5 Eventos do motor.** Rota de webhook por empresa (`/api/webhooks/:empresa/:integracao`) chamando `lerWebhook` do motor. Observador periódico para o Sistema B, que não tem webhook. Os eventos vão para uma tabela `eventos` (status, posição, mensagem). CRM, bot e totem leem dali.

### Fase 3 — CRM

- **Público:** passageiros e motoristas tirados das corridas de todas as integrações e do cadastro do motor. Cidade de cada um, total de corridas, última corrida e canal.
- **Listas e segmentos:** salvar filtro como lista; segmentos por regras (cidade, inatividade, quantidade de corridas, categoria, canal).
- **Campanhas:** mensagem com variáveis, variações de texto (IA, caso "classificacao"/"chat"), cupom, agendamento, contagem de destinatários antes de salvar.
- **Envio:** fila no banco; WhatsApp em lotes com pausa sorteada (padrão lote 20, pausa 5–10 min); limite por minuto por empresa; mensagem que cai na pausa volta para a fila (não vira falha). Cada canal envia só por ele.
- **Jornadas e gatilhos:** a partir dos eventos do motor (corrida finalizada, cancelada, sem corrida há X dias).
- **Relatórios e análise com IA:** mesmo padrão da análise de corridas (números em código, texto pela IA).

### Fase 4 — Bot de WhatsApp

- **Um número por empresa.** Provedor configurável por empresa em Integrações: Evolution API (instância da própria empresa, URL e token dela), Z-API ou WhatsApp oficial (Meta). Nunca uma instância compartilhada.
- **Fluxo:** menu (pedir, agendar, suporte) → embarque (texto, áudio ou localização; endereços salvos) → destino (ou "sem destino") → confirmação → categoria com preço (`estimarPreco`) → pagamento → `criarCorridaPropria` (painel próprio, sem motor) → mensagens de status → conversa com o motorista → avaliação.
- **Proteções:** não tratar cumprimento como endereço; uma corrida por conversa (trava no banco contra toque duplo); áudio transcrito (IA, caso "voz"/transcrição).
- **Conversas no painel:** tela Conversas com histórico por passageiro e resposta manual do operador.

### Fase 5 — Totem

- Página `/totem/:empresa/:local` (PWA) com a marca da empresa: endereço fixo do local, destino, categoria com preço, pagamento, confirmação e acompanhamento.
- Senha do totem por local; recarregar remoto; APK pelo mesmo `scripts/build-app-empresa.mjs` (modo totem/quiosque).
- Avisos por WhatsApp (opcional) pelo número da própria empresa.

## O que o motor precisa entregar (combinado com `motor-mob`)

| Para | Do motor |
|---|---|
| Bot e totem | `estimarCorrida(partida, destino, categoria)` com preço e tempo; `criarCorrida` (já existe); `detalharCorrida`; `cancelarCorrida` com motivo; `categorias` por cidade |
| Status em tempo real | Eventos `status`, `posicao` e `mensagem` (webhook do Sistema A via `lerWebhook`; observador para o Sistema B), com id do evento para não processar duas vezes |
| Conversa com o motorista | Enviar mensagem ao motorista da corrida e receber as respostas (evento `mensagem`) |
| CRM | Lista de passageiros e motoristas com cidade e última corrida (paginada); push para motorista e passageiro, se o sistema tiver |
| Corridas completas | Campos que faltam na Corrida: distância do motorista no aceite, dinâmica, avaliação, cupom/desconto, tarifa, operador, programada, estimativa |

Configuração por empresa: o motor recebe as credenciais da empresa em cada chamada (contrato v2, `Empresa { id, integracoes }`). Ele não guarda estado entre empresas.

## Divisão em sessões paralelas (sem conflito de arquivos)

Cada sessão mexe só no seu pacote. Arquivos comuns (marcados com *) só mudam na sessão "Base", e as outras pedem a mudança por mensagem.

| Sessão | Pacote de arquivos (só estes) |
|---|---|
| **Motor** (`motor-mob`) | `motor/**`, `docs/CONTRATO_MOTOR.md`, `docs/MOTOR_*.md` |
| **Base** (esta) | `painel/src/servidor/{index,dados,sessao,filtro,util}.ts`*, `painel/src/comum/**`*, `painel/src/web/{App,api,main}.tsx`*, `painel/src/web/estilo.css`*, `painel/src/web/componentes/**`*, `painel/src/ia/**`*, `painel/src/servidor/fontes/**`, `painel/src/analise/**`, telas de corridas/marca/integrações/usuários, `scripts/**`, `tenants/**`, `README.md`, `docs/{COMO_FUNCIONA,ANALISE_PAINEIS,MARCA_E_WHITELABEL,PLANO_FASES}.md` |
| **CRM** | `painel/src/crm/**` (servidor), `painel/src/web/crm/**` (telas), `painel/test/crm*.test.ts`, `docs/CRM.md` |
| **Bot** | `painel/src/bot/**` (servidor + provedores de WhatsApp), `painel/src/web/bot/**`, `painel/test/bot*.test.ts`, `docs/BOT.md` |
| **Totem** | `painel/src/totem/**` (servidor), `painel/src/web/totem/**`, `painel/test/totem*.test.ts`, `docs/TOTEM.md` |

Como cada módulo se liga sem conflito:
- **Rotas:** cada módulo exporta um `Router` do Express (`painel/src/<modulo>/rotas.ts`); a sessão Base registra os três de uma vez em `index.ts` (`app.use("/api/crm", ...)` etc.).
- **Menu:** as entradas já existem em `painel/src/comum/funcoes.ts` (situação "planejado"; entram no menu quando a situação vira "pronto"). Cada módulo exporta suas telas em `painel/src/web/<modulo>/index.tsx`; a Base liga as rotas em `App.tsx`.
- **Dados:** cada módulo cria as suas tabelas (prefixo `crm_`, `bot_`, `totem_`), sempre com `empresa_id`.
- **IA:** usar `gerarJson` do roteador com o caso certo; não criar outro cliente de IA.
- **Git:** `git add` só dos seus arquivos, `git pull --rebase` antes do push, sem push forçado.

## Variáveis novas (nomes, valores vazios no `.env.example`)

`DATABASE_URL`, `WEBHOOK_SEGREDO` (assinatura dos webhooks por empresa), `PUBLICO_URL` (endereço do painel, para links do totem e do bot). As credenciais de WhatsApp de cada empresa ficam em Integrações (segredos da empresa), não no `.env`.
