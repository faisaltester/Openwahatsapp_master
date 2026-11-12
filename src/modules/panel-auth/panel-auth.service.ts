import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AuthService } from '../auth/auth.service';
import { CreateCreditEntryDto, CreatePanelUserDto, PanelLoginDto } from './dto/panel-auth.dto';
import { PanelCreditLedger } from './entities/panel-credit-ledger.entity';
import { PanelLoginSession } from './entities/panel-login-session.entity';
import { PanelUser, PanelUserRole } from './entities/panel-user.entity';
import { PanelUserSession } from './entities/panel-user-session.entity';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class PanelAuthService {
  constructor(
    @InjectRepository(PanelUser, 'main') private readonly users: Repository<PanelUser>,
    @InjectRepository(PanelUserSession, 'main') private readonly grants: Repository<PanelUserSession>,
    @InjectRepository(PanelLoginSession, 'main') private readonly logins: Repository<PanelLoginSession>,
    @InjectRepository(PanelCreditLedger, 'main') private readonly credits: Repository<PanelCreditLedger>,
    private readonly authService: AuthService,
  ) {}

  private apiRole(role: PanelUserRole): ApiKeyRole {
    return role === PanelUserRole.ADMIN ? ApiKeyRole.ADMIN : role === PanelUserRole.SUPPORT ? ApiKeyRole.VIEWER : ApiKeyRole.OPERATOR;
  }

  async createUser(dto: CreatePanelUserDto): Promise<PanelUser> {
    const username = dto.username.trim().toLowerCase();
    if (await this.users.exists({ where: { username } })) throw new ConflictException('Username already exists');
    const user = await this.users.save(this.users.create({
      username, passwordHash: await hashPassword(dto.password), displayName: dto.displayName?.trim() || null,
      role: dto.role, isActive: true, lastLoginAt: null,
    }));
    await this.replaceSessionGrants(user.id, dto.sessionIds ?? []);
    return user;
  }

  async login(dto: PanelLoginDto): Promise<{ rawKey: string; user: PanelUser }> {
    const user = await this.users.findOne({ where: { username: dto.username.trim().toLowerCase() } });
    if (!user || !user.isActive || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const grants = user.role === PanelUserRole.ADMIN ? null : (await this.grants.find({ where: { userId: user.id } })).map(g => g.sessionId);
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const { apiKey, rawKey } = await this.authService.createApiKey({
      name: `panel:${user.username}:${Date.now()}`, role: this.apiRole(user.role), allowedSessions: grants ?? undefined, expiresAt: expiresAt.toISOString(),
    });
    await this.logins.save(this.logins.create({ userId: user.id, apiKeyId: apiKey.id, expiresAt }));
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return { rawKey, user };
  }

  async logoutByApiKey(apiKeyId: string | undefined): Promise<void> {
    if (!apiKeyId) return;
    const login = await this.logins.findOne({ where: { apiKeyId } });
    if (!login) return;
    await this.authService.revoke(apiKeyId);
    await this.logins.delete({ id: login.id });
  }

  async me(apiKeyId: string | undefined): Promise<PanelUser> {
    if (!apiKeyId) throw new UnauthorizedException();
    const login = await this.logins.findOne({ where: { apiKeyId } });
    if (!login || login.expiresAt < new Date()) throw new UnauthorizedException();
    const user = await this.users.findOne({ where: { id: login.userId, isActive: true } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async listUsers(): Promise<Array<PanelUser & { sessionIds: string[] }>> {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });
    const grants = await this.grants.find();
    return users.map(user => Object.assign(user, { sessionIds: grants.filter(grant => grant.userId === user.id).map(grant => grant.sessionId) }));
  }

  async replaceSessionGrants(userId: string, sessionIds: string[]): Promise<void> {
    if (!(await this.users.exists({ where: { id: userId } }))) throw new NotFoundException('Panel user not found');
    await this.grants.delete({ userId });
    const unique = [...new Set(sessionIds)];
    if (unique.length) await this.grants.save(unique.map(sessionId => this.grants.create({ userId, sessionId })));
    // A scoped OpenWA key snapshots its allowed sessions at login. Revoke all of this user's
    // existing browser sessions so a removed grant takes effect immediately, not at cookie expiry.
    const activeLogins = await this.logins.find({ where: { userId } });
    await Promise.all(activeLogins.map(login => this.authService.revoke(login.apiKeyId).catch(() => undefined)));
    if (activeLogins.length) await this.logins.delete({ userId });
  }

  async addCredit(dto: CreateCreditEntryDto): Promise<PanelCreditLedger> {
    if (dto.amount === 0) throw new ConflictException('Credit amount cannot be zero');
    if (!(await this.users.exists({ where: { id: dto.userId } }))) throw new NotFoundException('Panel user not found');
    return this.credits.save(this.credits.create({ userId: dto.userId, amount: dto.amount, remark: dto.remark?.trim() || null, sessionId: dto.sessionId || null }));
  }

  async creditsFor(userId: string): Promise<{ balance: number; entries: PanelCreditLedger[] }> {
    const entries = await this.credits.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return { balance: entries.reduce((total, entry) => total + entry.amount, 0), entries };
  }
}
