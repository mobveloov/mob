# Totem e Solicitar corrida (fase 5)

O totem é uma tela de pedido de corrida em tela cheia, com a marca da empresa, para recepções, hotéis e pontos fixos.
A tela "Solicitar corrida" é a mesma coisa para o operador da central, com atribuição de motorista.

As duas usam as **corridas próprias do painel** (`painel/src/corridas/`). O painel é o sistema da empresa:
nenhuma chave de sistema externo, nenhuma integração obrigatória. Categorias e preço vêm do cadastro
"Categorias e tarifas"; motoristas do cadastro "Motoristas"; o passageiro entra sozinho no cadastro "Passageiros".

## Como funciona

1. O admin cadastra um **local** em Atendimento › Totem: nome, endereço fixo de embarque (com latitude e longitude
   opcionais), categorias que aparecem (nenhuma marcada = todas as ativas), formas de pagamento e **senha**.
2. O aparelho abre `https://<painel>/totem/<empresa>/<local>`. A primeira tela já vem com a marca da empresa e pede a
   senha do local. Com a senha certa, o aparelho guarda uma chave e não pede mais.
3. O passageiro toca em **Pedir corrida** → destino (ou "vou dizer ao motorista") → categoria com preço "a partir de"
   → pagamento → nome e celular → confirmação.
4. A corrida nasce com canal "totem" e status "Procurando motorista". A central vê em Solicitar corrida (e no Totem),
   atribui o motorista e avança o status. O totem mostra o status, o nome do motorista, o carro e a placa.
5. O passageiro pode cancelar no totem enquanto a corrida não começou (até 3 horas depois do pedido).
6. Fim da corrida (ou cancelamento): o totem volta sozinho para o início em 30 segundos.

Passos com uma opção só (uma categoria, uma forma de pagamento) são pulados. Sem categorias cadastradas, o totem
pede sem categoria e sem preço.

## Regras de segurança

- **Senha por local**, guardada só como hash (scrypt). A chave do aparelho é um HMAC do local feito com o hash:
  trocar a senha desativa todos os aparelhos daquele local. No máximo 8 tentativas de senha a cada 10 minutos.
- O totem **só vê e só cancela as corridas que ele mesmo pediu** (últimas 12 horas). Não recebe telefone do
  motorista nem de outros passageiros.
- Pedido repetido (toque duplo, rede que caiu) com o mesmo `pedidoId` devolve a mesma corrida. O módulo de corridas
  também barra um segundo pedido do mesmo passageiro com corrida em aberto. Limite de 10 pedidos a cada 10 minutos
  por local.
- Passageiro bloqueado ou suspenso no cadastro não pede pelo totem.
- Rotas internas: empresa sempre de `req.ctx.empresaId`. Cadastrar, editar, remover e recarregar local é só admin.
- Local desligado ou empresa desativada: o totem mostra "Totem não encontrado".

## Recarregar remoto

Salvar o local ou clicar em **Recarregar totem** sobe a versão do local. O totem pergunta a versão a cada 60 segundos
e recarrega só quando está na tela inicial (nunca no meio de um pedido). No meio do pedido, 90 segundos sem toque
voltam para o início.

## Arquivos

| Arquivo | O que é |
|---|---|
| `painel/src/totem/rotas.ts` | `rotasTotem` (Express): rotas públicas do totem e internas da central |
| `painel/src/totem/dados.ts` | Locais e corridas do totem em `DADOS_DIR/empresas/<id>/totem/` |
| `painel/src/web/totem/Totem.tsx` | Página `/totem/:empresa/:local` (tela cheia, marca da empresa) |
| `painel/src/web/totem/SolicitarCorrida.tsx` | Tela do operador: pedir, atribuir motorista, status, finalizar, cancelar |
| `painel/src/web/totem/LocaisTotem.tsx` | Cadastro dos locais, link, recarregar e corridas do totem |
| `painel/src/web/totem/index.tsx` | Exporta `Totem`, `SolicitarCorrida` e `LocaisTotem` |
| `painel/test/totem.test.ts` | Testes (senha, isolamento entre empresas, pedido, acompanhar, cancelar, recarregar) |

Dados por empresa (fora do Git): `locais.json` (locais, senha só como hash) e `corridas.json` (qual local pediu cada
corrida). A corrida em si fica em `empresas/<id>/corridas.json`, do módulo de corridas.

## Rotas

Públicas (sem login; depois de `entrar`, cabeçalho `X-Totem-Chave`):

| Rota | O que faz |
|---|---|
| `GET /api/totem/publico/:empresa/:local` | Marca e nome do local (sem chave) |
| `POST .../entrar` `{ senha }` | Devolve a chave do aparelho |
| `GET .../config` | Endereço fixo, pagamentos, categorias com preço, versão |
| `GET .../versao` | Versão do local (recarregar remoto) |
| `POST .../corridas` | `{ pedidoId, destino{texto} \| semDestino, categoria, pagamento, nome, telefone }` |
| `GET .../corridas/:id` | Status, motorista, carro, valor e se pode cancelar |
| `POST .../corridas/:id/cancelar` | Cancela (só antes de começar, até 3 h) |

Internas (com login): `GET/POST /api/totem/locais`, `PUT/DELETE /api/totem/locais/:id`,
`POST /api/totem/locais/:id/recarregar`, `GET /api/totem/opcoes` (categorias com preço, motoristas ativos,
pagamentos, locais), `GET /api/totem/corridas?canal=` (em aberto e últimas 24 h). Pedir, atribuir motorista, mudar
status e cancelar pela central usam `/api/corridas-proprias` (módulo de corridas).

## Como ligar no painel (sessão Base)

`painel/src/servidor/index.ts` — import no topo e registro **antes** de `app.use("/api", exigirLogin)` (as rotas
públicas do totem não têm login; as internas chamam `exigirLogin` sozinhas):

```ts
import { rotasTotem } from "../totem/rotas.ts";
// ...
app.use("/api/totem", rotasTotem);   // logo antes de: app.use("/api", exigirLogin);
```

`painel/src/web/main.tsx` — a página do totem fica fora do `App` (sem login e sem menu):

```tsx
import { Route, Routes } from "react-router-dom";
import { Totem } from "./totem";
// dentro de <BrowserRouter>:
<Routes>
  <Route path="/totem/:empresa/:local" element={<Totem />} />
  <Route path="*" element={<App />} />
</Routes>
```

`painel/src/web/App.tsx` — telas no `PAGINAS`:

```tsx
import { LocaisTotem, SolicitarCorrida } from "./totem";
// em PAGINAS:
solicitar: <SolicitarCorrida />, totem: <LocaisTotem />,
```

`painel/src/comum/funcoes.ts` — `solicitar` e `totem` com `situacao: "pronto"` (e sem o `falta`).

## PWA

O totem abre em qualquer navegador e pode ser instalado como app (PWA). Hoje o `/manifest.webmanifest` tem
`start_url: "/"`. Para o ícone instalado abrir direto o totem, a Base pode aceitar `?inicio=/totem/<empresa>/<local>`
no manifest (validar que começa com `/totem/`) e o `Totem.tsx` passa a apontar o link do manifest para ele.

## APK do totem

Use o mesmo `scripts/build-app-empresa.mjs`, numa pasta de empresa só para o totem (um app por local, ou um para
todos os locais com a mesma URL):

1. Em Marca e aparência, baixe o `brand.json` da empresa.
2. Crie `tenants/<empresa>-totem/brand.json` (copie o da empresa) e troque só o bloco `app`:
   ```json
   "app": { "nome": "Totem Rota Norte", "pacote": "br.com.rotanorte.totem", "urlPainel": "https://painel.rotanorte.com.br/totem/rota-norte/hotel-praia" }
   ```
   O pacote precisa ser diferente do app do painel (os dois podem ficar instalados no mesmo aparelho).
3. Copie os arquivos da marca para `tenants/<empresa>-totem/assets/` e gere:
   ```bash
   node scripts/build-app-empresa.mjs rota-norte-totem --apk
   ```
4. No aparelho, abra o app, digite a senha do local uma vez e deixe o aparelho fixo na tela (fixar tela do Android).

O script hoje gera um app comum (abre a URL em tela cheia). Para um **modo quiosque** de verdade, a mudança sugerida
no script (sessão Base, não feita aqui): aceitar `--totem`, que no projeto Android gerado (a) liga o modo imersivo
(esconde barras), (b) chama `startLockTask()` na abertura (fixar tela) e (c) mantém a tela acesa
(`FLAG_KEEP_SCREEN_ON`). A senha para sair do modo quiosque pode ser a mesma senha do local.

## Testar no navegador

```bash
cd painel && npm run dev
```

Entre como admin, cadastre categorias (Categorias e tarifas), um motorista ativo e um local em Totem. Abra o link do
local em outra aba, digite a senha e peça uma corrida. Em Solicitar corrida, atribua o motorista e avance o status: o
totem acompanha em até 5 segundos.

## Falta (próximas fases)

- Aviso por WhatsApp ao passageiro (opcional), pelo número da própria empresa (fase 4, bot).
- Busca de endereço com sugestões e coordenadas (hoje o destino é texto; com latitude e longitude no local e no
  destino o preço já sai pela distância).
- Vínculo do aparelho (um aparelho por local) e senha para fechar o app.

## O que veio do sistema de referência (14/11/2026)

A tela do totem agora segue a do sistema de referência (com endereço fixo de embarque):

1. **Primeira tela:** nome completo, telefone, destino (opcional) e forma de pagamento, botão **Solicitar corrida**.
   Mensagens de erro iguais: "Digite seu nome completo", "Digite um telefone válido com DDD", "Selecione a forma de pagamento.".
2. **Escolha sua viagem:** origem e destino ("A definir pelo motorista"), categorias disponíveis (uma só: botão direto) e a forma de pagamento escolhida.
3. **Acompanhamento** (já existia).
4. **Totem bloqueado:** fechar ou recarregar a página pede a senha do local ("Digite a senha para fechar o aplicativo", "Senha incorreta", "Cancelar e continuar usando").
5. **Tela sempre acesa** (wake lock) e recarregar remoto só com a primeira tela vazia.

Diferenças: o preço aparece como estimativa (o painel calcula pelas tarifas); sem a ponte do app Android (senha de fechamento nativa).
Arquivos: `web/totem/Totem.tsx` (reescrito), `web/totem/Bloqueio.tsx` (novo).

## Totens & Preços, App do Totem e aparelho vinculado (14/11/2026, segunda leva)

- **Tela Totens & Preços** (Bot & Totem): abas "Totens & Locais" e "Preços" (só admin). O local ganhou endereço (slug) escolhido na criação,
  cidade e UF, imagem do topo e do rodapé (quadro 18:5, até 2 MB, PNG/JPG/WEBP), modo WhatsApp (individual ou compartilhado),
  ativar/desativar, excluir (apaga as imagens), copiar link, abrir, recarregar e "Baixar app".
- **Preços por totem**: tabela própria (taxa base, por km, por minuto, corrida mínima, tempo de espera, ordem, ativa), multiplicador (surge) e
  "Copiar para todos os totens". O nome da categoria precisa existir em Categorias e tarifas. Com tabela, o totem mostra a dela e a corrida
  nasce com o valor prefixado (com distância quando há coordenadas; sem destino no mapa vale a corrida mínima). Sem tabela, valem as tarifas da empresa.
- **Aparelho vinculado**: o primeiro aparelho que digita a senha fica com o link; outro vê "Acesso Negado". O admin libera em "Limpar Dispositivo".
- **WhatsApp do totem**: individual usa uma instância só dele (nome do bot + local) no servidor do bot; conectar por QR na lista de locais.
  Sem WhatsApp conectado o totem mostra "Totem indisponível no momento" e volta sozinho. Sem servidor configurado (simulado) tudo funciona sem chave.
  Antes de pedir, o totem confere se o telefone tem WhatsApp ("Esse número não foi encontrado no WhatsApp. Confira o telefone."); se não der para conferir, segue.
- **App do Totem**: baixa a versão ativa mais nova do APK. O dono da plataforma publica o endereço (https) das versões nessa mesma tela.
- Rotas novas: `/locais/:id/imagem/:tipo`, `/locais/:id/aparelho`, `/locais/:id/precos`, `/locais/:id/whatsapp[/conectar|/desconectar]`,
  `/apk`, `/apk/versoes`, `POST /publico/:empresa/:local/whatsapp/existe`, `POST /webhook/:empresa/:local` (aceita e ignora).
- Testes: `painel/test/totem-extras.test.ts`.

Diferenças em relação ao sistema de referência: a senha do totem fica só como hash (a tela não mostra a senha atual); o vínculo usa um
identificador gerado no aparelho; versões do APK guardam só o endereço do arquivo.

## Terceira leva: preços por cidade, endereços e prêmios (14/11/2026)

- **Preços por cidade** (Totens & Preços › Preços › Preços por cidade): três abas (dentro da cidade, locais, entre cidades), valor de dia, noite
  (com janela), faixas extras de horário, domingo, feriado e pedágio (por passagem, ida e volta ×2). Feriados nacionais calculados; os da empresa
  entram na lista. Hora de espera. Tarifa repetida é recusada (entre cidades vale nos dois sentidos). No totem, o destino digitado que cita um local
  da tabela ou uma cidade da tabela (a partir da cidade do local) vai com o valor fixo do horário + pedágio; a tela de escolha da viagem mostra esse
  preço (`POST .../cotacao`). Código: `src/totem/tarifas-cidade.ts`, teste `test/totem-tarifas-cidade.test.ts`.
- **Sugestões de endereço no destino**: botões grandes embaixo do campo; o endereço escolhido leva o ponto no mapa (`GET .../enderecos?q=`, só com a chave do aparelho, com limite).
- **Jogos de recompensa** (Totens & Preços › Jogos de recompensa): Roleta e Raspadinha. O passageiro recebe o link no WhatsApp da empresa e joga em
  `/p/<empresa>/<token>`; o link aberto `/premios/<empresa>/<roleta|raspadinha>` pede o telefone (só passageiro ativo do cadastro) e manda o link do jogo
  pelo WhatsApp (o link nunca volta na resposta). O sorteio é no servidor, uma jogada por convite; o prêmio vira um cupom do cadastro Cupons (uso único,
  só para aquele telefone) e também sai pelo WhatsApp. Admin: prêmios e chances, cores e textos, "Enviar agora", convite para um telefone, copiar o link.
  Código: `src/totem/premios-jogos.ts` (regras), `premios.ts` (convites, jogo, cupom), teste `test/totem-premios.test.ts`.
- **Gancho para o CRM**: `definirGanchoPremio(fn)` em `premios.ts` recebe cada prêmio ganho. Quando a aba Recompensas do CRM entrar no main, ela registra a função
  por essa interface, sem editar este módulo. Cartão fidelidade e pontos ficam com o CRM.

**Pendente:** senha de fechamento nativa do app Android (a ponte do app guarda a senha em SharedPreferences; exige build nativo e aparelho para testar);
envio automático dos convites por horário (os dias, horários e a regra `horarioVencido` já estão prontos; falta o agendador do CRM chamar `enviarAgora`);
resposta do bot à pergunta de preço usando a tabela de Preços por cidade (área do Bot).
