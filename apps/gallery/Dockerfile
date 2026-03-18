# Stage 1: Build
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy packages needed for build
COPY packages/types/ packages/types/
COPY apps/gallery/ apps/gallery/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build types package first, then gallery (server + frontend)
RUN pnpm --filter @art/types build && pnpm --filter @art/gallery build

# Stage 2: Production
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages
COPY packages/types/package.json packages/types/
COPY packages/types/dist/ packages/types/dist/
COPY apps/gallery/package.json apps/gallery/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend
COPY --from=build /app/apps/gallery/dist/ apps/gallery/dist/

# Copy server source (runs via tsx in production)
COPY --from=build /app/apps/gallery/server/ apps/gallery/server/

# Create data directory
RUN mkdir -p apps/gallery/data/images

ENV NODE_ENV=production
ENV GALLERY_PORT=3000
ENV GALLERY_DATA_DIR=./data

WORKDIR /app/apps/gallery

EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
