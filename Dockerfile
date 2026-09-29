FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:dev"]
