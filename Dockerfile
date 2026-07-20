FROM node:24-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

EXPOSE 8787
CMD ["sh", "-c", "onchainos wallet login && node server.js"]
