import { BadRequestException, Body, Controller, Get, NotFoundException, Put, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { DEFAULT_DATA_DIR } from '../../config/configuration';

/**
 * Panel branding (logo, app name, version label) that an admin can change from the dashboard.
 * Stored as plain files under <data>/branding so it survives rebuilds and restarts.
 * The read endpoints are public because the login page shows the branding before anyone signs in.
 */
export interface Branding {
  appName: string;
  /** Free text shown instead of the automatic "v1.2.3" label. Empty = automatic. */
  versionText: string;
  showVersion: boolean;
  /** Optional "Need help? View Documentation" line under the login form. */
  showHelp: boolean;
  helpText: string;
  helpLinkText: string;
  helpUrl: string;
  /** Public URL of the uploaded logo, or '' for the built-in one. */
  logoUrl: string;
  updatedAt: string | null;
}

interface StoredBranding {
  appName: string;
  versionText: string;
  showVersion: boolean;
  showHelp: boolean;
  helpText: string;
  helpLinkText: string;
  helpUrl: string;
  logoFile: string;
  updatedAt: string | null;
}

interface UpdateBrandingBody {
  appName?: string;
  versionText?: string;
  showVersion?: boolean;
  showHelp?: boolean;
  helpText?: string;
  helpLinkText?: string;
  helpUrl?: string;
  /** data:image/...;base64,... to replace the logo, null to go back to the built-in logo. */
  logo?: string | null;
}

const MAX_LOGO_BYTES = 1024 * 1024;
// SVG is deliberately not accepted: opened directly it can run script on this origin.
const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': {
    ext: 'png',
    magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': {
    ext: 'webp',
    magic: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'image/gif': { ext: 'gif', magic: b => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  'image/x-icon': { ext: 'ico', magic: b => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
};
const EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([type, v]) => [v.ext, type]),
);

const DEFAULTS: StoredBranding = {
  appName: '',
  versionText: '',
  showVersion: true,
  showHelp: false,
  helpText: 'Need help?',
  helpLinkText: 'View Documentation',
  helpUrl: '',
  logoFile: '',
  updatedAt: null,
};

@ApiTags('settings')
@Controller('settings/branding')
export class BrandingController {
  private readonly dir = path.resolve(process.cwd(), DEFAULT_DATA_DIR, 'branding');
  private readonly file = path.join(this.dir, 'branding.json');

  private async load(): Promise<StoredBranding> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<StoredBranding>;
      return { ...DEFAULTS, ...raw };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private toPublic(s: StoredBranding): Branding {
    return {
      appName: s.appName,
      versionText: s.versionText,
      showVersion: s.showVersion,
      showHelp: s.showHelp,
      helpText: s.helpText,
      helpLinkText: s.helpLinkText,
      helpUrl: s.helpUrl,
      // The timestamp busts browser caches when the logo is replaced.
      logoUrl: s.logoFile ? `/api/settings/branding/logo?v=${encodeURIComponent(s.updatedAt ?? '')}` : '',
      updatedAt: s.updatedAt,
    };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get panel branding (logo, name, version label)' })
  async get(): Promise<Branding> {
    return this.toPublic(await this.load());
  }

  @Get('logo')
  @Public()
  @ApiOperation({ summary: 'Download the uploaded panel logo' })
  async logo(@Res() res: Response): Promise<void> {
    const s = await this.load();
    const name = path.basename(s.logoFile || '');
    const type = EXT_TYPES[path.extname(name).slice(1)];
    if (!name || !type) throw new NotFoundException('No custom logo');
    let data: Buffer;
    try {
      data = await fs.readFile(path.join(this.dir, name));
    } catch {
      throw new NotFoundException('No custom logo');
    }
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(data);
  }

  @Put()
  @RequireRole(ApiKeyRole.ADMIN)
  @ApiOperation({ summary: 'Update panel branding' })
  async update(@Body() body: UpdateBrandingBody): Promise<Branding> {
    const current = await this.load();
    const next: StoredBranding = { ...current };

    if (body.appName !== undefined) {
      if (typeof body.appName !== 'string') throw new BadRequestException('appName must be text');
      next.appName = body.appName.trim().slice(0, 40);
    }
    if (body.versionText !== undefined) {
      if (typeof body.versionText !== 'string') throw new BadRequestException('versionText must be text');
      next.versionText = body.versionText.trim().slice(0, 60);
    }
    if (body.showVersion !== undefined) next.showVersion = body.showVersion !== false;
    if (body.showHelp !== undefined) next.showHelp = body.showHelp === true;
    for (const key of ['helpText', 'helpLinkText'] as const) {
      const v = body[key];
      if (v === undefined) continue;
      if (typeof v !== 'string') throw new BadRequestException(`${key} must be text`);
      next[key] = v.trim().slice(0, 80);
    }
    if (body.helpUrl !== undefined) {
      if (typeof body.helpUrl !== 'string') throw new BadRequestException('helpUrl must be text');
      const url = body.helpUrl.trim().slice(0, 500);
      // Only plain web, mail and phone links; anything else (javascript:, data:) could run script.
      if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
        throw new BadRequestException('Help link must start with https://, http://, mailto: or tel:');
      }
      next.helpUrl = url;
    }
    if (next.showHelp && !next.helpUrl)
      throw new BadRequestException('Add a help link address, or turn the help link off');

    await fs.mkdir(this.dir, { recursive: true });

    if (body.logo === null) {
      next.logoFile = '';
    } else if (body.logo !== undefined) {
      const m =
        typeof body.logo === 'string' ? /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(body.logo) : null;
      const kind = m ? IMAGE_TYPES[m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase()] : undefined;
      if (!m || !kind) throw new BadRequestException('Logo must be a PNG, JPG, WEBP, GIF or ICO image');
      const data = Buffer.from(m[2], 'base64');
      if (data.length === 0) throw new BadRequestException('The logo file is empty');
      if (data.length > MAX_LOGO_BYTES) throw new BadRequestException('Logo must be 1 MB or smaller');
      if (!kind.magic(data)) throw new BadRequestException('The file is not a valid image of that type');
      next.logoFile = `logo.${kind.ext}`;
      await fs.writeFile(path.join(this.dir, next.logoFile), data);
    }

    // Remove logo files that are no longer used.
    for (const ext of Object.keys(EXT_TYPES)) {
      if (`logo.${ext}` !== next.logoFile) await fs.rm(path.join(this.dir, `logo.${ext}`), { force: true });
    }

    next.updatedAt = new Date().toISOString();
    await fs.writeFile(this.file, JSON.stringify(next, null, 2));
    return this.toPublic(next);
  }
}
