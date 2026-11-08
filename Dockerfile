# Painel em um contêiner. Sem nenhuma chave dentro da imagem: tudo vem do ambiente (.env).
FROM node:22-alpine

WORKDIR /app
COPY motor/ ./motor/
COPY painel/package.json painel/package-lock.json ./painel/
RUN cd painel && npm ci --no-audit --no-fund
COPY painel/ ./painel/
RUN cd painel && npm run build

WORKDIR /app/painel
ENV NODE_ENV=production \
    PAINEL_API_PORTA=8787 \
    DADOS_DIR=/dados
VOLUME ["/dados"]
EXPOSE 8787
CMD ["npm", "start"]
