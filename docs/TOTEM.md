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
