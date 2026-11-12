import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A browser login maps to a short-lived OpenWA API key without exposing it to JavaScript. */
@Entity('panel_login_sessions')
export class PanelLoginSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  apiKeyId!: string;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
