import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentApiKey, RequireRole, SessionScoped } from '../auth/decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { AiSupportService } from './ai-support.service';
import { EnableAiSupportGroupsDto, SaveAiKnowledgeArticleDto, UpsertAiSupportGroupDto } from './dto/ai-support.dto';

@ApiTags('ai-support')
@Controller('sessions/:sessionId/ai-support')
@RequireRole(ApiKeyRole.ADMIN)
@SessionScoped()
export class AiSupportController {
  constructor(private readonly aiSupport: AiSupportService) {}
  @Get('status') @ApiOperation({ summary: 'Check approved-answer readiness for the OpenWA support workflow' })
  status(@Param('sessionId') sessionId: string) { return this.aiSupport.getStatus(sessionId); }
  @Get('groups') @ApiOperation({ summary: 'List support workflow group settings' })
  listGroups(@Param('sessionId') sessionId: string) { return this.aiSupport.listGroups(sessionId); }
  @Put('groups/all') @ApiOperation({ summary: 'Enable the support workflow in all listed groups' })
  enableAllGroups(@Param('sessionId') sessionId: string, @Body() dto: EnableAiSupportGroupsDto) { return this.aiSupport.enableAllGroups(sessionId, dto.groups); }
  @Put('groups') @ApiOperation({ summary: 'Configure support workflow for one WhatsApp group' })
  saveGroup(@Param('sessionId') sessionId: string, @Body() dto: UpsertAiSupportGroupDto) { return this.aiSupport.saveGroup(sessionId, dto); }
  @Get('knowledge') @ApiOperation({ summary: 'List support knowledge articles' })
  listArticles(@Param('sessionId') sessionId: string) { return this.aiSupport.listArticles(sessionId); }
  @Post('knowledge') @ApiOperation({ summary: 'Create a support knowledge article' })
  createArticle(@Param('sessionId') sessionId: string, @Body() dto: SaveAiKnowledgeArticleDto) { return this.aiSupport.createArticle(sessionId, dto); }
  @Put('knowledge/:articleId') @ApiOperation({ summary: 'Update a support knowledge article' })
  updateArticle(@Param('sessionId') sessionId: string, @Param('articleId') id: string, @Body() dto: SaveAiKnowledgeArticleDto) { return this.aiSupport.updateArticle(sessionId, id, dto); }
  @Delete('knowledge/:articleId') @ApiOperation({ summary: 'Delete a support knowledge article' })
  deleteArticle(@Param('sessionId') sessionId: string, @Param('articleId') id: string) { return this.aiSupport.deleteArticle(sessionId, id); }
  @Get('conversations') @ApiOperation({ summary: 'List recent AI support conversation records' })
  listLogs(@Param('sessionId') sessionId: string) { return this.aiSupport.listLogs(sessionId); }
  @Get('human-queue') @ApiOperation({ summary: 'List open human support requests' })
  humanQueue(@Param('sessionId') sessionId: string) { return this.aiSupport.listHumanQueue(sessionId); }
  @Get('cases') @ApiOperation({ summary: 'List support cases including closed history' })
  listCases(@Param('sessionId') sessionId: string) { return this.aiSupport.listCases(sessionId); }
  @Post('human-queue/:caseId/close') @ApiOperation({ summary: 'Close a resolved human support request' })
  closeHumanCase(@Param('sessionId') sessionId: string, @Param('caseId') caseId: string) { return this.aiSupport.closeHumanCase(sessionId, caseId); }
  @Post('human-queue/:caseId/claim') @ApiOperation({ summary: 'Assign an open support request to the current dashboard API key' })
  claimHumanCase(@Param('sessionId') sessionId: string, @Param('caseId') caseId: string, @CurrentApiKey() apiKey?: ApiKey) {
    return this.aiSupport.claimHumanCase(sessionId, caseId, apiKey?.name || apiKey?.id || 'OpenWA support agent');
  }
}
