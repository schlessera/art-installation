# Stage 1: Build
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all packages needed for build
COPY packages/ packages/
COPY actors/ actors/
COPY apps/runtime/ apps/runtime/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build everything (types, actor-sdk, actors, runtime)
RUN pnpm build

# Stage 2: Serve static files
FROM nginx:alpine AS production

# Copy built runtime
COPY --from=build /app/apps/runtime/dist/ /usr/share/nginx/html/

# Copy built actor bundles
COPY --from=build /app/actors/builtin/*/dist/ /usr/share/nginx/html/actors/

# SPA fallback — serve index.html for all routes
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
