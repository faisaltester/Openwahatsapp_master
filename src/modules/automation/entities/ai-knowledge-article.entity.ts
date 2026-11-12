import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('ai_knowledge_articles')
@Index('IDX_ai_knowledge_articles_session', ['sessionId'])
export class AiKnowledgeArticle {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) sessionId!: string;
  @Column({ type: 'varchar', length: 180 }) title!: string;
  @Column({ type: 'varchar', length: 120, default: 'General' }) category!: string;
  @Column({ type: 'text' }) question!: string;
  @Column({ type: 'text' }) answer!: string;
  @Column({ type: jsonColumnType(), default: '[]' }) keywords!: string[];
  @Column({ type: 'varchar', length: 24, default: 'en' }) language!: string;
  @Column({ type: 'boolean', default: false }) approved!: boolean;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
