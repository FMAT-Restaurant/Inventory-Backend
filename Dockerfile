FROM node:22-bookworm-slim

WORKDIR /app
ENV HUSKY=0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:dev"]
