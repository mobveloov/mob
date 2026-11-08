# Como funciona

## Objetivo

**Um painel único** que junta os dois painéis de referência, completando o que um tem e o outro não. Não são dois painéis lado a lado nem um seletor "modo A / modo B": é uma tela por função, com os mesmos filtros e o mesmo relatório, qualquer que seja o sistema por trás. A corrida só mostra de onde veio por uma etiqueta de origem (opcional, com o nome que a empresa escolher).

É um **SaaS multiempresa e white-label**: cada empresa entra com a própria marca, os próprios usuários, as próprias integrações e as próprias chaves de IA, sem mexer em código.

## Sistema próprio (sem chaves)

O painel é o **sistema da empresa**: as corridas, os motoristas, os passageiros, as categorias e tarifas, os cupons e os demais cadastros ficam nele mesmo. **Funciona sem nenhuma chave de API de sistema externo.** Os sistemas externos (Sistema A e B, pelo motor) são opcionais, só para importar ou espelhar dados de quem já usa outro sistema.

- **Corridas próprias** (`painel/src/corridas/`): nascem no painel, no bot ou no totem; o preço sai da tarifa da categoria (bandeirada + km + minuto, mínimo, acréscimo noturno, cupom); o operador atribui o motorista do cadastro e avança o status (a caminho, no local, em andamento, finalizada) ou cancela. Corrida sem motorista há 20 minutos vira "não atendida". Um passageiro não abre duas corridas ao mesmo tempo, e passageiro bloqueado não pede corrida.
- **Cadastros** (`painel/src/comum/cadastros.ts`, `painel/src/cadastros/`): motoristas, passageiros, veículos, empresas conveniadas, categorias e tarifas, cupons, áreas, punições, ocorrências, objetos perdidos, desafios e indicações. Todos com novo, editar, excluir, busca e planilha. Motoristas, passageiros e categorias têm "Importar" (das corridas e dos sistemas conectados), sem apagar o que a central já editou.
- **Chaves que continuam opcionais:** IA (sem chave o relatório sai só com números) e a conexão do WhatsApp por QR (no bot, por empresa).

## Peças

```
Navegador (React)  --/api-->  Servidor do painel (Node/Express)  -->  Motor (pasta motor/)  -->  Sistema A | Sistema B
                                     |                                  (outra sessão cuida)
                                     +--> Planilha CSV importada / dados de exemplo
                                     +--> Análise com IA (números em código + textos pelo roteador de IA)
                                     +--> dados/ (empresas, marcas, usuários, credenciais) - fora do Git
```

| Pasta | O que tem | Quem cuida |
|---|---|---|
| `painel/src/web/` | Telas (React + Vite + TypeScript) | painel |
| `painel/src/servidor/` | API, login, multiempresa, ponte com o motor, planilha, exemplo | painel |
| `painel/src/analise/` | Análise de corridas: números, prompts, HTML do relatório e do plano | painel |
| `painel/src/corridas/` | Corridas próprias: criar, preço, motorista, status, cancelar | painel |
| `painel/src/cadastros/` | Cadastros por empresa: guardar, validar, importar | painel |
| `painel/src/ia/` | Roteador de IA (qual IA em cada caso, plano B) | painel |
| `painel/src/comum/` | Tipos usados no navegador e no servidor (marca, corrida, matriz de funções) | painel |
| `motor/` | Integração com os dois sistemas de origem (contrato em `docs/CONTRATO_MOTOR.md`) | sessão `motor-mob` |
| `tenants/<empresa>/` | Marca de uma empresa em arquivo (para gerar o app) | cada empresa |
| `scripts/build-app-empresa.mjs` | Gera PWA/APK/AAB de uma empresa | painel |

## De onde vêm as corridas

Cada empresa liga uma ou mais **integrações** (tela Integrações):

- **Sistema A / Sistema B** (os dois sistemas de origem pelo motor). O painel cria um motor por empresa, com as credenciais só dela, e busca todas as páginas do período.
- **Planilha CSV**: a exportação de "Consultar corridas" (funciona hoje, testado com um CSV real).
- **Dados de exemplo**: corridas inventadas, para a empresa ver o painel funcionando no primeiro acesso.

Todas as integrações ativas entram juntas na mesma lista. Uma integração com erro vira aviso na tela; as outras continuam. O motor é carregado só na hora de usar: se ele estiver fora do ar ou mudando, o painel continua abrindo.

Toda corrida vira o mesmo formato (`painel/src/comum/corrida.ts`).

## A IA dentro de "Consultar corridas"

1. Você filtra as corridas na tela.
2. Clica em **Exportar relatório**.
3. O servidor busca **as mesmas corridas do filtro**. Você não envia nada.
4. O código calcula todos os números (`painel/src/analise/estatisticas.ts`).
5. A IA recebe só os números e escreve resumo, alertas, texto de cada seção, análise dos casos fora do padrão, recomendações e plano de ação (`painel/src/analise/analise.ts`).
6. O relatório HTML sai pronto com a marca da empresa: baixa sozinho e abre na tela, com Imprimir/PDF e Plano de ação.

Também dá para **perguntar ao assistente** sobre a consulta da tela (caixa acima da lista).

Regras da análise (as mesmas do projeto anterior, reescritas no `mob`):
- A IA **nunca calcula**: só escreve em cima dos números.
- Valor em reais que não está nos números vira "valor a definir pela gestão" (`protegerValores`).
- Dado que nenhuma integração traz aparece em "não foi possível medir", em vez de ser inventado.
- O nome do assistente, o nome da empresa e o tom vêm da marca. Nenhuma marca fixa nos textos.
- Sem chave de IA, o relatório sai mesmo assim, com os números e os alertas calculados, e um aviso.

A análise do projeto anterior foi usada **só como referência de leitura**. O código do `mob` é novo e não depende dele.

## Qual IA em cada caso (roteador)

`painel/src/ia/roteador.ts`. Modelo e ordem por variável de ambiente (`IA_ROTA_<CASO>`); chaves por empresa (Integrações) e, se a plataforma permitir, as do `.env`.

| Caso | 1ª opção | Plano B | Por quê |
|---|---|---|---|
| Relatório exportado | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Groq `openai/gpt-oss-120b`, depois Gemini Flash | Tabelas longas, raciocínio e texto claro em português. Sem limite de 8 mil tokens por minuto, então a análise sai inteira em 2 pedidos (relatório + plano). |
| Perguntas rápidas | Groq `openai/gpt-oss-120b` | Claude Haiku 5.5, Gemini Flash | Resposta em segundos e barata. As chaves Groq do usuário não têm Llama, por isso o gpt-oss. |
| Classificação | Groq `openai/gpt-oss-120b` | Claude Haiku 5.5 | Barato e rápido para textos curtos (vai servir ao bot e ao CRM). |
| Voz (reservado) | Gemini TTS | — | Para o bot, na fase 4. O painel ainda não usa voz. |

Detalhes do Claude: SDK oficial `@anthropic-ai/sdk`, esforço `medium` no relatório e `low` no chat. Em Sonnet/Opus vai `fallbacks: "default"` (se o filtro de segurança recusar, a própria Anthropic tenta outro modelo). Recusa ou resposta cortada passam para o plano B.

## Onde os dados ficam

- **Banco do painel (SQLite):** guarda as conversas do bot e a fila de envio do CRM. Ele já vem dentro do Node, não precisa de servidor separado nem de chave.
  - O caminho fica em `BANCO_ARQUIVO`. Se ficar vazio, usa `DADOS_DIR/painel.db`.
  - Cada linha guarda a empresa, e toda consulta filtra por ela.
  - Gravar uma conversa ou uma mensagem da fila mexe só naquela linha. Antes, o arquivo inteiro era reescrito a cada mensagem.
- **Migração automática:** na primeira vez que uma empresa usa o bot ou o CRM, o `conversas.json` e o `fila.json` antigos entram no banco. Depois, o arquivo vira `.json.migrado`; fica guardado, não é apagado. Se o arquivo estiver estragado, nada muda, e o painel tenta de novo depois.
- **Arquivos JSON por empresa (`DADOS_DIR/empresas/<id>/`):** cadastros, corridas próprias, marca, integrações, campanhas, jornadas e configurações.
- **No Docker:** o banco fica no volume `painel-banco`, e os arquivos no volume `painel-dados`.

## Regras para quem mexer com o Sistema A

Estas regras vêm da auditoria da documentação dele (`docs/MOTOR_AUDITORIA_SISTEMA_A.md`).

- **Período:** cada busca de corridas aceita no máximo 31 dias. O painel já divide sozinho os períodos maiores em pedaços de até 30 dias (`fontes/motor.ts`).
- **Categorias:** a lista de categorias exige um local. Preencha a latitude e a longitude de um ponto da cidade em **Integrações → Sistema A**.
- **Mapa de motoristas:** quando ele existir, não pode consultar as posições mais de 10 vezes por minuto por empresa.
- **Avisos do Sistema A:** o aviso que ele manda chega com a chave Pix do motorista. Nunca grave esse aviso inteiro em log, banco ou tela. Guarde só os campos que o painel usa.

## Multiempresa e isolamento

- Cada empresa tem a sua pasta em `DADOS_DIR` (`painel/dados/`, fora do Git): marca, integrações, **segredos** (credenciais e chaves de IA, arquivo com permissão restrita), imagens e planilhas.
- O login é por cookie assinado e HttpOnly. **A empresa de cada pedido vem do usuário logado**, nunca da URL.
- Só o papel **plataforma** (dono do SaaS) troca de empresa (cabeçalho `X-Empresa`). Admin e operador ficam presos à empresa deles (há teste para isso).
- Papéis: plataforma (tudo), admin (também marca, integrações e usuários), operador (consulta e relatórios).
- Segredos nunca voltam ao navegador: a tela só sabe se estão preenchidos.
- Senhas com `scrypt`. No máximo 8 tentativas de login a cada 10 minutos por IP.

## Marca (white-label)

Veja `docs/MARCA_E_WHITELABEL.md`.

## Horários

Todas as datas seguem um padrão só: **horário de Brasília guardado nos campos UTC** (ex.: `04/11/2026 10:43` vira `2026-11-04T10:43Z`). O motor manda ISO com fuso; o painel converte (`dataBr`). As telas mostram com `timeZone: "UTC"`.

## Decisões tomadas (sem perguntar)

- **Stack:** React + Vite + TypeScript, servidor Node (Express) rodado com `tsx`. Mesma stack do projeto anterior.
- **Dados em arquivos JSON** (`painel/dados/`) por enquanto: simples para começar e fácil de trocar por banco depois (fase 1 do plano). Um servidor só.
- **Integrações com nome neutro** ("Sistema A", "Sistema B"): o nome do fornecedor só aparece na tela Integrações.
- **Primeiro acesso**: o primeiro usuário vira dono da plataforma e cria a primeira empresa. As outras empresas são criadas em Usuários > Nova empresa.
- **Originais da dos sistemas de origem** (rar, zip, APKs) ficam fora do Git: têm chaves e dados de passageiros.

## O que ainda não foi testado de verdade

- **os dois sistemas de origem de verdade:** o painel chama o motor certinho (testado com corridas simuladas), mas ninguém rodou ainda com credenciais reais.
- **IA de verdade:** testada com respostas simuladas da Anthropic e da Groq. O formato é o oficial.
- **APK:** veja o resultado em `docs/MARCA_E_WHITELABEL.md`.

## Testes

Na pasta `painel`: `npm test` — planilha (Latin-1), filtros, datas, motor → painel, números, proteção de valores, marca, roteador com plano B, relatório com IA (simulada) e **isolamento entre empresas** pela API.

## Próximas fases

`docs/PLANO_FASES.md`: CRM, bot de WhatsApp e totem, e como dividir em sessões paralelas.
