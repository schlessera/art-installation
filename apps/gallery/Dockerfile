# Stage 1: Build
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy packages needed for build
COPY packages/types/ packages/types/
COPY apps/gallery/ apps/gallery/

# Install ALL dependencies (including devDependencies needed for build)
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile

# Build types package first, then gallery (server + frontend)
RUN pnpm --filter @art/types build && pnpm --filter @art/gallery build
ENV NODE_ENV=production

# Stage 2: Production
FROM node:22-slim AS production

# Install fonts for SVG stamp rendering (sharp uses librsvg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation fonts-dejavu-core fontconfig \
    && rm -rf /var/lib/apt/lists/* && fc-cache -fv

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy full types package from build stage (tsx needs source files)
COPY --from=build /app/packages/types/ packages/types/

# Copy gallery package.json for dependency install
COPY apps/gallery/package.json apps/gallery/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend from build stage
COPY --from=build /app/apps/gallery/dist/ apps/gallery/dist/

# Copy server source (runs via tsx in production)
COPY --from=build /app/apps/gallery/server/ apps/gallery/server/

# Create data directory (will be overridden by volume mount)
RUN mkdir -p apps/gallery/data/images

ENV NODE_ENV=production
ENV GALLERY_PORT=3000
ENV GALLERY_DATA_DIR=./data

WORKDIR /app/apps/gallery

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
