import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AiSupportFlowState = 'category' | 'question' | 'human' | 'closed';

@Entity('ai_support_cases')
@Index('IDX_ai_support_cases_queue', ['sessionId', 'status', 'updatedAt'])
@Index('UQ_ai_support_cases_client', ['sessionId', 'chatId', 'sender'], { unique: true })
export class AiSupportCase {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) sessionId!: string;
  @Column({ type: 'varchar', length: 180 }) chatId!: string;
  @Column({ type: 'varchar', length: 120 }) sender!: string;
  @Column({ type: 'varchar', length: 160 }) groupName!: string;
  @Column({ type: 'varchar', length: 24, default: 'bot' }) status!: 'bot' | 'human' | 'closed';
  @Column({ type: 'varchar', length: 120, nullable: true }) assignedTo!: string | null;
  @Column({ type: 'varchar', length: 24, default: 'category' }) flowState!: AiSupportFlowState;
  @Column({ type: 'varchar', length: 120, nullable: true }) category!: string | null;
  @Column({ type: 'varchar', length: 180, nullable: true }) selectedArticleId!: string | null;
  @Column({ type: 'text', nullable: true }) lastQuestion!: string | null;
  @Column({ type: 'text', nullable: true }) closeNote!: string | null;
  @Column({ type: 'varchar', length: 180, nullable: true }) lastMessageId!: string | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
  @Column({ type: process.env.DATABASE_TYPE === 'postgres' ? ('timestamp' as const) : ('datetime' as const), nullable: true }) closedAt!: Date | null;
}
