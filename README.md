# AtomicSeat

AtomicSeat is a portfolio-quality concert ticket reservation system built around one hard problem: preventing double-booking when many buyers try to reserve the same inventory at the same time.

The public website is the client experience where a user can discover concerts, reserve one ticket for five minutes, and complete purchase. The dashboard is the admin console for inventory, active holds, completed sales, cleanup, and API inspection.

## Stack

| Layer | Tool | Port |
| --- | --- | --- |
| API | Node.js + Express + TypeORM | `3000` |
| Database | SQLite file database with migrations | `apps/server/storage/atomic-seat.sqlite` |
| Website | Next.js 15 client/showcase/buyer flow | `3001` |
| Dashboard | Vite + React admin control | `3002` |
| Payments | Optional Stripe Checkout | API-driven |

## Quick Start

```bash
bun install
npm rebuild better-sqlite3
bun run seed
bun run dev
```

Open:

- Website buyer flow: `http://localhost:3001`
- Admin dashboard: `http://localhost:3002`
- OpenAPI docs: `http://localhost:3000/docs`

## Live Demo

- Website buyer flow: `https://atomic-seat-website.pages.dev`
- Admin dashboard: `https://atomic-seat-dashboard.pages.dev`
- API: `https://atomic-seat.onrender.com`
- OpenAPI docs: `https://atomic-seat.onrender.com/docs`

## Core Commands

```bash
bun run seed        # reset database, run migrations, seed concerts/tickets
bun run test        # backend transaction and rollback tests
bun run typecheck   # typecheck all workspaces
bun run build       # build all apps
bun run dev         # run API, website, and dashboard
```

## Assignment Alignment

AtomicSeat follows the assignment requirements:

- Node.js + TypeScript backend.
- Express.js API.
- TypeORM ORM.
- SQLite file database.
- `synchronize: false`.
- Explicit migrations only.
- Second migration adds `tickets.category`.
- `POST /reserve` uses `queryRunner.startTransaction()`.
- Reservation holds last five minutes.
- Cleanup expires old `PENDING` reservations.
- Tests prove rollback after stock decrement failure.

## API

OpenAPI documentation is served with Scalar from `GET /openapi.json`.

Required endpoints:

```http
GET  /concerts
POST /reserve
POST /purchase
POST /cleanup
```

Additional portfolio/admin endpoints:

```http
GET  /concerts/:id
GET  /reservations
GET  /metrics
GET  /explain
POST /payment/stripe-checkout
POST /payment/stripe-confirm
```

Reservation request:

```json
{
  "concertId": "concert-orion",
  "userId": "demo-buyer-001",
  "category": "General"
}
```

Purchase request:

```json
{
  "reservationId": "reservation-id"
}
```

## Concurrency Strategy

`POST /reserve` runs as one database transaction:

1. Start a TypeORM query runner transaction.
2. Load the concert and one available ticket for the requested category.
3. Decrement `concert.availableStock`.
4. Create a `PENDING` reservation with `expiresAt`.
5. Mark the ticket as `HELD`.
6. Commit all writes together.
7. Roll back everything if any write fails.

This prevents selling more tickets than exist because stock decrement, reservation creation, and ticket hold are one atomic unit. The test suite fires concurrent reservation attempts against limited inventory and asserts that successful holds never exceed available tickets.

## Indexes

The migrations create:

- B-tree index on `tickets.concert_id` for concert inventory lookup.
- Partial index on `reservations(status)` where `status = 'PENDING'` for cleanup scans.
- Composite index on `tickets(concert_id, category, status)` for category availability lookup.

Seed output includes the required query plan proof:

```text
EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING'
SEARCH reservations USING INDEX idx_reservations_pending_status (status=?)
```

## Stripe

Stripe Checkout is optional. Without `STRIPE_SECRET_KEY`, the app still supports manual purchase for assignment testing. With Stripe configured, the website opens Checkout for a pending reservation and confirms the session through the API on return.

## Interview Case Study

Problem: Ticketing systems fail when stock is shown optimistically and reservations are created without transactional guarantees.

Solution: AtomicSeat models tickets as individual sellable records and forces the reservation workflow through a transaction. The buyer gets a five-minute hold; the admin gets real-time visibility into pending, completed, and expired states.

Tradeoff: SQLite serializes writes, which is acceptable for this assignment and local demo. In production, the same TypeORM transaction boundary would move to PostgreSQL with row-level locks for higher write throughput.

AI usage: The project was built with AI assistance, but the critical concurrency logic was constrained by explicit rules, tests, migrations, and verification commands. The important point is not AI-generated UI polish; it is that the transaction behavior is testable and explainable.

## Links

- Live demo: `https://atomic-seat-website.pages.dev`
- Admin demo: `https://atomic-seat-dashboard.pages.dev`
- API docs: `https://atomic-seat.onrender.com/docs`
- Portfolio: `https://mg-wunna.vercel.app/`
- Email: `mgwunna.mw@icloud.com`
- Repository: `https://github.com/mg-wunna/atomic-seat`
