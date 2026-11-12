import { MigrationInterface, QueryRunner } from 'typeorm';

/** Password-login panel identities and their OpenWA session ownership grants. */
export class CreatePanelAuthTables1792300000000 implements MigrationInterface {
  name = 'CreatePanelAuthTables1792300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "panel_users" (
      "id" varchar PRIMARY KEY NOT NULL, "username" varchar(80) NOT NULL UNIQUE,
      "passwordHash" varchar(255) NOT NULL, "displayName" varchar(120),
      "role" varchar(20) NOT NULL DEFAULT ('user'), "isActive" boolean NOT NULL DEFAULT (1),
      "lastLoginAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "panel_user_sessions" (
      "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(36) NOT NULL, "sessionId" varchar(36) NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')), UNIQUE("userId", "sessionId")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_panel_user_sessions_userId" ON "panel_user_sessions" ("userId")`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "panel_login_sessions" (
      "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(36) NOT NULL, "apiKeyId" varchar(36) NOT NULL UNIQUE,
      "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_panel_login_sessions_userId" ON "panel_login_sessions" ("userId")`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "panel_credit_ledger" (
      "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(36) NOT NULL, "amount" integer NOT NULL,
      "remark" varchar(255), "sessionId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_panel_credit_ledger_userId" ON "panel_credit_ledger" ("userId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "panel_credit_ledger"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "panel_login_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "panel_user_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "panel_users"`);
  }
}
