import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAtomicSeatSchema1777392000000 implements MigrationInterface {
  name = "CreateAtomicSeatSchema1777392000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE concerts (
        id varchar PRIMARY KEY NOT NULL,
        title varchar NOT NULL,
        venue varchar NOT NULL,
        starts_at datetime NOT NULL,
        total_stock integer NOT NULL,
        available_stock integer NOT NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE tickets (
        id varchar PRIMARY KEY NOT NULL,
        concert_id varchar NOT NULL,
        status varchar NOT NULL CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
        reservation_id varchar,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (concert_id) REFERENCES concerts(id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE reservations (
        id varchar PRIMARY KEY NOT NULL,
        concert_id varchar NOT NULL,
        ticket_id varchar NOT NULL,
        user_id varchar NOT NULL,
        status varchar NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED')),
        expires_at datetime NOT NULL,
        amount_cents integer NOT NULL DEFAULT 0,
        payment_status varchar NOT NULL DEFAULT 'UNPAID'
          CHECK (payment_status IN ('UNPAID', 'CHECKOUT_CREATED', 'PAID')),
        payment_id varchar,
        checkout_session_id varchar,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (concert_id) REFERENCES concerts(id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
      )
    `);

    await queryRunner.query("CREATE INDEX idx_tickets_concert_id ON tickets(concert_id)");
    await queryRunner.query("CREATE INDEX idx_reservations_concert_id ON reservations(concert_id)");
    await queryRunner.query(
      "CREATE INDEX idx_reservations_pending_status ON reservations(status) WHERE status = 'PENDING'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS idx_reservations_pending_status");
    await queryRunner.query("DROP INDEX IF EXISTS idx_reservations_concert_id");
    await queryRunner.query("DROP INDEX IF EXISTS idx_tickets_concert_id");
    await queryRunner.query("DROP TABLE IF EXISTS reservations");
    await queryRunner.query("DROP TABLE IF EXISTS tickets");
    await queryRunner.query("DROP TABLE IF EXISTS concerts");
  }
}
