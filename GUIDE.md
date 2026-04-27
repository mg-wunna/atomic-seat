# Staging Deploy Guide

End-to-end recipe for hosting WorkShield staging on free tiers.

**Architecture:**

| Service | Host | Free? |
|---------|------|-------|
| Server (Hono + Mongoose) | Render Web Service (Docker) | ✅ free (sleeps after 15min idle) |
| Website (Next.js SSG) | Cloudflare Pages | ✅ free |
| Dashboard (Vite SPA) | Cloudflare Pages | ✅ free |
| Database | MongoDB Atlas M0 | ✅ free |

Triggered manually with `bun run deploy:staging` (no auto-deploy on push).

---

## Prerequisites

- GitHub repo: `mg-wunna/work-shield`
- Accounts: GitHub, MongoDB Atlas, Cloudflare, Render
- Local: `bun`, `gh` CLI authenticated, `git`

---

## 1. MongoDB Atlas

1. atlas.mongodb.com → **Build a Database** → **M0 (Free)**
2. Region: Singapore (or closest to Render region)
3. **Database Access** → **Add New Database User**:
   - Username: `wunna`
   - Password: generate, save to password manager
   - Role: `readWrite` on any database
4. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`)
   _(Required because Render IPs are dynamic.)_
5. **Connect** → **Drivers** → copy URI:
   ```
   mongodb+srv://wunna:<password>@<cluster>.mongodb.net/work-shield
   ```

---

## 2. Render — Server (Docker)

Free tier doesn't support Blueprint UI on first project, so create web service manually.

1. dashboard.render.com → **New +** → **Web Service** → **Build and deploy from a Git repository**
2. Connect repo `mg-wunna/work-shield`
3. Fill form:
   | Field | Value |
   |-------|-------|
   | Name | `work-shield` |
   | Region | Singapore |
   | Branch | `main` |
   | Runtime | **Docker** (NOT Node/Bun) |
   | Dockerfile path | `./apps/server/Dockerfile` |
   | Docker context | `.` |
   | Instance Type | **Free** |
   | Health Check Path | `/health` |
4. **Advanced** → **Add Environment Variable**:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `MONGO_URI` | Atlas URI from step 1 (append `/work-shield` db name) |
   | `JWT_SECRET` | run `openssl rand -base64 48` locally, paste output |
   | `CORS_ORIGINS` | leave blank now, set in step 5 |
5. **Create Web Service** → wait ~5 min for first build
6. After service live, copy:
   - **Service URL**: `https://work-shield.onrender.com` (or whatever Render assigns)
   - **Settings → Deploy Hook**: `https://api.render.com/deploy/srv-xxx?key=yyy`

### Caveats

- Free tier sleeps after 15 min idle. First request after sleep = ~30 s cold start.
- 750 hr/mo limit (single service stays under).
- Render auto-deploys on push to `main` by default. To disable: Settings → Build & Deploy → **Auto-Deploy**: No.

---

## 3. Cloudflare Pages — projects

Wrangler needs the project to exist before pushing builds. Create both empty:

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."

bunx wrangler@latest pages project create work-shield-website --production-branch=main
bunx wrangler@latest pages project create work-shield-dashboard --production-branch=main
```

Or via dashboard: dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets → name → drop dummy file → Deploy.

URLs after creation:
- `https://work-shield-website.pages.dev`
- `https://work-shield-dashboard.pages.dev`

---

## 4. Wire CORS on Render

dashboard.render.com → service → **Environment** → edit `CORS_ORIGINS`:

```
https://work-shield-website.pages.dev,https://work-shield-dashboard.pages.dev
```

Save → service auto-redeploys.

---

## 5. GitHub Secrets

Required by `.github/workflows/staging-deploy.yml`:

| Secret | Value |
|--------|-------|
| `STAGING_API_URL` | `https://work-shield.onrender.com` |
| `RENDER_DEPLOY_HOOK_URL` | from step 2.6 |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create → "Edit Cloudflare Workers" template + add **Cloudflare Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers & Pages → right sidebar |

Set via CLI:

```bash
gh secret set STAGING_API_URL --body "https://work-shield.onrender.com"
gh secret set RENDER_DEPLOY_HOOK_URL --body "https://api.render.com/deploy/srv-xxx?key=yyy"
gh secret set CLOUDFLARE_API_TOKEN --body "..."
gh secret set CLOUDFLARE_ACCOUNT_ID --body "..."
```

Verify:
```bash
gh secret list
```

---

## 6. Seed Production DB

One-shot from local (Atlas IP `0.0.0.0/0` already allowed):

```bash
cd apps/server
MONGO_URI="<atlas uri with /work-shield>" bun src/seed.ts
```

Creates 3 default accounts:

| Email | Password | Role |
|-------|----------|------|
| `admin@workshield.dev` | `admin1234` | admin |
| `hr@workshield.dev` | `hr123456` | hr |
| `emp@workshield.dev` | `emp123456` | employee |

---

## 7. Deploy

```bash
bun run deploy:staging
```

Equivalent to:
```bash
gh workflow run staging-deploy.yml --ref main && gh run watch
```

Workflow does:
1. Build website + dashboard locally on GitHub runner (with `STAGING_API_URL` baked in)
2. Push `apps/website/out` → `work-shield-website` Cloudflare Pages
3. Push `apps/dashboard/dist` → `work-shield-dashboard` Cloudflare Pages
4. Trigger Render redeploy via deploy hook (Render rebuilds Docker from latest `main`)

Total runtime ~1.5 min. Render redeploy continues in background ~3 min.

---

## 8. Verify

```bash
curl -s https://work-shield.onrender.com/health
curl -sI https://work-shield-website.pages.dev | head -1
curl -sI https://work-shield-dashboard.pages.dev | head -1
```

All should return `200 OK`.

---

## Live URLs

| Surface | URL |
|---------|-----|
| Marketing site | https://work-shield-website.pages.dev |
| Dashboard | https://work-shield-dashboard.pages.dev |
| API | https://work-shield.onrender.com |
| API health | https://work-shield.onrender.com/health |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Render returns 502 | Server boot crashed | Render Logs tab → check stderr; usually MongoDB connect (Atlas IP whitelist) or missing env var |
| Render returns 503 | Cold start | Wait 30 s, retry |
| Login fails with CORS error | `CORS_ORIGINS` missing/wrong on Render | Add Pages URLs comma-separated, redeploy |
| GitHub Action: `Project not found` | Wrangler trying to deploy before Pages project created | Run step 3 first |
| GitHub Action: `MONGO_URI required` | Render env var missing | Set on Render dashboard, not in repo |
| `JWT_SECRET must be at least 32 characters` | Weak secret | `openssl rand -base64 48` |

---

## Cost

$0/mo total. Limits:

- Atlas M0: 512 MB storage, 100 connections, no replication
- Render Free: 750 hr/mo, sleeps after 15 min idle
- Cloudflare Pages: 500 builds/mo, unlimited bandwidth

Hits ceiling on real traffic. Demo-grade only.
