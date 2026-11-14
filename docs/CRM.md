# CRM do painel (fase 3)

Campanhas e mensagens automáticas por WhatsApp, por empresa. Funciona sem nenhuma chave de sistema externo.
A IA é opcional: sem chave, tudo funciona e só não sai a sugestão de variações de texto.

## Onde fica

| O quê | Arquivo |
|---|---|
| Rotas `/api/crm` | `painel/src/crm/rotas.ts` (exporta `router`) |
| Público e segmentos (regras puras) | `painel/src/crm/publico.ts` |
| Fila, campanhas, jornadas, trabalhador | `painel/src/crm/envio.ts` |
| Ritmo do WhatsApp (lote, pausa, limite) | `painel/src/crm/ritmo.ts` |
| Texto, variáveis, variações com IA | `painel/src/crm/mensagem.ts` |
| Provedor de WhatsApp (Evolution e simulado) | `painel/src/crm/whatsapp.ts` |
| Cupons (do cadastro) | `painel/src/crm/cupons.ts` |
| Arquivos e segredos | `painel/src/crm/armazem.ts` |
| Telas | `painel/src/web/crm/` (`index.tsx` exporta `CrmPublico`, `CrmCampanhas`, `CrmJornadas`) |
| Testes | `painel/test/crm.test.ts` |

Dados de cada empresa em `DADOS_DIR/empresas/<id>/crm/` (`listas.json`, `campanhas.json`, `jornadas.json`,
`fila.json`, `contatos.json`, `config.json`, `ritmo.json`, `disparos.json`). URL, token e nome da instância do
WhatsApp ficam em `segredos.json` da empresa (chave `crm-whatsapp`) e nunca voltam para o navegador.
A empresa de cada pedido vem do login (`req.ctx.empresaId`), nunca da URL.

## Público

- Passageiros = cadastro `clientes`; motoristas = cadastro `motoristas`. Completados com as corridas dos últimos
  N dias (padrão 90; próprias e das integrações opcionais): nº de corridas, gasto, última corrida, dias sem
  corrida, categorias, canais.
- A pessoa é identificada pelo telefone (últimos 11 dígitos). Nome e cidade do cadastro valem mais que os das
  corridas. Quem está no cadastro e nunca pediu também aparece.
- Recebe WhatsApp quem tem telefone válido, não marcou "não quero receber" e não está "Bloqueado" no cadastro.
  Um envio por número.

## Segmentos e listas

- Regras: tipo (passageiro/motorista), cidade, sem corrida há pelo menos / no máximo X dias, corridas mínimo /
  máximo, categoria, canal, lista, busca. Cidade, categoria e canal comparam o nome inteiro, sem acento.
- **Segmento** (lista dinâmica) guarda as regras e recalcula a cada uso. **Lista fixa** guarda as pessoas do momento.
- A tela mostra quantas pessoas recebem antes de salvar.

## Campanhas

- Variáveis: `{primeiro_nome}`, `{nome}`, `{cidade}`, `{cupom}`, `{empresa}`, `{dias_sem_corrida}`, `{corridas}`.
  Variável desconhecida não salva. Sem `{cupom}` no texto, o código vai no fim.
- Cupom: escolhido do cadastro `cupons` (Financeiro › Cupons e descontos). Tem que existir para salvar; tem que
  estar ativo e no prazo para disparar.
- Variações: até 5. A IA (caso `chat` do roteador) sugere; só entra variação com as mesmas variáveis. Cada pessoa
  recebe sempre a mesma variação (sorteio fixo pela pessoa e campanha).
- Estados: rascunho → (agendada) → enviando ⇄ pausada → concluída / cancelada. Disparar, agendar, pausar e
  cancelar: só admin. Campanha disparada não muda (use Duplicar).
- O público é calculado na hora do disparo. Relatório: total, enviadas, na fila, falhas (com motivo), canceladas,
  primeiro e último envio, lista das mensagens (telefone mascarado).

## Envio (fila por empresa)

- Padrão: lote de 20, pausa sorteada entre 5 e 10 min, limite de 20 por minuto. Lote 0 desliga o lote.
- Entre mensagens há um intervalo que varia ±30%. Parado mais que a pausa máxima, o lote recomeça.
- Mensagem que cai na pausa ou no limite **continua pendente** (não é falha) e sai depois.
- Erro passageiro do provedor (429, 5xx, sem resposta) volta para a fila em 2 min, até 3 tentativas.
  Erro definitivo (4xx) vira falha.
- Trabalhador a cada 15 s: dispara agendadas vencidas, confere jornadas ligadas (1x por hora) e manda a fila.
  Não roda com `NODE_ENV=test`.
- Envio de teste (tela da campanha) sai na hora, fora do lote.

## WhatsApp da empresa

- `simulado` (padrão): não manda nada; guarda na memória e mostra em "Caixa de saída simulada".
  Telefone terminado em 0000 falha; em 9999 dá erro passageiro (para testar).
- `evolution`: instância da própria empresa (URL, nome e token dela). Envio em
  `POST {url}/message/sendText/{instancia}` com cabeçalho `apikey`. O número é conectado lendo o QR code na instância.
  Só aceita URL `https` pública (`CRM_PERMITIR_URL_LOCAL=true` libera endereço local para testes).

## Jornadas e gatilhos

- `sem-corrida`: sem corrida há pelo menos X dias. `cancelou`: a última corrida foi cancelada há no máximo X dias.
- Filtro extra pelas mesmas regras do segmento. Cada pessoa recebe uma vez; volta a valer depois que pedir de novo.
- Ligar, editar e "conferir agora": só admin.

## Rotas (`/api/crm`)

`POST /publico`, `POST /publico/contar`, `POST /publico/optout`, `GET|POST /listas`, `DELETE /listas/:id`,
`GET|POST /campanhas`, `PUT|DELETE /campanhas/:id`, `POST /campanhas/previa`,
`POST /campanhas/:id/(disparar|pausar|retomar|cancelar|duplicar)`, `GET /campanhas/:id/relatorio`,
`POST /variacoes`, `POST /teste`, `GET /cupons`, `GET|POST /jornadas`, `PUT|DELETE /jornadas/:id`,
`POST /jornadas/contar`, `POST /jornadas/:id/rodar`, `GET /fila`, `POST /fila/processar`, `GET /simulado`,
`GET|PUT /config`.

## Para ligar no painel (arquivos comuns)

`painel/src/servidor/index.ts` (antes do `app.use("/api", ...)` de 404):

```ts
import { router as rotasCrm } from "../crm/rotas.ts";
app.use("/api/crm", exigirLogin, rotasCrm);
```

`painel/src/web/App.tsx` (import e mapa `PAGINAS`):

```tsx
import { CrmPainel } from "./crm";
crm: <CrmPainel />,
```

`painel/src/comum/funcoes.ts`: item único `crm` ("CRM & Engajamento", rota `/crm`; as rotas antigas `/crm/campanhas`, `/crm/jornadas` e `/crm/publico` redirecionam).

## Ainda não

- "SAIR" respondido pelo passageiro no WhatsApp marcar "não quero receber" sozinho (precisa do webhook do bot, fase 4).
  Hoje marca na tela Público.
- Gatilhos por evento em tempo real (corrida finalizada agora): hoje a jornada confere a cada hora.
- Push no app e outros canais: só WhatsApp por enquanto.

## O que veio do mobveloov (14/11/2026)

O CRM agora é uma tela só, **CRM & Engajamento**, com os mesmos grupos e abas do CRM de referência (sem a aba da Machine:
a corrida é nativa). Também veio o botão "Emojis nas mensagens".

| Aba | Situação |
|---|---|
| Visão Geral | Veio: enviadas, falhas, puladas, pessoas notificadas, por dia e por origem (a conversão em corrida depende da aba Conversão, ainda não portada). |
| Automação › Jornadas | Já existia (jornadas por "sem corrida" e "cancelou"). |
| Comunicação › Campanhas, WhatsApp | Já existiam. |
| Comunicação › Templates | Veio: título, conteúdo com SpinText `{a|b}` e variáveis `{{x}}`, modelos prontos, pré-visualização, teste A/B, rodapé de descadastro, emojis, "Corrigir com IA + SpinText". |
| Comunicação › Descadastros | Veio: lista, busca, "Descadastrar número", reativar só com a autorização escrita. Regras de texto (NÃO QUERO MAIS, PARAR, SAIR...) em `painel/src/crm/optout.ts`. |
| Público › Passageiros, Motoristas | Já existiam (tela Público). |
| Falta | Gatilhos por evento, Fila, Régua, Templates comportamentais, Notificações, Histórico, Comportamentos, Contatos, Segmentos (hoje dentro de Público), RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança, Auditoria. |

Texto das mensagens: `{{nome}}` é o primeiro nome, `{{nome_completo}}` o nome todo, e o SpinText sorteia uma opção por pessoa.
As variáveis antigas `{primeiro_nome}`, `{nome}` etc. continuam valendo nas campanhas e jornadas já criadas.

Arquivos novos: `crm/spintext.ts`, `crm/optout.ts`, `crm/catalogo.ts`, `crm/emojis.ts`, `crm/templates.ts` (tabelas
`crm_templates` e `crm_descadastros` no banco), `web/crm/Painel.tsx`, `Templates.tsx`, `Descadastros.tsx`, `Visao.tsx`.
Testes: `test/crm-spintext.test.ts`, `crm-optout.test.ts`, `crm-templates.test.ts`.
