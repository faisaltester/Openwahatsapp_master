import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { CreateCreditEntryDto, CreatePanelUserDto, PanelLoginDto, ReplacePanelUserSessionsDto } from './dto/panel-auth.dto';
import { PanelAuthService } from './panel-auth.service';

@ApiTags('panel-auth')
@Controller('panel')
export class PanelAuthController {
  constructor(private readonly panelAuth: PanelAuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PanelLoginDto, @Res({ passthrough: true }) response: Response) {
    const { rawKey, user } = await this.panelAuth.login(dto);
    // Desktop OpenWA is commonly served over http://127.0.0.1 even with NODE_ENV=production.
    // Secure cookies would be discarded there, so TLS deployments opt in explicitly.
    response.cookie('openwa_session', rawKey, { httpOnly: true, sameSite: 'lax', secure: process.env.PANEL_COOKIE_SECURE === 'true', path: '/', maxAge: 8 * 60 * 60 * 1000 });
    return { user: this.present(user), role: user.role, apiRole: user.role === 'admin' ? 'admin' : user.role === 'support' ? 'viewer' : 'operator' };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentApiKey() key: ApiKey | undefined, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.panelAuth.logoutByApiKey(key?.id);
    response.clearCookie('openwa_session', { httpOnly: true, sameSite: 'lax', secure: process.env.PANEL_COOKIE_SECURE === 'true', path: '/' });
  }

  @Get('auth/me')
  async me(@CurrentApiKey() key?: ApiKey) { return { user: this.present(await this.panelAuth.me(key?.id)) }; }

  @Get('users')
  @RequireRole(ApiKeyRole.ADMIN)
  async users() { return (await this.panelAuth.listUsers()).map(user => ({ ...this.present(user), sessionIds: user.sessionIds })); }

  @Post('users')
  @RequireRole(ApiKeyRole.ADMIN)
  async createUser(@Body() dto: CreatePanelUserDto) { return this.present(await this.panelAuth.createUser(dto)); }

  @Put('users/:userId/sessions')
  @RequireRole(ApiKeyRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async replaceGrants(@Param('userId') userId: string, @Body() dto: ReplacePanelUserSessionsDto): Promise<void> {
    await this.panelAuth.replaceSessionGrants(userId, dto.sessionIds);
  }

  @Get('credits/me')
  async myCredits(@CurrentApiKey() key?: ApiKey) {
    const user = await this.panelAuth.me(key?.id);
    return this.panelAuth.creditsFor(user.id);
  }

  @Get('users/:userId/credits')
  @RequireRole(ApiKeyRole.ADMIN)
  async credits(@Param('userId') userId: string) { return this.panelAuth.creditsFor(userId); }

  @Post('credits')
  @RequireRole(ApiKeyRole.ADMIN)
  async addCredit(@Body() dto: CreateCreditEntryDto) { return this.panelAuth.addCredit(dto); }

  private present(user: { id: string; username: string; displayName: string | null; role: string; isActive: boolean; createdAt: Date; lastLoginAt: Date | null }) {
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isActive: user.isActive, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
  }
}
