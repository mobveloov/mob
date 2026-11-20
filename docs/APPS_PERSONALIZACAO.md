# Personalização do app do passageiro (painel para o app)

Seção para juntar depois em `docs/APPS_DADOS_DO_PAINEL.md`.

Onde se muda: painel > Configurações > Personalização app passageiro (só administrador).
A Machine só tem personalização do app do passageiro. Não existe tela igual para o motorista, então não há rota `/personalizacao-motorista`.

## Rota do app

`GET /api/apps/:empresa/personalizacao` (com o token do app; vale para os dois apps).
Devolve tudo já normalizado e com padrão. O app aplica ao vivo, sem gerar APK.

| Campo | O que é | Origem no painel |
|---|---|---|
| `versao` | Código curto; muda quando qualquer coisa muda | automático |
| `empresa.nome` | Nome que o cliente vê | Geral > Nome |
| `empresa.nomeExibido`, `logoClaro`, `logoEscuro`, `icone` | Marca da empresa (URLs) | Marca e aparência |
| `cores.principal` | Cor principal (#rrggbb, uma das 36 da grade) | Geral > Cor principal |
| `cores.textoSobrePrincipal` | Branco ou preto, o que lê melhor sobre a principal | calculado |
| `cores.escura`, `cores.clara` | Tons da principal (70% e mistura com branco) | calculado |
| `cores.paleta` | As 36 cores | fixo |
| `design.estiloTela` | `flutuante`, `neutro` ou `marcante` | Tela inicial > Estilo da tela |
| `design.marca` | `texto`, `imagem`, `texto_imagem`, `imagem_alongada` | Tela inicial > Sua marca |
| `design.mostrarNome`, `mostrarImagem` | Já resolvido a partir do modo da marca | calculado |
| `design.imagemMarcaUrl` | Imagem da marca (PNG/JPG até 5 MB) | envio na tela |
| `design.dimensoesImagem` | 184x52 (alongada) ou 52x52; nulo se só nome | fixo |
| `veiculoMapa.id` / `tipo` | `realista`=2, `moderno`=1, `classico`=0 | Geral > Veículo no mapa |
| `veiculoMapa.iconeLivreUrl` / `iconeOcupadoUrl` | SVG do carro por URL (sem token) | gerado pelo servidor |
| `veiculoMapa.diferenciaOcupado` | `false` no Realista (livre e ocupado iguais) | regra da Machine |
| `veiculoMapa.iconeAlternativoUrl` | Ícone Moderno, usado no Realista quando a rota passa do limite de recálculo | regra da Machine |
| `telaInicial.recursos` | `[{id, visivel, posicao}]` em ordem: mapa, destino, cupons, anuncio, desafio | Recursos |
| `telaInicial.ordemVisiveis` | Só os visíveis, na ordem | calculado |
| `telaInicial.mapaFixo` | `true` no estilo Flutuante (mapa sempre visível e primeiro) | regra da Machine |
| `recursos.{mapa,destino,cupons,anuncio,desafio}` | Ligado ou desligado | Recursos |

Também saem sem token: `GET /api/apps/:empresa/personalizacao/icone/:veiculo/:estado.svg` (veículo: realista, moderno, classico; estado: livre, ocupado) e as imagens em `/api/publico/arquivo/:empresa/:nome`.
A resposta também vai dentro de `GET /api/apps/:empresa/config` (campo `personalizacao`, formato do painel).

## Rotas do painel (`/api/config`)

- `GET /personalizacao` e `PUT /personalizacao` (nome obrigatório; marca com imagem exige imagem enviada).
- `POST /personalizacao/imagem` (corpo = arquivo PNG ou JPG, até 5 MB) e `DELETE /personalizacao/imagem`. Vale na hora, como na Machine. A imagem fica em arquivo da empresa (antes ia dentro do JSON).

## O que os apps web já leem (passageiro)

Lê ao entrar, a cada 60 s e ao voltar para o app; guarda a última no aparelho.

- Cores: `--cor`, `--cor-texto`, `--cor2`, `--cor-clara` e `theme-color`.
- Nome: vale como nome do app (título e textos).
- Ícone do carro no mapa: do motorista na corrida e dos carros livres por perto (carro; moto segue com o desenho padrão).
- Tela inicial: estilo (classe `estilo-*`: neutro e marcante mudam o topo) e recursos Mapa e Seleção do destino ligados ou desligados.

## Pendente para a sessão dos apps

- Tela inicial: ordem dos recursos; bloco "Aviso de cupons disponíveis"; bloco "Anúncio" (carrossel); bloco "Desafio" (hoje sempre bloqueado: falta definir qual desafio de cliente o libera).
- Sua marca: mostrar a imagem/nome no topo da tela inicial conforme `design.marca` (hoje o topo mostra saudação e foto).
- Estilo Flutuante com folha deslizante sobre o mapa, como na pré-visualização do painel (hoje o app tem só um layout).
- Ícone do carro ocupado e troca para Moderno ao passar do limite de recálculo (precisa do estado "ocupado" no mapa).
- Tela de entrada (antes do login): a rota exige token, então só usa o último valor guardado no aparelho. Se o dono quiser as cores certas já na tela de entrada na primeira abertura, falta uma versão pública (só cores, nome e logo).
- App do motorista: não aplica a personalização (é do passageiro na Machine). Decidir se ele deve usar ao menos a cor principal.
- Confirmação "Personalizado" ao salvar (a Machine mostra um aviso de plano Ultra): não existe plano aqui, não feito.
