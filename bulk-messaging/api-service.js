/**
 * OpenWA API Client Service
 * Interacts directly with OpenWA HTTP Gateway (http://localhost:2785/api)
 * All endpoints reflect the official OpenAPI 3.0 documentation.
 */

export class OpenWaApiService {
  constructor(baseUrl = '/api') {
    let savedUrl = localStorage.getItem('openwa_bulk_base_url');
    // If user has old localhost:2785 saved, or nothing saved, use '/api'
    if (!savedUrl || savedUrl.includes('localhost:2785') || savedUrl.includes('127.0.0.1:2785')) {
      savedUrl = '/api';
      localStorage.setItem('openwa_bulk_base_url', '/api');
    }
    this.baseUrl = (savedUrl || baseUrl).replace(/\/+$/, '');
    // Prefer the dashboard's current login over old Bulk credentials.
    const dashboardKey = localStorage.getItem('openwa_api_key') || sessionStorage.getItem('openwa_api_key');
    if (dashboardKey) localStorage.setItem('openwa_api_key', dashboardKey);
    this.usingDashboardAuth = Boolean(dashboardKey);
    this.apiKey =
      dashboardKey ||
      localStorage.getItem('openwa_bulk_api_key') ||
      localStorage.getItem('relaywa_key') ||
      '';
  }

  setApiKey(key) {
    this.usingDashboardAuth = false;
    this.apiKey = (key || '').trim();
    if (this.apiKey) {
      localStorage.setItem('openwa_bulk_api_key', this.apiKey);
    }
  }

  getApiKey() {
    const dashboardKey = localStorage.getItem('openwa_api_key');
    if (dashboardKey) {
      this.usingDashboardAuth = true;
      this.apiKey = dashboardKey;
    } else if (this.usingDashboardAuth) {
      // Do not keep sending the previous actor's key after logout in another tab.
      this.apiKey = '';
    }
    return this.apiKey;
  }

  setBaseUrl(url) {
    let cleanUrl = (url || '/api').trim().replace(/\/+$/, '');
    if (cleanUrl.includes('localhost:2785') || cleanUrl.includes('127.0.0.1:2785')) {
      cleanUrl = '/api';
    }
    this.baseUrl = cleanUrl;
    localStorage.setItem('openwa_bulk_base_url', this.baseUrl);
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    // Abort hung requests so the UI never waits forever. A timed-out request has no
    // HTTP status, which the campaign engine treats as "may have reached the server".
    const { timeoutMs = 30000, ...fetchOptions } = options;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (!response.ok) {
        let errorData = null;
        const text = await response.text();
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { message: text || `HTTP Error ${response.status}` };
        }

        const err = new Error(errorData.message || `Request failed with status ${response.status}`);
        err.status = response.status;
        err.details = errorData;
        throw err;
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      const reason = error.name === 'AbortError' ? `request timed out after ${Math.round(timeoutMs / 1000)}s` : error.message;
      const connErr = new Error(`Connection to OpenWA API failed: ${reason}`);
      connErr.isNetworkError = true;
      throw connErr;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ========== Sessions ==========

  /** GET /api/sessions */
  async getSessions() {
    return await this.request('/sessions');
  }

  /** GET /api/sessions/{sessionId} */
  async getSession(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  /** POST /api/sessions */
  async createSession(sessionData) {
    return await this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  /** POST /api/sessions/{sessionId}/start */
  async startSession(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/start`, {
      method: 'POST',
    });
  }

  /** POST /api/sessions/{sessionId}/stop */
  async stopSession(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: 'POST',
    });
  }

  /** POST /api/sessions/{sessionId}/logout */
  async logoutSession(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/logout`, {
      method: 'POST',
    });
  }

  /** DELETE /api/sessions/{sessionId} */
  async deleteSession(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  /** GET /api/sessions/{sessionId}/qr */
  async getSessionQR(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/qr`);
  }

  /** POST /api/sessions/{sessionId}/pairing-code */
  async requestPairingCode(sessionId, phoneNumber) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/pairing-code`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: String(phoneNumber).replace(/\D/g, '') }),
    });
  }

  // ========== Contacts ==========

  /** GET /api/sessions/{sessionId}/contacts */
  async getContacts(sessionId, limit = 1000, offset = 0) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/contacts?limit=${limit}&offset=${offset}`);
  }

  /** GET /api/sessions/{sessionId}/contacts/check/{number} */
  async checkNumber(sessionId, number) {
    const cleanNumber = String(number).replace(/\D/g, '');
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/contacts/check/${encodeURIComponent(cleanNumber)}`);
  }

  /** GET /api/sessions/{sessionId}/contacts/{contactId} */
  async getContact(sessionId, contactId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(contactId)}`);
  }

  // ========== Groups ==========

  /** GET /api/sessions/{sessionId}/groups */
  async getGroups(sessionId, limit = 1000, offset = 0) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/groups?limit=${limit}&offset=${offset}`);
  }

  /** GET /api/sessions/{sessionId}/groups/{groupId}/participants */
  async getGroupParticipants(sessionId, groupId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/groups/${encodeURIComponent(groupId)}/participants`);
  }

  // ========== Templates ==========

  /** GET /api/sessions/{sessionId}/templates */
  async getTemplates(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/templates`);
  }

  /** POST /api/sessions/{sessionId}/templates */
  async createTemplate(sessionId, { name, body, header, footer }) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/templates`, {
      method: 'POST',
      body: JSON.stringify({ name, body, header, footer }),
    });
  }

  // ========== Media & Conversion ==========

  /** GET /api/sessions/{sessionId}/media/convert */
  async getMediaConversionStatus(sessionId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/media/convert`);
  }

  /** POST /api/sessions/{sessionId}/media/convert/voice */
  async convertVoice(sessionId, { url, base64 }) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/media/convert/voice`, {
      method: 'POST',
      body: JSON.stringify({ url, base64 }),
    });
  }

  // ========== Bulk Messaging (Batch Engine) ==========

  /**
   * POST /api/sessions/{sessionId}/messages/send-bulk
   * Max 100 messages per request (enforced by API schema ArrayMaxSize(100)).
   * Exact duplicate entries are collapsed by the backend (first occurrence wins).
   */
  async sendBulk(sessionId, { batchId, messages, options }) {
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array is required');
    }
    if (messages.length > 100) {
      throw new Error(`Batch exceeds API limit: max 100 messages allowed per request (received ${messages.length})`);
    }

    const payload = {
      messages,
      ...(batchId ? { batchId } : {}),
      ...(options ? { options } : {}),
    };

    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/messages/send-bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 120000, // base64 media payloads can be large
    });
  }

  /**
   * GET /api/sessions/{sessionId}/messages/batch/{batchId}
   * Returns: { batchId, status, progress: { total, sent, failed, pending, cancelled }, results, startedAt, completedAt }
   */
  async getBatchStatus(sessionId, batchId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/messages/batch/${encodeURIComponent(batchId)}`);
  }

  /**
   * POST /api/sessions/{sessionId}/messages/batch/{batchId}/cancel
   * Returns: { batchId, status: 'cancelled', progress }
   */
  async cancelBatch(sessionId, batchId) {
    return await this.request(`/sessions/${encodeURIComponent(sessionId)}/messages/batch/${encodeURIComponent(batchId)}/cancel`, {
      method: 'POST',
    });
  }

  // ========== Statistics & Reporting ==========

  /** GET /api/stats/overview */
  async getStatsOverview() {
    return await this.request('/stats/overview');
  }

  /** GET /api/stats/messages */
  async getMessageStats(period = '24h') {
    return await this.request(`/stats/messages?period=${encodeURIComponent(period)}`);
  }

  /** GET /api/stats/sessions/{sessionId} */
  async getSessionStats(sessionId) {
    return await this.request(`/stats/sessions/${encodeURIComponent(sessionId)}`);
  }

  /** GET /api/audit */
  async getAuditLogs(params = {}) {
    const query = new URLSearchParams();
    if (params.action) query.set('action', params.action);
    if (params.severity) query.set('severity', params.severity);
    if (params.sessionId) query.set('sessionId', params.sessionId);
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);
    return await this.request(`/audit?${query.toString()}`);
  }
}
