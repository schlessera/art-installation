# Art Installation - CloudFest Hackathon 2026
# Usage: just <recipe>
# List recipes: just --list

set dotenv-load
set export
set shell := ["bash", "-euc"]

# Port variables (from .env via devports, with fallback defaults)
port_runtime := env("RUNTIME_PORT", "3000")
port_api := env("GALLERY_PORT", "3001")
port_frontend := env("GALLERY_FRONTEND_PORT", "5173")

# ─── Default ──────────────────────────────────────────────

[doc("List all available recipes")]
default:
    @just --list --unsorted

# ─── Setup ────────────────────────────────────────────────

[group('setup')]
[doc("Allocate ports via devports and render .env")]
setup:
    npx devports setup --force
    @echo ""
    @echo "  Ports allocated:"
    @echo "    Runtime:  {{port_runtime}}"
    @echo "    API:      {{port_api}}"
    @echo "    Frontend: {{port_frontend}}"
    @echo ""

[group('setup')]
[doc("Install all dependencies")]
install:
    pnpm install

[group('setup')]
[doc("Clean build artifacts and caches")]
clean:
    -rm -rf apps/*/dist
    -rm -rf packages/*/dist
    -rm -rf actors/*/dist
    -rm -rf node_modules/.cache

[group('setup')]
[doc("Full clean including node_modules")]
[confirm("This will delete all node_modules. Continue?")]
clean-all: clean
    -rm -rf node_modules
    -rm -rf apps/*/node_modules
    -rm -rf packages/*/node_modules
    -rm -rf actors/*/node_modules

# ─── Development ──────────────────────────────────────────

[group('dev')]
[doc("Start all dev servers concurrently")]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM
    pnpm --filter @art/runtime dev &
    pnpm --filter @art/gallery dev &
    echo ""
    echo "  Runtime:  http://localhost:${RUNTIME_PORT:-{{port_runtime}}}"
    echo "  API:      http://localhost:${GALLERY_PORT:-{{port_api}}}/api"
    echo "  Frontend: http://localhost:${GALLERY_FRONTEND_PORT:-{{port_frontend}}}"
    echo ""
    wait

[group('dev')]
[doc("Start runtime dev server")]
dev-runtime:
    pnpm --filter @art/runtime dev

[group('dev')]
[doc("Start gallery (API + frontend)")]
dev-gallery:
    pnpm --filter @art/gallery dev

[group('dev')]
[doc("Start gallery API server only")]
dev-api:
    pnpm --filter @art/gallery dev:server

[group('dev')]
[doc("Start gallery React frontend only")]
dev-frontend:
    pnpm --filter @art/gallery dev:client

# ─── Building ─────────────────────────────────────────────

[group('build')]
[doc("Build all packages")]
build: install
    pnpm -r build

[group('build')]
[doc("Build a specific package (e.g., just build-pkg runtime)")]
build-pkg package:
    pnpm --filter @art/{{package}} build

# ─── Testing ──────────────────────────────────────────────

[group('test')]
[doc("Run all tests")]
test:
    pnpm -r test

[group('test')]
[doc("Run tests in watch mode")]
test-watch:
    pnpm -r --parallel test:watch

# ─── Quality ──────────────────────────────────────────────

[group('quality')]
[doc("Lint all packages")]
lint:
    pnpm -r lint

[group('quality')]
[doc("Type-check a specific package (default: runtime)")]
typecheck package="runtime":
    pnpm --filter @art/{{package}} exec tsc --noEmit

# ─── Actors ───────────────────────────────────────────────

[group('actors')]
[doc("Create a new actor from template")]
new-actor name:
    pnpm new:actor {{name}}

[group('actors')]
[doc("Validate all community actors")]
validate-actors:
    pnpm -r --filter './actors/**' validate

[group('actors')]
[doc("Build a specific actor")]
build-actor name:
    pnpm --filter @art/actor-{{name}} build

[group('actors')]
[doc("Preview a specific actor in the runtime")]
preview-actor name:
    pnpm --filter @art/actor-{{name}} dev

# ─── Ports ────────────────────────────────────────────────

[group('ports')]
[doc("Show current port allocations")]
ports:
    npx devports list --project art-installation

[group('ports')]
[doc("Release all allocated ports")]
teardown:
    npx devports release art-installation --all

# ─── Utilities ────────────────────────────────────────────

[group('util')]
[doc("Run a pnpm command in a specific workspace")]
run filter +cmd:
    pnpm --filter {{filter}} {{cmd}}
