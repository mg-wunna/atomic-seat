import { rmSync } from "node:fs";
import { sqlitePath, initializeDataSource, AppDataSource } from "./data-source.js";
import { ConcertEntity, TicketEntity, ReservationEntity } from "./entities.js";
import type { Concert, Ticket } from "./entities.js";

const concerts = [
  {
    id: "concert-orion",
    title: "Orion Pulse Live",
    venue: "North Pier Arena",
    startsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    vip: 18,
    general: 90,
  },
  {
    id: "concert-velvet",
    title: "Velvet Circuit",
    venue: "Metro Hall",
    startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    vip: 12,
    general: 64,
  },
  {
    id: "concert-static",
    title: "Static Bloom",
    venue: "Glasshouse Theater",
    startsAt: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
    vip: 8,
    general: 42,
  },
];

function createTickets(concertId: string, category: "VIP" | "General", count: number): Ticket[] {
  const prefix = category === "VIP" ? "VIP" : "GEN";
  return Array.from({ length: count }, (_, index) => ({
    id: `${concertId}-${prefix}-${String(index + 1).padStart(3, "0")}`,
    concertId,
    category,
    status: "AVAILABLE",
    reservationId: null,
    createdAt: new Date(),
  }));
}

async function main() {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  rmSync(sqlitePath, { force: true });
  rmSync(`${sqlitePath}-shm`, { force: true });
  rmSync(`${sqlitePath}-wal`, { force: true });

  await initializeDataSource();

  const concertRepo = AppDataSource.getRepository<Concert>(ConcertEntity);
  const ticketRepo = AppDataSource.getRepository<Ticket>(TicketEntity);
  const reservationRepo = AppDataSource.getRepository(ReservationEntity);

  await reservationRepo.clear();
  await ticketRepo.clear();
  await concertRepo.clear();

  for (const seed of concerts) {
    const totalStock = seed.vip + seed.general;
    await concertRepo.save({
      id: seed.id,
      title: seed.title,
      venue: seed.venue,
      startsAt: seed.startsAt,
      totalStock,
      availableStock: totalStock,
      createdAt: new Date(),
    });

    await ticketRepo.save([
      ...createTickets(seed.id, "VIP", seed.vip),
      ...createTickets(seed.id, "General", seed.general),
    ]);
  }

  const explain = await AppDataSource.query(
    "EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING'",
  );
  process.stderr.write(`[seed] Seeded ${concerts.length} concerts into ${sqlitePath}\n`);
  process.stderr.write(`[seed] EXPLAIN QUERY PLAN ${JSON.stringify(explain)}\n`);

  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
