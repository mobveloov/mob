# Endereços (CNEFE) e rota

O painel acha a rua e o número na base pública de endereços do IBGE, o **CNEFE**. Com isso, a corrida ganha um ponto no mapa, a distância e o preço.

Tudo isso é opcional. Sem a base, o endereço é digitado em texto livre e o preço sai sem distância.

## O que faz

- **Sugestões:** em "Solicitar corrida", o campo de endereço sugere rua, número, bairro e cidade.
- **Ponto no mapa:** a corrida criada no painel, no bot ou no totem ganha a coordenada do endereço, mesmo que ele tenha vindo só em texto.
- **Localização do WhatsApp:** quando o passageiro manda a localização, o painel coloca o endereço mais perto dela.
- **Distância e tempo:**
  - Com um servidor de rotas OSRM (`OSRM_URL`), a conta é pelas ruas.
  - Sem ele, a conta é em linha reta × 1,3, com 2,5 minutos por km.
- **Isolamento:** cada empresa só busca nas cidades que escolheu.

## Como ligar

1. Tenha a pasta do CNEFE com dois tipos de arquivo:
   - `_casas/<código UF>_<UF>.tsv.gz`, por exemplo `_casas/35_SP.tsv.gz`. Cada linha tem: município, número, rua, bairro, tipo, latitude e longitude, separados por tabulação. A última coluna é um código interno e não é usada.
   - `<código UF>_<UF>/<código do município>_<NOME>.zip`. Só o nome desses arquivos é usado, para dar nome às cidades.
2. Aponte a variável `CNEFE_DIR` para essa pasta, por exemplo `CNEFE_DIR=D:/CNEFE_Brasil`.
3. No painel, abra **Configurações → Endereços** e adicione as cidades atendidas.
4. Na primeira vez, o painel lê o arquivo do estado e guarda só a cidade em `DADOS_DIR/cnefe/<código>.json.gz`. Depois disso, a busca é na memória e leva poucos milissegundos.

Se quiser distância pelas ruas, aponte `OSRM_URL` para um servidor OSRM, por exemplo `OSRM_URL=http://localhost:5000`.

## No Docker

O `docker-compose.yml` monta a pasta do CNEFE só para leitura. Para usar:

```bash
CNEFE_PASTA=D:/CNEFE_Brasil docker compose up -d --build
```

## Rotas da API (com login)

| Rota | O que faz |
|---|---|
| `GET /api/enderecos/situacao` | Mostra se a base e o OSRM estão ligados e as cidades da empresa (pronta ou preparando). |
| `GET /api/enderecos/municipios?q=` | Procura cidades pelo nome. |
| `PUT /api/enderecos/config` | Salva as cidades atendidas. Só admin. Corpo: `{ "municipios": ["3550308"] }`. |
| `GET /api/enderecos/buscar?q=` | Sugere endereços. |
| `GET /api/enderecos/ponto?lat=&lng=` | Devolve o endereço mais perto de um ponto. |
| `GET /api/enderecos/rota?lat1=&lng1=&lat2=&lng2=` | Calcula a distância e o tempo. |

## Limites

- O número que não existe na base vira o número mais perto na mesma rua. Ele aparece como "número aproximado".
- O CNEFE não tem nomes de lugares, como "shopping" ou "rodoviária". Nesses casos, digite a rua.
- Memória: uma cidade pequena usa poucos MB. A capital de São Paulo (cerca de 2 milhões de endereços) pede perto de 1,3 GB no servidor, e a primeira preparação leva cerca de 1 minuto.
- Os nomes das cidades vêm sem acento (é assim no nome dos arquivos do IBGE).
- O código fica em `painel/src/enderecos/`. O teste fica em `painel/test/enderecos.test.ts` e usa uma base pequena inventada.

## Casas corrigidas (base extra, 13/11/2026)
Além do CNEFE, o painel aceita um arquivo de **correções**: casas e pontos de rua que o CNEFE não tem. Ficam no banco do painel (tabela `enderecos_correcoes`), valem para todas as empresas e só aparecem na busca das cidades que a empresa atende. Nenhuma ligação com outro sistema: só lê o arquivo que você entregar.
- **Formato (TSV):** `cod_municipio`, `numero`, `nome_logradouro`, `bairro`, `tipo`, `latitude`, `longitude` (número 0 = ponto da rua; linhas com # são comentário).
- **Importar:** `cd painel` e `npm run importar-casas -- caminho/do/arquivo.tsv` (pode repetir, não duplica). Ou, como dono da plataforma, `POST /api/enderecos/correcoes` com `{ "conteudo": "..." }` (até 1 MB).
- **Busca:** as correções vêm antes do CNEFE (casa exata, senão a mais próxima da mesma rua) e funcionam mesmo sem o CNEFE. Também valem para "endereço do ponto do mapa".
- **Arquivo de exemplo (só leitura, de outro projeto):** `D:\mobveloov-git\vps\cnefe\correcoes\35_SP_correcoes.tsv` (400 linhas). O arquivo completo, se houver mais, precisa ser exportado do servidor pelo usuário; os dados não vão para o Git.
