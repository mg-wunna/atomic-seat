import { corsOriginHandler } from "@template/configs/cors";
import { ports } from "@template/configs/ports";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { initializeDataSource } from "./data-source.js";
import { HttpError } from "./errors.js";
import {
  cleanup,
  confirmStripePayment,
  createStripeCheckout,
  explainCleanupQuery,
  getConcert,
  listSeats,
  listConcerts,
  listReservations,
  metrics,
  purchase,
  reserve,
} from "./services/ticketing.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = corsOriginHandler(origin);
      return callback(null, allowed || false);
    },
    credentials: true,
  }),
);

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: Date.now() }));

app.get(
  "/metrics",
  asyncRoute(async (_req, res) => res.json({ data: await metrics() })),
);

app.get(
  "/concerts",
  asyncRoute(async (req, res) => {
    res.json({ data: await listConcerts({ search: String(req.query.search ?? "") || undefined }) });
  }),
);

app.get(
  "/concerts/:id",
  asyncRoute(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) throw new HttpError(400, "bad_request", "Concert id is required");
    res.json({ data: await getConcert(id) });
  }),
);

app.get(
  "/concerts/:id/seats",
  asyncRoute(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) throw new HttpError(400, "bad_request", "Concert id is required");
    res.json({ data: await listSeats(id) });
  }),
);

app.get(
  "/reservations",
  asyncRoute(async (_req, res) => res.json({ data: await listReservations() })),
);

app.post(
  "/reserve",
  asyncRoute(async (req, res) => res.status(201).json({ data: await reserve(req.body) })),
);

app.post(
  "/purchase",
  asyncRoute(async (req, res) => res.json({ data: await purchase(req.body) })),
);

app.post(
  "/cleanup",
  asyncRoute(async (req, res) => res.json({ data: await cleanup(req.body ?? {}) })),
);

app.post(
  "/payment/stripe-checkout",
  asyncRoute(async (req, res) =>
    res.json({ data: await createStripeCheckout(req.body, req.header("origin")) }),
  ),
);

app.post(
  "/payment/stripe-confirm",
  asyncRoute(async (req, res) => res.json({ data: await confirmStripePayment(req.body) })),
);

app.get(
  "/explain",
  asyncRoute(async (_req, res) => res.json({ data: await explainCleanupQuery() })),
);

app.get("/openapi.json", (_req, res) =>
  res.json({
    openapi: "3.1.0",
    info: {
      title: "AtomicSeat API",
      version: "1.0.0",
      description: "Express + TypeORM SQLite API for concurrency-safe concert ticket reservations.",
    },
    servers: [{ url: `http://localhost:${Number(process.env.PORT) || ports.server}` }],
    paths: {
      "/concerts": {
        get: {
          summary: "List concerts and available stock",
          responses: { "200": { description: "Concert list" } },
        },
      },
      "/concerts/{id}": {
        get: {
          summary: "Get concert detail and recent reservations",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Concert detail" } },
        },
      },
      "/concerts/{id}/seats": {
        get: {
          summary: "Get a concert seat map with AVAILABLE, HELD, and SOLD seats",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Seat map" } },
        },
      },
      "/reservations": {
        get: {
          summary: "List reservations for admin ledger",
          responses: { "200": { description: "Reservation list" } },
        },
      },
      "/reserve": {
        post: {
          summary: "Reserve exactly 1 ticket for userId for 5 minutes",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReserveRequest" },
              },
            },
          },
          responses: {
            "201": { description: "Pending reservation" },
            "409": { description: "No stock available" },
          },
        },
      },
      "/purchase": {
        post: {
          summary: "Convert a PENDING reservation to COMPLETED",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PurchaseRequest" },
              },
            },
          },
          responses: { "200": { description: "Completed reservation" } },
        },
      },
      "/cleanup": {
        post: {
          summary: "Release expired PENDING reservations",
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CleanupRequest" },
              },
            },
          },
          responses: {
            "200": { description: "Expired reservation count and released ticket count" },
          },
        },
      },
      "/payment/stripe-checkout": {
        post: {
          summary: "Optional Stripe Checkout for a reservation",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PurchaseRequest" },
              },
            },
          },
          responses: { "200": { description: "Stripe Checkout URL" } },
        },
      },
      "/payment/stripe-confirm": {
        post: {
          summary: "Verify Stripe session and complete reservation",
          responses: { "200": { description: "Completed reservation" } },
        },
      },
      "/explain": {
        get: {
          summary: "EXPLAIN QUERY PLAN proof for pending cleanup index",
          responses: { "200": { description: "SQLite query plan rows" } },
        },
      },
    },
    components: {
      schemas: {
        ReserveRequest: {
          type: "object",
          required: ["concertId", "userId"],
          properties: {
            concertId: { type: "string", example: "concert-orion" },
            userId: { type: "string", example: "demo-buyer-001" },
            category: { type: "string", enum: ["VIP", "General"], default: "General" },
            ticketId: { type: "string", description: "Optional selected seat ticket id" },
          },
        },
        PurchaseRequest: {
          type: "object",
          required: ["reservationId"],
          properties: { reservationId: { type: "string" } },
        },
        CleanupRequest: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } },
        },
      },
    },
  }),
);

app.get("/docs", (_req, res) =>
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AtomicSeat API Docs</title>
  <style>body{margin:0}</style>
</head>
<body>
  <script
    id="api-reference"
    data-url="/openapi.json"
    data-configuration='{"theme":"kepler","layout":"modern","darkMode":true,"hideModels":false}'
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
  ></script>
</body>
</html>`),
);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  console.error(error);
  return res
    .status(500)
    .json({ error: { code: "internal_error", message: "Internal server error" } });
});

const port = Number(process.env.PORT) || ports.server;

await initializeDataSource();

app.listen(port, () => {
  process.stderr.write(`[server] AtomicSeat Express API running on http://localhost:${port}\n`);
});
