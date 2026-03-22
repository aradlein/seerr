import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermissions21773500000000 implements MigrationInterface {
  name = 'AddPermissions21773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "permissions2" integer DEFAULT 0`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "permissions2"`);
  }
}
