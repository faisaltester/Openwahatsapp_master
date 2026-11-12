import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRuleController } from './automation-rule.controller';
import { AiSupportGroup } from './entities/ai-support-group.entity';
import { AiKnowledgeArticle } from './entities/ai-knowledge-article.entity';
import { AiSupportLog } from './entities/ai-support-log.entity';
import { AiSupportCase } from './entities/ai-support-case.entity';
import { AiSupportService } from './ai-support.service';
import { AiSupportController } from './ai-support.controller';

/**
 * Deliberately imports no feature module: SessionModule imports this one (the projector fires rule
 * evaluation), so anything imported here must not lead back to SessionModule. The reply dependency
 * (MessageService) is resolved lazily via ModuleRef inside the service for exactly that reason.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule, AiSupportGroup, AiKnowledgeArticle, AiSupportLog, AiSupportCase], 'data')],
  controllers: [AutomationRuleController, AiSupportController],
  providers: [AutomationRulesService, AiSupportService],
  exports: [AutomationRulesService, AiSupportService],
})
export class AutomationModule {}
