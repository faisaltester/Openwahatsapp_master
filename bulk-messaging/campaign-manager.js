/**
 * Campaign Orchestrator & Batch Execution Engine
 * Handles multi-batch slicing (max 100 per API request), execution pacing,
 * polling GET /messages/batch/{batchId}, cancellation, scheduling, retries, and exporting.
 */

import { ReportStore } from './report-store.js';

export class CampaignManager {
  constructor(apiService) {
    this.api = apiService;
    this.state = 'idle'; // 'idle' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'
    this.activeBatchId = null;
    this.pollIntervalId = null;
    this.scheduleTimerId = null;
    this.scheduleTargetTime = null;
    this.campaignId = null;
    this.campaignName = '';
    this.sessionName = '';
    
    // Campaign statistics
    this.stats = {
      totalRecipients: 0,
      totalBatches: 0,
      currentBatchIndex: 0,
      sentCount: 0,
      failedCount: 0,
      pendingCount: 0,
      cancelledCount: 0,
    };

    this.batches = []; // Array of { index, batchId, status, items: [], results: [] }
    this.allResults = []; // Flattened results for all attempted recipients
    this.listeners = new Set();
    this.loopActive = false; // true while a start() loop is still executing
    this.wakers = new Set(); // resolvers of pending sleeps, woken on cancel
  }

  /** Cancellable sleep: resolves early when cancel() wakes it. */
  sleep(ms) {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }

  wakeAll() {
    [...this.wakers].forEach(w => w());
  }

  onUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload = {}) {
    for (const listener of this.listeners) {
      try {
        listener(event, { state: this.state, stats: this.stats, activeBatchId: this.activeBatchId, ...payload });
      } catch (err) {
        console.error('Listener error:', err);
      }
    }
  }

  /**
   * Slice recipients into API-compliant chunks (max 100 items per chunk)
   */
  static chunkRecipients(recipients, batchSize = 100) {
    const size = Math.min(Math.max(1, parseInt(batchSize, 10) || 100), 100);
    const chunks = [];
    for (let i = 0; i < recipients.length; i += size) {
      chunks.push(recipients.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Format message content for UI display and export
   */
  static getItemContentPreview(item) {
    if (!item) return '';
    if (item.type === 'text') {
      let textStr = item.content?.text || '';
      if (item.variables) {
        Object.entries(item.variables).forEach(([k, v]) => {
          textStr = textStr.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          textStr = textStr.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        });
      }
      return textStr;
    } else {
      const typeLabel = (item.type || 'Media').toUpperCase();
      const cap = item.content?.caption ? `: "${item.content.caption}"` : '';
      return `[${typeLabel}]${cap}`;
    }
  }

  /**
   * Build BulkMessageItemDto objects for API submission
   */
  static formatMessageItems(recipients, messageConfig) {
    const { type, text, media, mentions, sendSeparateTextMessage = true } = messageConfig;
    const hasMedia = ['image', 'video', 'audio', 'document'].includes(type) && (media?.url || media?.base64);
    const hasText = Boolean(text && text.trim());
    const mediaCaption = (media?.caption && media.caption.trim()) || '';

    const items = [];

    recipients.forEach(r => {
      const chatId = r.chatId || (r.number ? `${r.number}@c.us` : '');
      const variables = r.variables || {};

      if (!hasMedia) {
        // Plain text message
        items.push({
          chatId,
          type: 'text',
          content: {
            text: text || '',
            ...(mentions && mentions.length > 0 ? { mentions } : {}),
          },
          variables,
        });
        return;
      }

      // Media payload
      const mediaPayload = {};
      if (media?.url) mediaPayload.url = media.url;
      if (media?.base64) mediaPayload.base64 = media.base64;
      if (media?.mimetype) mediaPayload.mimetype = media.mimetype;
      if (media?.filename && type === 'document') mediaPayload.filename = media.filename;
      if (media?.ptt && type === 'audio') mediaPayload.ptt = true;

      // When sendSeparateTextMessage is true AND there is text in the main message box:
      // Send 1 Media item (with mediaCaption if provided), AND 1 Text item (with main text)!
      if (sendSeparateTextMessage && hasText) {
        // 1. Media item (with file caption if provided)
        items.push({
          chatId,
          type,
          content: {
            [type]: mediaPayload,
            ...(mediaCaption ? { caption: mediaCaption } : {}),
            ...(mentions && mentions.length > 0 ? { mentions } : {}),
          },
          variables,
        });

        // 2. Main Message Text item (with template variables)
        items.push({
          chatId,
          type: 'text',
          content: {
            text: text.trim(),
            ...(mentions && mentions.length > 0 ? { mentions } : {}),
          },
          variables,
        });
      } else {
        // Single message: combine caption if both exist, or use whichever is provided
        let captionText = undefined;
        if (mediaCaption && hasText) {
          captionText = `${mediaCaption}\n\n${text.trim()}`;
        } else if (mediaCaption) {
          captionText = mediaCaption;
        } else if (hasText) {
          captionText = text.trim();
        }

        items.push({
          chatId,
          type,
          content: {
            [type]: mediaPayload,
            ...(captionText ? { caption: captionText } : {}),
            ...(mentions && mentions.length > 0 ? { mentions } : {}),
          },
          variables,
        });
      }
    });

    return items;
  }

  /**
   * Prepare a new Campaign
   */
  setupCampaign({ campaignName, sessionId, sessionName, recipients, messageConfig, batchSize = 100, options = {}, interBatchDelaySeconds = 5 }) {
    if (this.state === 'running') {
      throw new Error('A campaign is already running');
    }
    if (this.loopActive) {
      throw new Error('The previous campaign is still stopping. Please wait a few seconds and try again.');
    }

    if (!sessionId) throw new Error('Active session is required');
    if (!recipients || recipients.length === 0) throw new Error('At least one recipient is required');

    this.sessionId = sessionId;
    this.sessionName = sessionName || sessionId;
    this.haltReason = null;
    this.campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.campaignName = campaignName || `Bulk Campaign ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    this.messageConfig = messageConfig;
    this.options = {
      delayBetweenMessages: Math.min(Math.max(3000, Number(options.delayBetweenMessages) || 5000), 60000),
      randomizeDelay: options.randomizeDelay !== false,
      stopOnError: options.stopOnError === true,
    };
    this.interBatchDelay = Math.max(10, Number(interBatchDelaySeconds) || 30);

    // Calculate effective batch chunk size so that total items per batch does not exceed 100
    const hasMedia = ['image', 'video', 'audio', 'document'].includes(messageConfig.type) && (messageConfig.media?.url || messageConfig.media?.base64);
    const hasText = Boolean(messageConfig.text && messageConfig.text.trim());
    const itemsPerRecipient = (hasMedia && hasText && messageConfig.sendSeparateTextMessage !== false) ? 2 : 1;
    const effectiveBatchSize = Math.max(1, Math.min(Math.floor(batchSize / itemsPerRecipient), 100));

    // Chunk into batches ensuring <= 100 items per batch
    const rawChunks = CampaignManager.chunkRecipients(recipients, effectiveBatchSize);
    this.batches = rawChunks.map((chunk, index) => ({
      index,
      batchId: `batch_${Date.now()}_${index + 1}`,
      status: 'pending',
      recipients: chunk,
      items: CampaignManager.formatMessageItems(chunk, messageConfig),
      results: [],
    }));

    const totalMessages = this.batches.reduce((sum, b) => sum + b.items.length, 0);

    this.stats = {
      totalRecipients: recipients.length,
      totalMessages,
      totalBatches: this.batches.length,
      currentBatchIndex: 0,
      sentCount: 0,
      failedCount: 0,
      pendingCount: totalMessages,
      cancelledCount: 0,
    };
    this.allResults = [];
    this.state = 'idle';

    this.notify('setup');
    return this.stats;
  }

  /**
   * Schedule campaign for future timestamp
   */
  schedule(targetDate) {
    if (this.scheduleTimerId) {
      clearTimeout(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }

    const now = Date.now();
    const targetMs = new Date(targetDate).getTime();
    const delay = targetMs - now;

    if (delay <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    this.state = 'scheduled';
    this.scheduleTargetTime = targetMs;

    this.scheduleTimerId = setTimeout(() => {
      this.scheduleTimerId = null;
      this.scheduleTargetTime = null;
      this.start();
    }, delay);

    this.notify('scheduled', { targetDate, delayMs: delay });
  }

  cancelSchedule() {
    if (this.scheduleTimerId) {
      clearTimeout(this.scheduleTimerId);
      this.scheduleTimerId = null;
      this.scheduleTargetTime = null;
      this.state = 'idle';
      this.notify('schedule_cancelled');
    }
  }

  /**
   * Start executing the campaign
   */
  async start() {
    if (this.state === 'running' || this.loopActive) return;
    this.cancelSchedule();

    this.loopActive = true;
    try {
      await this.runLoop();
    } finally {
      this.loopActive = false;
    }
  }

  async runLoop() {
    this.state = 'running';
    this.notify('started');

    // Persist campaign initialization in permanent ReportStore
    try {
      await ReportStore.saveCampaign({
        id: this.campaignId,
        name: this.campaignName,
        sessionId: this.sessionId,
        sessionName: this.sessionName,
        totalRecipients: this.stats.totalRecipients,
        totalMessages: this.stats.totalMessages,
        sentCount: 0,
        failedCount: 0,
        pendingCount: this.stats.totalMessages,
        messagePreview: CampaignManager.getItemContentPreview(this.batches[0]?.items[0]) || this.messageConfig?.text || '',
        mediaType: this.messageConfig?.type || 'text',
        hasPtt: Boolean(this.messageConfig?.media?.ptt),
        options: this.options,
        status: 'in_progress',
      });
    } catch (e) {
      console.warn('Could not save initial campaign to ReportStore:', e);
    }

    for (let i = this.stats.currentBatchIndex; i < this.batches.length; i++) {
      if (this.state !== 'running') break;

      this.stats.currentBatchIndex = i;
      const batch = this.batches[i];
      batch.status = 'processing';
      this.activeBatchId = batch.batchId;

      this.notify('batch_started', { batch });

      try {
        // 1. Submit batch via POST /api/sessions/{sessionId}/messages/send-bulk
        const response = await this.api.sendBulk(this.sessionId, {
          batchId: batch.batchId,
          messages: batch.items,
          options: this.options,
        });

        // Use returned batchId if generated by server
        if (response?.batchId) {
          batch.batchId = response.batchId;
          this.activeBatchId = batch.batchId;
        }

        // Cancelled while the submit request was in flight: the server never saw the
        // earlier cancel call for this batch, so cancel it now before polling.
        if (this.state === 'cancelled') {
          try { await this.api.cancelBatch(this.sessionId, batch.batchId); } catch (_) { /* best effort */ }
        }

        // 2. Poll status via GET /api/sessions/{sessionId}/messages/batch/{batchId}
        const finalBatchStatus = await this.pollBatchStatus(batch);
        batch.status = finalBatchStatus.status;
        batch.results = finalBatchStatus.results || [];
        
        // Merge into all results with enriched content preview
        batch.results.forEach((res, resIdx) => {
          const item = batch.items[resIdx];
          this.allResults.push({
            ...res,
            batchIndex: i + 1,
            batchId: batch.batchId,
            type: item?.type || res.type || 'text',
            content: res.content || CampaignManager.getItemContentPreview(item),
          });
        });

        this.updateStatsFromBatches();
        this.notify('batch_completed', { batch });

        // Stream results to permanent ReportStore immediately
        try {
          await ReportStore.appendCampaignLogs(this.campaignId, batch.results);
          await ReportStore.updateCampaign(this.campaignId, {
            sentCount: this.stats.sentCount,
            failedCount: this.stats.failedCount,
            pendingCount: this.stats.pendingCount,
          });
        } catch (e) {
          console.warn('Error syncing batch logs to ReportStore:', e);
        }

        if (finalBatchStatus.status === 'cancelled' || this.state === 'cancelled') {
          this.state = 'cancelled';
          break;
        }

        if (batch.results.some(r => r.error?.code === 'SEND_HALTED')) {
          console.error('Campaign halted: WhatsApp refused/restricted sending on this number.', batch.results.find(r => r.error?.code === 'SEND_HALTED')?.error);
          this.state = 'completed';
          this.haltReason = 'WhatsApp refused or restricted sending on this number. Campaign stopped; do not resend until the number is healthy.';
          this.notify('stopped_on_error', { batch, reason: this.haltReason });
          break;
        }

        if (this.options.stopOnError && batch.results.some(r => r.status === 'failed')) {
          this.state = 'completed';
          this.notify('stopped_on_error', { batch });
          break;
        }

        // 3. Inter-batch delay if more batches exist
        if (i < this.batches.length - 1 && this.state === 'running') {
          this.notify('inter_batch_delay', { seconds: this.interBatchDelay, nextBatch: i + 2 });
          await this.sleep(this.interBatchDelay * 1000);
        }

      } catch (err) {
        console.error(`Batch ${i + 1} submission error:`, err);
        batch.status = 'failed';
        batch.error = err.message;

        // No HTTP status = network error/timeout: the server may have accepted the batch anyway.
        // Marking its items "failed" would let "Retry failed" message the same people twice, so check.
        if (!err.status) {
          let existsOnServer = false;
          try {
            existsOnServer = Boolean(await this.api.getBatchStatus(this.sessionId, batch.batchId));
          } catch (_) { /* not found / unreachable */ }
          if (existsOnServer) {
            this.state = 'completed';
            this.haltReason = `Batch ${i + 1} reached the server but its progress could not be tracked. Campaign stopped to avoid duplicate messages; check the batch report before resending.`;
            this.notify('batch_failed', { batch, error: this.haltReason });
            break;
          }
        }
        
        // Mark all items in this batch as failed if not submitted
        if (!batch.results || batch.results.length === 0) {
          batch.items.forEach(item => {
            const failRes = {
              chatId: item.chatId,
              status: 'failed',
              error: { code: 'SUBMISSION_FAILED', message: err.message },
              batchIndex: i + 1,
              batchId: batch.batchId,
              type: item?.type || 'text',
              content: CampaignManager.getItemContentPreview(item),
            };
            batch.results.push(failRes);
            this.allResults.push(failRes);
          });
        }

        this.updateStatsFromBatches();
        this.notify('batch_failed', { batch, error: err.message });

        // Stream failed results to permanent ReportStore
        try {
          await ReportStore.appendCampaignLogs(this.campaignId, batch.results);
          await ReportStore.updateCampaign(this.campaignId, {
            sentCount: this.stats.sentCount,
            failedCount: this.stats.failedCount,
            pendingCount: this.stats.pendingCount,
          });
        } catch (e) {
          console.warn('Error syncing failed batch logs to ReportStore:', e);
        }

        // 401/403 (refused), 409 (batch already running on this number), 429 (rate limited),
        // 503 (session not connected): sending more batches cannot succeed and may worsen a restriction.
        if (this.options.stopOnError || [401, 403, 409, 429, 503].includes(err.status)) {
          this.state = 'completed';
          if (err.status) this.haltReason = `Campaign stopped: server returned HTTP ${err.status} (${err.message})`;
          break;
        }

        if (i < this.batches.length - 1 && this.state === 'running') {
          this.notify('inter_batch_delay', { seconds: this.interBatchDelay, nextBatch: i + 2 });
          await this.sleep(this.interBatchDelay * 1000);
        }
      }
    }

    if (this.state === 'running') {
      this.state = 'completed';
    }
    this.activeBatchId = null;

    // Finalize campaign in permanent ReportStore
    try {
      await ReportStore.updateCampaign(this.campaignId, {
        status: this.state,
        completedAt: Date.now(),
        sentCount: this.stats.sentCount,
        failedCount: this.stats.failedCount,
        pendingCount: this.stats.pendingCount,
      });
    } catch (e) {
      console.warn('Error finalizing campaign in ReportStore:', e);
    }

    this.notify('campaign_finished');
  }

  /**
   * Poll GET /messages/batch/{batchId} until terminal status
   */
  async pollBatchStatus(batch) {
    const batchId = batch.batchId;
    const MAX_POLL_ERRORS = 20;
    let pollErrors = 0;
    // Loop with cancellable sleeps (cancel() wakes them) so this can never hang forever.
    for (;;) {
        let statusRes;
        try {
          statusRes = await this.api.getBatchStatus(this.sessionId, batchId);
        } catch (err) {
          console.warn(`Polling error for batch ${batchId}:`, err.message);
          // Cancelled: stop with what we know. Do not mark unknown items "failed" (a retry would duplicate them).
          if (this.state === 'cancelled') return { status: 'cancelled', results: batch.results || [] };
          if (++pollErrors >= MAX_POLL_ERRORS) throw err;
          await this.sleep(Math.min(2500 * 2 ** (pollErrors - 1), 30000));
          continue;
        }
        {
          pollErrors = 0;
          let liveResults = [];
          if (Array.isArray(statusRes.results) && statusRes.results.length > 0) {
            liveResults = statusRes.results.map((res, resIdx) => {
              const item = batch.items[resIdx];
              return {
                ...res,
                batchId,
                type: item?.type || 'text',
                content: CampaignManager.getItemContentPreview(item),
              };
            });
            batch.results = liveResults;
          }

          this.notify('batch_progress', {
            batchId,
            progress: statusRes.progress,
            status: statusRes.status,
            results: liveResults,
            batch,
          });

          const isTerminal = ['completed', 'failed', 'cancelled'].includes(statusRes.status);
          if (isTerminal || this.state === 'cancelled') {
            return { ...statusRes, results: liveResults.length > 0 ? liveResults : (statusRes.results || []) };
          }
        }
        await this.sleep(1500);
    }
  }

  /**
   * Cancel active batch and halt campaign
   */
  async cancel() {
    if (this.state === 'scheduled') {
      // Nothing was sent yet: just drop the schedule.
      this.cancelSchedule();
      return;
    }
    if (this.state !== 'running') return;
    this.state = 'cancelled';

    if (this.activeBatchId) {
      try {
        await this.api.cancelBatch(this.sessionId, this.activeBatchId);
      } catch (err) {
        console.warn('API Cancel Batch failed:', err.message);
      }
    }
    // Wake pending poll/inter-batch sleeps so the run loop finishes promptly.
    this.wakeAll();

    this.updateStatsFromBatches();

    if (this.campaignId) {
      try {
        await ReportStore.updateCampaign(this.campaignId, {
          status: 'cancelled',
          completedAt: Date.now(),
          sentCount: this.stats.sentCount,
          failedCount: this.stats.failedCount,
          pendingCount: this.stats.pendingCount,
        });
      } catch (e) {
        console.warn('Error saving cancelled status to ReportStore:', e);
      }
    }

    this.notify('cancelled');
  }

  updateStatsFromBatches() {
    let sent = 0;
    let failed = 0;

    this.batches.forEach(b => {
      (b.results || []).forEach(r => {
        if (r.status === 'sent') sent++;
        else if (r.status === 'failed') failed++;
      });
    });

    const total = this.stats.totalMessages || this.stats.totalRecipients;
    this.stats.sentCount = sent;
    this.stats.failedCount = failed;
    this.stats.pendingCount = Math.max(0, total - sent - failed);
  }

  /**
   * Extract failed contacts for retry campaign
   */
  getFailedRecipients() {
    const failedChatIds = new Set(
      this.allResults.filter(r => r.status === 'failed').map(r => r.chatId)
    );

    const allRecipients = this.batches.flatMap(b => b.recipients);
    return allRecipients.filter(r => failedChatIds.has(r.chatId));
  }

  /**
   * Export results to CSV formatted text
   */
  exportResultsCSV(filter = 'all') {
    let list = this.allResults;
    if (filter === 'sent') list = list.filter(r => r.status === 'sent');
    if (filter === 'failed') list = list.filter(r => r.status === 'failed');

    const headers = ['#', 'Chat ID', 'Status', 'Type', 'Message Content', 'Message ID', 'Error Code', 'Error Message', 'Sent At', 'Batch ID'];
    const lines = [headers.join(',')];

    list.forEach((r, idx) => {
      const errCode = r.error?.code || '';
      const errMsg = (r.error?.message || '').replace(/"/g, '""');
      const content = (r.content || '').replace(/"/g, '""');
      const sentAt = r.sentAt || '';
      lines.push([
        idx + 1,
        `"${r.chatId}"`,
        `"${r.status}"`,
        `"${r.type || 'text'}"`,
        `"${content}"`,
        `"${r.messageId || ''}"`,
        `"${errCode}"`,
        `"${errMsg}"`,
        `"${sentAt}"`,
        `"${r.batchId || ''}"`,
      ].join(','));
    });

    return lines.join('\n');
  }
}
