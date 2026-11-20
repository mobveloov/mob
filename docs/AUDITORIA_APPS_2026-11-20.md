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
