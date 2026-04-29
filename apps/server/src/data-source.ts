import "reflect-metadata";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DataSource } from "typeorm";
import { ConcertEntity, ReservationEntity, TicketEntity } from "./entities.js";
import { CreateAtomicSeatSchema1777392000000 } from "./migrations/1777392000000-CreateAtomicSeatSchema.js";
import { AddTicketCategory1777392001000 } from "./migrations/1777392001000-AddTicketCategory.js";

export const sqlitePath = resolve(process.env.SQLITE_PATH ?? "storage/atomic-seat-typeorm.sqlite");

mkdirSync(dirname(sqlitePath), { recursive: true });

export const AppDataSource = new DataSource({
  type: "better-sqlite3",
  database: sqlitePath,
  synchronize: false,
  logging: false,
  entities: [ConcertEntity, TicketEntity, ReservationEntity],
  migrations: [CreateAtomicSeatSchema1777392000000, AddTicketCategory1777392001000],
});

export async function initializeDataSource(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
  }
  return AppDataSource;
}
