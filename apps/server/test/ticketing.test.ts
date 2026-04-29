import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.SQLITE_PATH = `storage/test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`;

const { AppDataSource, initializeDataSource, sqlitePath } = await import("../src/data-source.js");
const { ConcertEntity, ReservationEntity, TicketEntity } = await import("../src/entities.js");
const { seedDatabase } = await import("../src/seed.js");
const { cleanup, purchase, reserve } = await import("../src/services/ticketing.js");

async function resetDatabase(stock = 2) {
  const concertRepo = AppDataSource.getRepository(ConcertEntity);
  const ticketRepo = AppDataSource.getRepository(TicketEntity);
  const reservationRepo = AppDataSource.getRepository(ReservationEntity);

  await reservationRepo.clear();
  await ticketRepo.clear();
  await concertRepo.clear();

  await concertRepo.save({
    id: "concert-test",
    title: "Concurrency Test",
    venue: "Test Hall",
    startsAt: new Date(),
    totalStock: stock,
    availableStock: stock,
    createdAt: new Date(),
  });

  await ticketRepo.save(
    Array.from({ length: stock }, (_, index) => ({
      id: `ticket-${index + 1}`,
      concertId: "concert-test",
      category: "General" as const,
      status: "AVAILABLE" as const,
      reservationId: null,
      createdAt: new Date(),
    })),
  );
}

async function run(name: string, test: () => Promise<void>) {
  await resetDatabase();
  await test();
  process.stderr.write(`[test] passed: ${name}\n`);
}

await initializeDataSource();

try {
  await run("does not reserve more tickets than available under concurrent requests", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        reserve({ concertId: "concert-test", userId: `user-${index + 1}`, category: "General" }),
      ),
    );

    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const concert = await AppDataSource.getRepository(ConcertEntity).findOneByOrFail({
      id: "concert-test",
    });
    const heldTickets = await AppDataSource.getRepository(TicketEntity).countBy({ status: "HELD" });

    assert.ok(fulfilled.length > 0);
    assert.ok(fulfilled.length <= 2);
    assert.equal(concert.availableStock, 2 - fulfilled.length);
    assert.equal(heldTickets, fulfilled.length);
  });

  await run("rolls stock back when reservation fails after decrement", async () => {
    await assert.rejects(
      reserve({
        concertId: "concert-test",
        userId: "rollback-user",
        category: "General",
        simulateFailure: true,
      }),
      /Simulated reservation failure/,
    );

    const concert = await AppDataSource.getRepository(ConcertEntity).findOneByOrFail({
      id: "concert-test",
    });
    const reservations = await AppDataSource.getRepository(ReservationEntity).count();
    const availableTickets = await AppDataSource.getRepository(TicketEntity).countBy({
      status: "AVAILABLE",
    });

    assert.equal(concert.availableStock, 2);
    assert.equal(reservations, 0);
    assert.equal(availableTickets, 2);
  });

  await run("purchase converts pending reservation to completed", async () => {
    const pending = await reserve({
      concertId: "concert-test",
      userId: "buyer-1",
      category: "General",
    });

    const completed = await purchase({ reservationId: pending.reservationId });
    const sold = await AppDataSource.getRepository(TicketEntity).countBy({ status: "SOLD" });

    assert.equal(completed.status, "COMPLETED");
    assert.equal(sold, 1);
  });

  await run("cleanup expires old pending reservations and restores stock", async () => {
    const pending = await reserve({
      concertId: "concert-test",
      userId: "buyer-1",
      category: "General",
    });
    await AppDataSource.getRepository(ReservationEntity).update(
      { id: pending.reservationId },
      { expiresAt: new Date(Date.now() - 60_000) },
    );

    const result = await cleanup({ limit: 100 });
    const concert = await AppDataSource.getRepository(ConcertEntity).findOneByOrFail({
      id: "concert-test",
    });

    assert.equal(result.expiredReservations, 1);
    assert.equal(result.releasedTickets, 1);
    assert.equal(concert.availableStock, 2);
  });

  await run("seed database resets demo concerts and tickets", async () => {
    await reserve({
      concertId: "concert-test",
      userId: "buyer-1",
      category: "General",
    });

    const result = await seedDatabase();
    const concerts = await AppDataSource.getRepository(ConcertEntity).count();
    const tickets = await AppDataSource.getRepository(TicketEntity).count();
    const reservations = await AppDataSource.getRepository(ReservationEntity).count();

    assert.equal(result.concerts, 3);
    assert.equal(result.tickets, 234);
    assert.equal(concerts, 3);
    assert.equal(tickets, 234);
    assert.equal(reservations, 0);
  });

  await run("EXPLAIN QUERY PLAN uses the partial pending status index", async () => {
    const rows = await AppDataSource.query(
      "EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING'",
    );
    assert.match(JSON.stringify(rows), /idx_reservations_pending_status/);
  });
} finally {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  rmSync(sqlitePath, { force: true });
  rmSync(`${sqlitePath}-shm`, { force: true });
  rmSync(`${sqlitePath}-wal`, { force: true });
}
