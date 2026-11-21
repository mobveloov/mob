# Personalização dos apps (painel para o app)

Contrato para os apps (web e nativo). Seção para juntar depois em `docs/APPS_DADOS_DO_PAINEL.md`.

Onde se muda (só administrador):
- Configurações > Personalização app passageiro (igual à Machine).
- Configurações > Personalização app motorista (item nosso: a Machine só personaliza o app do passageiro).

Regra do dono: o logo no canto superior esquerdo dos dois apps vem da Personalização (imagem ou nome). Não existe imagem fixa dentro do app.

## Como o app lê

Os dois apps leem ao abrir (depois do login), a cada 60 s e quando voltam para a tela. Comparam `versao`: se mudou, aplicam na hora, sem gerar APK. Guardam a última resposta no aparelho para já abrir com as cores certas (a rota exige o token).

| App | Rota | Token |
|---|---|---|
| Passageiro | `GET /api/apps/:empresa/personalizacao` | qualquer app (usa o do passageiro) |
| Motorista | `GET /api/apps/:empresa/personalizacao-motorista` | só motorista (passageiro recebe 403) |

URLs de imagem e de ícone vêm relativas (`/api/...`): o app junta o endereço da API. Ícones do carro e imagens saem sem token.

## Passageiro: campos

| Campo | O que é |
|---|---|
| `versao` | Código curto; muda quando qualquer coisa muda |
| `empresa.nome` | Nome que o cliente vê (Geral > Nome) |
| `empresa.nomeExibido`, `logoClaro`, `logoEscuro`, `icone` | Marca da empresa (Marca e aparência) |
| `cores.principal` | #rrggbb, uma das 36 da grade |
| `cores.textoSobrePrincipal` | `#ffffff` ou `#111827`, o que lê melhor sobre a principal (a pré-visualização usa como "contraste escuro") |
| `cores.escura`, `cores.clara` | Tons da principal |
| `cores.paleta` | As 36 cores |
| `design.estiloTela` | `flutuante`, `neutro` ou `marcante` |
| `design.marca` | `texto`, `imagem`, `texto_imagem`, `imagem_alongada` |
| `design.mostrarNome`, `design.mostrarImagem` | Já resolvidos a partir de `marca` e da imagem enviada |
| `design.imagemMarcaUrl` | Imagem da marca (PNG/JPG até 5 MB); vazio se não há |
| `design.dimensoesImagem` | 184x52 (alongada) ou 52x52; nulo se só nome |
| `veiculoMapa.id` / `tipo` | `realista`=2, `moderno`=1, `classico`=0 |
| `veiculoMapa.iconeLivreUrl` / `iconeOcupadoUrl` | SVG 48x48 do carro |
| `veiculoMapa.diferenciaOcupado` | `false` no Realista (livre e ocupado iguais) |
| `veiculoMapa.iconeAlternativoUrl` | Moderno: usar no Realista quando a rota passa do limite de recálculo |
| `telaInicial.recursos` | `[{id, visivel, posicao}]` na ordem escolhida |
| `telaInicial.ordemVisiveis` | Só os visíveis, em ordem |
| `telaInicial.mapaFixo` | `true` no estilo Flutuante (mapa sempre visível e primeiro) |
| `recursos.{mapa, selecao_destino, aviso_cupons, anuncio, desafio}` | Ligado ou desligado (ids iguais aos da Machine) |
| `desafioLiberado` | `false` enquanto não existir desafio para clientes (Cadastro > Desafios > Clientes); então `recursos.desafio` vem `false` |

Layout por estilo (como na pré-visualização do painel):
- Flutuante: topo com marca sobre o mapa; folha deslizante com saudação e blocos.
- Neutro e Marcante: cabeçalho com marca e saudação (Marcante em cor principal), depois os blocos na ordem, inclusive o mapa como bloco.

## Motorista: campos

Mesmos blocos `versao`, `empresa`, `cores`, `design`, `veiculoMapa` do passageiro, mais:

| Campo | O que é |
|---|---|
| `tema` | `sistema` (Automático), `claro` ou `escuro`: padrão da empresa. O que o motorista escolher no aparelho manda |
| `design.marca` | `texto` (iniciais/nome) ou `imagem` (logo redondo 52x52) para o canto superior esquerdo |
| `design.estiloTela` | `flutuante` (pílulas sobre o mapa), `neutro` (barra do topo na cor do tema), `marcante` (barra do topo na cor principal) |
| `recursos.saldo` | Pílula com os ganhos de hoje |
| `recursos.notificacoes` | Sino |
| `recursos.ajuda` | Botão de alerta (continua dependendo de Configurações > Gerais) |
| `recursos.tema` | Botão de aparência |
| `recursos.centralizar` | Botão de centralizar |
| `recursos.preferencias`, `recursos.macaneta` | Só aparecem com o motorista online |
| `recursos.iniciar`, `recursos.rodape` | Sempre `true` (fixos) |

## Rotas do painel (`/api/config`)

- Passageiro: `GET` e `PUT /personalizacao`; `POST` (corpo = arquivo PNG/JPG até 5 MB) e `DELETE /personalizacao/imagem`.
- Motorista: `GET` e `PUT /personalizacao-motorista`; `POST` e `DELETE /personalizacao-motorista/imagem`.
- Nome é obrigatório; marca com imagem exige imagem enviada. A imagem vale na hora ao enviar (como na Machine).

## O que os apps web já leem

Passageiro:
- Cores (`--cor`, `--cor-texto`, `--cor2`, `--cor-clara`, `theme-color`) e nome do app.
- Logo/nome no topo da tela inicial, conforme `design.marca` (e no login, se já houver o último valor guardado).
- Ícone do carro no mapa (carro do motorista na corrida e carros livres por perto).
- Estilo da tela inicial (neutro e marcante mudam o topo) e recursos Mapa e Seleção do destino ligados ou desligados.

Motorista:
- Cores, nome e título.
- Logo redondo do canto superior esquerdo (imagem da Personalização, ou iniciais do nome).
- Tema padrão da empresa (só enquanto o motorista não escolheu o dele).
- Ícone do veículo no mapa.
- Estilo do topo (neutro e marcante) e recursos saldo, sino, ajuda, aparência, centralizar, preferências e maçaneta.

## O que falta (sessão dos apps / app nativo)

- Passageiro: ordem dos recursos; blocos de cupons, anúncio e desafio; layout Flutuante com folha deslizante sobre o mapa; contador de cupons e sino no topo.
- Ícone de carro ocupado e troca para Moderno ao passar do limite de recálculo (precisa do estado "ocupado" no mapa).
- Cores já na tela de entrada na primeira abertura (a rota exige token): falta uma versão pública só com cores, nome e logo.
- Motorista: cor principal e tema aplicados nas telas internas além do mapa (hoje as telas usam `--cor`, mas o visual escuro/claro das telas do cadastro é próprio).
- Desafio para clientes não existe no painel; o recurso fica bloqueado até existir.
- O aviso de plano Ultra da Machine ao salvar não foi feito (não há planos aqui).
