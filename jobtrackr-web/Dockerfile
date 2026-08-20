# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

ENV VITE_API_MOCKING=false \
    VITE_API_ORIGIN=

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

RUN nginx -t

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=6 \
    CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
