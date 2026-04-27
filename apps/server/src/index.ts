// Bun auto-loads .env.<NODE_ENV> from project root (e.g., .env.development).
import { corsOriginHandler } from "@template/configs/cors";
import { requireEnv } from "@template/configs/env";
import { ports } from "@template/configs/ports";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { rateLimiter } from "hono-rate-limiter";
import mongoose from "mongoose";
import { appRouter } from "./router.js";

const app = new Hono();

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: corsOriginHandler,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Rate limiting — prefer x-real-ip (set by Traefik), fall back to first x-forwarded-for hop.
// In production, reject requests with no resolvable IP (Traefik always sets x-real-ip).
// In dev, fall through with a constant key so the limiter still enforces a global cap
// without leaking unbounded MemoryStore entries via per-request UUIDs.
const isProd = process.env.NODE_ENV === "production";

app.use("*", async (c, next) => {
  if (!isProd) return next();
  const hasIp = c.req.header("x-real-ip") || c.req.header("x-forwarded-for");
  if (!hasIp) return c.json({ error: "Bad request" }, 400);
  return next();
});

app.use(
  "*",
  rateLimiter({
    windowMs: 60_000,
    limit: 100,
    keyGenerator: (c) => {
      const real = c.req.header("x-real-ip");
      if (real) return `ip:${real}`;
      const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (fwd) return `ip:${fwd}`;
      return "dev:no-ip";
    },
  }),
);

// Liveness probe (Render healthcheck path = /health). Kept outside oRPC so it has
// zero dependencies on the router. The contract also exposes /v1/health for clients.
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// --- OpenAPI spec + Scalar docs ---
const generator = new OpenAPIGenerator({});

app.get("/openapi.json", async (c) => {
  const spec = await generator.generate(appRouter, {
    info: {
      title: "Template API",
      version: "1.0.0",
      description: "Auto-generated from oRPC router",
    },
    servers: [{ url: "/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  });
  return c.json(spec);
});

app.get("/docs", (c) => {
  const html = `<!doctype html>
<html>
<head>
  <title>API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', { url: '/openapi.json' })
  </script>
</body>
</html>`;
  return c.html(html);
});

// --- oRPC: REST via OpenAPI handler at /v1/* ---
const openApiHandler = new OpenAPIHandler(appRouter);

app.all("/v1/*", async (c) => {
  const { matched, response } = await openApiHandler.handle(c.req.raw, {
    prefix: "/v1",
    context: {},
  });
  if (matched && response) return response;
  return c.json({ error: "Not found" }, 404);
});

// --- oRPC: RPC handler at /rpc/* (type-safe clients) ---
const rpcHandler = new RPCHandler(appRouter);

app.all("/rpc/*", async (c) => {
  const { response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {},
  });
  return response ?? c.json({ error: "Not found" }, 404);
});

// --- Start ---
async function start() {
  const mongoUri = requireEnv("MONGO_URI");
  await mongoose.connect(mongoUri);
  process.stderr.write("[server] Connected to MongoDB\n");

  const port = Number(process.env.PORT) || ports.server;
  process.stderr.write(`[server] Running on http://localhost:${port}\n`);
  process.stderr.write(`[server] Docs at http://localhost:${port}/docs\n`);

  Bun.serve({
    port,
    fetch(req, server) {
      // WebSocket upgrade at /ws
      if (new URL(req.url).pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        process.stderr.write("[ws] Client connected\n");
        ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
      },
      message(ws, message) {
        const text = typeof message === "string" ? message : new TextDecoder().decode(message);
        process.stderr.write(`[ws] Received: ${text}\n`);
        if (text === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        } else {
          ws.send(JSON.stringify({ type: "echo", data: text, timestamp: Date.now() }));
        }
      },
      close() {
        process.stderr.write("[ws] Client disconnected\n");
      },
    },
  });
}

start().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[server] Fatal startup error: ${message}\n`);
  process.exit(1);
});
