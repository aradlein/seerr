import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpenLibraryIdToWatchlistAndBlocklist1774000000000 implements MigrationInterface {
  name = 'AddOpenLibraryIdToWatchlistAndBlocklist1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD COLUMN "openLibraryId" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_watchlist_openLibraryId" ON "watchlist" ("openLibraryId")`
    );
    await queryRunner.query(
      `ALTER TABLE "blocklist" ADD COLUMN "openLibraryId" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blocklist_openLibraryId" ON "blocklist" ("openLibraryId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_blocklist_openLibraryId"`);
    await queryRunner.query(
      `ALTER TABLE "blocklist" DROP COLUMN "openLibraryId"`
    );
    await queryRunner.query(`DROP INDEX "IDX_watchlist_openLibraryId"`);
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP COLUMN "openLibraryId"`
    );
  }
}
