# Apps: contrato da API (versão 2, para as telas de docs/APPS_TELAS.md)

Todas as rotas ficam em `/api/apps/<empresa>/...`. As marcadas com 🔒 exigem o token: `Authorization: Bearer <token>`. As rotas que já existiam continuam valendo (veja `painel/src/apps/rotas.ts` e `extras.ts`). Aqui está só o que **muda** ou é **novo**.

Erro: o HTTP vem com status 4xx e o corpo `{ "erro": "texto para mostrar" }`.

## Conta e login (passageiro e motorista)

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /cidades` | — | `{ cidades: [{ id, nome, uf }] }`: cidades atendidas pela empresa (vêm de Endereços). Sem nenhuma, a lista vem vazia e o app pula a tela. |
| `POST /conta/existe` | `{ papel, login }` (telefone ou e-mail) | `{ existe: boolean, temSenha: boolean, mascarado: "k***@gmail.com" }` |
| `POST /conta/entrar` | `{ papel, login, senha }` | `{ token, eu }`. Limite: 8 erros em 10 min por login. |
| `POST /conta/criar` (passageiro) | `{ papel: "passageiro", nome, genero, telefone, email, senha, cidadeId? }` | `{ token, eu }`. Telefone ou e-mail repetido devolve erro. |
| `POST /conta/criar` (motorista) | `{ papel: "motorista", nome, cpf, telefone, email, nascimento, genero, chavePix, senha, cidadeId? }` | `{ token, eu }`. Cria o motorista com a situação **"Aguardando aprovação"**. Ele entra, completa o cadastro, mas **não fica online** até a central aprovar. |
| `POST /conta/esqueci` | `{ papel, login }` | Manda o código pelo WhatsApp (e devolve `codigoTeste` no ambiente de teste) |
| `POST /conta/nova-senha` | `{ papel, login, codigo, senha }` | `{ token, eu }` |
| 🔒 `POST /conta/senha` | `{ atual, nova }` | `{ ok }` |
| 🔒 `POST /conta/excluir` | `{ senha }` | `{ ok }`: pede a exclusão, que a central conclui. A sessão é encerrada. |
| 🔒 `GET /eu` | — | Agora traz também: `foto` (URL ou null), `email`, `genero`, `cidadeId`, `situacao` (do cadastro). Para o motorista, traz também `aprovado` e as `pendencias` (lista do que falta no cadastro). |
| 🔒 `POST /foto` | corpo cru `image/jpeg` ou `image/png`, até 3 MB | `{ foto }` (URL). Foto de perfil, que no motorista é a foto do rosto. |
| 🔒 `GET /foto/:papel/:chave` | — | A imagem. Só abre para quem está numa corrida aberta com essa pessoa, para a própria pessoa ou para a central. |

O login por código (`/entrar/codigo` e `/entrar`) continua funcionando.

## Passageiro

| Rota | Corpo | Resposta |
|---|---|---|
| 🔒 `GET /lugares` | — | `{ casa: Ponto\|null, trabalho: Ponto\|null, favoritos: [{ id, nome, ponto }], recentes: [Ponto] }`. Recentes: os últimos 8 destinos, sem repetir. |
| 🔒 `POST /lugares` | `{ tipo: "casa"\|"trabalho"\|"favorito", nome?, ponto }` | o mesmo do GET |
| 🔒 `POST /lugares/:id/remover` | — | o mesmo do GET |
| 🔒 `GET /opcionais` | — | `{ opcionais: [{ id, nome }] }` (porta-malas grande, encomenda, carro adaptado, à disposição) |
| 🔒 `GET /motivos-cancelamento` | — | `{ motivos: ["Motorista demorou muito", ...] }`, da empresa |
| 🔒 `GET /etiquetas-avaliacao` | — | `{ boas: [...], ruins: [...] }` (ex.: "Carro limpo", "Direção segura" / "Carro sujo", "Direção perigosa") |
| 🔒 `POST /corridas` | também aceita `valorOferecido` (número; não pode ficar abaixo do mínimo da categoria nem passar de 3× a estimativa) e `opcionais: [ids]` | a corrida com `valorOferecido` |
| 🔒 `POST /corridas/:id/oferta` | `{ valor }` | Muda o valor oferecido enquanto procura. |
| 🔒 `GET /corridas/:id/contraofertas` | — | `{ contraofertas: [{ id, valor, motorista: { nome, nota, viagens, veiculo, placa, foto }, distanciaKm, expira }] }` |
| 🔒 `POST /corridas/:id/contraofertas/:oferta/aceitar` | — | A corrida fica com esse motorista e esse valor. As outras ofertas são encerradas. |
| 🔒 `POST /corridas/:id/rota` | `{ paradas?: [Ponto], destino?: Ponto }` | Edita a rota com a corrida aberta. Recalcula a estimativa e avisa o motorista. |
| 🔒 `POST /corridas/:id/avaliar` | também aceita `etiquetas: [texto]` | |
| 🔒 `GET /corridas?filtro=todas\|finalizadas\|canceladas\|andamento&de=AAAA-MM-DD&ate=AAAA-MM-DD` | — | lista filtrada |

A corrida do passageiro agora traz também:
- `motorista`: `{ nome, foto, nota, viagens, veiculo, cor, placa, telefone }`;
- `distanciaMotoristaKm` e `minutosMotorista` (estimados);
- `chegando`: boolean, menos de 500 m;
- `valorOferecido`, `opcionais` e `mensagensNaoLidas`.

## Motorista

| Rota | Corpo | Resposta |
|---|---|---|
| 🔒 `GET /corridas-abertas` | — | `{ disponiveis: [...], pendentes: [...], programadas: [...] }`. **Disponíveis**: corridas procurando motorista dentro do raio, que ele pode pegar (aceitar direto ou mandar contra-oferta). **Pendentes**: as dele que ainda não começaram. **Programadas**: agendadas que ele pode assumir antes da hora. |
| 🔒 `POST /corridas/:id/pegar` | — | Aceita uma disponível ou programada, se ainda estiver livre. |
| 🔒 `POST /corridas/:id/contraoferta` | `{ valor }` | Manda a contra-oferta ao passageiro. Vale 60 s. |
| 🔒 `GET /ofertas` | — | A chamada atual agora traz também: `valorOferecido`, `opcionais`, a `nota` e as `viagens` do passageiro, `observacao`, `paradas`, `agendadaPara`, `minutosAteEmbarque`, `distanciaViagemKm` e o **valor**, calculado no servidor: `valorBruto`, `taxaCentral` (comissão da categoria: percentual ou valor fixo; vale também a regra do motorista, se ele tiver uma própria), `valorLiquido = valorBruto − taxaCentral` e `ganhoPorKm` (líquido ÷ km da viagem). A contra-oferta continua sendo em valor bruto, e o app mostra o líquido correspondente. |
| 🔒 `POST /macaneta` | `{ modo: "taximetro"\|"destino", categoria, destino?: Ponto, lat, lng, passageiro?: { nome, telefone } }` | Cria a corrida de rua já com ele e já **em andamento** (canal "Maçaneta"). |
| 🔒 `POST /posicao` | (já existia) | Na Maçaneta em modo taxímetro, soma a distância percorrida (ignora saltos acima de 300 m em 5 s). |
| 🔒 `POST /corridas/:id/status` finalizada | | Na Maçaneta com taxímetro, o valor sai da distância percorrida e do tempo, pela tarifa da categoria. |
| 🔒 `GET /ganhos?periodo=mes&mes=AAAA-MM` ou `periodo=semana` | — | `{ total, viagens, minutosOnline, minutosEmViagem, porDia: [{ dia, valor }], porPagamento: [{ pagamento, valor, corridas }], viagens: [{ id, os, em, valor, passageiro, pagamento, embarque, destino }] }` |
| 🔒 `GET /cadastro` | — | `{ dados: { nome, cpf, telefone, email, nascimento, genero, chavePix }, endereco: { cep, rua, numero, semNumero, complemento, bairro, uf, cidade }, foto, situacao, pendencias: [texto] }` |
| 🔒 `POST /cadastro/dados` e `POST /cadastro/endereco` | os campos acima | o mesmo do GET |
| 🔒 `GET /cep/:cep` | — | `{ rua, bairro, cidade, uf }` pela base de endereços (CNEFE), quando houver. Sem base: 404 e o app deixa preencher à mão. |
| 🔒 `GET /veiculos` | — | `{ veiculos: [{ id, modelo, placa, cor, ano, cnh, validadeCnh, ativo, situacao }] }` |
| 🔒 `POST /veiculos` e `POST /veiculos/:id` | `{ modelo, placa, cor, ano, cnh, validadeCnh }` | `{ veiculos }`. Placa no padrão antigo ou Mercosul. |
| 🔒 `POST /veiculos/:id/ativar` e `POST /veiculos/:id/excluir` | — | `{ veiculos }` |
| 🔒 `GET /documentos` | (já existia) | Os tipos agora são: `cnh` (CNH frente e verso), `residencia`, `crlv`, `lateralEsquerda` e `lateralDireita`. |
| 🔒 `GET /preferencias` e `POST /preferencias` | também `pagamentos: [texto]` (os que aceita) e `filtros: [ids de opcionais]` (o que oferece) | |
| 🔒 `GET /suporte` | — | `{ mensagens: [{ id, de: "eu"\|"central", texto?, audio?, em }] }`: chat com a central |
| 🔒 `POST /suporte` | `{ texto }` | `{ mensagem }`. Aceita áudio pelo mesmo jeito do chat da corrida: `POST /suporte/audio`. |
| 🔒 `GET /contatos` | — | `{ whatsapp, telefone, site, termosUrl, privacidadeUrl }`, da marca da empresa |

## Comissão da central (por categoria)

- **Onde fica:** em Categorias, no painel, há dois campos novos: "Comissão da central", com o tipo (percentual ou valor fixo) e o valor. Se o motorista tiver uma regra de cobrança própria (Personalizado ou Isento), ela vale no lugar.
- **Cálculo:** `taxaCentral = percentual × bruto ÷ 100` ou o valor fixo, sem passar do valor bruto. `valorLiquido = bruto − taxa`. Os valores são arredondados em centavos.
- **Teste:** o cálculo tem teste próprio (percentual, valor fixo, isento, motorista com regra própria e arredondamento).

## Despacho com valor oferecido

- **Oferta:** a corrida vai para os motoristas com o `valorOferecido`. Cada motorista pode **aceitar** pelo valor ou mandar **contra-oferta**.
- **Contra-oferta:** aparece para o passageiro, que escolhe uma. A primeira aceita leva a corrida. As outras recebem o aviso "oferta encerrada".
- **Filtros:** um motorista que não oferece um opcional pedido não recebe a corrida. Um motorista que não aceita a forma de pagamento escolhida também não recebe.

## Painel (central)

- **Motoristas aguardando aprovação:** a tela mostra os dados, a foto, o endereço, o veículo e os documentos, com os botões Aprovar e Recusar (com motivo).
- **Chat de suporte:** lista de conversas com motoristas e passageiros, para responder com texto.
- **Configurações dos apps:** motivos de cancelamento, etiquetas de avaliação, opcionais e os contatos (WhatsApp, telefone, site, links de termos e privacidade).

## Como ficou na implementação (servidor)

O que difere do texto acima ou foi acrescentado. O código está em `painel/src/apps/` (`v2.ts`, `perfil.ts`, `suporte.ts`, `comissao.ts`, `ajustes.ts`, `despacho.ts`).

- **`GET /ganhos?periodo=...`:** a chave `viagens` é o **número** de viagens, e a lista das viagens vem em `lista` (também em `realizadas`, com o mesmo conteúdo). Sem `periodo`, devolve o resumo simples de antes (`hoje`, `semana`, `mes`, `ultimas`).
- **Chamada (`GET /ofertas`, evento `oferta` e `estado`):** os valores vêm planos na chamada **e** dentro de `corrida`: `valorBruto`, `taxaCentral`, `valorLiquido`, `ganhoPorKm`, `valorOferecido`, `opcionais` (nomes), `nota` e `viagens` do passageiro, `minutosAteEmbarque` e `distanciaViagemKm`. Vem também `regraComissao` (`{ tipo: "Percentual" | "Valor fixo" | "", valor }`), para o app mostrar o líquido de uma contra-oferta (o valor que o motorista digita é bruto). `valorBruto` já é o que o passageiro paga (valor oferecido menos o desconto do cupom).
- **Comissão:** lida pelo adaptador `apps/comissao.ts`. Categoria: `comissaoTipo` (`Percentual` ou `Valor fixo`) e `comissaoValor`. Motorista: `cobranca` (`Padrão`, `Personalizado` ou `Isento`), `cobrancaTipo` e `cobrancaValor`. Quando o painel trouxer o cálculo dele, troca-se só o corpo de `calcularComissao`.
- **Tempo real:** novos eventos `contraoferta` (para o passageiro), `contraoferta_encerrada` (para os outros motoristas) e `suporte` (resposta da central).
- **Novas rotas:** `GET /mensagens-rapidas`, `POST /corridas/:id/chat/lida` (zera `mensagensNaoLidas`), `GET /suporte/nao-lidas`, `GET /suporte/audio/:id`.
- **Login:** o motorista com cadastro "Aguardando aprovação" entra, mas `POST /online` recusa até a central aprovar. Quem cria conta já sai logado (`token`).
- **Esqueci a senha:** quem não tem conta recebe a mesma resposta (`{ enviado: true }`). Conta criada pela central, sem senha, entra pelo código ou cria a senha por aqui.
- **Limites por IP e por hora:** `APPS_CADASTROS_POR_IP` (cadastros, padrão 10) e `APPS_CODIGOS_POR_IP` (códigos, padrão 30). Senha: 8 erros em 10 minutos por login.
- **Painel (central, em `/api/apps-central`):** `GET /aprovacoes`, `POST /aprovacoes/:id/aprovar` (recusa se faltar item, a menos que `forcar: true`) e `POST /aprovacoes/:id/recusar` (`motivo`). Chat de suporte: `GET /suporte`, `GET` e `POST /suporte/:papel/:chave`, `GET /suporte/:papel/:chave/audio/:audio`. Foto: `GET /foto/:papel/:chave`.
- **Ajustes dos apps:** motivos de cancelamento, etiquetas, opcionais, formas de pagamento e mensagens rápidas têm padrão no código e podem ser trocados por empresa em `DADOS_DIR/empresas/<id>/apps/ajustes.json` (`apps/ajustes.ts`). Os contatos vêm da marca (`textos.suporteWhatsapp`, `suporteTelefone`, `suporteSite`, `termosUrl` e `privacidadeUrl`).
- **Veículos:** ficam no perfil do motorista; o veículo ativo é copiado para o cadastro de Motoristas (modelo, placa, ano e CNH), que é o que a central vê.
