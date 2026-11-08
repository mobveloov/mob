# Contrato do motor (versão 3.2.0)

Formato que o painel consome. Dono: sessão do **motor**. Arquivo compartilhado com o **painel**:
mudou aqui, avise a outra sessão. Os tipos de verdade estão em [`motor/src/tipos.ts`](../motor/src/tipos.ts).

## Regras

- **Integração opcional.** O painel é o sistema próprio e funciona sem o motor e sem chave nenhuma. O motor serve
  só para quem quiser importar ou espelhar dados de um sistema externo (Sistema A ou Sistema B).
- **Nomes neutros.** O código, os ids e os documentos usam "Sistema A" / "Sistema B". Nenhum endereço de servidor
  fica no código: cada empresa informa os endereços na própria configuração.
- **Várias empresas (SaaS).** O motor não guarda estado entre empresas. Cada chamada recebe a configuração
  da empresa (`Empresa`), com as integrações e credenciais dela. Uma empresa pode ter Sistema A, Sistema B, os dois
  ou mais de uma integração do mesmo tipo (ex.: duas centrais Sistema A).
- **Sem marca.** O motor não tem nome de empresa nem marca fixa. Os únicos nomes são dos sistemas
  ("Sistema A", "Sistema B"), usados nas mensagens de configuração.
- **Modelo único.** Corrida, motorista, categoria, pagamento e status têm o mesmo formato para os dois
  sistemas, com o campo `origem` (`"sistema-a"` ou `"sistema-b"`).
- **Nada some em silêncio.** Dado que o sistema não oferece aparece em `semDado` com o motivo. Função que o
  sistema não oferece aparece em `capacidades` com `disponivel: false` e o motivo; chamar dá `NAO_SUPORTADO`.
- **Projeto separado.** O motor usa só os arquivos desta pasta e a própria configuração. Nada de outros projetos.
- O motor roda **só no servidor** (Node 22+ ou Deno), sem dependências de execução.

## Configuração de uma empresa

```ts
interface Empresa { id: string; integracoes: Integracao[] }

type Integracao =
  | { id: string; tipo: "sistema-a"; credenciais: { apiUrl; apiKey; usuario; senha; motivoCancelamentoId?; latPadrao?; lngPadrao? } }
  | { id: string; tipo: "sistema-b"; credenciais: { painelUrl; cookie; cidadeId?; appApiUrl? } };
```

`id` da integração: texto livre, sem espaço nem `:` (ex.: `"sistema-a"`, `"central-1"`). Ele vira o prefixo dos ids.

O painel guarda as credenciais com nomes de variável (`SISTEMA_A_API_KEY`...)? Use `empresaDoEnv(objeto, empresaId)`:
cria a empresa com as integrações `"sistema-a"` e `"sistema-b"` a partir desses nomes.

## Uso direto (import)

```ts
const { criarMotor, empresaDoEnv } = await import("../../motor/src/index.ts");

const motor = criarMotor(empresaDoEnv(credenciaisDaEmpresa, empresaId));   // ou criarMotor(empresa)
let pagina = 1, r;
do {
  r = await motor.adaptador("sistema-a").listarCorridas({ de, ate, pagina, limite: 100 });
  pagina++;
} while (r.temMais);

motor.status();                      // pendências e capacidades de cada integração (tela de Integrações)
await motor.listarCorridas("todas", { de, ate });   // junta todas as integrações configuradas
```

Mudanças da v1 para a v2: `criarMotor({ env })` virou `criarMotor(empresa)`; `fonte` virou
`integracaoId` + `tipo` + `origem`; `categorias()` agora devolve `Pagina` (com `avisos`); `lerWebhook` é `async`.

## Funções do motor

| Função | Devolve | Observação |
|---|---|---|
| `status()` | `{integracaoId, tipo, origem, nome, configurado, pendencias[], capacidades}[]` | Não chama a rede. |
| `listarCorridas(alvo, filtro?)` | `Pagina<Corrida>` | `alvo` = id da integração ou `"todas"`. Sem `de`: últimas 24 h. |
| `detalharCorrida(id)` | `Corrida` | `id` = `"<integração>:<número>"`. |
| `criarCorrida(integracaoId, NovaCorrida)` | `CorridaCriada` | Sistema A: endereço e bairro. Sistema B: lat/lng. |
| `cancelarCorrida(id, motivo?)` | `void` | Sistema A pede número do motivo (ou o padrão da empresa). |
| `motoristas(alvo, {busca?, pagina?, limite?})` | `Pagina<Motorista>` | Busca por nome, telefone ou CPF com máscara. |
| `categorias(alvo)` | `Pagina<Categoria>` | Sistema B precisa de `cidadeId`. |
| `lerWebhook(integracaoId, corpo, cabecalhos?)` | `Promise<Evento[]>` | Só Sistema A. |
| `observador(integracaoId, {janelaMin?, maxPaginas?})` | `{ verificar(): Promise<Evento[]> }` | Eventos por consulta periódica (Sistema B). |
| `adaptador(integracaoId)` | `Adaptador` | Acesso direto a uma integração. |

### Funções extras (2.1)

`alvo` = id da integração ou `"todas"`. Em `"todas"`, integração sem a função fica de fora e entra em `avisos`
com `codigo: "NAO_SUPORTADO"` e o motivo. Pedindo direto a uma integração sem a função: erro `NAO_SUPORTADO`.

| Função | Devolve | Tela do painel |
|---|---|---|
| `estimarCorrida(alvo, { partida, destino?, categoriaId? })` | `Pagina<Estimativa>` | Solicitar corrida (preço) |
| `programadas(alvo, filtro?)` | `Pagina<Programada>` | Programadas |
| `posicoesMotoristas(alvo)` | `Pagina<PosicaoMotorista>` | Mapa de motoristas |
| `rastrearCorrida(id)` | `Rastreio` | Acompanhamento |
| `linhaDoTempo(id)` | `LinhaDoTempo` (eventos + ofertas) | Auditoria (raio-x) |
| `mensagensCorrida(id)` | `MensagemCorrida[]` | Conversas |
| `passageiros(alvo, filtro?)` | `Pagina<Passageiro>` | Passageiros, funil |
| `conveniadas(alvo, filtro?)` | `Pagina<Conveniada>` | Empresas conveniadas |
| `extrato(alvo, { de?, ate?, pagina? })` | `Pagina<Lancamento>` | Carteiras / financeiro |
| `carteiras(alvo, filtro?)` | `Pagina<Carteira>` | Carteiras (saldos) |
| `cupons(alvo, filtro?)` | `Pagina<Cupom>` | Cupons |
| `dinamicas(alvo)` | `Pagina<Dinamica>` | Tarifas dinâmicas |
| `punicoes(alvo, filtro?)` | `Pagina<Punicao>` | Punições |
| `areas(alvo)` | `Pagina<Area>` | Áreas |
| `veiculos(alvo, filtro?)` | `Pagina<VeiculoCadastro>` | Veículos |

`filtro` = `{ busca?, pagina?, limite?, de?, ate? }`. Tudo isso é **só leitura**. Escrita (criar cupom,
enviar push, mudar tarifa) ainda não está no motor.

```ts
interface Estimativa { integracaoId; origem; categoriaId?; categoria?; valor?; valorSemDesconto?; distanciaKm?; duracaoMin?;
  tarifa?; dinamica?: { ativa; fator? }; bruto }
interface Programada { id; integracaoId; origem; idOriginal; statusTexto; statusOriginal; agendadaPara?: string;
  passageiro; partida; destino?; categoria?; pagamento?; valorEstimado?; observacao?; corridaId?; semDado; bruto }
interface PosicaoMotorista { integracaoId; origem; motoristaId; nome?; lat; lng; em?; livre?; inativo? }
interface Rastreio { corridaId; motoristaId?; lat?; lng?; disponivel: boolean; motivo? }
interface LinhaDoTempo { corridaId; eventos: { em?; texto }[];
  ofertas: { motorista?; placa?; distanciaKm?; etapa?; resultado: "aceitou"|"recusou"|"tentou"|"sem_resposta" }[]; semDado; bruto }
interface MensagemCorrida { em?; de: "passageiro"|"motorista"|"central"|"outro"; nome?; texto; midiaUrl? }
interface Passageiro { id; integracaoId; origem; idOriginal; nome; telefone?; email?; cpf?; ativo; avaliacao?;
  corridasFinalizadas?; ultimaCorridaEm?; cadastradoEm?; origemCadastro?; aparelho?; semDado; bruto }
interface Conveniada { id; ...; nome; documento?; telefone?; cidade?; ativa; funcionarios?; categorias: string[] }
interface Lancamento { integracaoId; origem; em?; valor: number /* + entra, - sai */; pessoa?: { tipo; nome? }; operacao; descricao?; estornado }
interface Carteira { id; ...; tipoPessoa; nome; telefone?; saldo: number }
interface Cupom { id; ...; codigo; descricao?; ativo; tipoDesconto: "percentual"|"valor"; desconto?; inicio?; fim?; usos?;
  limiteTotal?; limitePorPessoa?; valorMinimoCorrida?; valorMaximoDesconto? }
interface Dinamica { id; ...; nome; ativa; tipo: string /* área, horário, demanda */; fator?; adicional? }
interface Punicao { id; ...; motorista: { id?; nome?; telefone?; email? }; motivo?; inicio?; ate?;
  situacao: "ativa"|"concluida"|"revogada"|"desconhecida"; automatica? }
interface Area { id; ...; nome }
interface VeiculoCadastro { id; ...; placa?; modelo?; ano?; cor?; emUso: boolean; motorista?: { id?; nome? } }
```

Fora do motor: `capacidadesPorSistema()` (tabela abaixo, sem empresa), `buscarCorridas(motor, filtroDoPainel)`
em `motor/src/busca.ts` (filtro com datas AAAA-MM-DD, grupo de status e busca livre).

## Modelo único

```ts
type Origem = "sistema-a" | "sistema-b";
type StatusCorrida = "distribuindo" | "pendente" | "em_espera" | "aceita" | "no_local" | "em_andamento"
  | "aguardando_pagamento" | "finalizada" | "cancelada" | "nao_atendida" | "agrupada" | "desconhecido";
type GrupoStatus = "aberta" | "finalizada" | "cancelada" | "nao_atendida";
type FormaPagamento = "dinheiro" | "pix" | "cartao_app" | "cartao_maquina" | "carteira" | "voucher" | "faturado" | "outro";

interface SemDado { campo: string; motivo: string; doSistema: boolean } // doSistema=true: o sistema nunca manda

interface Corrida {
  id: string; integracaoId: string; tipo: "sistema-a" | "sistema-b"; origem: Origem; idOriginal: string;
  status: StatusCorrida; grupo: GrupoStatus; statusOriginal: string; statusTexto: string;
  canceladaPor?: "passageiro" | "motorista" | "central"; motivoCancelamento?: string;
  solicitadaEm?; aceitaEm?; chegadaEm?; iniciadaEm?; finalizadaEm?; canceladaEm?: string; // ISO 8601 com fuso
  passageiro: { id?; nome?; telefone? }; motorista?: { id?; nome?; telefone? }; veiculo?: { modelo?; placa?; cor? };
  partida: Endereco; destino?: Endereco; paradas: Endereco[];   // Endereco { texto, bairro?, cidade?, estado?, lat?, lng? }
  categoria?: { id?; nome }; pagamento: FormaPagamento; pagamentoOriginal?: string;
  valor?; valorSemDesconto?; descontoPct?; descontoValor?: number; cupom?: string; tarifa?: string;
  distanciaKm?; duracaoMin?; distanciaMotoristaKm?: number;
  avaliacao?: { nota: number; comentario?: string };
  dinamica?: { ativa: boolean; fator?: number; descricao?: string };
  operador?: string; programada: boolean; canal?: string; observacao?: string; linkAcompanhamento?: string;
  semDado: SemDado[]; bruto: unknown;
}

interface Pagina<T> { itens: T[]; pagina: number; temMais: boolean; total?: number;
  avisos?: { integracaoId; origem; codigo; mensagem }[] }

interface Motorista { id; integracaoId; tipo; origem; idOriginal; nome; telefone?; cpf?; ativo: boolean; online?: boolean;
  avaliacao?: number; categorias: string[]; veiculo?; semDado: SemDado[]; bruto }
interface Categoria { id; integracaoId; tipo; origem; idOriginal; nome; descricao?;
  tarifa?: { base?; km?; minuto?; minima? }; semDado: SemDado[]; bruto }
interface NovaCorrida { passageiro: { nome; telefone }; partida: Endereco; destino?: Endereco; categoriaId?: string;
  pagamento: FormaPagamento; observacao?: string; idExterno?: string /* até 36 letras */; valor?: number /* só Sistema B */;
  paradas?: Endereco[]; cupom?: string; empresa?: { id; centroCustoId? } /* os três: só Sistema A */ }
interface FiltroCorridas { de?; ate?; status?; motoristaId?; empresaId?; passageiroId?; pagamento?; pagina?; limite? }
  // empresaId e passageiroId: só Sistema A (no Sistema B dão NAO_SUPORTADO)
interface FiltroMotoristas { busca?; situacao?: SituacaoMotorista; pagina?; limite? }
type SituacaoMotorista = "ativo" | "em_analise" | "fila_de_espera" | "inativo" | "suspenso" | "rejeitado" | "deletado";
  // Motorista ganhou situacao?, viatura? e fotoUrl? (Sistema A). No Sistema B, só "ativo" e "inativo".
interface Tarifa { id; integracaoId; origem; idOriginal; nome; metodo?; padrao: boolean; inicio?;
  horarios: { diaSemana; inicio; fim }[]; faixas: { ateKm?; aPartirDe?; valor? }[]; semDado; bruto }
interface WebhookCadastrado { id; integracaoId; origem; idOriginal; tipo; url;
  situacao: "ativo" | "bloqueado_temporariamente" | "bloqueado_definitivamente" | "desconhecido";
  proximaTentativa?; falhasSeguidas?; semDado; bruto }
interface Evento { tipo: "status" | "posicao" | "mensagem" | "parada"; integracaoId; origem; corridaId?; em: string;
  status?; statusAnterior?; posicao?: { lat; lng; motoristaId? }; mensagem?: { texto; de? }; idEvento?;
  reabre?: boolean /* só em "cancelada": true = a mesma corrida volta a procurar motorista */; bruto }
```

Sistema A: `latPadrao`/`lngPadrao` são um ponto da cidade da empresa. A lista de categorias do Sistema A exige um local;
sem esse ponto, `categorias()` pode dar `NAO_CONFIGURADO`. Limites do Sistema A: no máximo 100 itens por página e
31 dias por busca de corridas ou de extrato (pedido maior dá `DADOS_INVALIDOS` sem chamar a plataforma).

Datas: Sistema A vem em UTC (`Z`), Sistema B em horário de Brasília (`-03:00`). Para comparar, use `Date.parse`.
`valor` é em reais.

## Capacidades por sistema

| Função | Sistema A | Sistema B |
|---|---|---|
| Listar / detalhar corridas | sim | sim (painel, com cookie) |
| Criar corrida | sim | sim (resposta ainda não confirmada) |
| Cancelar corrida | sim (número do motivo) | sim |
| Motoristas | sim | sim |
| Categorias | sim (sem valores) | sim (com tarifas; precisa da cidade) |
| Eventos por webhook | sim (status, posição, mensagens) | **não existe** no Sistema B |
| Eventos por consulta periódica | sim | sim |
| Estimativa de preço | sim (todas as categorias de uma vez) | sim* (precisa de lat/lng e cidade) |
| Programadas | sim (leitura) | sim* (lista em HTML; o motor lê o detalhe de cada uma) |
| Cancelar / despachar programada | sim (sem teste real) | **não ainda** (falta mapear com sessão real) |
| Tarifas por categoria | sim (padrão e extras, com horários e faixas) | **não precisa** (vêm dentro da categoria) |
| Webhooks cadastrados e situação de entrega | sim | **não existe** |
| Mapa de motoristas | sim (só livres; 10 consultas/min) | **não** (o mapa do Sistema B não usa rota legível) |
| Rastreio da corrida | sim | sim* |
| Linha do tempo / raio-x | sim, sem as ofertas recusadas | sim*, com as ofertas aos motoristas |
| Chat da corrida (leitura) | sim | sim* |
| Passageiros | sim | sim* |
| Empresas conveniadas | sim | **não** (vem pronta na página) |
| Extrato financeiro | sim (10 por página) | **não** (vem pronto na página) |
| Carteiras (saldos) | **não** (só um motorista por vez) | sim* |
| Cupons (leitura) | sim | sim* |
| Dinâmicas (leitura) | sim (por área e a geral, sem área) | sim* (área, horário, demanda) |
| Punições (leitura) | sim | sim* |
| Áreas | sim (só nome) | **não** (vem pronta na página) |
| Veículos | **não** (vêm dentro de cada motorista) | sim* |
| Ocorrências, objetos perdidos, pagamentos pendentes | **não** (a API não tem) | **não ainda** (o Sistema B manda HTML pronto; mapear com sessão real) |
| Enviar push, criar cupom, mudar tarifa (escrita) | existe no Sistema A; **falta no motor** | existe no Sistema B; **falta no motor** |

\* Sistema B: formato lido das páginas salvas do painel; ainda não confirmado com sessão real.

A tabela viva (com o motivo de cada linha) sai de `capacidadesPorSistema()` e de `GET /v1/capacidades`.

### Dados que cada sistema não manda (`semDado` com `doSistema: true`)

| Campo | Sistema A | Sistema B |
|---|---|---|
| telefone do passageiro | não manda na consulta | manda |
| canal (app/central/maçaneta) | não manda | manda |
| observação | não manda na consulta | manda |
| quem cancelou / motivo | não manda na consulta (só webhook) | manda |
| dinâmica | não manda (só o CSV) | manda (ativa + descrição) |
| operador | não manda (só o CSV) | não manda |
| tarifa (nome) | manda | não manda |
| cupom | manda o código | só o valor do desconto |
| desconto em % | manda | não manda |
| bairro/cidade separados | manda | não (endereço em um texto) |
| id da categoria | manda | não (só o nome) |
| duração realizada | manda | não (só a prevista) |
| comentário da avaliação | não | não |
| motorista online | não na lista | manda |
| avaliação, telefone e categorias do motorista | manda | não manda na lista |

## Erros

Toda falha é um `MotorErro` (`ehMotorErro(e)`) com `codigo`, `message` em português, `integracaoId` e, às vezes,
`tentarEmSegundos`. Para o navegador use `e.paraJson()` (não leva detalhe interno).

| `codigo` | Quando | HTTP no servidor |
|---|---|---|
| `NAO_CONFIGURADO` | falta credencial da empresa | 400 |
| `DADOS_INVALIDOS` | o sistema recusou o pedido; id sem prefixo | 400 |
| `NAO_ENCONTRADO` | corrida ou integração não existe | 404 |
| `LIMITE` | muitas chamadas (429 do sistema) | 429 |
| `NAO_SUPORTADO` | o sistema não tem a função | 501 |
| `SEM_AUTORIZACAO` | credencial da empresa recusada / cookie vencido | 502 |
| `ERRO_REMOTO` | resposta inesperada | 502 |
| `INDISPONIVEL` | sem rede, tempo esgotado, 5xx | 503 |

## Servidor HTTP (opcional)

Para usar o motor como serviço separado: `node --experimental-strip-types motor/src/servidor.ts`
(variáveis `MOTOR_PORTA` padrão 8790, `MOTOR_HOST` padrão 127.0.0.1, `MOTOR_TOKEN`). Sem token só escuta em 127.0.0.1.
Todo `POST` leva `{ empresaId, integracoes: [...] }` no corpo. O motor não guarda nem registra o corpo.

| Rota | Corpo extra | Resposta |
|---|---|---|
| `GET /v1/saude` | — | `{ ok, versao }` |
| `GET /v1/capacidades` | — | `{ versao, sistemas, fontes: [{tipo, origem, funcoes[]}] }` |
| `POST /v1/status` | — | `{ integracoes }` |
| `POST /v1/corridas/buscar` | `filtro` (formato do painel) | `{ corridas, avisos: string[], indisponivel: [{integracaoId, origem, codigo, motivo}] }` |
| `POST /v1/corridas/detalhe` | `id` | `{ corrida }` |
| `POST /v1/corridas/criar` | `integracaoId`, `corrida` | `{ criada }` |
| `POST /v1/corridas/cancelar` | `id`, `motivo?` | `{ ok }` |
| `POST /v1/motoristas/buscar` | `alvo?`, `filtro` | `Pagina<Motorista>` |
| `POST /v1/categorias` | `alvo?` | `Pagina<Categoria>` |
| `POST /v1/webhooks/ler` | `integracaoId`, `corpo`, `cabecalhos` | `{ eventos }` |
| `POST /v1/estimativa` | `alvo?`, `pedido` | `Pagina<Estimativa>` |
| `POST /v1/programadas`, `/v1/passageiros`, `/v1/conveniadas`, `/v1/extrato`, `/v1/carteiras`, `/v1/cupons`, `/v1/punicoes`, `/v1/veiculos` | `alvo?`, `filtro?` | `Pagina<...>` |
| `POST /v1/posicoes`, `/v1/dinamicas`, `/v1/areas` | `alvo?` | `Pagina<...>` |
| `POST /v1/corridas/rastreio`, `/v1/corridas/linha-do-tempo`, `/v1/corridas/mensagens` | `id` | `{ rastreio }`, `{ linhaDoTempo }`, `{ mensagens }` |
| `POST /v1/programadas/cancelar`, `/v1/programadas/despachar` | `id` (da programada) | `{ ok }` |
| `POST /v1/tarifas` | `categoriaId` (id do motor) | `{ tarifas }` |
| `POST /v1/webhooks/cadastrados` | `alvo?` | `Pagina<WebhookCadastrado>` |

Erro: `{ erro: "texto em português", codigo, integracaoId?, tentarEmSegundos? }`.

Filtro do painel (`/v1/corridas/buscar`): `{ inicio?, fim? (AAAA-MM-DD), ultimasHoras?, os?, busca?,
status? ("aberta"|"finalizada"|"cancelada"|"nao_atendida"), cidade?, categoria?, pagamento?, canal?, programada? }`.

## Webhook do Sistema A

O painel recebe o webhook, acha a empresa pela URL e chama `motor.lerWebhook(integracaoId, corpoTexto, cabecalhos)`.
Conferir a assinatura: `assinaturaSistemaAValida(corpo, cabecalho Signature-V2, apiKey)`. Ainda **não confirmada** com envio real.

## Histórico

- 3.2.0 (08/11/2026): pendências da auditoria do Sistema A. Funções novas no motor: `cancelarProgramada(id)`,
  `despacharProgramada(id)`, `tarifas(categoriaId)` e `webhooksCadastrados(alvo)`. Filtros novos: corridas por
  `empresaId`, `passageiroId` e `pagamento`; motoristas por `situacao`. `NovaCorrida` aceita `paradas`, `cupom` e
  `empresa` (Sistema A). `Motorista` ganhou `situacao`, `viatura` e `fotoUrl`. Dinâmicas incluem a geral (sem área).
  Quem implementa `Adaptador` precisa das quatro funções novas; quem usa `criarMotor` não precisa mudar nada.
- 3.1.0 (08/11/2026): ajustes da auditoria do Sistema A (`docs/MOTOR_AUDITORIA_SISTEMA_A.md`). Só acréscimos:
  `Evento.reabre`, credenciais `latPadrao`/`lngPadrao` (variáveis `SISTEMA_A_LAT`/`SISTEMA_A_LNG`). Webhook entende
  as fases `AN`/`AP`/`AW`, o status `L` e os formatos antigos. Erros de permissão e licença do Sistema A (HTTP 400)
  viram `SEM_AUTORIZACAO`. Motoristas sem resultado voltam lista vazia.
- 3.0.0 (08/11/2026): nomes neutros. Tipos viraram `"sistema-a"` / `"sistema-b"` (também em `origem`; ids padrão
  `sistema-a:123`). Variáveis `SISTEMA_A_*` / `SISTEMA_B_*`. Endereços obrigatórios na configuração: `apiUrl`
  (Sistema A, termina em `/api/v2/integracao`), `painelUrl` e, para categorias, `appApiUrl` (Sistema B).
  Funções `criarAdaptadorSistemaA` / `criarAdaptadorSistemaB`; `criarAdaptador` e `criarMotor` continuam iguais.
- 2.1.0 (08/11/2026): funções extras só de leitura — estimativa, programadas, mapa, rastreio, linha do tempo/raio-x,
  chat, passageiros, conveniadas, extrato, carteiras, cupons, dinâmicas, punições, áreas e veículos. Sem quebra da 2.0
  para quem usa `criarMotor`; quem implementa `Adaptador` precisa das funções novas.
- 2.0.0 (08/11/2026): várias empresas (credenciais por chamada), `origem`, `semDado`, capacidades, campos novos
  (tarifa, cupom, desconto, avaliação, dinâmica, distância do motorista, programada), servidor HTTP.
- 1.0.0 (07/11/2026): primeira versão (credenciais pelo `.env`).
