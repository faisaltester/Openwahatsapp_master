import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { Repository } from 'typeorm';
import { AiKnowledgeArticle } from './entities/ai-knowledge-article.entity';
import { AiSupportCase } from './entities/ai-support-case.entity';
import { AiSupportGroup } from './entities/ai-support-group.entity';
import { AiSupportLog } from './entities/ai-support-log.entity';
import { SaveAiKnowledgeArticleDto, UpsertAiSupportGroupDto } from './dto/ai-support.dto';
import { PLUGIN_MESSAGE_PORT, type PluginMessagePort } from '../../core/plugins/plugin-host-ports';

const MAX_MESSAGE_AGE_SECONDS = 300;

@Injectable()
export class AiSupportService {
  private readonly logger = new Logger(AiSupportService.name);
  private messagePort?: PluginMessagePort;

  constructor(
    @InjectRepository(AiSupportGroup, 'data') private readonly groups: Repository<AiSupportGroup>,
    @InjectRepository(AiKnowledgeArticle, 'data') private readonly articles: Repository<AiKnowledgeArticle>,
    @InjectRepository(AiSupportLog, 'data') private readonly logs: Repository<AiSupportLog>,
    @InjectRepository(AiSupportCase, 'data') private readonly cases: Repository<AiSupportCase>,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  listGroups(sessionId: string) { return this.groups.find({ where: { sessionId }, order: { groupName: 'ASC' } }); }

  async getStatus(sessionId: string) {
    const approvedArticleCount = await this.articles.count({ where: { sessionId, approved: true, active: true } });
    return { mode: 'predefined', approvedArticleCount, ready: approvedArticleCount > 0 };
  }

  async saveGroup(sessionId: string, dto: UpsertAiSupportGroupDto) {
    if (!/^[\d-]+@g\.us$/.test(dto.chatId)) throw new BadRequestException('A valid WhatsApp group chatId ending in @g.us is required');
    if (typeof dto.groupName !== 'string' || !dto.groupName.trim() || dto.groupName.trim().length > 160) throw new BadRequestException('A valid WhatsApp groupName is required');
    if (dto.enabled) await this.assertReadyToEnable(sessionId);
    return this.persistGroup(sessionId, dto);
  }

  private async persistGroup(sessionId: string, dto: UpsertAiSupportGroupDto) {
    let group = await this.groups.findOne({ where: { sessionId, chatId: dto.chatId } });
    if (!group) group = this.groups.create({ sessionId, chatId: dto.chatId });
    Object.assign(group, { groupName: dto.groupName.trim(), enabled: dto.enabled, trigger: dto.trigger?.trim() || '*', cooldownSeconds: dto.cooldownSeconds ?? 60 });
    return this.groups.save(group);
  }

  async enableAllGroups(sessionId: string, rows: Array<{ chatId: string; groupName: string }>) {
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.chatId !== 'string' || !/^[\d-]+@g\.us$/.test(row.chatId) || typeof row.groupName !== 'string' || !row.groupName.trim() || row.groupName.trim().length > 160)) {
      throw new BadRequestException('Each group must include a valid WhatsApp group chatId and groupName');
    }
    if (rows.length) await this.assertReadyToEnable(sessionId);
    return Promise.all(rows.map(row => this.persistGroup(sessionId, { chatId: row.chatId, groupName: row.groupName.trim(), enabled: true, trigger: '*', cooldownSeconds: 60 })));
  }

  private async assertReadyToEnable(sessionId: string) {
    const status = await this.getStatus(sessionId);
    if (!status.approvedArticleCount) throw new BadRequestException('Add and approve at least one active support answer before enabling this group');
  }

  listArticles(sessionId: string) { return this.articles.find({ where: { sessionId }, order: { category: 'ASC', title: 'ASC' } }); }

  async createArticle(sessionId: string, dto: SaveAiKnowledgeArticleDto) {
    return this.articles.save(this.articles.create({
      sessionId, title: dto.title.trim(), category: dto.category?.trim() || 'General', question: dto.question.trim(), answer: dto.answer.trim(),
      keywords: cleanKeywords(dto.keywords), language: dto.language || 'en', approved: dto.approved ?? false, active: dto.active ?? true,
    }));
  }

  async updateArticle(sessionId: string, id: string, dto: SaveAiKnowledgeArticleDto) {
    const article = await this.articles.findOne({ where: { sessionId, id } });
    if (!article) throw new NotFoundException('Support answer not found');
    Object.assign(article, {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() || 'General' } : {}),
      ...(dto.question !== undefined ? { question: dto.question.trim() } : {}),
      ...(dto.answer !== undefined ? { answer: dto.answer.trim() } : {}),
      ...(dto.keywords !== undefined ? { keywords: cleanKeywords(dto.keywords) } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.approved !== undefined ? { approved: dto.approved } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    });
    return this.articles.save(article);
  }

  async deleteArticle(sessionId: string, id: string): Promise<void> {
    const article = await this.articles.findOne({ where: { sessionId, id } });
    if (!article) throw new NotFoundException('Support answer not found');
    await this.articles.remove(article);
  }

  listLogs(sessionId: string) { return this.logs.find({ where: { sessionId }, order: { createdAt: 'DESC' }, take: 100 }); }
  listHumanQueue(sessionId: string) { return this.cases.find({ where: { sessionId, status: 'human' }, order: { updatedAt: 'DESC' } }); }
  listCases(sessionId: string) { return this.cases.find({ where: { sessionId }, order: { updatedAt: 'DESC' }, take: 200 }); }

  async closeHumanCase(sessionId: string, caseId: string) {
    const supportCase = await this.cases.findOne({ where: { sessionId, id: caseId, status: 'human' } });
    if (!supportCase) throw new NotFoundException('Open human support request not found');
    supportCase.status = 'closed';
    supportCase.flowState = 'closed';
    supportCase.closedAt = new Date();
    return this.cases.save(supportCase);
  }

  async claimHumanCase(sessionId: string, caseId: string, agentName: string) {
    const supportCase = await this.cases.findOne({ where: { sessionId, id: caseId, status: 'human' } });
    if (!supportCase) throw new NotFoundException('Open human support request not found');
    if (supportCase.assignedTo && supportCase.assignedTo !== agentName) throw new ConflictException(`This request is already assigned to ${supportCase.assignedTo}`);
    supportCase.assignedTo = agentName;
    return this.cases.save(supportCase);
  }

  async evaluateInbound(sessionId: string, message: Record<string, unknown>): Promise<boolean> {
    try {
      if (message.fromMe === true || message.isGroup !== true) return false;
      const chatId = typeof message.chatId === 'string' ? message.chatId : '';
      const body = typeof message.body === 'string' ? message.body.trim() : '';
      const messageId = typeof message.id === 'string' ? message.id : '';
      const sender = typeof message.author === 'string' ? message.author : '';
      if (!chatId.endsWith('@g.us') || !body || !messageId || !sender) return false;
      const timestamp = typeof message.timestamp === 'number' ? message.timestamp : null;
      if (timestamp !== null && Date.now() / 1000 - timestamp > MAX_MESSAGE_AGE_SECONDS) return false;

      const group = await this.groups.findOne({ where: { sessionId, chatId, enabled: true } });
      if (!group) return false;
      const articles = await this.articles.find({ where: { sessionId, approved: true, active: true }, order: { category: 'ASC', title: 'ASC' } });
      const supportCase = await this.getOrCreateCase(sessionId, group, sender, chatId);
      if (supportCase.lastMessageId === messageId) return true;
      supportCase.lastMessageId = messageId;
      supportCase.lastQuestion = body;

      if (supportCase.status === 'human') {
        await this.cases.save(supportCase);
        await this.logStep(sessionId, chatId, messageId, sender, body, null, 'human_requested');
        return true; // Keep the conversation in human mode until an agent closes it.
      }
      if (supportCase.status === 'closed') {
        supportCase.status = 'bot';
        supportCase.flowState = 'category';
        supportCase.category = null;
        supportCase.selectedArticleId = null;
        supportCase.closeNote = null;
        supportCase.closedAt = null;
      }

      const log = await this.logStep(sessionId, chatId, messageId, sender, body, null, 'menu');
      const response = this.nextMenuResponse(supportCase, body, articles);
      await this.cases.save(supportCase);
      await this.sendAndLog(sessionId, chatId, response.text, log, response.outcome);
      return true;
    } catch (error) {
      this.logger.warn(`Support workflow skipped an inbound message: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async getOrCreateCase(sessionId: string, group: AiSupportGroup, sender: string, chatId: string) {
    let row = await this.cases.findOne({ where: { sessionId, chatId, sender } });
    if (!row) row = this.cases.create({ sessionId, chatId, sender, groupName: group.groupName, status: 'bot', assignedTo: null, flowState: 'category', category: null, selectedArticleId: null, lastQuestion: null, lastMessageId: null, closeNote: null, closedAt: null });
    row.groupName = group.groupName;
    return row;
  }

  private nextMenuResponse(supportCase: AiSupportCase, body: string, articles: AiKnowledgeArticle[]) {
    if (/^(human|agent|support|person|0)$/i.test(body.trim())) {
      supportCase.status = 'human';
      supportCase.flowState = 'human';
      return { text: 'Your request is now in the human support queue. A support person will reply here in this group. Please wait; you do not need to repeat your question.', outcome: 'human_requested' as const };
    }

    const categories = [...new Set(articles.map(article => article.category?.trim() || 'General'))];
    if (!categories.length) {
      supportCase.flowState = 'category';
      return { text: 'Support options are being prepared. Please contact the support team in this group.', outcome: 'no_match' as const };
    }

    if (supportCase.flowState === 'question' && supportCase.category) {
      const categoryArticles = articles.filter(article => (article.category?.trim() || 'General') === supportCase.category);
      const choice = parseMenuChoice(body, categoryArticles.length);
      if (choice !== null) {
        const article = categoryArticles[choice];
        supportCase.selectedArticleId = article.id;
        supportCase.flowState = 'category';
        return { text: `${article.answer.trim()}\n\nStill need help? Reply 0 or type human to talk to a support person.`, outcome: 'answered' as const };
      }
      return { text: questionMenu(supportCase.category, categoryArticles), outcome: 'menu' as const };
    }

    const choice = parseMenuChoice(body, categories.length);
    if (choice !== null) {
      const category = categories[choice];
      const categoryArticles = articles.filter(article => (article.category?.trim() || 'General') === category);
      supportCase.category = category;
      supportCase.flowState = 'question';
      return { text: questionMenu(category, categoryArticles), outcome: 'menu' as const };
    }
    supportCase.flowState = 'category';
    return { text: categoryMenu(categories), outcome: 'menu' as const };
  }

  private logStep(sessionId: string, chatId: string, messageId: string, sender: string, question: string, answer: string | null, outcome: AiSupportLog['outcome']) {
    return this.logs.save(this.logs.create({ sessionId, chatId, messageId, sender, question, answer, outcome }));
  }

  private async sendAndLog(sessionId: string, chatId: string, answer: string, record: AiSupportLog, outcome: AiSupportLog['outcome']) {
    const port = this.resolveMessagePort();
    if (!port) throw new Error('WhatsApp send service is unavailable');
    await port.sendText(sessionId, { chatId, text: answer });
    await this.logs.update(record.id, { answer, outcome });
  }

  private resolveMessagePort(): PluginMessagePort | undefined {
    if (!this.messagePort) {
      try { this.messagePort = this.moduleRef?.get<typeof PLUGIN_MESSAGE_PORT, PluginMessagePort>(PLUGIN_MESSAGE_PORT, { strict: false }); }
      catch (error) { this.logger.warn(`Could not resolve message service: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return this.messagePort;
  }
}

function parseMenuChoice(body: string, length: number): number | null {
  const match = body.trim().match(/^(\d+)$/);
  if (!match) return null;
  const choice = Number(match[1]) - 1;
  return Number.isInteger(choice) && choice >= 0 && choice < length ? choice : null;
}
function categoryMenu(categories: string[]) {
  return `Welcome to support. Please select a category by replying with its number:\n${categories.map((name, index) => `${index + 1}. ${name}`).join('\n')}\n\nYou can reply 0 at any time to talk to human support.`;
}
function questionMenu(category: string, articles: AiKnowledgeArticle[]) {
  if (!articles.length) return `There are no questions configured for ${category} yet. Reply 0 to talk to human support.`;
  return `${category} - please select your question by replying with its number:\n${articles.map((article, index) => `${index + 1}. ${article.question}`).join('\n')}\n\nReply 0 to talk to human support.`;
}
function cleanKeywords(keywords?: string[]) {
  return Array.isArray(keywords) ? keywords.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean).slice(0, 30) : [];
}
