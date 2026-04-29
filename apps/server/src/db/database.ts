import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";

const dbPath = resolve(process.env.SQLITE_PATH ?? "storage/atomic-seat.sqlite");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true, strict: true });

db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

type Migration = {
  id: number;
  name: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS concerts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        venue TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        concert_id TEXT NOT NULL REFERENCES concerts(id),
        category TEXT NOT NULL CHECK (category IN ('VIP', 'General')),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        concert_id TEXT NOT NULL REFERENCES concerts(id),
        seat_code TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
        reservation_id TEXT REFERENCES reservations(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (concert_id, seat_code)
      );

      CREATE TABLE IF NOT EXISTS reservation_tickets (
        reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        ticket_id TEXT NOT NULL REFERENCES tickets(id),
        PRIMARY KEY (reservation_id, ticket_id),
        UNIQUE (ticket_id)
      );
    `,
  },
  {
    id: 2,
    name: "add_ticket_category",
    sql: `
      ALTER TABLE tickets ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
    `,
  },
  {
    id: 3,
    name: "indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS tickets_concert_id_idx
      ON tickets (concert_id);

      CREATE INDEX IF NOT EXISTS tickets_concert_category_status_idx
      ON tickets (concert_id, category, status);

      CREATE INDEX IF NOT EXISTS reservations_pending_idx
      ON reservations (concert_id, expires_at)
      WHERE status = 'PENDING';

      CREATE INDEX IF NOT EXISTS tickets_pending_hold_idx
      ON tickets (concert_id, reservation_id)
      WHERE status = 'HELD';
    `,
  },
  {
    id: 4,
    name: "reservation_payment_fields",
    sql: `
      ALTER TABLE reservations ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE reservations ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN ('UNPAID', 'CHECKOUT_CREATED', 'PAID'));
      ALTER TABLE reservations ADD COLUMN payment_id TEXT;
      ALTER TABLE reservations ADD COLUMN checkout_session_id TEXT;

      CREATE INDEX IF NOT EXISTS reservations_checkout_session_idx
      ON reservations (checkout_session_id);
    `,
  },
];

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .query<{ id: number }, []>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.query("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(
        migration.id,
        migration.name,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

let writeQueue = Promise.resolve();

export function runWriteTransaction<T>(work: () => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
