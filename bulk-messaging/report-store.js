/**
 * OpenWA Dedicated Bulk Messaging - Permanent Storage & Reports Engine
 * Powered by browser IndexedDB (OpenWaReportsDB).
 * 
 * 100% Session-Independent & Refresh-Proof:
 * - Data persists even if WhatsApp is disconnected, logged out, or sessions are deleted.
 * - Auto-saves contact drafts so page refresh (F5) never loses imported numbers.
 * - Stores complete audit logs of both Bulk Campaigns and Single/Test messages.
 * - Generates Excel/CSV exports using bundled SheetJS.
 */

const DB_NAME = 'OpenWaReportsDB';
const DB_VERSION = 1;

class ReportStoreService {
  constructor() {
    this.db = null;
    this.dbReadyPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Campaigns Meta Store
        if (!db.objectStoreNames.contains('campaigns')) {
          const campaignStore = db.createObjectStore('campaigns', { keyPath: 'id' });
          campaignStore.createIndex('createdAt', 'createdAt', { unique: false });
          campaignStore.createIndex('status', 'status', { unique: false });
          campaignStore.createIndex('sessionId', 'sessionId', { unique: false });
        }

        // 2. Detailed Campaign Logs Store
        if (!db.objectStoreNames.contains('campaign_logs')) {
          const logStore = db.createObjectStore('campaign_logs', { keyPath: 'id' });
          logStore.createIndex('campaignId', 'campaignId', { unique: false });
          logStore.createIndex('status', 'status', { unique: false });
          logStore.createIndex('recipient', 'recipient', { unique: false });
        }

        // 3. Single / Direct Test Messages Store
        if (!db.objectStoreNames.contains('single_messages')) {
          const singleStore = db.createObjectStore('single_messages', { keyPath: 'id' });
          singleStore.createIndex('timestamp', 'timestamp', { unique: false });
          singleStore.createIndex('sessionId', 'sessionId', { unique: false });
        }

        // 4. Draft State Store (Refresh Protection)
        if (!db.objectStoreNames.contains('draft_store')) {
          db.createObjectStore('draft_store', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getDB() {
    if (!this.db) {
      await this.dbReadyPromise;
    }
    return this.db;
  }

  // ==========================================
  // 1. DRAFT PERSISTENCE (Page Refresh Protection)
  // ==========================================

  async saveContactsDraft(records) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('draft_store', 'readwrite');
        const store = tx.objectStore('draft_store');
        store.put({
          key: 'contacts_draft',
          records: records || [],
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to save contacts draft:', err);
    }
  }

  async getContactsDraft() {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('draft_store', 'readonly');
        const store = tx.objectStore('draft_store');
        const req = store.get('contacts_draft');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to get contacts draft:', err);
      return null;
    }
  }

  async clearContactsDraft() {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('draft_store', 'readwrite');
        const store = tx.objectStore('draft_store');
        store.delete('contacts_draft');
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to clear contacts draft:', err);
    }
  }

  async saveComposerDraft(composerData) {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('draft_store', 'readwrite');
        const store = tx.objectStore('draft_store');
        store.put({
          key: 'composer_draft',
          data: composerData,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to save composer draft:', err);
    }
  }

  async getComposerDraft() {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('draft_store', 'readonly');
        const store = tx.objectStore('draft_store');
        const req = store.get('composer_draft');
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to get composer draft:', err);
      return null;
    }
  }

  // ==========================================
  // 2. BULK CAMPAIGN MANAGEMENT
  // ==========================================

  async saveCampaign(meta) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('campaigns', 'readwrite');
      const store = tx.objectStore('campaigns');
      
      const record = {
        id: meta.id || `camp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: meta.name || `Campaign ${new Date().toLocaleString()}`,
        sessionId: meta.sessionId || 'default',
        sessionName: meta.sessionName || meta.sessionId || 'WhatsApp Account',
        createdAt: meta.createdAt || Date.now(),
        completedAt: meta.completedAt || null,
        status: meta.status || 'in_progress', // 'in_progress' | 'completed' | 'cancelled' | 'failed'
        totalRecipients: Number(meta.totalRecipients) || 0,
        totalMessages: Number(meta.totalMessages) || Number(meta.totalRecipients) || 0,
        sentCount: Number(meta.sentCount) || 0,
        failedCount: Number(meta.failedCount) || 0,
        pendingCount: Number(meta.pendingCount) || 0,
        messagePreview: meta.messagePreview || '',
        mediaType: meta.mediaType || 'text',
        hasPtt: Boolean(meta.hasPtt),
        options: meta.options || {},
      };

      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async updateCampaign(campaignId, updates) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('campaigns', 'readwrite');
      const store = tx.objectStore('campaigns');
      const req = store.get(campaignId);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        const updated = { ...req.result, ...updates, updatedAt: Date.now() };
        store.put(updated);
        resolve(updated);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async appendCampaignLogs(campaignId, results = []) {
    if (!results || results.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('campaign_logs', 'readwrite');
      const store = tx.objectStore('campaign_logs');

      results.forEach((res, index) => {
        const rawChatId = res.chatId || '';
        const recipient = rawChatId.replace('@c.us', '').replace('@g.us', '');
        const logId = `${campaignId}_${res.batchId || 'b'}_${recipient}_${index}_${Date.now()}`;

        const logEntry = {
          id: logId,
          campaignId,
          recipient,
          rawChatId,
          name: res.name || res.contactName || '',
          content: res.content || '',
          type: res.type || 'text',
          status: res.status === 'success' || res.status === 'sent' ? 'sent' : (res.status || 'failed'),
          waMessageId: res.messageId || res.waMessageId || (res.id && typeof res.id === 'string' ? res.id : ''),
          error: res.error ? (typeof res.error === 'object' ? (res.error.message || JSON.stringify(res.error)) : String(res.error)) : '',
          timestamp: res.timestamp || Date.now(),
          batchId: res.batchId || '',
        };

        store.put(logEntry);
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllCampaigns() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('campaigns', 'readonly');
      const store = tx.objectStore('campaigns');
      const req = store.getAll();

      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(sorted);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getCampaignDetails(campaignId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['campaigns', 'campaign_logs'], 'readonly');
      const campStore = tx.objectStore('campaigns');
      const logStore = tx.objectStore('campaign_logs');
      const logIndex = logStore.index('campaignId');

      const campReq = campStore.get(campaignId);
      const logsReq = logIndex.getAll(campaignId);

      let campaign = null;
      let logs = [];

      campReq.onsuccess = () => { campaign = campReq.result; };
      logsReq.onsuccess = () => { logs = logsReq.result || []; };

      tx.oncomplete = () => {
        if (!campaign) {
          resolve(null);
          return;
        }
        // Sort logs by timestamp ascending
        logs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        resolve({ campaign, logs });
      };

      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteCampaign(campaignId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['campaigns', 'campaign_logs'], 'readwrite');
      const campStore = tx.objectStore('campaigns');
      const logStore = tx.objectStore('campaign_logs');
      const logIndex = logStore.index('campaignId');

      campStore.delete(campaignId);

      const logsReq = logIndex.getAllKeys(campaignId);
      logsReq.onsuccess = () => {
        const keys = logsReq.result || [];
        keys.forEach(k => logStore.delete(k));
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async clearAllCampaigns() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['campaigns', 'campaign_logs'], 'readwrite');
      tx.objectStore('campaigns').clear();
      tx.objectStore('campaign_logs').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==========================================
  // 3. SINGLE / DIRECT TEST MESSAGES
  // ==========================================

  async saveSingleMessage(entry) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('single_messages', 'readwrite');
      const store = tx.objectStore('single_messages');

      const record = {
        id: entry.id || `single_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sessionId: entry.sessionId || 'default',
        sessionName: entry.sessionName || entry.sessionId || 'WhatsApp Account',
        recipient: (entry.recipient || '').replace('@c.us', '').replace('@g.us', ''),
        rawChatId: entry.recipient || '',
        message: entry.message || '',
        mediaType: entry.mediaType || 'text',
        status: entry.status === 'success' || entry.status === 'sent' ? 'sent' : (entry.status || 'failed'),
        waMessageId: entry.waMessageId || '',
        error: entry.error ? (typeof entry.error === 'object' ? (entry.error.message || JSON.stringify(entry.error)) : String(entry.error)) : '',
        timestamp: entry.timestamp || Date.now(),
      };

      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllSingleMessages() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('single_messages', 'readonly');
      const store = tx.objectStore('single_messages');
      const req = store.getAll();

      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(sorted);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async clearAllSingleMessages() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('single_messages', 'readwrite');
      tx.objectStore('single_messages').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==========================================
  // 4. SUMMARY STATISTICS & KPIS
  // ==========================================

  async getOverallStats() {
    const campaigns = await this.getAllCampaigns();
    const singles = await this.getAllSingleMessages();

    let totalCampaigns = campaigns.length;
    let totalBulkSent = 0;
    let totalBulkFailed = 0;
    let totalBulkRecipients = 0;

    campaigns.forEach(c => {
      totalBulkSent += Number(c.sentCount) || 0;
      totalBulkFailed += Number(c.failedCount) || 0;
      totalBulkRecipients += Number(c.totalRecipients) || 0;
    });

    let singleSent = singles.filter(s => s.status === 'sent').length;
    let singleFailed = singles.filter(s => s.status === 'failed').length;

    const totalMessagesSent = totalBulkSent + singleSent;
    const totalFailed = totalBulkFailed + singleFailed;
    const totalAttempts = totalMessagesSent + totalFailed;
    const successRate = totalAttempts > 0 ? ((totalMessagesSent / totalAttempts) * 100).toFixed(1) : '100.0';

    return {
      totalCampaigns,
      totalSingleMessages: singles.length,
      totalMessagesSent,
      totalFailed,
      totalRecipients: totalBulkRecipients + singles.length,
      successRate,
    };
  }

  // ==========================================
  // 5. EXCEL / CSV EXPORT
  // ==========================================

  /**
   * Export single campaign logs to XLSX or CSV
   */
  async exportCampaignReport(campaignId, format = 'xlsx') {
    if (!window.XLSX) {
      throw new Error('SheetJS library (XLSX) is not available');
    }

    const data = await this.getCampaignDetails(campaignId);
    if (!data || !data.campaign) {
      throw new Error('Campaign not found');
    }

    const { campaign, logs } = data;

    // Build rows for export
    const rows = logs.map((log, idx) => ({
      'S.No': idx + 1,
      'Recipient Number': log.recipient,
      'Contact Name': log.name || '',
      'Status': (log.status || 'unknown').toUpperCase(),
      'Sent At': new Date(log.timestamp).toLocaleString(),
      'Message Type': (log.type || 'text').toUpperCase(),
      'Message Preview': log.content || '',
      'WhatsApp Message ID': log.waMessageId || '',
      'Error Detail': log.error || '',
      'Session Used': campaign.sessionName || campaign.sessionId,
      'Campaign Name': campaign.name,
    }));

    // If no logs, create at least header
    if (rows.length === 0) {
      rows.push({
        'Campaign Name': campaign.name,
        'Status': campaign.status,
        'Total Recipients': campaign.totalRecipients,
        'Note': 'No individual logs recorded.',
      });
    }

    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Campaign Report');

    const cleanName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanName}_Report_${new Date().toISOString().slice(0, 10)}.${format}`;

    window.XLSX.writeFile(workbook, filename, { bookType: format });
    return filename;
  }

  /**
   * Export all campaigns summary to Excel
   */
  async exportAllCampaignsSummary(format = 'xlsx') {
    if (!window.XLSX) throw new Error('SheetJS is not available');
    const campaigns = await this.getAllCampaigns();

    const rows = campaigns.map((c, idx) => ({
      'S.No': idx + 1,
      'Campaign Name': c.name,
      'Session Used': c.sessionName || c.sessionId,
      'Date & Time': new Date(c.createdAt).toLocaleString(),
      'Status': (c.status || '').toUpperCase(),
      'Total Recipients': c.totalRecipients,
      'Sent Count': c.sentCount,
      'Failed Count': c.failedCount,
      'Pending Count': c.pendingCount || 0,
      'Success Rate (%)': c.totalRecipients > 0 ? (((c.sentCount || 0) / c.totalRecipients) * 100).toFixed(1) + '%' : '0%',
      'Message Preview': c.messagePreview || '',
    }));

    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'All Campaigns Summary');

    const filename = `OpenWA_All_Campaigns_Summary_${new Date().toISOString().slice(0, 10)}.${format}`;
    window.XLSX.writeFile(workbook, filename, { bookType: format });
    return filename;
  }
}

export const ReportStore = new ReportStoreService();
