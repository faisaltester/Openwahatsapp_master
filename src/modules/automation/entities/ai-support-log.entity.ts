import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('ai_support_logs')
@Unique('UQ_ai_support_logs_message', ['sessionId', 'messageId'])
@Index('IDX_ai_support_logs_chat_created', ['sessionId', 'chatId', 'createdAt'])
export class AiSupportLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) sessionId!: string;
  @Column({ type: 'varchar' }) chatId!: string;
  @Column({ type: 'varchar', length: 180 }) messageId!: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) sender!: string | null;
  @Column({ type: 'text' }) question!: string;
  @Column({ type: 'text', nullable: true }) answer!: string | null;
  @Column({ type: 'varchar', length: 24, default: 'answered' }) outcome!: 'answered' | 'no_match' | 'error' | 'menu' | 'human_requested';
  @CreateDateColumn() createdAt!: Date;
}
