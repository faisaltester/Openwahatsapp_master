import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Immutable balance entries. Positive credits add balance; negative credits consume it. */
@Entity('panel_credit_ledger')
export class PanelCreditLedger {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column({ type: 'varchar', length: 36 }) userId!: string;
  @Column({ type: 'integer' }) amount!: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) remark!: string | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) sessionId!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
