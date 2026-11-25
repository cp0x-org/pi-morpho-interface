FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY pnpm-lock.yaml package.json ./
RUN pnpm install

COPY . .

RUN pnpm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/morpho.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.d/05-morpho-rest-proxy.sh
RUN chmod +x /docker-entrypoint.d/05-morpho-rest-proxy.sh \
    && [ -f /usr/share/nginx/html/config.js ] || cp /usr/share/nginx/html/config.example.js /usr/share/nginx/html/config.js

EXPOSE 80
