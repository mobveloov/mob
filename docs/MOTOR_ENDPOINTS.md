# Motor — o que cada plataforma oferece

Levantamento feito em 07/11/2026 a partir dos arquivos da pasta (o arquivo do Sistema A, o arquivo de páginas do Sistema B, os dois APKs do Sistema B)
e da documentação pública do Sistema A. Nenhuma chave, token ou senha foi copiada para este repositório.

## Sistema A

**O que veio nos arquivos:** o arquivo do Sistema A tem 163 páginas salvas do painel da central (no domínio próprio da central),
3 CSVs exportados e 4 PDFs (termos de uso e política de privacidade). Não há documentação de API nos arquivos.
As páginas são telas prontas do servidor (não chamam API JSON), então não servem de integração.

**A integração oficial** é a "API de Integração", pública na documentação do próprio Sistema A
(OpenAPI em `/pages/v2/openapi-corridas.json`). O motor usa a **v2**.

- Base: `<endereço da API do Sistema A>` (há também um endereço alternativo)
- Autenticação: **as duas juntas** em todo pedido
  - cabeçalho `api-key: <chave>` (criada no painel do Sistema A)
  - `Authorization: Basic <usuário:senha>` do usuário de integração
- Erros: corpo `{ "success": false, "errors": [{ "code", "message" }] }`
- Limite de uso: janela de 60 s por chave; "Crítico (corridas)" 800/min × faixa; estourou = HTTP 429 com `Retry-After`.

### Endpoints usados pelo motor

| Função do motor | Pedido |
|---|---|
| `listarCorridas` | `POST /corridas/consultar` corpo `{pagina, limite, data_hora_solicitacao_min, data_hora_solicitacao_max, status_solicitacao, condutor_id}` |
| `detalharCorrida` | `GET /corridas/{id}` (+ `GET /corridas/{id}/status` para saber se o motorista já chegou) |
| `criarCorrida` | `POST /corridas` (resposta traz `data.id_mch`) |
| `cancelarCorrida` | `POST /corridas/{id}/cancelar` corpo `{motivo_id}` |
| `motoristas` | `GET /condutores?pagina&limite&telefone&cpf` |
| `categorias` | `GET /configuracoes/categorias` |
| eventos | webhooks (abaixo) |

Outros disponíveis e ainda não usados: estimativas, programadas, recibo, posição do condutor, clientes,
empresas, cupons, dinâmicas, notificações, mensagens, extrato, login único.

### Estados da corrida (`status_solicitacao`)

| Código | Texto | No motor |
|---|---|---|
| D | Distribuindo | distribuindo |
| T | Redistribuindo | distribuindo |
| G | Aguardando aceite | distribuindo |
| P | Pendente | pendente |
| S | Em espera | em_espera |
| A | Aceita (fase: a_caminho, proximo, no_local, espera_prolongada) | aceita / no_local |
| E | Em andamento | em_andamento |
| R | Aguardando pagamento | aguardando_pagamento |
| F | Finalizada | finalizada |
| C | Cancelada | cancelada |
| N | Não atendida | nao_atendida |
| U | Agrupada | agrupada |

### Formas de pagamento (`tipo_pagamento`)
D dinheiro · B débito máquina · C crédito máquina · T eTicket · V voucher · X pix · P picpay · H whatsapp ·
A cartão no app · F faturado · I pix no app · R carteira de créditos.

### Campos principais de uma corrida
`id, data_hora_solicitacao(_utc), data_hora_aceite(_utc), data_hora_chegada_local(_utc), data_hora_inicio,
data_hora_finalizacao(_utc), data_hora_cancelamento(_utc), status_solicitacao, cliente_id, nome_passageiro,
condutor_id, nome_condutor, telefone_condutor(_internacional), veiculo, placa_veiculo, cor_veiculo, valor_corrida,
valor_corrida_integral, desconto, tipo_pagamento, id_categoria, categoria, partida{endereco,bairro,cidade,estado,lat,lng},
desejado{...}, paradas[], duracao_corrida (s), distancia_percorrida_km, link_acompanhamento_solicitacao`.

### Webhooks (eventos)
Cadastro: `POST /webhooks {tipo, url, responsavel}`; tipos `status`, `posicao`, `mensagens`, `mensagens_corrida`.
Assinatura no cabeçalho `Signature-V2` (HMAC-SHA512 com a api-key). Máximo de 5 por tipo.

- **status**: `datetime, event_id, request_id, status_code, status_label, passenger{}, driver{}, vehicle{}, links, will_reopen`
  (`status_code` = códigos acima; `ER` = parada concluída).
- **posicao**: lote a cada 10 s `{event_id, datetime, data:[{timestamp, request_id, driver_id, coordinates{latitude,longitude}}]}`; sem reenvio.
- **mensagens_corrida**: `request_id, sender_type (DRIVER/PASSENGER), content, ...`

## Sistema B

**O que veio nos arquivos:** o arquivo de páginas do Sistema B tem 52 páginas salvas do painel (`*.php` do painel web).
Os APKs são pacotes divididos (`base.apk` + `split_config.*.apk`) de apps **Flutter**:
app do passageiro (versão 1.5.0) e app do motorista (versão 4.8).

**O Sistema B não tem API pública nem webhooks.** O servidor tem duas partes, achadas no JavaScript do painel e no
código compilado dos apps (`libapp.so`):

### 1) Painel — `<painel web do Sistema B>` (precisa da sessão do painel, cookie `PHPSESSID`)
Sem sessão responde `{"success":false,"msg":"Acesso negado"}` (testado de verdade).

| Uso | Pedido |
|---|---|
| listar corridas | `POST consultar_corridas_api.php` form `acao=listar, pagina, data_ini, hora_ini, data_fim, hora_fim, status, categoria, pagamento, origem_solicitacao, cidade_filtro` → `{data[], stats{total,finalizadas,canceladas,andamento}, info_pag, total_pags}` |
| detalhe | `GET consultar_corridas_api.php?acao=detalhes&id=` → `{success, data{...}}` |
| outros | `acao=rastrear`, `buscar_chat`, `buscar_historico`, `raiox`, `buscar_categorias`, `salvar_edicao` |
| cancelar | `POST cancelar_corrida_painel.php` form `id_corrida, origem (central/motorista/passageiro/sistema), motivo` |
| criar | `POST solicitar_corrida.php` form `acao=criar_corrida, cidade_id_final, cliente_id, nome_passageiro, tel_passageiro, origem, lat_origem, lng_origem, destino, lat_destino, lng_destino, valor_final, categoria_id, observacao, forma_pagamento, distancia, tempo, exigencias` |
| motoristas | `GET api_motoristas.php?acao=listar&page&nome&cpf&telefone&placa&cidade_filtro` → `{success, data[], tabs, paginacao{atual,total_paginas}}` |
| estimativa | `POST api_calcular_painel.php` `cidade_id, origem_lat/lng, destino_lat/lng` |
| outros | `api_clientes.php, api_tarifas.php, api_cupons.php, api_desafios.php, api_dinamicas.php, api_punicoes.php, api_carteira.php, dados_painel_api.php, webhook_alertas.php (alertas internos do painel, não é webhook externo)` |

### 2) App — `<API do app do Sistema B>` (passageiro) e `/_/motoristas/` (motorista)
Achados ~60 endpoints em cada app, por exemplo: `login_user.php, get_cidades.php, get_categorias_ativas.php,
calcular_custos.php, verificar_corrida_ativa.php, cancelar_corrida_passageiro.php, get_historico.php, agendar_corrida.php`
e no motorista `login.php, busca_abertas.php, aceitar.php, atualizar_localizacao.php, finalizar_corrida_completa.php`.
Pagamento usa Mercado Pago; mapas usam Mapbox e Google.
`get_cidades.php` e `get_categorias_ativas.php` respondem **sem login** (testado). O motor só usa o de categorias.

### Estados da corrida (campo `status`)

| Código | Texto | No motor |
|---|---|---|
| 0 | Aguardando | distribuindo |
| 6 | Pendente (fila de espera) | pendente |
| 10 | Em fila | em_espera |
| 1 | A caminho | aceita |
| 2 | Chegou | no_local |
| 3 | Em viagem | em_andamento |
| 9 | Maçaneta (passageiro pego na rua) | em_andamento (canal `macaneta`) |
| 4 | Finalizada | finalizada |
| 5 | Cancelada pelo passageiro | cancelada |
| 8 | Cancelada pelo motorista | cancelada |
| 11 | Não atendida (expirou) | nao_atendida |

### Formas de pagamento
Dinheiro · Pix · Cartão (app) · Maquininha · Saldo da carteira.

### Campos principais de uma corrida
`id, date, hora_fmt, status, st_ui{label}, endereco_ini_txt, endereco_fim_txt, lat_ini, lng_ini, lat_fim, lng_fim,
paradas_json, nome_cliente, passageiro_telefone, motorista_id, nome_motorista/motorista_nome, motorista_carro, placa, cor,
f_pagamento, valor_inicial, valor_final, nome_categoria, distancia_prevista, tempo_previsto, quem_cancelou, motivo_cancel,
data_aceite_fmt, data_chegada_fmt, data_inicio_fmt, data_finalizacao_fmt, data_cancel, origem_visual, share_link`.

### Eventos
Não existem webhooks. O motor gera eventos comparando listagens (`observador`).

## Segredos encontrados (NÃO copiados)

- Nos dois APKs há **uma chave de API do Google** embutida (padrão `AIza…`), comum em apps com mapa/Firebase.
  Não foi copiada nem usada. Se ela não tiver restrição por app no Google Cloud, quem tiver o APK pode usá-la.
- Na página salva de Integrações do Sistema B os campos do Mercado Pago (Access Token, Public Key, Client ID, Client Secret)
  estão **vazios** no arquivo.
- Os arquivos do Sistema A e do Sistema B têm **dados pessoais** (nomes, telefones, e-mails de passageiros e motoristas).
  Eles ficam fora do git (`.gitignore`) e não foram copiados para o repositório.
