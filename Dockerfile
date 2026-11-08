# Painel em um contêiner. Sem nenhuma chave dentro da imagem: tudo vem do ambiente (.env).
# Node 22.13 ou mais novo: traz o SQLite embutido (node:sqlite), usado pelo banco do painel.
FROM node:22-alpine

WORKDIR /app
COPY motor/ ./motor/
COPY painel/package.json painel/package-lock.json ./painel/
RUN cd painel && npm ci --no-audit --no-fund
COPY painel/ ./painel/
RUN cd painel && npm run build && node -e "require('node:sqlite')" 2>/dev/null

WORKDIR /app/painel
ENV NODE_ENV=production \
    PAINEL_API_PORTA=8787 \
    DADOS_DIR=/dados \
    BANCO_ARQUIVO=/banco/painel.db
VOLUME ["/dados", "/banco"]
EXPOSE 8787
CMD ["npm", "start"]
