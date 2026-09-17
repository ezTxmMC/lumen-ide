# Ohne Abhängigkeiten: Der Quelltext reicht, es gibt nichts zu installieren.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV LUMEN_EXT_DATA=/data \
    LUMEN_EXT_HOST=0.0.0.0 \
    LUMEN_EXT_PORT=8730
VOLUME /data
EXPOSE 8730

# Nicht als root laufen — der Server braucht nur den Datenordner.
RUN mkdir -p /data && chown node:node /data
USER node

CMD ["node", "src/main.js"]
