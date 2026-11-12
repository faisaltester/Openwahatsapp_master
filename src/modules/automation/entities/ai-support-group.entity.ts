import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('ai_support_groups')
@Unique('UQ_ai_support_groups_session_chat', ['sessionId', 'chatId'])
@Index('IDX_ai_support_groups_session', ['sessionId'])
export class AiSupportGroup {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) sessionId!: string;
  @Column({ type: 'varchar' }) chatId!: string;
  @Column({ type: 'varchar', length: 160 }) groupName!: string;
  @Column({ type: 'boolean', default: false }) enabled!: boolean;
  @Column({ type: 'varchar', length: 32, default: '/help' }) trigger!: string;
  @Column({ type: 'int', default: 60 }) cooldownSeconds!: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
