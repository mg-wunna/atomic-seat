import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddTicketCategory1777392001000 implements MigrationInterface {
  name = "AddTicketCategory1777392001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE tickets ADD COLUMN category varchar NOT NULL DEFAULT 'General'",
    );
    await queryRunner.query(
      "CREATE INDEX idx_tickets_concert_category_status ON tickets(concert_id, category, status)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS idx_tickets_concert_category_status");
  }
}
