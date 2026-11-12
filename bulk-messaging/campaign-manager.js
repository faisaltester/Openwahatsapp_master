/**
 * Campaign Orchestrator & Batch Execution Engine
 * Handles multi-batch slicing (max 100 per API request), execution pacing,
 * polling GET /messages/batch/{batchId}, cancellation, scheduling, retries, and exporting.
 *
 * Reload safety: the server keeps sending a batch it has accepted even after this page goes away,
 * but the *next* batches are submitted from here. So every campaign persists
 *   - its send plan (recipients, message, settings)       -> ReportStore campaign_plans
 *   - per-batch progress (server batch ids and states)    -> campaign.batches
 *   - an activity log of every action                     -> ReportStore campaign_events
 * and holds a Web Lock while this tab drives it. After a reload, inspect() asks the server what
 * really happened and resumeFrom() continues from the first unfinished batch.
 */

import { ReportStore } from './report-store.js?v=20261112d';

const TERMINAL_BATCH = ['completed', 'failed', 'cancelled'];
const LOCK_PREFIX = 'openwa-bulk-campaign:';
const HEARTBEAT_MS = 5000;
// Without Web Locks, a campaign whose heartbeat is newer than this is assumed alive in another tab.
const HEARTBEAT_STALE_MS = 20000;

export class CampaignManager {
  constructor(apiService) {
    this.api = apiService;
    // 'idle' | 'scheduled' | 'running' | 'completed' | 'stopped' | 'cancelled'
    this.state = 'idle';
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
    this.events = []; // Activity log of the current campaign (also persisted)
    this.listeners = new Set();
    this.loopActive = false; // true while a start() loop is still executing
    this.wakers = new Set(); // resolvers of pending sleeps, woken on cancel
    this.releaseLock = null;
    this.heartbeatTimer = null;
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

  /** True while this tab owns a campaign that has not finished (running or waiting for its schedule). */
  get isBusy() {
    return this.state === 'running' || this.state === 'scheduled' || this.loopActive;
  }

  // ---------- Activity log ----------

  /** Append one action to the campaign's activity log (memory + IndexedDB) and tell the UI. */
  log(level, type, message, campaignId = this.campaignId) {
    const entry = { ts: Date.now(), level, type, message };
    if (campaignId === this.campaignId) {
      this.events.push(entry);
      this.notify('log', { entry });
    }
    ReportStore.addCampaignEvent(campaignId, entry);
    return entry;
  }

  // ---------- Cross-tab lock & heartbeat ----------

  static lockName(campaignId) {
    return `${LOCK_PREFIX}${campaignId}`;
  }

  /**
   * Hold an exclusive Web Lock for this campaign while this tab drives it. The browser releases it
   * when the tab closes or reloads, which is how another tab (or this one after a reload) can tell
   * a live campaign from an orphaned one. Resolves false if another tab already holds it.
   */
  holdLock() {
    if (this.releaseLock) return Promise.resolve(true);
    if (!navigator.locks?.request) return Promise.resolve(true);
    return new Promise(acquired => {
      navigator.locks.request(CampaignManager.lockName(this.campaignId), { ifAvailable: true }, lock => {
        if (!lock) {
          acquired(false);
          return undefined;
        }
        acquired(true);
        return new Promise(release => { this.releaseLock = release; });
      }).catch(() => acquired(true));
    });
  }

  dropLock() {
    if (this.releaseLock) this.releaseLock();
    this.releaseLock = null;
  }

  /** true = a live tab is driving this campaign, false = nobody is, null = cannot tell (no Web Locks). */
  static async isLockHeld(campaignId) {
    if (!navigator.locks?.query) return null;
    try {
      const { held = [], pending = [] } = await navigator.locks.query();
      const name = CampaignManager.lockName(campaignId);
      return held.some(l => l.name === name) || pending.some(l => l.name === name);
    } catch {
      return null;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const beat = () => {
      if (!this.campaignId) return;
      ReportStore.updateCampaign(this.campaignId, { heartbeatAt: Date.now() }).catch(() => {});
    };
    beat();
    this.heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // ---------- Persistence ----------

  batchMeta(b) {
    const sent = (b.results || []).filter(r => r.status === 'sent').length;
    const failed = (b.results || []).filter(r => r.status === 'failed').length;
    return {
      index: b.index,
      batchId: b.batchId,
      status: b.status,
      submitted: Boolean(b.submitted),
      recipients: b.recipients.length,
      total: b.items.length,
      sent,
      failed,
      submittedAt: b.submittedAt || null,
      finishedAt: b.finishedAt || null,
      error: b.error || '',
    };
  }

  /** Save per-batch progress and counters to the campaign record. */
  async persistProgress(extra = {}) {
    if (!this.campaignId) return;
    try {
      await ReportStore.updateCampaign(this.campaignId, {
        batches: this.batches.map(b => this.batchMeta(b)),
        totalBatches: this.batches.length,
        sentCount: this.stats.sentCount,
        failedCount: this.stats.failedCount,
        pendingCount: this.stats.pendingCount,
        heartbeatAt: Date.now(),
        ...extra,
      });
    } catch (e) {
      console.warn('Could not save campaign progress:', e);
    }
  }

  /** First write of a campaign: the report row plus the plan needed to resume it. */
  async persistNew(status, extra = {}) {
    try {
      await ReportStore.saveCampaign({
        id: this.campaignId,
        name: this.campaignName,
        sessionId: this.sessionId,
        sessionName: this.sessionName,
        totalRecipients: this.stats.totalRecipients,
        totalMessages: this.stats.totalMessages,
        totalBatches: this.batches.length,
        batches: this.batches.map(b => this.batchMeta(b)),
        sentCount: 0,
        failedCount: 0,
        pendingCount: this.stats.totalMessages,
        messagePreview: CampaignManager.getTextBlocks(this.messageConfig).join('\n\n---\n\n')
          || CampaignManager.getItemContentPreview(this.batches[0]?.items[0]) || '',
        mediaType: this.messageConfig?.type || 'text',
        hasPtt: Boolean(this.messageConfig?.media?.ptt),
        options: { ...this.options, interBatchDelaySeconds: this.interBatchDelay },
        status,
        heartbeatAt: Date.now(),
        ...extra,
      });
      await ReportStore.saveCampaignPlan(this.campaignId, {
        recipients: this.plan.recipients,
        messageConfig: this.messageConfig,
        recipientsPerBatch: this.plan.recipientsPerBatch,
        options: this.options,
        interBatchDelay: this.interBatchDelay,
      });
      this.persisted = true;
    } catch (e) {
      console.warn('Could not save campaign to ReportStore:', e);
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
   * Non-empty message blocks, in order. `texts` (one entry per composer block) takes precedence over
   * the legacy single `text` field.
   */
  static getTextBlocks(messageConfig) {
    const raw = Array.isArray(messageConfig?.texts) ? messageConfig.texts : [messageConfig?.text];
    return raw.map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  }

  static hasMediaPayload(messageConfig) {
    const { type, media } = messageConfig || {};
    return ['image', 'video', 'audio', 'document'].includes(type) && Boolean(media?.url || media?.base64);
  }

  /** How many BulkMessageItemDto entries one recipient produces for this config. */
  static itemsPerRecipient(messageConfig) {
    const blocks = CampaignManager.getTextBlocks(messageConfig).length;
    if (!CampaignManager.hasMediaPayload(messageConfig)) return Math.max(1, blocks);
    // Without separate texts the first block rides in the media caption.
    const separate = messageConfig.sendSeparateTextMessage !== false;
    return 1 + (separate ? blocks : Math.max(0, blocks - 1));
  }

  /**
   * Build BulkMessageItemDto objects for API submission. Each message block becomes its own text
   * item; a recipient's items stay adjacent so the server sends them in order.
   */
  static formatMessageItems(recipients, messageConfig) {
    const { type, media, mentions, sendSeparateTextMessage = true } = messageConfig;
    const hasMedia = CampaignManager.hasMediaPayload(messageConfig);
    const blocks = CampaignManager.getTextBlocks(messageConfig);
    const mediaCaption = (media?.caption && media.caption.trim()) || '';
    const mentionPart = mentions && mentions.length > 0 ? { mentions } : {};

    const items = [];

    recipients.forEach(r => {
      const chatId = r.chatId || (r.number ? `${r.number}@c.us` : '');
      const variables = r.variables || {};
      const pushText = text => items.push({ chatId, type: 'text', content: { text, ...mentionPart }, variables });

      if (!hasMedia) {
        if (blocks.length === 0) pushText('');
        blocks.forEach(pushText);
        return;
      }

      // Media payload
      const mediaPayload = {};
      if (media?.url) mediaPayload.url = media.url;
      if (media?.base64) mediaPayload.base64 = media.base64;
      if (media?.mimetype) mediaPayload.mimetype = media.mimetype;
      if (media?.filename && type === 'document') mediaPayload.filename = media.filename;
      if (media?.ptt && type === 'audio') mediaPayload.ptt = true;

      // Separate texts: the media item carries only the file caption, then every block follows.
      // Otherwise the first block is merged into the caption and any further blocks follow.
      const separate = sendSeparateTextMessage !== false;
      const captionText = separate || blocks.length === 0
        ? mediaCaption
        : [mediaCaption, blocks[0]].filter(Boolean).join('\n\n');

      items.push({
        chatId,
        type,
        content: {
          [type]: mediaPayload,
          ...(captionText ? { caption: captionText } : {}),
          ...mentionPart,
        },
        variables,
      });

      (separate ? blocks : blocks.slice(1)).forEach(pushText);
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
    this.stopNote = '';
    this.persisted = false;
    this.resumed = false;
    this.startedAt = null;
    this.events = [];
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
    const itemsPerRecipient = CampaignManager.itemsPerRecipient(messageConfig);
    const effectiveBatchSize = Math.max(1, Math.min(Math.floor(batchSize / itemsPerRecipient), 100));
    this.plan = { recipients, recipientsPerBatch: effectiveBatchSize };

    this.buildBatches(recipients, effectiveBatchSize, []);

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

  /** Slice recipients into batches. `metas` (saved per-batch progress) restores ids and states on resume. */
  buildBatches(recipients, recipientsPerBatch, metas) {
    const rawChunks = CampaignManager.chunkRecipients(recipients, recipientsPerBatch);
    const stamp = Date.now();
    this.batches = rawChunks.map((chunk, index) => {
      const meta = metas[index] || {};
      return {
        index,
        batchId: meta.batchId || `batch_${stamp}_${index + 1}`,
        status: meta.status && meta.status !== 'submitting' ? meta.status : 'pending',
        submitted: Boolean(meta.submitted) && meta.status !== 'pending',
        submittedAt: meta.submittedAt || null,
        finishedAt: meta.finishedAt || null,
        recipients: chunk,
        items: CampaignManager.formatMessageItems(chunk, this.messageConfig),
        results: [],
      };
    });
  }

  describeBatch(i) {
    return `Batch ${i + 1} of ${this.batches.length}`;
  }

  /**
   * Schedule campaign for future timestamp
   */
  async schedule(targetDate) {
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
    if (!(await this.holdLock())) {
      throw new Error('This campaign is already open in another tab.');
    }

    this.state = 'scheduled';
    this.scheduleTargetTime = targetMs;

    this.scheduleTimerId = setTimeout(() => {
      this.scheduleTimerId = null;
      this.scheduleTargetTime = null;
      this.log('info', 'schedule_fired', 'Scheduled time reached. Starting automatically.');
      this.start();
    }, delay);

    if (this.persisted) {
      await ReportStore.updateCampaign(this.campaignId, { status: 'scheduled', scheduledFor: targetMs, statusNote: '' }).catch(() => {});
    } else {
      await this.persistNew('scheduled', { scheduledFor: targetMs });
    }
    this.log('info', 'scheduled', `Scheduled for ${new Date(targetMs).toLocaleString()}: ${this.stats.totalRecipients} recipients, ${this.stats.totalMessages} messages. Keep this page open until then.`);

    this.notify('scheduled', { targetDate, delayMs: delay });
  }

  /** User dropped a scheduled campaign before it started. */
  cancelSchedule(reason = 'Scheduled campaign cancelled before it started. Nothing was sent.') {
    if (this.scheduleTimerId) {
      clearTimeout(this.scheduleTimerId);
      this.scheduleTimerId = null;
      this.scheduleTargetTime = null;
      this.state = 'cancelled';
      this.log('warn', 'schedule_cancelled', reason);
      if (this.campaignId) {
        ReportStore.updateCampaign(this.campaignId, { status: 'cancelled', completedAt: Date.now(), statusNote: reason }).catch(() => {});
        ReportStore.deleteCampaignPlan(this.campaignId);
      }
      this.dropLock();
      this.notify('schedule_cancelled');
    }
  }

  /**
   * Start executing the campaign
   */
  async start() {
    if (this.state === 'running' || this.loopActive) return;
    // Send now on a scheduled campaign: drop the timer without cancelling the campaign.
    clearTimeout(this.scheduleTimerId);
    this.scheduleTimerId = null;
    this.scheduleTargetTime = null;

    if (!(await this.holdLock())) {
      throw new Error('This campaign is already being sent from another tab.');
    }

    this.loopActive = true;
    try {
      await this.runLoop();
    } finally {
      this.loopActive = false;
      this.stopHeartbeat();
      this.dropLock();
    }
  }

  async runLoop() {
    this.state = 'running';
    this.startedAt = this.startedAt || Date.now();
    this.startHeartbeat();

    if (!this.persisted) {
      await this.persistNew('in_progress', { startedAt: this.startedAt });
    } else {
      await this.persistProgress({ status: 'in_progress', startedAt: this.startedAt, statusNote: '' });
    }

    const pace = `${(this.options.delayBetweenMessages / 1000).toFixed(1)} s between messages${this.options.randomizeDelay ? ' (+0-2 s jitter)' : ''}`;
    const done = this.batches.filter(b => TERMINAL_BATCH.includes(b.status)).length;
    const watching = this.batches.some(b => b.submitted && !TERMINAL_BATCH.includes(b.status));
    if (this.resumed && (done > 0 || watching)) {
      this.log('info', 'resumed', `Resumed: ${done} of ${this.batches.length} batches were already finished. Continuing with ${this.describeBatch(this.stats.currentBatchIndex).toLowerCase()}.`);
    } else {
      this.log('info', 'started', `Started sending to ${this.stats.totalRecipients} recipients: ${this.stats.totalMessages} messages in ${this.batches.length} batch${this.batches.length === 1 ? '' : 'es'}, ${pace}.`);
    }
    this.notify('started');

    for (let i = this.stats.currentBatchIndex; i < this.batches.length; i++) {
      if (this.state !== 'running') break;

      this.stats.currentBatchIndex = i;
      const batch = this.batches[i];
      if (TERMINAL_BATCH.includes(batch.status)) continue; // finished before a reload

      this.activeBatchId = batch.batchId;

      try {
        if (batch.submitted) {
          // Resumed while the server was still sending this batch: watch it, do not send it again.
          batch.status = 'processing';
          this.log('info', 'reattached', `${this.describeBatch(i)}: the server is still sending it. Watching its progress again.`);
          this.notify('batch_started', { batch });
        } else {
          // Saved before the request so a reload mid-request can still ask the server about this id.
          batch.status = 'submitting';
          batch.submittedAt = Date.now();
          await this.persistProgress();
          this.notify('batch_started', { batch });

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
          batch.submitted = true;
          batch.status = 'processing';
          await this.persistProgress();
          this.log('info', 'batch_accepted', `${this.describeBatch(i)}: server accepted ${batch.items.length} message${batch.items.length === 1 ? '' : 's'} for ${batch.recipients.length} recipient${batch.recipients.length === 1 ? '' : 's'}.`);

          // Cancelled while the submit request was in flight: the server never saw the
          // earlier cancel call for this batch, so cancel it now before polling.
          if (this.state === 'cancelled') {
            try { await this.api.cancelBatch(this.sessionId, batch.batchId); } catch (_) { /* best effort */ }
          }
        }

        // 2. Poll status via GET /api/sessions/{sessionId}/messages/batch/{batchId}
        const finalBatchStatus = await this.pollBatchStatus(batch);
        batch.status = finalBatchStatus.status;
        batch.results = this.enrichResults(batch, finalBatchStatus.results || []);
        batch.finishedAt = Date.now();

        this.rebuildAllResults();
        this.updateStatsFromBatches();
        this.notify('batch_completed', { batch });

        const bSent = batch.results.filter(r => r.status === 'sent').length;
        const bFailed = batch.results.filter(r => r.status === 'failed').length;
        const bNot = batch.items.length - bSent - bFailed;
        this.log(bFailed || batch.status !== 'completed' ? 'warn' : 'ok', 'batch_done',
          `${this.describeBatch(i)} ${batch.status === 'cancelled' ? 'cancelled' : 'finished'}: ${bSent} sent, ${bFailed} failed${bNot > 0 ? `, ${bNot} not sent` : ''}.`);

        // Stream results to permanent ReportStore immediately
        try {
          await ReportStore.appendCampaignLogs(this.campaignId, batch.results);
        } catch (e) {
          console.warn('Error syncing batch logs to ReportStore:', e);
        }
        await this.persistProgress();

        if (finalBatchStatus.status === 'cancelled' || this.state === 'cancelled') {
          this.state = 'cancelled';
          break;
        }

        const halted = batch.results.find(r => r.error?.code === 'SEND_HALTED');
        if (halted) {
          console.error('Campaign halted: WhatsApp refused/restricted sending on this number.', halted.error);
          this.state = 'stopped';
          this.haltReason = 'WhatsApp refused or restricted sending on this number. Campaign stopped; do not resend until the number is healthy.';
          this.log('bad', 'halted', this.haltReason);
          this.notify('stopped_on_error', { batch, reason: this.haltReason });
          break;
        }

        if (this.options.stopOnError && bFailed > 0) {
          this.state = 'stopped';
          this.stopNote = `Stopped after ${this.describeBatch(i).toLowerCase()} because "Stop on first error" is on and ${bFailed} message${bFailed === 1 ? '' : 's'} failed.`;
          this.log('warn', 'stopped_on_error', this.stopNote);
          this.notify('stopped_on_error', { batch });
          break;
        }

        // 3. Inter-batch delay if more batches exist
        if (i < this.batches.length - 1 && this.state === 'running') {
          this.log('info', 'pause', `Waiting ${this.interBatchDelay} s before ${this.describeBatch(i + 1).toLowerCase()}.`);
          this.notify('inter_batch_delay', { seconds: this.interBatchDelay, nextBatch: i + 2 });
          await this.sleep(this.interBatchDelay * 1000);
        }

      } catch (err) {
        console.error(`Batch ${i + 1} submission error:`, err);
        batch.status = 'failed';
        batch.error = err.message;
        batch.finishedAt = Date.now();

        // No HTTP status = network error/timeout: the server may have accepted the batch anyway.
        // Marking its items "failed" would let "Retry failed" message the same people twice, so check.
        if (!err.status) {
          let existsOnServer = false;
          try {
            existsOnServer = Boolean(await this.api.getBatchStatus(this.sessionId, batch.batchId));
          } catch (_) { /* not found / unreachable */ }
          if (existsOnServer) {
            this.state = 'stopped';
            this.haltReason = `Batch ${i + 1} reached the server but its progress could not be tracked. Campaign stopped to avoid duplicate messages; check the batch report before resending.`;
            this.log('bad', 'batch_untracked', this.haltReason);
            await this.persistProgress();
            this.notify('batch_failed', { batch, error: this.haltReason });
            break;
          }
        }

        this.log('bad', 'batch_failed', `${this.describeBatch(i)}: could not be sent (${err.status ? `HTTP ${err.status}: ` : ''}${err.message}).`);

        // Mark all items in this batch as failed if not submitted
        if (!batch.results || batch.results.length === 0) {
          batch.results = this.enrichResults(batch, batch.items.map(item => ({
            chatId: item.chatId,
            status: 'failed',
            error: { code: 'SUBMISSION_FAILED', message: err.message },
          })));
        }

        this.rebuildAllResults();
        this.updateStatsFromBatches();
        this.notify('batch_failed', { batch, error: err.message });

        // Stream failed results to permanent ReportStore
        try {
          await ReportStore.appendCampaignLogs(this.campaignId, batch.results);
        } catch (e) {
          console.warn('Error syncing failed batch logs to ReportStore:', e);
        }
        await this.persistProgress();

        // 401/403 (refused), 409 (batch already running on this number), 429 (rate limited),
        // 503 (session not connected): sending more batches cannot succeed and may worsen a restriction.
        if (this.options.stopOnError || [401, 403, 409, 429, 503].includes(err.status)) {
          this.state = 'stopped';
          if (err.status) this.haltReason = `Campaign stopped: server returned HTTP ${err.status} (${err.message})`;
          else this.stopNote = `Stopped after ${this.describeBatch(i).toLowerCase()} failed because "Stop on first error" is on.`;
          this.log('warn', 'stopped', this.haltReason || this.stopNote);
          break;
        }

        if (i < this.batches.length - 1 && this.state === 'running') {
          this.log('info', 'pause', `Waiting ${this.interBatchDelay} s before ${this.describeBatch(i + 1).toLowerCase()}.`);
          this.notify('inter_batch_delay', { seconds: this.interBatchDelay, nextBatch: i + 2 });
          await this.sleep(this.interBatchDelay * 1000);
        }
      }
    }

    if (this.state === 'running') {
      this.state = 'completed';
    }
    this.activeBatchId = null;

    const { sentCount, failedCount, pendingCount, totalMessages } = this.stats;
    const summary = `${sentCount} of ${totalMessages} messages sent, ${failedCount} failed${pendingCount ? `, ${pendingCount} not sent` : ''}.`;
    let note;
    if (this.state === 'completed') {
      note = `Finished. ${summary}`;
      this.log(failedCount ? 'warn' : 'ok', 'finished', note);
    } else if (this.state === 'cancelled') {
      note = `Cancelled by user. ${summary} Messages already sent cannot be recalled.`;
      this.log('warn', 'cancelled', note);
    } else {
      note = `${this.haltReason || this.stopNote || 'Stopped.'} ${summary}`;
    }

    // Finalize campaign in permanent ReportStore
    await this.persistProgress({ status: this.state, completedAt: Date.now(), statusNote: note });
    if (!pendingCount) ReportStore.deleteCampaignPlan(this.campaignId);

    this.notify('campaign_finished');
  }

  /** Attach batch/item position and recipient name to raw server results. */
  enrichResults(batch, results) {
    const names = new Map(batch.recipients.map(r => [r.chatId || (r.number ? `${r.number}@c.us` : ''), r.name || '']));
    return results.map((res, resIdx) => {
      const item = batch.items[resIdx];
      return {
        ...res,
        batchId: batch.batchId,
        batchIndex: batch.index + 1,
        itemIndex: resIdx,
        name: res.name || names.get(res.chatId) || '',
        type: item?.type || res.type || 'text',
        content: typeof res.content === 'string' && res.content ? res.content : CampaignManager.getItemContentPreview(item),
      };
    });
  }

  rebuildAllResults() {
    this.allResults = this.batches.flatMap(b => b.results || []);
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
          if (pollErrors === 0) this.log('warn', 'poll_error', `${this.describeBatch(batch.index)}: lost contact with the server (${err.message}). Retrying…`);
          if (++pollErrors >= MAX_POLL_ERRORS) throw err;
          await this.sleep(Math.min(2500 * 2 ** (pollErrors - 1), 30000));
          continue;
        }
        {
          if (pollErrors > 0) this.log('info', 'poll_recovered', `${this.describeBatch(batch.index)}: server reachable again.`);
          pollErrors = 0;
          let liveResults = [];
          if (Array.isArray(statusRes.results) && statusRes.results.length > 0) {
            liveResults = this.enrichResults(batch, statusRes.results);
            batch.results = liveResults;
            this.updateStatsFromBatches(); // live Sent/Failed counters, not just at batch end
          }

          this.notify('batch_progress', {
            batchId,
            progress: statusRes.progress,
            status: statusRes.status,
            results: liveResults,
            batch,
          });

          const isTerminal = TERMINAL_BATCH.includes(statusRes.status);
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
    this.log('warn', 'cancel_requested', 'Cancel requested. Stopping the current batch on the server; no further batches will be sent.');

    if (this.activeBatchId) {
      try {
        await this.api.cancelBatch(this.sessionId, this.activeBatchId);
      } catch (err) {
        console.warn('API Cancel Batch failed:', err.message);
        this.log('warn', 'cancel_error', `The server did not confirm the cancel (${err.message}). It may already have finished that batch.`);
      }
    }
    // Wake pending poll/inter-batch sleeps so the run loop finishes promptly.
    this.wakeAll();

    this.updateStatsFromBatches();
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

  // ==========================================================================
  // Recovery after a page reload
  // ==========================================================================

  /** Saved report log row -> the result shape the monitor and retry logic use. */
  static logToResult(log) {
    return {
      chatId: log.rawChatId || log.recipient,
      status: log.status,
      messageId: log.waMessageId || undefined,
      error: log.error ? { message: log.error } : undefined,
      sentAt: log.timestamp,
      content: log.content,
      type: log.type,
      name: log.name,
      batchId: log.batchId,
      batchIndex: log.batchIndex,
      itemIndex: log.itemIndex,
    };
  }

  /**
   * Work out what really happened to an unfinished campaign whose page went away, by asking the
   * server about every batch that had been handed to it. Saves whatever it learns (results, batch
   * states, counters) and returns a verdict:
   *   other_tab      another open tab is still driving it
   *   server_running the server is still sending a batch; the batches after it are waiting
   *   interrupted    nothing is sending; some batches were never sent
   *   finished       every batch finished (possibly while the page was closed)
   *   schedule_lost  it was waiting for its scheduled time (future or missed)
   *   unreachable    the server could not be asked
   *   legacy         created before resume support; its batches cannot be checked
   */
  static async inspect(api, campaignId) {
    const campaign = await ReportStore.getCampaign(campaignId);
    if (!campaign) return { kind: 'gone' };

    const locked = await CampaignManager.isLockHeld(campaignId);
    const beatAge = Date.now() - (campaign.heartbeatAt || 0);
    if (locked === true || (locked === null && beatAge < HEARTBEAT_STALE_MS && campaign.status !== 'interrupted')) {
      return { kind: 'other_tab', campaign };
    }

    const plan = await ReportStore.getCampaignPlan(campaignId);
    if (campaign.scheduledFor && !campaign.startedAt) {
      return { kind: 'schedule_lost', campaign, plan, missed: campaign.scheduledFor <= Date.now() };
    }

    const metas = Array.isArray(campaign.batches) ? campaign.batches.map(m => ({ ...m })) : [];
    if (!metas.length) return { kind: 'legacy', campaign, plan };

    // Rebuild items so recovered results carry their message preview.
    let items = [];
    if (plan) {
      const chunks = CampaignManager.chunkRecipients(plan.recipients || [], plan.recipientsPerBatch || 100);
      items = chunks.map(c => CampaignManager.formatMessageItems(c, plan.messageConfig || {}));
    }

    let active = null;
    const learned = [];
    for (const meta of metas) {
      if (TERMINAL_BATCH.includes(meta.status) || meta.status === 'pending') continue;
      // 'submitting' or 'processing': ask the server.
      let res;
      try {
        res = await api.getBatchStatus(campaign.sessionId, meta.batchId);
      } catch (err) {
        if (err.status === 404) {
          if (meta.status === 'submitting') {
            meta.status = 'pending'; // the request never reached the server: safe to send later
            meta.submitted = false;
            learned.push(`Batch ${meta.index + 1} never reached the server; it is still to be sent.`);
          } else {
            meta.status = 'failed';
            meta.error = 'The server no longer knows this batch.';
            learned.push(`Batch ${meta.index + 1} is unknown to the server; its results could not be recovered.`);
          }
          continue;
        }
        return { kind: 'unreachable', campaign, plan, error: err.message };
      }

      meta.submitted = true;
      const results = (res.results || []).map((r, idx) => {
        const item = items[meta.index]?.[idx];
        return {
          ...r,
          batchId: meta.batchId,
          batchIndex: meta.index + 1,
          itemIndex: idx,
          type: item?.type || 'text',
          content: CampaignManager.getItemContentPreview(item),
        };
      });
      if (results.length) await ReportStore.appendCampaignLogs(campaignId, results);
      meta.sent = res.progress?.sent ?? results.filter(r => r.status === 'sent').length;
      meta.failed = res.progress?.failed ?? results.filter(r => r.status === 'failed').length;

      if (TERMINAL_BATCH.includes(res.status)) {
        meta.status = res.status;
        meta.finishedAt = res.completedAt ? new Date(res.completedAt).getTime() : Date.now();
        learned.push(`Batch ${meta.index + 1} ${res.status} on the server while the page was away: ${meta.sent} sent, ${meta.failed} failed.`);
      } else {
        meta.status = 'processing';
        active = { meta, progress: res.progress || { total: meta.total, sent: meta.sent, failed: meta.failed } };
      }
    }

    // Counters come from the saved per-recipient logs, which now include anything recovered.
    const details = await ReportStore.getCampaignDetails(campaignId);
    const logs = details?.logs || [];
    const sentCount = logs.filter(l => l.status === 'sent').length;
    const failedCount = logs.filter(l => l.status === 'failed').length;
    const totalMessages = campaign.totalMessages || campaign.totalRecipients || 0;
    const updates = {
      batches: metas,
      sentCount,
      failedCount,
      pendingCount: Math.max(0, totalMessages - sentCount - failedCount),
    };
    const updated = await ReportStore.updateCampaign(campaignId, updates) || { ...campaign, ...updates };

    const totalBatches = campaign.totalBatches || metas.length;
    const finishedBatches = metas.filter(m => TERMINAL_BATCH.includes(m.status)).length;
    const remainingBatches = totalBatches - finishedBatches - (active ? 1 : 0);
    const verdict = { campaign: updated, plan, logs, learned, active, remainingBatches, totalBatches, finishedBatches };

    if (active) return { kind: 'server_running', ...verdict };
    if (remainingBatches > 0) return { kind: 'interrupted', ...verdict };
    return { kind: 'finished', ...verdict };
  }

  /**
   * Take over an unfinished campaign after a reload: rebuild its batches from the saved plan and
   * outcome, then continue from the first unfinished batch (watching, not resending, one the
   * server is still processing). Call start() — or schedule() — afterwards.
   */
  async resumeFrom(campaign, plan, logs = []) {
    if (this.isBusy) throw new Error('Another campaign is running in this tab.');
    if (!plan?.recipients?.length) throw new Error('This campaign cannot be resumed: its recipient list was not saved.');

    this.campaignId = campaign.id;
    this.campaignName = campaign.name;
    this.sessionId = campaign.sessionId;
    this.sessionName = campaign.sessionName || campaign.sessionId;
    this.messageConfig = plan.messageConfig;
    this.options = plan.options;
    this.interBatchDelay = plan.interBatchDelay || 30;
    this.plan = { recipients: plan.recipients, recipientsPerBatch: plan.recipientsPerBatch };
    this.haltReason = null;
    this.stopNote = '';
    this.persisted = true;
    this.resumed = true;
    this.startedAt = campaign.startedAt || null;
    this.events = await ReportStore.getCampaignEvents(campaign.id);

    this.buildBatches(plan.recipients, plan.recipientsPerBatch, campaign.batches || []);
    // A failed batch with no saved results (e.g. lost on the server) has nothing to restore.
    this.batches.forEach(b => {
      if (!TERMINAL_BATCH.includes(b.status)) return;
      b.results = logs.filter(l => l.batchId === b.batchId).map(CampaignManager.logToResult)
        .sort((x, y) => (x.itemIndex ?? 0) - (y.itemIndex ?? 0));
    });

    const totalMessages = this.batches.reduce((sum, b) => sum + b.items.length, 0);
    const firstOpen = this.batches.findIndex(b => !TERMINAL_BATCH.includes(b.status));
    this.stats = {
      totalRecipients: plan.recipients.length,
      totalMessages,
      totalBatches: this.batches.length,
      currentBatchIndex: firstOpen < 0 ? this.batches.length : firstOpen,
      sentCount: 0,
      failedCount: 0,
      pendingCount: totalMessages,
      cancelledCount: 0,
    };
    this.rebuildAllResults();
    this.updateStatsFromBatches();
    this.state = 'idle';
    this.notify('setup');
  }

  /** Stop an orphaned campaign from outside: cancel its server batch (if any) and close the report. */
  static async stopOrphan(api, verdict, reason) {
    const { campaign } = verdict;
    let serverNote = '';
    if (verdict.active) {
      try {
        await api.cancelBatch(campaign.sessionId, verdict.active.meta.batchId);
        serverNote = ` Batch ${verdict.active.meta.index + 1} was cancelled on the server.`;
      } catch (err) {
        serverNote = ` The server did not confirm cancelling batch ${verdict.active.meta.index + 1} (${err.message}).`;
      }
    }
    // Re-read so results of the batch that was just cancelled are captured.
    const fresh = await CampaignManager.inspect(api, campaign.id).catch(() => null);
    const c = fresh?.campaign || campaign;
    const note = `${reason}${serverNote} ${c.sentCount || 0} of ${c.totalMessages || c.totalRecipients || 0} messages were sent; the rest were not.`;
    await ReportStore.updateCampaign(campaign.id, {
      status: (c.sentCount || 0) > 0 ? 'stopped' : 'cancelled',
      completedAt: Date.now(),
      statusNote: note,
    });
    await ReportStore.addCampaignEvent(campaign.id, { level: 'warn', type: 'stopped_after_reload', message: note });
    await ReportStore.deleteCampaignPlan(campaign.id);
    return note;
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
