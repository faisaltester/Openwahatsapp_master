import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelAuthController } from './panel-auth.controller';
import { PanelAuthService } from './panel-auth.service';
import { PanelLoginSession } from './entities/panel-login-session.entity';
import { PanelUser } from './entities/panel-user.entity';
import { PanelUserSession } from './entities/panel-user-session.entity';
import { PanelCreditLedger } from './entities/panel-credit-ledger.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PanelUser, PanelUserSession, PanelLoginSession, PanelCreditLedger], 'main')],
  controllers: [PanelAuthController], providers: [PanelAuthService], exports: [PanelAuthService],
})
export class PanelAuthModule {}
