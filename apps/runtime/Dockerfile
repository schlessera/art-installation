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

# Cache-bust: any change to actor count invalidates from here
RUN echo "actors: $(ls -d actors/community/*/src/index.ts 2>/dev/null | wc -l) community, $(ls -d actors/builtin/*/src/index.ts 2>/dev/null | wc -l) builtin"

# Install dependencies (no frozen-lockfile: community actors add workspace packages)
RUN pnpm install --no-frozen-lockfile

# Build everything (types, actor-sdk, actors, runtime)
RUN pnpm build

# Stage 2: Serve static files
FROM nginx:alpine AS production

# Copy built runtime (includes builtin actors via Vite bundle)
COPY --from=build /app/apps/runtime/dist/ /usr/share/nginx/html/

# Create mount point for community actors (Coolify persistent volume)
RUN mkdir -p /usr/share/nginx/html/actors/community

# nginx config: SPA fallback + community actor serving
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
    listen 80;
    root /usr/share/nginx/html;

    # Community actor manifest — never cache (polled every 30s by ActorLoader)
    location = /actors/community/manifest.json {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Access-Control-Allow-Origin "*";
        try_files $uri =404;
    }

    # Community actor bundles — short cache (immutable once deployed)
    location /actors/community/ {
        add_header Cache-Control "public, max-age=3600";
        add_header Access-Control-Allow-Origin "*";
        try_files $uri =404;
    }

    # SPA fallback for everything else
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

EXPOSE 80
