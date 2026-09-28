FROM node:20-bookworm-slim

# Instala ffmpeg e fontes básicas do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm install --omit=dev

# Copia código do microserviço
COPY . .

# Garante permissões na pasta temporária de jobs
RUN mkdir -p /tmp/video-jobs && chmod 777 /tmp/video-jobs

EXPOSE 3100

ENV PORT=3100
ENV NODE_ENV=production

CMD ["node", "server.js"]
