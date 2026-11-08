# mob — painel de corridas multiempresa

Um **sistema próprio de corridas**, que funciona **sem nenhuma chave de API de sistema externo**. É um **painel único** que junta o melhor de dois painéis de corridas (Sistema A e Sistema B). Vendido para **várias empresas**, cada uma com a **própria marca** (white-label). A **análise com IA** já vem dentro de "Consultar corridas".

## O que precisa para rodar

- **Node.js 20 ou mais novo** (testado com o 22). Baixe em https://nodejs.org (versão LTS).
- Nada mais para o painel. Para gerar o APK: JDK 21 e Android SDK (veja `docs/MARCA_E_WHITELABEL.md`).

## Como rodar

```bash
cd painel
```
```bash
npm install
```
```bash
npm run dev
```

Abra http://localhost:5173.

1. **Primeiro acesso:** crie a sua empresa e o seu usuário. Você vira o dono da plataforma.
2. O painel já abre com **dados de exemplo** (desligue em Integrações). Cadastre categorias e tarifas, motoristas e passageiros, e as corridas próprias já funcionam. Sistemas externos são opcionais (Integrações).

Para produção: `npm run build` e depois `npm start` (abre em http://localhost:8787).

Testes: `npm test` (na pasta `painel`).

### No Docker

Na pasta raiz do projeto:

```bash
docker compose up -d --build
```

O painel abre em http://localhost:8787 (troque a porta com `PAINEL_PORTA`). Os dados ficam no volume `painel-dados`. As chaves opcionais vêm de `painel/.env`. Para ligar a base de endereços, rode com `CNEFE_PASTA=D:/CNEFE_Brasil` (veja `docs/ENDERECOS.md`).

## Como configurar as chaves

Há dois lugares, e nenhum vai para o Git:

1. **Da plataforma** (`painel/.env`): copie `painel/.env.example` para `painel/.env`. Chaves de IA padrão (`ANTHROPIC_API_KEY`, `GROQ_API_KEYS`...), ordem das IAs (`IA_ROTA_*`) e o segredo da sessão.
2. **De cada empresa** (tela **Integrações**): credenciais dos sistemas de origem e chaves de IA próprias. Ficam em `painel/dados/` com acesso restrito e nunca voltam para o navegador.

Sem nenhuma chave de IA, o relatório sai com os números e os alertas, sem os textos.

## O que tem em cada tela

- **Painel:** indicadores do período, alertas, horários, dias, categorias, pagamentos, cancelamentos e top motoristas.
- **Consultar corridas:** corridas de todas as integrações juntas, com etiqueta de origem. Atalhos (15 min a 30 dias), filtros (OS, passageiro, motorista, telefone, endereço, status, cidade, categoria, pagamento, canal, origem, programadas), indicadores, detalhe, atualização automática e planilha.
  - **Exportar relatório:** a consulta vai sozinha para a IA. O relatório baixa já com a análise e o plano de ação, com a marca da empresa.
  - **Pergunte ao assistente:** caixa para perguntar sobre a consulta da tela.
- **Acompanhamento:** em aberto e últimas 2 horas, atualiza a cada 20 s.
- **Corridas próprias:** no detalhe da corrida, atribuir motorista, avançar o status, finalizar com valor, cancelar e ver o histórico.
- **Cadastros com novo, editar e excluir:** motoristas, passageiros, veículos, empresas conveniadas, categorias e tarifas, cupons, áreas, punições, ocorrências, objetos perdidos, desafios e indicações. Motoristas, passageiros e categorias têm "Importar".
- **Programadas**, **Produção dos motoristas**, **Avaliações (NPS)**, **Faturamento** e **Estatísticas**.
- **Análise com IA:** relatório e plano de ação de um período inteiro.
- **Marca e aparência:** nome, logo, cores, fonte, textos, domínio e app, com pré-visualização ao vivo.
- **Integrações:** sistemas de origem, planilha CSV e chaves de IA (qual IA em cada caso).
- **Usuários:** usuários da empresa; o dono da plataforma também cria empresas.
- No menu só aparece o que já funciona. O que ainda falta está em `docs/ANALISE_PAINEIS.md` e `docs/PLANO_FASES.md`.

## White-label em resumo

Cada empresa troca nome, logo, ícones, cores, fonte, textos, domínio, nome do assistente de IA e o app do celular, tudo pela tela, sem código. Os sistemas de origem aparecem só como "Sistema A" e "Sistema B". App por empresa: `node scripts/build-app-empresa.mjs <empresa> --apk`. Detalhes em `docs/MARCA_E_WHITELABEL.md`.

## Pastas

| Pasta | O que é |
|---|---|
| `painel/` | O painel (React + Vite + TypeScript) e o servidor dele (Node) |
| `motor/` | Integração com os dois sistemas de origem (outra equipe; contrato em `docs/CONTRATO_MOTOR.md`) |
| `tenants/` | Marca de cada empresa em arquivo; `tenants/exemplo/` é fictícia |
| `scripts/` | Gerar o app (PWA/APK/AAB) de uma empresa |
| `docs/` | Documentação |

## Mais detalhes

- [`docs/COMO_FUNCIONA.md`](docs/COMO_FUNCIONA.md): peças, IA, isolamento entre empresas, decisões e o que falta testar.
- [`docs/ANALISE_PAINEIS.md`](docs/ANALISE_PAINEIS.md): o que tem em cada painel original e a matriz de funções.
- [`docs/MARCA_E_WHITELABEL.md`](docs/MARCA_E_WHITELABEL.md): marca, empresa nova e app do celular.
- [`docs/ENDERECOS.md`](docs/ENDERECOS.md): base de endereços do IBGE (CNEFE), sugestões de rua e número, distância e preço.
- [`docs/PLANO_FASES.md`](docs/PLANO_FASES.md): CRM, bot e totem, e a divisão em sessões.
- [`docs/CONTRATO_MOTOR.md`](docs/CONTRATO_MOTOR.md): o que o motor oferece.
