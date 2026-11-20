# Importação das casas (números e posições) do mobveloov

As casas importadas entram na base própria do painel (tabela `enderecos_correcoes`), valem mais que o CNEFE e aparecem no mapa dos apps (números das casas, zoom 17 ou mais) e na busca de endereços.

## Formato pedido

Um arquivo **por cidade ou tudo junto** (tanto faz; o campo do município separa). Colunas, nesta ordem, separadas por TAB (`.tsv`):

| # | coluna | exemplo |
|---|---|---|
| 1 | `cod_municipio` (IBGE, 7 dígitos; Pitangueiras = 3539509) | `3539509` |
| 2 | `numero` (0 = ponto da rua) | `120` |
| 3 | `nome_logradouro` (sem o tipo) | `Das Flores` |
| 4 | `bairro` | `Centro` |
| 5 | `tipo` (Rua, Avenida...) | `Rua` |
| 6 | `latitude` (ponto decimal) | `-21.0123` |
| 7 | `longitude` (ponto decimal) | `-48.2234` |

Também aceito, sem mudar nada no código: **CSV** (vírgula ou ponto e vírgula) **com linha de cabeçalho** usando esses nomes (sinônimos: `municipio`, `cod_ibge`, `logradouro`, `rua`, `lat`, `lng`, `lon`), ou **JSON** (lista de objetos com as mesmas chaves).

Repetir uma casa (mesma cidade, rua, bairro e número) atualiza a anterior; dá para importar de novo sem duplicar.

## Como exportar da VPS (tabela `casas`)

Ajuste os nomes das colunas ao que a tabela tem; o importante é sair uma linha por casa:

```bash
docker exec supabase-db psql -U postgres -d postgres -At -F $'\t' -c \
 "select cod_municipio, numero, nome_logradouro, bairro, tipo, latitude, longitude from casas" > casas.tsv
```

## Como importar

```powershell
cd painel
npm run importar-casas -- C:\caminho\casas.tsv
```

No contêiner de teste: copiar o arquivo para dentro e rodar o mesmo comando lá. A cidade precisa estar entre as cidades atendidas da empresa (Config › Endereços) para as casas aparecerem no mapa dela.
