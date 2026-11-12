import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiSupport1792100000000 implements MigrationInterface {
  name = 'CreateAiSupport1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const pg = queryRunner.dataSource.options.type === 'postgres';
    const id = pg ? 'varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::varchar' : 'varchar PRIMARY KEY NOT NULL';
    const created = pg ? 'timestamp NOT NULL DEFAULT NOW()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const updated = pg ? 'timestamp NOT NULL DEFAULT NOW()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const json = pg ? "jsonb NOT NULL DEFAULT '[]'::jsonb" : "text NOT NULL DEFAULT '[]'";

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "ai_support_groups" (
      "id" ${id}, "sessionId" varchar NOT NULL, "chatId" varchar NOT NULL, "groupName" varchar(160) NOT NULL,
      "enabled" boolean NOT NULL DEFAULT false, "trigger" varchar(32) NOT NULL DEFAULT '/help',
      "cooldownSeconds" integer NOT NULL DEFAULT 60, "createdAt" ${created}, "updatedAt" ${updated},
      CONSTRAINT "UQ_ai_support_groups_session_chat" UNIQUE ("sessionId", "chatId"),
      CONSTRAINT "FK_ai_support_groups_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_ai_support_groups_session" ON "ai_support_groups" ("sessionId")');

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "ai_knowledge_articles" (
      "id" ${id}, "sessionId" varchar NOT NULL, "title" varchar(180) NOT NULL, "question" text NOT NULL,
      "answer" text NOT NULL, "keywords" ${json}, "language" varchar(24) NOT NULL DEFAULT 'en',
      "approved" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true,
      "createdAt" ${created}, "updatedAt" ${updated},
      CONSTRAINT "FK_ai_knowledge_articles_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_ai_knowledge_articles_session" ON "ai_knowledge_articles" ("sessionId")');

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "ai_support_logs" (
      "id" ${id}, "sessionId" varchar NOT NULL, "chatId" varchar NOT NULL, "messageId" varchar(180) NOT NULL,
      "sender" varchar(120), "question" text NOT NULL, "answer" text,
      "outcome" varchar(24) NOT NULL DEFAULT 'answered', "createdAt" ${created},
      CONSTRAINT "UQ_ai_support_logs_message" UNIQUE ("sessionId", "messageId"),
      CONSTRAINT "FK_ai_support_logs_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE)`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_ai_support_logs_chat_created" ON "ai_support_logs" ("sessionId", "chatId", "createdAt")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "ai_support_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "ai_knowledge_articles"');
    await queryRunner.query('DROP TABLE IF EXISTS "ai_support_groups"');
  }
}
