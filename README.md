# Template

Single-project monorepo template for vibe-coded demo apps. Bun workspaces, no turbo, no custom CLI.

## Stack

| Layer | Tool | Where |
|------|------|-------|
| Runtime + workspaces | Bun 1.3.10 | root |
| Backend | Hono + oRPC + Mongoose | `apps/server` (`:3000`) |
| Website | Next.js 15 (SSG export) | `apps/website` (`:3001`) |
| Dashboard | Vite + React 19 | `apps/dashboard` (`:3002`) |
| Shared | `@template/configs` (ports, cors, env) | `packages/configs` |
| Lint + format | Biome | root |
| Git hooks | Lefthook | root |
| Validation | Zod | server |

## Quick Start

```bash
bun install         # installs deps + lefthook hooks
bun run dev         # all 3 apps in parallel
```

Or run one app:

```bash
bun run dev:server     # http://localhost:3000
bun run dev:website    # http://localhost:3001
bun run dev:dashboard  # http://localhost:3002
```

Server needs MongoDB + Redis. Easiest: `bun run docker:up` to spin up infra (uses `docker-compose.yml`), then run dev as usual.

## Scripts

| Script | What |
|--------|------|
| `dev` / `dev:<app>` | Dev server(s) |
| `build` / `build:<app>` | Production build |
| `start:server` | Run built server (`bun dist/index.js`) |
| `typecheck` | `tsc --noEmit` across all workspaces |
| `lint` / `lint:fix` | Biome lint |
| `format` / `format:check` | Biome format |
| `docker:up` / `docker:down` | Local infra (mongo + redis + server) |
| `docker:logs` | Tail compose logs |
| `docker:build` | Rebuild compose images |

Per-app filter (advanced): `bun --filter <name> <script>`.

## Layout

```
template/
  apps/
    server/                # Hono + oRPC backend
      src/index.ts
      Dockerfile
    website/               # Next.js 15
    dashboard/             # Vite React
  packages/
    configs/               # @template/configs (ports/cors/env)
  .env.example             # template — copy to .env.development / .env.production
  docker-compose.yml             # local dev infra
  docker-compose.production.yml  # VPS prod
  render.yaml                    # Render staging blueprint
  .github/workflows/
    staging-deploy.yml
    production-deploy.yml
```

## Environment

Bun auto-loads `.env.<NODE_ENV>` from project root.

```bash
cp .env.example .env.development   # local dev (gitignored)
cp .env.example .env.production    # VPS server (gitignored)
```

Edit values in the copied files. `.env.example` is the only env file committed.

## Deploy

Two environments. Branch-driven.

### Staging — Render + Cloudflare Pages

Trigger: push to `staging` branch.

- `apps/server` → Render web service via `RENDER_DEPLOY_HOOK_URL`
- `apps/website` → Cloudflare Pages project `staging-website`
- `apps/dashboard` → Cloudflare Pages project `staging-dashboard`

Required GitHub secrets:
- `RENDER_DEPLOY_HOOK_URL`
- `STAGING_API_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required Render env (set in dashboard, marked `sync: false` in `render.yaml`):
- `MONGO_URI` (Atlas free cluster works)
- `JWT_SECRET`
- `REDIS_URL`

### Production — Docker on VPS + Cloudflare Pages

Trigger: push to `production` branch.

- `apps/server` → Docker image `ghcr.io/<owner>/template-server:latest` → VPS pulls via watchtower (5min poll)
- `apps/website` + `apps/dashboard` → Cloudflare Pages projects `production-website` / `production-dashboard`

Required GitHub secrets:
- `PRODUCTION_API_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- (`GITHUB_TOKEN` is auto-provided for GHCR push)

Required VPS env (`.env.production` on host, alongside `docker-compose.production.yml`):
- `DOMAIN` — base domain (e.g. `example.com`); server published at `apis.example.com`
- `JWT_SECRET`, `MONGO_USER`, `MONGO_PASSWORD`, `REDIS_PASSWORD`
- `ACME_EMAIL` — Let's Encrypt registration
- `GITHUB_OWNER` — substituted into image refs

VPS bootstrap: SSH in, `docker login ghcr.io -u <user> -p <PAT>` once (so `~/.docker/config.json` exists for watchtower), then `docker compose --env-file .env.production -f docker-compose.production.yml up -d`.

## Git Workflow

```
main         ← stable
production   ← deploy to VPS + Pages on push
staging      ← deploy to Render + Pages on push
feature/*    ← work branches; PR into main
```

Lefthook hooks auto-installed by `bun install`:
- pre-commit: biome format (staged) + `bun run lint` + `bun run typecheck`
- pre-push: `bun run build` + lint + typecheck

Bypass with `git commit --no-verify` (use sparingly).

## Adapting This Template

1. Rename root `package.json` `"name"` from `"template"` to your project.
2. Rename `@template/configs` package + all imports (`apps/*/package.json`, `apps/*/src/**`).
3. Update OpenAPI title in `apps/server/src/index.ts`.
4. Update `docker-compose.yml` Mongo db name from `template` to your project.
5. Update `production-deploy.yml` image name `template-server` → `<your-project>-server`.
6. `cp .env.example .env.development` and fill values.
7. Set GitHub secrets + Cloudflare Pages projects + Render service.
8. Push.

## License

Private.
