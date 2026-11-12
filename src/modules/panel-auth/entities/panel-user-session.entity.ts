import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Links a panel account to one OpenWA WhatsApp session UUID. */
@Entity('panel_user_sessions')
@Index(['userId', 'sessionId'], { unique: true })
export class PanelUserSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
