# Bot de WhatsApp (fase 4)

Pedido de corrida pelo WhatsApp, com a marca de cada empresa. Cada empresa tem o **próprio número** (instância
própria). As corridas nascem **no próprio painel** (corridas próprias, canal "bot"). Não precisa de chave de sistema
externo.

## Como funciona

1. **Menu:** *1* Pedir uma corrida, *2* Falar com o suporte. O texto usa o nome da empresa e do assistente da marca.
2. **Embarque:** texto ("me pega na Rua das Flores, 120") ou localização (clipe 📎).
3. **Destino:** texto, localização ou *2* para seguir sem destino.
4. **Confirmação:** *1* Sim / *2* Corrigir.
5. **Categoria:** do cadastro "Categorias e tarifas" (só as ativas), com o preço de `estimarPreco`
   ("cerca de" com distância calculada; "a partir de" sem distância).
6. **Pagamento:** Dinheiro, Pix ou Cartão na maquininha.
7. **Corrida:** `criarCorridaPropria(empresaId, { ..., canal: "bot" })`. O passageiro entra no cadastro de passageiros.
8. **Status:** a cada 10 s o bot olha as corridas abertas das conversas e avisa quando muda
   (motorista a caminho com carro e placa, chegou, iniciou, finalizou com valor, cancelada, não atendida).
9. **Avaliação:** nota de 1 a 5, gravada na corrida própria (`avaliar`).

Durante a corrida, *cancelar* cancela a corrida (cancelada pelo passageiro). *menu* volta ao começo.

**Frase livre:** "preciso de um carro na rua X 402 pra Santa Casa" funciona com IA (`gerarJson`, caso
"classificacao", chaves da empresa). Sem chave de IA, o bot segue pelo menu numerado e por regras simples.

### Proteções

- Cumprimento ("oi lindo", "bom dia", "tudo bem?") e pergunta nunca viram endereço.
- **Uma corrida por conversa:** cada conversa tem uma fila (`naFila`); um toque duplo espera o primeiro e recebe
  "você já tem uma corrida". A etapa "criando" é gravada antes de criar. O painel também recusa uma segunda corrida
  aberta para o mesmo telefone (aberta pelo painel ou totem): o bot avisa a OS.
- Mensagem repetida pelo provedor (mesmo id) é ignorada.
- Passageiro **bloqueado ou suspenso** no cadastro não pede corrida (o suporte continua liberado).
- O nome do passageiro vem do cadastro; sem cadastro, do perfil do WhatsApp.

### Suporte e conversas no painel

Tela **Bot de WhatsApp › Conversas**: histórico por passageiro, mensagens não lidas, resposta manual do operador.
Quando o operador responde no começo da conversa, o bot passa a esperar o operador (etapa "suporte").
"Devolver ao bot" encerra o atendimento.

## Conexão do número

Tela **Bot de WhatsApp › Conexão do número** (só administrador muda):

- **Simulado:** nada sai pelo WhatsApp. Use a aba **Testar conversa** para conversar como passageiro.
- **WhatsApp de verdade (Evolution API):**
  - Padrão: **servidor da plataforma** (`WHATSAPP_EVOLUTION_URL` e `WHATSAPP_EVOLUTION_TOKEN` no `.env` do servidor).
    A instância é sempre `bot-<empresa>`, sem escolha: uma empresa nunca usa a instância de outra.
    A empresa só clica em **Conectar** e lê o QR no celular.
  - Opcional: **servidor próprio da empresa** (endereço + token, guardados nos segredos da empresa, chave
    `bot-whatsapp`). Aí o nome da instância é livre.
  - Ao conectar, o painel cria a instância (se não existir) e aponta o webhook para o painel.
- **Ligar o bot:** marque "Bot ligado". Desligado, o webhook responde 200 e ignora as mensagens.

## Webhook

`POST /api/bot/webhook/:empresa/:segredo` (público). O segredo é sorteado por empresa e fica nos segredos dela.
Segredo errado ou de outra empresa: 404. O painel responde na hora e processa em seguida, uma fila por conversa.
Para o endereço certo atrás de proxy, defina `PUBLICO_URL`.

## Arquivos

| Onde | O quê |
|---|---|
| `painel/src/bot/rotas.ts` | `rotasBot` (Router): webhook, config, conexão, conversas, teste |
| `painel/src/bot/fluxo.ts` | etapas da conversa, operador, escolha do servidor de WhatsApp |
| `painel/src/bot/corridas.ts` | ponte com as corridas próprias e cadastros (categorias, clientes, motoristas) |
| `painel/src/bot/status.ts` | aviso de mudança de status (verificação periódica) |
| `painel/src/bot/provedores.ts` | `ProvedorWhatsApp`: Evolution API e simulado |
| `painel/src/bot/entender.ts` | cumprimento, endereço, opções, IA (classificação) |
| `painel/src/bot/textos.ts` | textos do bot com a marca |
| `painel/src/bot/armazem.ts` | config, segredos e conversas em `dados/empresas/<id>/bot/`; fila por conversa |
| `painel/src/web/bot/` | telas: Conversas, Conexão do número, Testar conversa |
| `painel/test/bot.test.ts` | testes (provedor simulado, sem rede) |

## Ligar no painel (sessão Base)

Em `painel/src/servidor/index.ts`, o webhook precisa ficar **antes** do `app.use("/api", exigirLogin)`
(o router aplica o login nas outras rotas):

```ts
import { rotasBot } from "../bot/rotas.ts";
// ... antes de: app.use("/api", exigirLogin);
app.use("/api/bot", rotasBot);
```

Em `painel/src/web/App.tsx`:

```tsx
import BotWhatsApp from "./bot";
// dentro de <Routes>:
<Route path="/bot" element={<BotWhatsApp />} />
```

Em `painel/src/comum/funcoes.ts`, a função `bot` passa para `situacao: "pronto"`.
No `.env.example`: `WHATSAPP_EVOLUTION_URL=`, `WHATSAPP_EVOLUTION_TOKEN=`, `BOT_STATUS_SEGUNDOS=` (opcional, padrão 10).

## Falta (próximos passos)

- Áudio (transcrição com o caso "voz"), endereços salvos, agendamento.
- Conversa entre passageiro e motorista pelo número do bot.
- Mover conversas para o banco quando a fase 1.4 chegar (tabelas `bot_*` com `empresa_id`).

## O que veio do sistema de referência (14/11/2026)

Tela **Bot de WhatsApp › Ajustes do bot** (só admin muda) e regras do bot de referência, sem a Machine (a corrida é nativa).

| Parte | Situação |
|---|---|
| Etapas do fluxo (menu de boas-vindas, pedir destino, permitir "não informar", confirmar endereços, pedir categoria, pedir pagamento) | Veio. Sem pagamento perguntado, a corrida vai como Dinheiro (a corrida própria exige uma forma). Sem "Preço fixo": o preço já vem das categorias e tarifas. |
| Destino obrigatório (`destSkip`) | Veio, com os dois textos de aviso. |
| Mensagens do Bot (textos editáveis) | Veio, com os mesmos grupos e chaves. Ficaram de fora as perguntas de cidade e "não quer corrida" (não existem neste fluxo). O texto padrão do menu continua com a marca (assistente e empresa); o texto editado vale no lugar. |
| Saudação com imagem (no máximo uma a cada 12 h) | Veio. Só endereço `https`. |
| Respostas prontas (base de conhecimento) | Veio. No começo vale qualquer pergunta; no meio do pedido só com "?" e o bot volta à pergunta. |
| Comandos da central (`#bloquear`, `#desbloquear`, `#pausar`, `#voltar`, com ou sem número) | Veio, também pelos botões em Conversas. Bloqueado ou pausado: o bot fica quieto e a conversa fica no painel. |
| Mensagens de status | Veio: textos padrão do sistema de referência, editáveis com `{passageiro}`, `{motorista}`, `{empresa}`; aceite e troca de motorista levam os dados do carro. |
| Grupos de WhatsApp | Já ignorados (`@g.us`). |
| Falta | Várias conexões por empresa e outros provedores (Z-API, Z-Pro, Meta), cidades ativas, voz do bot, áudio, endereços aprendidos, agendamento pelo bot, repasse de mídia entre motorista e passageiro, descadastro por resposta (PARAR/SAIR) ligado ao CRM. |

Arquivos novos: `bot/textos-editaveis.ts`, `bot/mensagens-status.ts`, `bot/controle.ts`, `bot/destino.ts`, `web/bot/Ajustes.tsx`.
Testes: `test/bot-fluxo-avancado.test.ts` e `test/bot-regras-*.test.ts`.
