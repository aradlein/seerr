import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookSupport1773000000000 implements MigrationInterface {
  name = 'AddBookSupport1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "openLibraryId" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_media_openLibraryId" ON "media" ("openLibraryId")`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD COLUMN "mediaFormat" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "bookQuotaLimit" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "bookQuotaDays" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_media_openLibraryId"`);
    await queryRunner.query(
      `ALTER TABLE "media" DROP COLUMN "openLibraryId"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "mediaFormat"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "bookQuotaLimit"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "bookQuotaDays"`
    );
  }
}
