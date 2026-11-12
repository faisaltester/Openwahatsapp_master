import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { BrandingController } from './branding.controller';

@Module({
  controllers: [SettingsController, BrandingController],
})
export class SettingsModule {}
