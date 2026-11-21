# Auditoria dos apps, 20/11/2026

Feita no navegador em tamanho de celular (375×812) contra uma cópia dos dados do ambiente de teste, e pela suíte automática. **Não abri o emulador Android**: o emulador `VeloovTest` não iniciou nas rodadas anteriores. Tudo que depende de aparelho (GPS com a tela apagada, sons, vibração, notificações, câmera, gravação, serviço em primeiro plano) continua **sem teste real**.

## O que corrigi

| # | Achado | Correção |
|---|---|---|
| 1 | Ícones dos apps eram o logo genérico | Ícones oficiais recortados do arquivo do dono: `tenants/up-corridas/assets/icone-motorista.png` e `icone-passageiro.png`. O build usa o ícone do papel (`arquivos.iconeMotorista` / `iconePassageiro` do `brand.json`); sem ele, vale o ícone da empresa (`iconeApp`), então outras empresas seguem funcionando. O ícone adaptativo do Android usa fundo preto e o desenho no centro. |
| 2 | Folha "Passageiro" do motorista: foto virava oval enorme sobre o nome | Foto redonda de 88 px fixos (largura, altura e proporção travadas), nome embaixo, sem sobrepor (`motorista-m.css`). Verificado só pelo CSS; não abri uma corrida real com foto. |
| 3 | Motorista sem botão de claro/escuro no mapa | Botão sol/lua no mapa inicial (Automático → Claro → Escuro), além de Ajustes › Tema do Aplicativo. "Sistema" agora se chama "Automático". Testado no navegador. |
| 4 | Passageiro sem opção de tema | Conta › Automático / Claro / Escuro, escolha guardada no aparelho (`comum/tema.ts`). Modo escuro do passageiro criado (variáveis de cor com `!important`, porque a marca da empresa grava as cores direto no `<html>`). Testado nas telas Início e Conta. |
| 5 | Painel mostrava "APP OFF" com o app instalado | O app manda `GET /ping` ao abrir e a cada 4 minutos; todo pedido com token também conta. O servidor guarda o último contato (tabela `app_contatos`) e o painel (`gestao/motoristas.ts`) passa a considerar o app instalado se falou nos últimos 7 dias, além de expor `diagnostico.ultimoContato`. Teste automático incluído. **Precisa do painel de produção reconstruído** para valer. |

## Já estava certo (conferido no código)

- Documentos exigidos: a lista de "Documentos padrão" em Configurações Gerais › Motorista vem do servidor (`gerais(...).motorista.documentos`, campo `exigir`). `pendenciasDoMotorista` cobra cada documento marcado, mais as laterais do veículo, e a central só aprova com tudo (a menos que use "aprovar mesmo assim").
- Endereço e veículo do app vão para os mesmos campos do cadastro do painel: `cep, rua, numero, complemento, bairro, cidade, uf` e, do veículo ativo, `veiculo` (modelo e cor), `placa`, `anoVeiculo`, `cnh`, `validadeCnh`.

## O que não deu para fazer ou testar

- **Marca do veículo**: o cadastro do painel só tem o campo `veiculo` (texto livre); não existe "marca" separada. O app grava "modelo cor". Separar marca exige um campo novo no painel; combinar com a sessão do painel.
- **Bloquear o fim do cadastro no app** até enviar todos os documentos: hoje o app mostra o que falta (`pendencias`) e a central não aprova sem eles, mas não há um botão "Enviar para análise" com validação própria no servidor.
- Passada completa por todas as telas dos dois apps (cadastro, pedir corrida, aceitar, chat, cancelar, carteira, histórico, ajustes, mapa) com dados reais: só vi Início e Conta do passageiro e o Início do motorista. O restante está coberto pelos testes automáticos, não por olhos.
- O mapa de fundo não carrega no navegador de teste (sem tiles em alguns momentos); não deu para conferir pinos e rotas visualmente.
- Redesenho amplo (item 6 do pedido): só fiz o que o pedido exigia (tema escuro do passageiro, botões do mapa). Um polimento geral de espaçamento e tipografia continua pendente.

## Segunda rodada (mesmo dia)

| Item | O que foi feito | Como foi provado | O que só se testa em aparelho |
|---|---|---|---|
| Tela sempre ligada | `MainActivity` dos dois apps liga `FLAG_KEEP_SCREEN_ON` ao abrir e em cada `onResume`; Wake Lock da web reaplicado a cada 30 s. Causa: o APK do passageiro não tinha plugin nativo. | Compila no build do APK. | Deixar o app parado além do tempo de tela. |
| Toques | 3 toques do motorista em laço, sons suaves do passageiro (`scripts/gerar-toques.mjs`). | RMS e duração medidos nos arquivos. | Ouvir dentro do carro. |
| Notificação fixa "Você está online" + botão Ficar offline | `PosicaoService` ganhou a ação `FICAR_OFFLINE`: avisa `/offline`, fecha a bolha e para o serviço. | Compila no build do APK. | Tocar o botão com o app fechado. |
| Chamada por cima de tudo | Plugin `ofertaTelaCheia`: acorda a tela, notificação de chamada com full-screen intent e, com "Exibir sobre outros apps", abre o app direto. `pararSons()` cancela. | Compila no build do APK. | Tudo: tela bloqueada, outro app aberto, Android 14. |
| Permissões passo a passo | `Permissoes.tsx` + plugin `permissoes()/abrir()`: localização o tempo todo, notificações, exibir sobre outros apps, bateria (essenciais), tela cheia (opcional) e início automático por fabricante. Abre sozinho na primeira vez; sem as essenciais o motorista não fica online. | Tipos e build. Tela vista no navegador só como "explicação" (sem plugin). | Estados OK/Falta e os atalhos de cada fabricante. |
| Concluir cadastro | A rota `/cadastro/concluir` e o bloqueio por documentos obrigatórios vieram da sessão do painel e já estão no app web do motorista (`Cadastro.tsx`). | Testes da sessão do painel. | Fluxo completo no APK. |
| Personalização do painel | O motorista agora lê `/personalizacao` (ao entrar, a cada 60 s e ao voltar): cor principal e nome. O passageiro já lia (sessão do painel). | tsc e suíte (640 testes). | Ver a cor mudar no aparelho. |
| Respiro e toque (Ajustes, Conta, Carteira, formulários) | Linhas com 56 px de altura mínima, divisores, quebra de texto, interruptores com área de toque de 48 px, campos de 48 px, folga para o teclado. | CSS revisado; não passei pelas telas em 360×640 com fonte grande no navegador. | Fonte do sistema aumentada. |

### Ainda fixo nos apps (não vem do painel)

- Lista de lembretes da folha aberta do mapa do motorista (`AvisoDoMotorista` em `Pecas.tsx`).
- Lista de problemas do botão "Avisar um problema" (`PROBLEMAS` em `Corrida.tsx`).
- Valor mínimo de R$ 10,00 na retirada e no depósito (`Telas.tsx`, `Atividades.tsx`).
- Perguntas e respostas da tela "Taxa de aceitação" (`Atividades.tsx`).
- Lista de fabricantes que pedem início automático (`Permissoes.tsx`).
- Personalização do passageiro: faltam ordem dos recursos, cupons, anúncio, desafio, marca no topo e layout Flutuante (lista em `docs/APPS_PERSONALIZACAO.md`).

## Menu lateral do motorista: cabeçalho cortado (corrigido de verdade)

**Causa real** (reproduzida no navegador em 360×640 com fonte grande): `.menu-lateral > div` é uma coluna flex de altura fixa e **todos os filhos encolhiam** (`flex-shrink: 1`). O cabeçalho amarelo era espremido a ~50 px (nome e foto cortados) e os itens da lista se sobrepunham. Não era só padding da barra de status.

**Correção** (`motorista-m.css`): filhos do menu com `flex-shrink: 0`, cabeçalho com `flex: none` e altura mínima, foto de 64 px redonda e fixa, nome e veículo/placa com quebra de linha, X em coluna própria; topo e rodapé com `max(env(safe-area-inset-*), 28px)` (no Android o `env()` pode vir zero); o menu rola quando não cabe.

**Provas** em `docs/evidencias/`: `menu-motorista-1-antes-360x640-fonte20.jpg` (antes: cabeçalho espremido e itens sobrepostos, igual à captura do dono), `...-2-depois-360x640-fonte20.jpg`, `...-3-depois-rodape.jpg` ("Termos de uso", "Sair da conta" e a versão com folga embaixo) e `...-4-depois-412x915.jpg`. A foto real não foi testada (a conta de teste não tem foto; o CSS trava 64×64 e `object-fit: cover`). A área segura de um notch alto foi coberta pelo mínimo de 28 px, não simulada.
