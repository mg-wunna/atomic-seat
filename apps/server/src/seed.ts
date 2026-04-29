import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
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

export async function seedDatabase() {
  await initializeDataSource();

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const concertRepo = queryRunner.manager.getRepository<Concert>(ConcertEntity);
    const ticketRepo = queryRunner.manager.getRepository<Ticket>(TicketEntity);
    const reservationRepo = queryRunner.manager.getRepository(ReservationEntity);

    await reservationRepo.clear();
    await ticketRepo.clear();
    await concertRepo.clear();

    let ticketsSeeded = 0;

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

      const tickets = [
        ...createTickets(seed.id, "VIP", seed.vip),
        ...createTickets(seed.id, "General", seed.general),
      ];
      await ticketRepo.save(tickets);
      ticketsSeeded += tickets.length;
    }

    await queryRunner.commitTransaction();

    const explain = await AppDataSource.query(
      "EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING'",
    );

    return {
      concerts: concerts.length,
      tickets: ticketsSeeded,
      reservations: 0,
      sqlitePath,
      explain,
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function main() {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  rmSync(sqlitePath, { force: true });
  rmSync(`${sqlitePath}-shm`, { force: true });
  rmSync(`${sqlitePath}-wal`, { force: true });

  const result = await seedDatabase();
  process.stderr.write(`[seed] Seeded ${result.concerts} concerts into ${result.sqlitePath}\n`);
  process.stderr.write(`[seed] EXPLAIN QUERY PLAN ${JSON.stringify(result.explain)}\n`);

  await AppDataSource.destroy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
