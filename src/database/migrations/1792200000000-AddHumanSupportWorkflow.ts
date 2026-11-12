import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHumanSupportWorkflow1792200000000 implements MigrationInterface {
  name = 'AddHumanSupportWorkflow1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const pg = queryRunner.dataSource.options.type === 'postgres';
    const id = pg ? 'varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::varchar' : 'varchar PRIMARY KEY NOT NULL';
    const created = pg ? 'timestamp NOT NULL DEFAULT NOW()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const updated = pg ? 'timestamp NOT NULL DEFAULT NOW()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const closed = pg ? 'timestamp' : 'datetime';
    await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD COLUMN "category" varchar(120) NOT NULL DEFAULT 'General'`);
    await queryRunner.query(`CREATE TABLE "ai_support_cases" (
      "id" ${id}, "sessionId" varchar NOT NULL, "chatId" varchar(180) NOT NULL, "sender" varchar(120) NOT NULL,
      "groupName" varchar(160) NOT NULL, "status" varchar(24) NOT NULL DEFAULT 'bot', "assignedTo" varchar(120), "flowState" varchar(24) NOT NULL DEFAULT 'category',
      "category" varchar(120), "selectedArticleId" varchar(180), "lastQuestion" text, "closeNote" text,
      "lastMessageId" varchar(180), "createdAt" ${created}, "updatedAt" ${updated}, "closedAt" ${closed},
      CONSTRAINT "FK_ai_support_cases_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE,
      CONSTRAINT "UQ_ai_support_cases_client" UNIQUE ("sessionId", "chatId", "sender"))`);
    await queryRunner.query('CREATE INDEX "IDX_ai_support_cases_queue" ON "ai_support_cases" ("sessionId", "status", "updatedAt")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "ai_support_cases"');
    await queryRunner.query('ALTER TABLE "ai_knowledge_articles" DROP COLUMN "category"');
  }
}
