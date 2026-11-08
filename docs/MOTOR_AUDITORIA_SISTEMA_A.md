# Auditoria do Sistema A: documentação × motor (08/11/2026)

## Como foi feita

- Li toda a documentação pública do Sistema A, que o usuário indicou: textos das páginas, especificação completa da
  API v2 de corridas (102 rotas) e histórico de mudanças até 10/11/2026.
- Fiz só leitura, sem login e sem chave.
- Comparei a documentação com o adaptador do motor (`motor/src/sistema-a.ts` e `motor/src/sistema-a-extras.ts`).
- A parte de **entregas** ficou fora: o motor só trata corridas.
- Nada foi testado com uma conta real. A documentação pode diferir do servidor em algum detalhe.

Legenda da coluna "O que fazer":
- **Corrigido**: mudou na versão 3.1.0 do motor e tem teste.
- **Feito na 3.2**: entrou na versão 3.2.0 e tem teste (com respostas simuladas).
- **A fazer**: falta no motor; fica para depois.
- **Ok**: já estava certo.

## 1. Autenticação, erros e ambientes

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| Todo pedido leva o cabeçalho `api-key` **e** usuário e senha (Basic Auth) | Manda os dois | Ok |
| Sem chave: HTTP 400 com código `B1`. Chave não reconhecida: HTTP 403 com corpo `-` em texto puro. Usuário ou senha errados: código `B5` (401) ou `1` (400) | `B1`, 401 e 403 já viravam `SEM_AUTORIZACAO`. O código `1` com HTTP 400 virava "dados inválidos" | **Corrigido**: os códigos `1`, `19` (licença sem API), `63`, `67`, `68` (sem permissão), `B5` e `B6` viram `SEM_AUTORIZACAO` |
| Erros de usuário, licença e permissão chegam com **HTTP 400**, não 401 ou 403 | Tratava todo 400 como dado errado | **Corrigido** (linha acima) |
| "Não encontrado" às vezes vem com 400 (códigos `25`, `56`, `72`, `75`, `167`) | Virava `DADOS_INVALIDOS` | **Corrigido**: vira `NAO_ENCONTRADO` |
| Código `18`: muitas corridas do mesmo passageiro em 60 segundos | Virava `DADOS_INVALIDOS` | **Corrigido**: vira `LIMITE` (tentar em 60 s) |
| Trate o erro pelo `code`, não pelo texto; o texto muda com o tipo da central | O código vai em `detalhe`, e a mensagem do sistema vai junto do erro | Ok |
| Erro 500 por tempo esgotado (5 s internos): a operação **pode ter sido concluída** | Criar corrida dava só "plataforma com problema" | **Corrigido**: a mensagem avisa para conferir a lista antes de repetir (e mostra o id externo) |
| `id_externo` repetido dá erro `8`; até 36 caracteres | Manda `idExterno` | Ok. Recomendação: o painel sempre mandar um `idExterno` único, assim um pedido repetido não cria corrida em dobro |
| Existe ambiente de **homologação** (testes, sem efeito real) além do de produção | `apiUrl` vem da configuração da empresa | Ok. Para o primeiro teste real, usar o endereço de homologação |

## 2. Limites de uso

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| Janela de 60 s por chave; ao passar o limite, 429 com `Retry-After` | 429 vira `LIMITE` com `tentarEmSegundos` | Ok |
| Paginação: padrão 20, **máximo 100** | Corridas e motoristas aceitavam até 200 | **Corrigido**: máximo 100 |
| Grupo "Crítico" (corridas): 800 × faixa por minuto. Condutores: 750 × faixa | Sem controle próprio | Ok para o uso atual |
| Posição de motoristas livres e histórico de punições: **10 por minuto**. Extrato: 40 por minuto. Cupons: 60 × faixa | Sem controle próprio | **A fazer** no painel: não atualizar o mapa de motoristas mais de uma vez a cada 6 s, e guardar a resposta por um tempo |
| Cabeçalhos `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-Total-Period` mostram o consumo | Não lê | **A fazer**: ler `X-RateLimit-Remaining` para frear antes do 429 |

## 3. Corridas

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| `POST /corridas/consultar`: intervalo de **no máximo 31 dias**; início igual ao fim dá erro `41`; fim antes do início dá erro `40` | Mandava só o início quando o painel não dava o fim | **Corrigido**: sempre manda o fim (agora, se faltar) e recusa antes de chamar quando passa de 31 dias ou quando o fim não vem depois do início |
| O filtro de status **não aceita `U`** (agrupada): erro `98` | Mandaria `U` ao filtrar só por "agrupada" | **Corrigido**: nunca manda `U`; filtra no motor |
| Sem resultado: 200 **sem** `data` | Lista vazia | Ok |
| Datas: o texto em horário da central e a cópia `_utc` em ISO | Usa `_utc` primeiro | Ok |
| `valor_corrida` já com desconto; `valor_corrida_integral` sem desconto | Usa os dois | Ok |
| A consulta traz `empresa_id`, `cliente_id`, `tipo_pagamento`, `data_hora_pendencia`, `taxas_cancelamento`, `descricao_categoria`, `codigo_coleta` | Ficam só em `bruto` | **A fazer**: levar `data_hora_pendencia` e as taxas de cancelamento para o modelo, se o painel precisar |
| Filtros extras na consulta: `empresa_id`, `cliente_id`, `tipo_pagamento`, `obter_filiais` | Data, status, motorista, empresa, passageiro e pagamento | **Feito na 3.2** (falta só `obter_filiais`) |
| `GET /corridas/{id}`: vem em lista; qualquer erro vira 404 | Pega o primeiro item | Ok |
| `GET /corridas/{id}/status`: `fase` (`a_caminho`, `proximo`, `no_local`, `espera_prolongada`) e as datas de cada fase | Usa a fase para mostrar "no local" | Ok |
| `POST /corridas` aceita `paradas` (até 1000), `codigo_cupom`, `empresa` (corrida corporativa), `extras` (porta-malas, animais, cadeirante…), `condutor` (motorista escolhido), `chat_ativo`, `info_apos_aceite` | Manda também paradas, cupom e empresa (com centro de custo); confere parada sem bairro e id externo com mais de 36 letras antes de chamar | **Feito na 3.2**. **A fazer**: `extras`, motorista escolhido, `chat_ativo` |
| A resposta da criação traz `tipo`, `passageiro_id` e `condutor_id` (para o chat) | Guarda só o id e o valor; o resto fica em `bruto` | Ok por enquanto |
| Corridas **programadas**: criar, ver uma, cancelar, **despachar agora** (responde 202; 409 se já saiu) e estimar | Lista, cancela e despacha | **Feito na 3.2** (cancelar e despachar). **A fazer**: criar e ver uma |
| `GET /corridas/{id}/recibo` (só corrida finalizada) | Não usa | **A fazer**, se o painel quiser recibo |
| Cancelar: `motivo_id` obrigatório; códigos `26` (motivo não existe) e `151` (já finalizada ou cancelada) | Exige número do motivo | Ok |

## 4. Status e eventos

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| Status da corrida: `D T G P S A E R F C N U` | Todos mapeados | Ok |
| O webhook tem códigos que não existem na consulta: `AN` (perto do embarque), `AP` (chegou), `AW` (espera passou do previsto) e `L` (aguardando liberação) | Viravam "desconhecido" | **Corrigido**: `AN` vira aceita, `AP` e `AW` viram no local, `L` vira pendente |
| Cancelada com `will_reopen: true`: a **mesma** corrida volta para a distribuição; não abrir outra | Ignorava | **Corrigido**: o evento traz `reabre: true` (campo novo do contrato 3.1.0) |
| `ER` = parada concluída, com `stop_id` | Vira evento "parada" | Ok |

## 5. Webhooks

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| Tipos: `status`, `posicao`, `mensagens` e `mensagens_corrida`. Até 5 por tipo | Lê os quatro | Ok |
| Posição: lote a cada 10 s, até 500 por envio, sem reenvio; usar `timestamp` (posição do motorista) e não `datetime` | Usa `timestamp` | Ok |
| Use `event_id` para não processar duas vezes | Põe em `idEvento` | Ok. O painel precisa guardar os ids já vistos |
| Formatos antigos (status com `status_solicitacao` e `id_mch`; posição com `lat_cond` e `lng_cond`) ainda podem chegar até a central cadastrar de novo | Status antigo vinha sem status; posição antiga era descartada | **Corrigido**: os dois formatos antigos são lidos |
| Assinatura `Signature-V2`: HMAC-SHA512 com a chave; na posição, sobre o corpo inteiro. O exemplo é hexadecimal | Confere o corpo inteiro, em hexadecimal ou base64 | Ok. Continua **sem prova real**: conferir com o primeiro webhook verdadeiro |
| O status `A` traz `driver.pix_key` (chave Pix do motorista): é dado pessoal, não gravar em log | O motor não grava log do corpo; o evento leva `bruto` | **A fazer** no painel: não guardar `bruto` do webhook em log |
| Cadastrar, mudar, apagar e ver a saúde do webhook (`GET /webhooks/{id}/status`: ativo, bloqueado por um tempo ou de vez) | Lista os webhooks com a situação de cada um | **Feito na 3.2** (leitura). **A fazer**: cadastrar, mudar e apagar |

## 6. Motoristas

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| `GET /condutores` **sem resultado responde 404 com código `56`**, e não lista vazia | Dava erro "não encontrado" na busca | **Corrigido**: volta lista vazia |
| Filtros: `id`, `telefone`, `cpf` (busca exata) e `status_condutor` (A, E, F, I, S, R, D) | Telefone, CPF e situação; nome é filtrado no motor só na página recebida | **Feito na 3.2** (situação) |
| Traz `numero_viatura`, `foto_url`, `email`, endereço, `data_hora_ultima_corrida` e `chave_pix` | Usa também situação, viatura e foto | **Feito na 3.2**. `chave_pix` fica de fora de propósito: é dado pessoal |
| `GET /condutores/{id}/score` (pontos e nível do trimestre) | Não usa | **A fazer**, se o painel quiser |
| Escrita: mudar cadastro, documentos, créditos (recarga, saque e saldo, 5 por minuto por motorista) e áreas de bloqueio | Não tem (motor só lê) | **A fazer** com cuidado: mexe em dinheiro e cadastro |

## 7. Categorias e tarifas

| O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|
| `GET /configuracoes/categorias` **exige um local**: `lat` e `lng`, ou endereço, bairro e cidade. Uma filial devolve as categorias dela | Chamava sem local (a doc indica que dá erro 400) | **Corrigido**: usa `latPadrao`/`lngPadrao` da empresa. Sem esse ponto, a recusa vira `NAO_CONFIGURADO` com a explicação |
| A lista traz só `id` e `nome` | Igual | Ok |
| Tarifas por categoria: `GET /configuracoes/categorias/{id}/tarifas` (padrão e extras com horários). Criar, editar e excluir também existem | Lê as tarifas: padrão, extras com horários e faixas por distância | **Feito na 3.2** (leitura). **A fazer**: criar, editar e excluir |

## 8. Funções extras (só leitura)

| Função | O que a doc diz | O que o motor faz | O que fazer |
|---|---|---|---|
| Estimativa | `POST /corridas/estimativas`, uma ou várias categorias; aceita `codigo_cupom`, `empresa_id`, paradas e data/hora | Usa partida, destino, categoria e várias categorias | Ok. **A fazer**: cupom e paradas |
| Programadas | Sem nenhuma, vem 200 com `data.code` 72 | Lista vazia | Ok |
| Mapa de motoristas | Só os **livres**; filtros `raio_km`, `lat`, `lng`, `incluir_parceiras`; falha vem como 503, nunca lista vazia | Sem filtros | Ok. Limite de 10 por minuto (seção 2) |
| Rastreio | `lat_condutor`/`lng_condutor` (e os antigos `_taxi`) | Lê os dois | Ok |
| Linha do tempo | `GET /corridas/{id}/detalhes`: aceite, perto, chegada, início, fim e cancelamento | Usa | Ok |
| Chat da corrida | Ler "como condutor" só funciona em corrida pedida pelo app do passageiro. Para corrida criada pela API com `chat_ativo`, a leitura é "como passageiro". **Ler marca as mensagens como lidas** | Lê só "como condutor" | **A fazer**: escolher o lado certo. Atenção: só ler já muda o "lido" no app do outro lado |
| Passageiros | Filtros `cpf_cnpj`, `ultimo_acesso_apos`, `nunca_acessou`; sem resultado vem 200 sem `data` | Busca por CPF, e-mail, telefone ou nome | Ok |
| Conveniadas | Limite acima de 100 é reduzido pela API | Máximo 100 | Ok |
| Extrato | `data_ini`/`data_fim` no fuso da central; **no máximo 31 dias**, só os últimos 6 meses; 10 por página | Não conferia o período | **Corrigido**: mais de 31 dias dá `DADOS_INVALIDOS` sem chamar |
| Cupons | 10 por página; filtro `status` (ativo, inativo, aguardo); campo novo `exibir_app` | Lê código, desconto, vigência e usos | Ok |
| Dinâmicas | Por área: fator ou valor adicional, embarque ou destino. Há também faixas por distância e a dinâmica sem área | Lê as de área e a geral (sem área) | **Feito na 3.2** (sem área). **A fazer**: faixas por distância |
| Punições | Filtro `taxista_id` (não `condutor_id`); busca precisa de 3 letras | Usa a busca | Ok |
| Áreas | Só `id` e `nome` (áreas de filial e cercas, não de tarifa) | Igual | Ok |

## 9. O que existe no Sistema A e o motor ainda não usa

Já entraram na 3.2: ver a situação dos webhooks, cancelar e despachar programadas, ler tarifas e criar corrida
com paradas, cupom e empresa.

O que falta, em ordem de utilidade para o painel:

1. **Webhooks pelo painel**: cadastrar, trocar a URL e apagar.
2. **Programadas**: criar e ver uma.
3. Lista de funcionários e centros de custo da empresa, para escolher na corrida corporativa.
4. Ler `X-RateLimit-Remaining` para frear antes do limite.
5. **Recibo** da corrida.
6. **Cadastrar ou achar passageiro pelo telefone** (`POST /clientes`) e **cupons disponíveis do passageiro**.
7. **Mensagens**: escrever no chat da corrida e mandar mensagem para um motorista ou uma empresa.
8. **Notificações** push e no app, para passageiros e motoristas (limite de 4 por minuto por passageiro).
9. **Cupons (escrita)**: criar, criar em lote e desativar.
10. **Dinâmicas (escrita)**: criar e mudar área, faixas e dinâmica sem área.
11. **Motoristas (escrita)**: cadastro, documentos, créditos e áreas.
12. Desafios de passageiro, login único no site da central e webhooks de engajamento.

As funções de escrita mexem em dinheiro, preço ou cadastro de verdade. Cada uma deve entrar com confirmação no
painel e ser testada primeiro no ambiente de homologação.

## 10. Segurança

- A documentação não traz chave nem senha reais. Os exemplos usam dados inventados.
- Dois campos são dado pessoal sensível: `chave_pix` (lista de motoristas) e `driver.pix_key` (webhook de status
  aceito). Não devem ir para log nem para quem não precisa.
- Nenhum endereço de servidor do Sistema A foi colocado no código ou nesta documentação. O endereço vem da
  configuração de cada empresa.
