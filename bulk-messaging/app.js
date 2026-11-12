/**
 * OpenWA Dedicated Bulk Messaging Module - Main Application Controller
 */

import { OpenWaApiService } from './api-service.js';
import { ContactParser } from './contact-parser.js';
import { CampaignManager } from './campaign-manager.js';
import { ReportStore } from './report-store.js';

class BulkApp {
  constructor() {
    this.api = new OpenWaApiService();
    this.campaignManager = new CampaignManager(this.api);

    // State
    this.sessions = [];
    this.currentSessionId = null;
    this.records = []; // Processed contacts
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.currentAttachedMedia = null; // { type, base64, url, mimetype, filename, caption, ptt }
    this.activeQrSessionId = null;
    this.qrPollInterval = null;

    this.initElements();
    this.bindEvents();
    this.initSession();
  }

  initElements() {
    // Top Bar
    this.sessionSelect = document.getElementById('sessionSelect');
    this.sessionStatusPill = document.getElementById('sessionStatusPill');
    this.apiConnectionStatus = document.getElementById('apiConnectionStatus');
    this.waReadyStatusTag = document.getElementById('waReadyStatusTag');
    this.activeSessionNameTag = document.getElementById('activeSessionNameTag');

    // Column 1
    this.fileImportInput = document.getElementById('fileImportInput');
    this.btnImportFile = document.getElementById('btnImportFile');
    this.btnSampleContacts = document.getElementById('btnSampleContacts');
    this.btnDownloadSampleExcel = document.getElementById('btnDownloadSampleExcel');
    this.btnExportContacts = document.getElementById('btnExportContacts');
    this.btnClearContacts = document.getElementById('btnClearContacts');
    this.duplicateBanner = document.getElementById('duplicateBanner');
    this.dupCount = document.getElementById('dupCount');
    this.uniqueCount = document.getElementById('uniqueCount');
    this.invalidCount = document.getElementById('invalidCount');
    this.btnRemoveDuplicates = document.getElementById('btnRemoveDuplicates');
    this.contactSearchInput = document.getElementById('contactSearchInput');
    this.contactFilterSelect = document.getElementById('contactFilterSelect');
    this.contactsTableBody = document.getElementById('contactsTableBody');
    this.selectAllCheckbox = document.getElementById('selectAllCheckbox');
    this.footerTotal = document.getElementById('footerTotal');
    this.footerContacts = document.getElementById('footerContacts');
    this.footerGroups = document.getElementById('footerGroups');
    this.footerSelected = document.getElementById('footerSelected');

    // Column 2
    this.messageTextarea = document.getElementById('messageTextarea');
    this.charCount = document.getElementById('charCount');
    this.composerRecipientCount = document.getElementById('composerRecipientCount');
    this.insertVariableSelect = document.getElementById('insertVariableSelect');
    this.btnBold = document.getElementById('btnBold');
    this.btnItalic = document.getElementById('btnItalic');
    this.btnStrike = document.getElementById('btnStrike');
    this.btnEmoji = document.getElementById('btnEmoji');
    this.mediaTypeSelect = document.getElementById('mediaTypeSelect');
    this.mediaUrlInput = document.getElementById('mediaUrlInput');
    this.mediaFileInput = document.getElementById('mediaFileInput');
    this.btnAttachFile = document.getElementById('btnAttachFile');
    this.mediaDetailsRow = document.getElementById('mediaDetailsRow');
    this.mediaCaptionInput = document.getElementById('mediaCaptionInput');
    this.attachedFileName = document.getElementById('attachedFileName');
    this.pttVoiceToggleWrap = document.getElementById('pttVoiceToggleWrap');
    this.pttVoiceCheck = document.getElementById('pttVoiceCheck');
    this.sendSeparateTextMessageCheck = document.getElementById('sendSeparateTextMessageCheck');
    this.btnLoadTemplates = document.getElementById('btnLoadTemplates');

    // Column 3
    this.batchSizeInput = document.getElementById('batchSizeInput');
    this.delaySlider = document.getElementById('delaySlider');
    this.delayDisplay = document.getElementById('delayDisplay');
    this.randomizeDelayCheck = document.getElementById('randomizeDelayCheck');
    this.stopOnErrorCheck = document.getElementById('stopOnErrorCheck');
    this.interBatchDelaySelect = document.getElementById('interBatchDelaySelect');
    this.scheduleDateTimeInput = document.getElementById('scheduleDateTimeInput');
    this.scheduleCountdownDisplay = document.getElementById('scheduleCountdownDisplay');
    this.scheduleCountdownText = document.getElementById('scheduleCountdownText');
    this.btnSendNow = document.getElementById('btnSendNow');
    this.btnScheduleSend = document.getElementById('btnScheduleSend');

    // Monitor Drawer
    this.liveMonitorDrawer = document.getElementById('liveMonitorDrawer');
    this.monitorHeaderBar = document.getElementById('monitorHeaderBar');
    this.btnToggleMonitor = document.getElementById('btnToggleMonitor');
    this.toggleMonitorIcon = document.getElementById('toggleMonitorIcon');
    this.toggleMonitorText = document.getElementById('toggleMonitorText');
    this.monitorStatusText = document.getElementById('monitorStatusText');
    this.monitorProgressBar = document.getElementById('monitorProgressBar');
    this.monitorProgressPercent = document.getElementById('monitorProgressPercent');
    this.statTotal = document.getElementById('statTotal');
    this.statSent = document.getElementById('statSent');
    this.statFailed = document.getElementById('statFailed');
    this.statPending = document.getElementById('statPending');
    this.btnCancelBatch = document.getElementById('btnCancelBatch');
    this.btnRetryFailed = document.getElementById('btnRetryFailed');
    this.btnExportResultsExcel = document.getElementById('btnExportResultsExcel');
    this.btnExportResults = document.getElementById('btnExportResults');
    this.monitorResultsBody = document.getElementById('monitorResultsBody');

    // Modals
    this.modalApiSettings = document.getElementById('modalApiSettings');
    this.btnOpenApiConfig = document.getElementById('btnOpenApiConfig');
    this.apiBaseUrlInput = document.getElementById('apiBaseUrlInput');
    this.apiKeyInput = document.getElementById('apiKeyInput');
    this.btnTestApiConnection = document.getElementById('btnTestApiConnection');
    this.btnSaveApiSettings = document.getElementById('btnSaveApiSettings');
    this.apiTestResult = document.getElementById('apiTestResult');

    this.modalTemplates = document.getElementById('modalTemplates');
    this.templateTableBody = document.getElementById('templateTableBody');
    this.btnShowCreateTemplate = document.getElementById('btnShowCreateTemplate');
    this.createTemplateForm = document.getElementById('createTemplateForm');
    this.newTemplateName = document.getElementById('newTemplateName');
    this.newTemplateBody = document.getElementById('newTemplateBody');
    this.btnSaveNewTemplate = document.getElementById('btnSaveNewTemplate');
    this.btnCancelNewTemplate = document.getElementById('btnCancelNewTemplate');

    this.modalAddressbook = document.getElementById('modalAddressbook');
    this.btnFetchAddressbook = document.getElementById('btnFetchAddressbook');
    this.btnTabLoadContacts = document.getElementById('btnTabLoadContacts');
    this.btnTabLoadGroups = document.getElementById('btnTabLoadGroups');
    this.addressbookTableBody = document.getElementById('addressbookTableBody');
    this.btnImportSelectedAddressbook = document.getElementById('btnImportSelectedAddressbook');

    this.modalStats = document.getElementById('modalStats');
    this.btnStatsModal = document.getElementById('btnStatsModal');
    this.gwStatSent = document.getElementById('gwStatSent');
    this.gwStatReceived = document.getElementById('gwStatReceived');
    this.gwStatFailed = document.getElementById('gwStatFailed');
    this.gwStatSessions = document.getElementById('gwStatSessions');
    this.auditTableBody = document.getElementById('auditTableBody');

    // Session Manager Modal
    this.btnRefreshSessions = document.getElementById('btnRefreshSessions');
    this.btnOpenSessionManager = document.getElementById('btnOpenSessionManager');
    this.modalSessionManager = document.getElementById('modalSessionManager');
    this.newSessionNameInput = document.getElementById('newSessionNameInput');
    this.btnCreateNewSession = document.getElementById('btnCreateNewSession');
    this.createSessionMessage = document.getElementById('createSessionMessage');
    this.sessionConnectionCard = document.getElementById('sessionConnectionCard');
    this.qrPlaceholder = document.getElementById('qrPlaceholder');
    this.qrActiveContainer = document.getElementById('qrActiveContainer');
    this.qrSessionNameText = document.getElementById('qrSessionNameText');
    this.qrStatusBadge = document.getElementById('qrStatusBadge');
    this.btnManualRefreshQr = document.getElementById('btnManualRefreshQr');
    this.tabModeQr = document.getElementById('tabModeQr');
    this.tabModePairing = document.getElementById('tabModePairing');
    this.sectionModeQr = document.getElementById('sectionModeQr');
    this.sectionModePairing = document.getElementById('sectionModePairing');
    this.sessionQrImg = document.getElementById('sessionQrImg');
    this.qrImageWrapper = document.getElementById('qrImageWrapper');
    this.qrHoverHint = document.getElementById('qrHoverHint');
    this.btnQrSizeSmall = document.getElementById('btnQrSizeSmall');
    this.btnQrSizeMed = document.getElementById('btnQrSizeMed');
    this.btnQrSizeLarge = document.getElementById('btnQrSizeLarge');
    this.btnOpenQrEnlargeModal = document.getElementById('btnOpenQrEnlargeModal');
    this.modalQrEnlarge = document.getElementById('modalQrEnlarge');
    this.enlargedQrImg = document.getElementById('enlargedQrImg');
    this.enlargedQrBox = document.getElementById('enlargedQrBox');
    this.enlargedQrLoadingOverlay = document.getElementById('enlargedQrLoadingOverlay');
    this.enlargedQrSessionName = document.getElementById('enlargedQrSessionName');
    this.qrZoomSlider = document.getElementById('qrZoomSlider');
    this.qrZoomValText = document.getElementById('qrZoomValText');
    this.btnZoomOutSlider = document.getElementById('btnZoomOutSlider');
    this.btnZoomInSlider = document.getElementById('btnZoomInSlider');
    this.btnEnlargeResetSize = document.getElementById('btnEnlargeResetSize');
    this.currentQrSize = 160;

    this.qrLoadingOverlay = document.getElementById('qrLoadingOverlay');
    this.pairingPhoneInput = document.getElementById('pairingPhoneInput');
    this.btnGetPairingCode = document.getElementById('btnGetPairingCode');
    this.pairingCodeResult = document.getElementById('pairingCodeResult');
    this.pairingCodeValue = document.getElementById('pairingCodeValue');
    this.btnCopyPairingCode = document.getElementById('btnCopyPairingCode');
    this.btnRefreshSessionTable = document.getElementById('btnRefreshSessionTable');
    this.sessionsManagerTable = document.getElementById('sessionsManagerTable');
    this.sessionsManagerBody = document.getElementById('sessionsManagerBody');
    this.activeSessionFooterDisplay = document.getElementById('activeSessionFooterDisplay');

    // Reports & History Modal Elements
    this.btnOpenReportsHistory = document.getElementById('btnOpenReportsHistory');
    this.reportsCountBadge = document.getElementById('reportsCountBadge');
    this.btnExportAllSummaryExcel = document.getElementById('btnExportAllSummaryExcel');
    this.modalReportsHistory = document.getElementById('modalReportsHistory');
    this.campaignNameInput = document.getElementById('campaignNameInput');
    this.draftStatusBanner = document.getElementById('draftStatusBanner');
    this.btnClearDraftBtn = document.getElementById('btnClearDraftBtn');
    this.kpiTotalCampaigns = document.getElementById('kpiTotalCampaigns');
    this.kpiTotalSent = document.getElementById('kpiTotalSent');
    this.kpiTotalFailed = document.getElementById('kpiTotalFailed');
    this.kpiSuccessRate = document.getElementById('kpiSuccessRate');
    this.tabBtnBulkReports = document.getElementById('tabBtnBulkReports');
    this.tabBtnSingleReports = document.getElementById('tabBtnSingleReports');
    this.tabCountBulk = document.getElementById('tabCountBulk');
    this.tabCountSingle = document.getElementById('tabCountSingle');
    this.reportSearchInput = document.getElementById('reportSearchInput');
    this.btnRefreshReportsView = document.getElementById('btnRefreshReportsView');
    this.btnClearAllReportsBtn = document.getElementById('btnClearAllReportsBtn');
    this.viewBulkCampaigns = document.getElementById('viewBulkCampaigns');
    this.viewSingleMessages = document.getElementById('viewSingleMessages');
    this.campaignsHistoryBody = document.getElementById('campaignsHistoryBody');
    this.singleMessagesBody = document.getElementById('singleMessagesBody');
    this.viewCampaignDetailDrilldown = document.getElementById('viewCampaignDetailDrilldown');
    this.btnBackToCampaignsList = document.getElementById('btnBackToCampaignsList');
    this.drilldownCampaignTitle = document.getElementById('drilldownCampaignTitle');
    this.drilldownSessionBadge = document.getElementById('drilldownSessionBadge');
    this.drilldownMetaSubtitle = document.getElementById('drilldownMetaSubtitle');
    this.drilldownCountAll = document.getElementById('drilldownCountAll');
    this.drilldownCountSent = document.getElementById('drilldownCountSent');
    this.drilldownCountFailed = document.getElementById('drilldownCountFailed');
    this.btnExportSingleCampaignExcel = document.getElementById('btnExportSingleCampaignExcel');
    this.btnRetryFailedFromReport = document.getElementById('btnRetryFailedFromReport');
    this.drilldownMessagePreviewText = document.getElementById('drilldownMessagePreviewText');
    this.drilldownNumbersBody = document.getElementById('drilldownNumbersBody');
    this.activeDrilldownCampaignId = null;
    this.currentDrilldownLogs = [];
    this.drilldownFilter = 'all';
  }

  bindEvents() {
    // Session selection & management
    this.sessionSelect.addEventListener('change', () => {
      this.selectActiveSession(this.sessionSelect.value);
    });
    this.btnRefreshSessions?.addEventListener('click', () => this.refreshSessions(true));
    this.btnOpenSessionManager?.addEventListener('click', () => this.openSessionManagerModal());
    this.btnCreateNewSession?.addEventListener('click', () => this.handleCreateSession());
    this.btnGetPairingCode?.addEventListener('click', () => this.handleGetPairingCode());
    this.btnRefreshSessionTable?.addEventListener('click', () => this.loadSessionManagerTable());
    this.tabModeQr?.addEventListener('click', () => this.switchConnectionMode('qr'));
    this.tabModePairing?.addEventListener('click', () => this.switchConnectionMode('pairing'));
    this.btnManualRefreshQr?.addEventListener('click', () => this.forceRefreshCurrentQr());
    this.btnCopyPairingCode?.addEventListener('click', () => this.copyPairingCode());

    // QR Zoom & Sizing Events
    this.qrImageWrapper?.addEventListener('click', () => this.openEnlargedQrModal());
    this.btnOpenQrEnlargeModal?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEnlargedQrModal();
    });

    document.querySelectorAll('.qr-size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.qr-size-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const size = parseInt(e.currentTarget.dataset.size, 10) || 160;
        this.setQrSize(size);
      });
    });

    this.qrZoomSlider?.addEventListener('input', (e) => {
      this.setEnlargedQrZoom(parseInt(e.target.value, 10) || 360);
    });

    this.btnZoomOutSlider?.addEventListener('click', () => {
      if (this.qrZoomSlider) {
        this.qrZoomSlider.value = Math.max(260, parseInt(this.qrZoomSlider.value, 10) - 20);
        this.setEnlargedQrZoom(parseInt(this.qrZoomSlider.value, 10));
      }
    });

    this.btnZoomInSlider?.addEventListener('click', () => {
      if (this.qrZoomSlider) {
        this.qrZoomSlider.value = Math.min(480, parseInt(this.qrZoomSlider.value, 10) + 20);
        this.setEnlargedQrZoom(parseInt(this.qrZoomSlider.value, 10));
      }
    });

    this.btnEnlargeResetSize?.addEventListener('click', () => {
      if (this.qrZoomSlider) {
        this.qrZoomSlider.value = 360;
        this.setEnlargedQrZoom(360);
      }
    });

    // File Import
    this.btnImportFile.addEventListener('click', () => this.fileImportInput.click());
    this.fileImportInput.addEventListener('change', (e) => this.handleFileImport(e));
    this.btnSampleContacts.addEventListener('click', () => this.loadSampleContacts());
    this.btnDownloadSampleExcel?.addEventListener('click', () => this.downloadSampleExcel());
    this.btnExportContacts?.addEventListener('click', () => this.exportContactsExcel());
    this.btnClearContacts.addEventListener('click', () => this.clearContacts());
    this.btnRemoveDuplicates.addEventListener('click', () => this.removeDuplicates());

    // Reports & History Modal Events
    this.btnOpenReportsHistory?.addEventListener('click', () => this.openReportsModal());
    this.btnExportAllSummaryExcel?.addEventListener('click', () => this.exportAllSummaryExcel());
    this.tabBtnBulkReports?.addEventListener('click', () => this.switchReportsTab('bulk'));
    this.tabBtnSingleReports?.addEventListener('click', () => this.switchReportsTab('single'));
    this.btnRefreshReportsView?.addEventListener('click', () => this.refreshCurrentReportsView());
    this.btnClearAllReportsBtn?.addEventListener('click', () => this.clearAllReports());
    this.reportSearchInput?.addEventListener('input', () => this.filterReportsList());
    this.btnBackToCampaignsList?.addEventListener('click', () => this.closeDrilldownView());
    this.btnExportSingleCampaignExcel?.addEventListener('click', () => this.exportCurrentDrilldownExcel());
    this.btnRetryFailedFromReport?.addEventListener('click', () => this.retryFailedFromCurrentDrilldown());
    this.btnClearDraftBtn?.addEventListener('click', () => this.clearDraftContacts());

    document.querySelectorAll('.drilldownFilterBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.drilldownFilterBtn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.drilldownFilter = e.currentTarget.dataset.filter || 'all';
        this.renderDrilldownNumbersTable();
      });
    });

    // Auto-save composer text changes
    // Debounced: avoid an IndexedDB write on every keystroke.
    this.messageTextarea.addEventListener('input', () => {
      clearTimeout(this.composerDraftTimer);
      this.composerDraftTimer = setTimeout(() => this.saveComposerDraft(), 400);
    });

    // Search & Filter (debounced so large lists don't re-render per keystroke)
    this.contactSearchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimer);
      const value = e.target.value;
      this.searchTimer = setTimeout(() => {
        this.searchQuery = value.toLowerCase().trim();
        this.renderContactsTable();
      }, 200);
    });

    // One delegated listener instead of one listener per table row.
    this.contactsTableBody.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"][data-id]')) return;
      const rec = this.records.find(r => String(r.id) === cb.dataset.id);
      if (rec) {
        rec.selected = cb.checked;
        this.updateStats();
      }
    });

    this.contactFilterSelect.addEventListener('change', (e) => {
      this.activeFilter = e.target.value;
      this.renderContactsTable();
    });

    this.selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      // Never auto-select duplicate rows: that would message the same number twice.
      this.records.forEach(r => {
        if (r.isValid && !r.isDuplicate) r.selected = checked;
      });
      this.renderContactsTable();
      this.updateStats();
    });

    // Composer inputs & toolbar
    this.messageTextarea.addEventListener('input', () => this.updateComposerStats());
    this.insertVariableSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        this.insertTextAtCursor(this.messageTextarea, val);
        e.target.value = '';
        this.updateComposerStats();
      }
    });

    this.btnBold.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '*'));
    this.btnItalic.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '_'));
    this.btnStrike.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '~'));
    this.btnEmoji.addEventListener('click', () => this.insertEmoji());

    // Media
    this.btnAttachFile.addEventListener('click', () => this.mediaFileInput.click());
    this.mediaFileInput.addEventListener('change', (e) => this.handleMediaFileUpload(e));
    this.mediaTypeSelect.addEventListener('change', () => this.handleMediaTypeChange());
    this.mediaUrlInput.addEventListener('input', () => this.handleMediaUrlChange());

    // Speed Presets
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const delay = parseInt(btn.dataset.delay, 10);
        this.delaySlider.value = delay;
        this.updateDelayDisplay(delay);
      });
    });

    this.delaySlider.addEventListener('input', (e) => {
      this.updateDelayDisplay(e.target.value);
    });

    // Execution Buttons
    this.btnSendNow.addEventListener('click', () => this.executeCampaign(false));
    this.btnScheduleSend.addEventListener('click', () => this.executeCampaign(true));
    this.btnCancelBatch.addEventListener('click', () => this.campaignManager.cancel());
    this.btnRetryFailed.addEventListener('click', () => this.retryFailedRecipients());
    this.btnExportResultsExcel?.addEventListener('click', () => this.exportCampaignExcel());
    this.btnExportResults.addEventListener('click', () => this.exportCampaignReport());

    // Live Monitor Drawer Toggle
    this.btnToggleMonitor?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMonitorDrawer();
    });

    this.monitorHeaderBar?.addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('a') && !e.target.closest('input')) {
        this.toggleMonitorDrawer();
      }
    });

    // Campaign Manager callbacks
    this.campaignManager.onUpdate((event, data) => this.handleCampaignUpdate(event, data));

    // Modals
    document.querySelectorAll('.btnCloseModal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        if (modalId) document.getElementById(modalId).style.display = 'none';
      });
    });

    this.btnOpenApiConfig.addEventListener('click', async () => {
      this.apiBaseUrlInput.value = this.api.getBaseUrl() || '/api';
      if (!this.api.getApiKey()) {
        try {
          const cfgRes = await fetch('/app-config.json');
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            if (cfg.masterApiKey) this.api.setApiKey(cfg.masterApiKey);
          }
        } catch {}
      }
      this.apiKeyInput.value = this.api.getApiKey();
      this.modalApiSettings.style.display = 'grid';
    });

    this.btnTestApiConnection.addEventListener('click', () => this.testApiConnection());
    this.btnSaveApiSettings.addEventListener('click', () => this.saveApiSettings());

    this.btnLoadTemplates.addEventListener('click', () => this.openTemplatesModal());
    this.btnShowCreateTemplate.addEventListener('click', () => {
      this.createTemplateForm.style.display = 'flex';
    });
    this.btnCancelNewTemplate.addEventListener('click', () => {
      this.createTemplateForm.style.display = 'none';
    });
    this.btnSaveNewTemplate.addEventListener('click', () => this.saveNewTemplate());

    this.btnFetchAddressbook.addEventListener('click', () => this.openAddressbookModal());
    this.btnTabLoadContacts.addEventListener('click', () => this.loadSessionContacts());
    this.btnTabLoadGroups.addEventListener('click', () => this.loadSessionGroups());
    this.btnImportSelectedAddressbook.addEventListener('click', () => this.importSelectedAddressbook());

    this.btnStatsModal.addEventListener('click', () => this.openStatsModal());
  }

  // ========== Initialization & Session ==========

  async initSession() {
    // 1. If no API key is set in client localStorage, auto-fetch from server config
    if (!this.api.getApiKey()) {
      try {
        const cfgRes = await fetch('/app-config.json');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          if (cfg.masterApiKey) {
            this.api.setApiKey(cfg.masterApiKey);
            if (this.apiKeyInput) this.apiKeyInput.value = cfg.masterApiKey;
          }
        }
      } catch {
        // Ignored; server proxy will inject master key automatically
      }
    }

    try {
      this.sessions = await this.api.getSessions();
      this.sessionSelect.innerHTML = '';

      if (Array.isArray(this.sessions) && this.sessions.length > 0) {
        this.sessions.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name || s.id} (${s.status})`;
          this.sessionSelect.appendChild(opt);
        });

        // Pick preferred session from localStorage, or first ready session, or first in list
        const preferredId = localStorage.getItem('openwa_bulk_preferred_session');
        const matchedPref = this.sessions.find(s => s.id === preferredId || s.name === preferredId);
        const readySession = matchedPref || this.sessions.find(s => s.status === 'ready') || this.sessions[0];
        this.currentSessionId = readySession.id;
        this.sessionSelect.value = readySession.id;
        if (this.activeSessionFooterDisplay) {
          this.activeSessionFooterDisplay.textContent = readySession.name || readySession.id;
        }
        this.updateSessionStatus();
      } else {
        this.sessionSelect.innerHTML = '<option value="">No sessions configured</option>';
        this.sessionStatusPill.className = 'cap-pill unsupported';
        this.sessionStatusPill.textContent = 'No Session';
      }

      this.apiConnectionStatus.className = 'cap-pill supported';
      this.apiConnectionStatus.innerHTML = '<span class="dot green"></span> API Connected';
    } catch (err) {
      console.warn('Could not fetch sessions on load:', err.message);
      const isAuth = err.status === 401 || String(err.message).toLowerCase().includes('api key');
      this.apiConnectionStatus.className = 'cap-pill unsupported';
      this.apiConnectionStatus.style.cursor = 'pointer';
      this.apiConnectionStatus.innerHTML = isAuth
        ? `<span class="dot red"></span> API Key Required (Click to Set)`
        : `<span class="dot red"></span> API Disconnected`;
      this.apiConnectionStatus.onclick = () => {
        this.btnOpenApiConfig.click();
      };
      this.sessionSelect.innerHTML = `<option value="">${isAuth ? 'Enter API key in settings' : 'Cannot reach API'}</option>`;
    }

    this.updateComposerStats();
    await this.checkAndRestoreDraft();
    await this.updateReportsBadge();
  }

  async updateSessionStatus() {
    if (!this.currentSessionId) return;

    try {
      const session = await this.api.getSession(this.currentSessionId);
      const isReady = session.status === 'ready';
      const sessionName = session.name || 'Unknown';
      const sessionPhone = session.phone ? ` (${session.phone})` : '';
      
      this.activeSessionNameTag.textContent = `Session: ${sessionName}${sessionPhone}`;
      this.sessionStatusPill.className = isReady ? 'cap-pill supported' : 'cap-pill unsupported';
      this.sessionStatusPill.textContent = session.status || 'unknown';

      this.waReadyStatusTag.className = isReady ? 'status-tag green' : 'status-tag red';
      this.waReadyStatusTag.textContent = isReady ? '● WhatsApp: Ready' : `● WhatsApp: ${session.status}`;
    } catch {
      const fallback = this.sessions.find(s => s.id === this.currentSessionId);
      this.sessionStatusPill.className = 'cap-pill unsupported';
      this.sessionStatusPill.textContent = fallback?.status || 'disconnected';
    }
  }

  // ========== Contact Import & Handling ==========

  async handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let parsed = null;
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        parsed = await ContactParser.parseExcel(file);
      } else {
        const text = await file.text();
        parsed = ContactParser.parseCSV(text);
      }

      if (!parsed.headers || parsed.headers.length === 0) {
        alert('Could not detect columns in the uploaded file.');
        return;
      }

      const mapping = ContactParser.autoDetectColumns(parsed.headers);
      const processed = ContactParser.processRecords(parsed.rows, mapping);

      this.records = processed.records;
      this.showDuplicateBanner(processed.stats);
      this.renderContactsTable();
      this.updateStats();
      this.saveCurrentDraft();
    } catch (err) {
      alert(`Error parsing file: ${err.message}`);
    } finally {
      this.fileImportInput.value = '';
    }
  }

  loadSampleContacts() {
    const sampleRows = [
      { name: 'Rahul Sharma', phone: '918109531677', var1: 'ORD-9821', var2: 'Electronics' },
      { name: 'Priya Patel', phone: '919826012345', var1: 'ORD-9822', var2: 'Books' },
      { name: 'Amit Verma', phone: '918109531677', var1: 'ORD-9823', var2: 'Duplicate Test' }, // Intentional duplicate!
      { name: 'Sara Khan', phone: '919876543210', var1: 'ORD-9824', var2: 'Apparel' },
      { name: 'Invalid User', phone: '1234', var1: 'ORD-0000', var2: 'Short Number' }, // Intentional invalid!
    ];

    const mapping = { number: 'phone', name: 'name', var1: 'var1', var2: 'var2' };
    const processed = ContactParser.processRecords(sampleRows, mapping);

    this.records = processed.records;
    this.showDuplicateBanner(processed.stats);
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
  }

  clearContacts() {
    this.records = [];
    this.duplicateBanner.style.display = 'none';
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
  }

  removeDuplicates() {
    const beforeCount = this.records.length;
    this.records = ContactParser.removeDuplicates(this.records);
    const removed = beforeCount - this.records.length;
    
    this.duplicateBanner.style.display = 'none';
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
    alert(`Successfully removed ${removed} duplicate number(s). Unique valid recipients preserved.`);
  }

  showDuplicateBanner(stats) {
    if (stats.duplicates > 0 || stats.invalid > 0) {
      this.dupCount.textContent = stats.duplicates;
      this.uniqueCount.textContent = stats.unique;
      this.invalidCount.textContent = stats.invalid;
      this.duplicateBanner.style.display = 'flex';
    } else {
      this.duplicateBanner.style.display = 'none';
    }
  }

  renderContactsTable() {
    const tbody = this.contactsTableBody;
    tbody.innerHTML = '';

    let filtered = this.records;

    // Filter by category
    if (this.activeFilter === 'unique') {
      filtered = filtered.filter(r => r.isValid && !r.isDuplicate);
    } else if (this.activeFilter === 'duplicates') {
      filtered = filtered.filter(r => r.isDuplicate);
    } else if (this.activeFilter === 'invalid') {
      filtered = filtered.filter(r => !r.isValid);
    }

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter(r =>
        (r.name && r.name.toLowerCase().includes(this.searchQuery)) ||
        (r.number && r.number.includes(this.searchQuery)) ||
        (r.var1 && r.var1.toLowerCase().includes(this.searchQuery))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No matching records found.</td></tr>`;
      return;
    }

    // Render in a single DOM write and cap visible rows; all records still stay selected/sendable.
    const MAX_ROWS = 500;
    const visible = filtered.length > MAX_ROWS ? filtered.slice(0, MAX_ROWS) : filtered;
    let html = '';
    for (const r of visible) {
      const rowClass = r.isDuplicate ? 'duplicate' : (!r.isValid ? 'invalid' : '');
      const badgeHtml = !r.isValid
        ? `<span class="badge badge-invalid">Invalid</span>`
        : (r.isDuplicate ? `<span class="badge badge-duplicate">Duplicate</span>` : `<span class="badge badge-valid">Valid</span>`);
      html += `<tr class="${rowClass}">
        <td><input type="checkbox" data-id="${this.escape(r.id)}" ${r.selected ? 'checked' : ''} ${!r.isValid ? 'disabled' : ''} /></td>
        <td><strong>${this.escape(r.name || '—')}</strong></td>
        <td>${this.escape(r.number || r.rawNumber)}</td>
        <td class="cell-muted">${this.escape(r.var1 || '—')}</td>
        <td>${badgeHtml}</td>
      </tr>`;
    }
    if (filtered.length > MAX_ROWS) {
      html += `<tr><td colspan="5" class="table-empty">Showing first ${MAX_ROWS} of ${filtered.length.toLocaleString()} records. Use search or filters to narrow the list.</td></tr>`;
    }
    tbody.innerHTML = html;
  }

  updateStats() {
    const total = this.records.length;
    const selected = this.records.filter(r => r.selected && r.isValid).length;
    const groups = this.records.filter(r => r.chatId && r.chatId.endsWith('@g.us')).length;
    const contacts = total - groups;

    this.footerTotal.textContent = total;
    this.footerContacts.textContent = contacts;
    this.footerGroups.textContent = groups;
    this.footerSelected.textContent = selected;
    this.composerRecipientCount.textContent = selected;
  }

  // ========== Message Composer & Media ==========

  updateComposerStats() {
    const text = this.messageTextarea.value || '';
    this.charCount.textContent = text.length;
  }

  insertTextAtCursor(textarea, textToInsert) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + textToInsert + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    textarea.focus();
  }

  wrapSelectedText(textarea, symbol) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || 'text';
    const wrapped = `${symbol}${selected}${symbol}`;
    this.insertTextAtCursor(textarea, wrapped);
    this.updateComposerStats();
  }

  insertEmoji() {
    const emojis = ['😊', '🙏', '🔥', '✨', '🚀', '✅', '📦', '🎉', '👋'];
    const chosen = prompt(`Pick an emoji (or type your own):\n${emojis.join('  ')}`, emojis[0]);
    if (chosen) {
      this.insertTextAtCursor(this.messageTextarea, chosen);
      this.updateComposerStats();
    }
  }

  handleMediaTypeChange() {
    const type = this.mediaTypeSelect.value;
    if (type === 'text') {
      this.currentAttachedMedia = null;
      this.mediaDetailsRow.style.display = 'none';
      this.mediaUrlInput.value = '';
    } else {
      this.mediaDetailsRow.style.display = 'flex';
      this.pttVoiceToggleWrap.style.display = type === 'audio' ? 'inline-flex' : 'none';
    }
  }

  handleMediaUrlChange() {
    const url = this.mediaUrlInput.value.trim();
    if (url) {
      if (this.mediaTypeSelect.value === 'text') {
        this.mediaTypeSelect.value = 'image';
      }
      this.currentAttachedMedia = {
        type: this.mediaTypeSelect.value,
        url,
        caption: this.mediaCaptionInput.value,
      };
      this.mediaDetailsRow.style.display = 'flex';
      this.attachedFileName.textContent = `Remote URL: ${url.substring(0, 40)}...`;
    }
  }

  async handleMediaFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    this.mediaTypeSelect.value = mediaType;
    this.mediaDetailsRow.style.display = 'flex';
    this.attachedFileName.textContent = `Local File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    this.pttVoiceToggleWrap.style.display = mediaType === 'audio' ? 'inline-flex' : 'none';

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result.split(',')[1];
      this.currentAttachedMedia = {
        type: mediaType,
        base64: base64Data,
        mimetype: file.type || 'application/octet-stream',
        filename: file.name,
        caption: this.mediaCaptionInput.value,
        ptt: this.pttVoiceCheck.checked,
      };
    };
    reader.readAsDataURL(file);
  }

  updateDelayDisplay(ms) {
    const seconds = (Number(ms) / 1000).toFixed(1);
    this.delayDisplay.textContent = `${seconds}s (${ms}ms)`;
  }

  // ========== Execution & Live Monitoring ==========

  async executeCampaign(isScheduled = false) {
    if (!this.currentSessionId) {
      alert('Please select a connected WhatsApp session first.');
      return;
    }

    const activeSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (activeSession && activeSession.status !== 'ready') {
      const confirmOpen = confirm(`The selected session "${activeSession.name || this.currentSessionId}" is currently "${activeSession.status}". It must be "ready" to dispatch WhatsApp messages.\n\nWould you like to open the Session Manager to connect or scan QR now?`);
      if (confirmOpen) {
        this.openSessionManagerModal();
        this.displaySessionQr(this.currentSessionId, activeSession.name);
      }
      return;
    }

    // Final duplicate guard: one message set per chat ID, whatever the selection state.
    const seenChatIds = new Set();
    const selectedRecipients = this.records.filter(r => {
      if (!r.selected || !r.isValid || !r.chatId || seenChatIds.has(r.chatId)) return false;
      seenChatIds.add(r.chatId);
      return true;
    });
    if (selectedRecipients.length === 0) {
      alert('Please select at least one valid recipient from the contacts list.');
      return;
    }

    const messageText = this.messageTextarea.value.trim();
    const mediaType = this.mediaTypeSelect.value;
    if (mediaType === 'text' && !messageText) {
      alert('Please enter a message text before sending.');
      return;
    }

    const mediaCaption = this.mediaCaptionInput.value.trim();
    const sendSeparateTextMessage = this.sendSeparateTextMessageCheck ? this.sendSeparateTextMessageCheck.checked : true;

    let mediaObj = undefined;
    if (this.currentAttachedMedia) {
      mediaObj = {
        ...this.currentAttachedMedia,
        caption: mediaCaption || undefined,
        ptt: this.pttVoiceCheck.checked,
      };
    } else if (mediaType !== 'text' && this.mediaUrlInput.value.trim()) {
      mediaObj = {
        url: this.mediaUrlInput.value.trim(),
        caption: mediaCaption || undefined,
      };
    }

    const messageConfig = {
      type: mediaType,
      text: messageText,
      media: mediaObj,
      sendSeparateTextMessage,
    };

    const batchSize = parseInt(this.batchSizeInput.value, 10) || 100;
    const options = {
      delayBetweenMessages: parseInt(this.delaySlider.value, 10) || 5000,
      randomizeDelay: this.randomizeDelayCheck.checked,
      stopOnError: this.stopOnErrorCheck.checked,
    };
    const interBatchDelay = parseInt(this.interBatchDelaySelect.value, 10) || 30;

    const customTitle = this.campaignNameInput?.value?.trim();
    const currentSession = this.sessions.find(s => s.id === this.currentSessionId);
    const sessionName = currentSession?.name || currentSession?.id || this.currentSessionId;
    const campaignName = customTitle || `Bulk Campaign ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    try {
      this.campaignManager.setupCampaign({
        campaignName,
        sessionId: this.currentSessionId,
        sessionName,
        recipients: selectedRecipients,
        messageConfig,
        batchSize,
        options,
        interBatchDelaySeconds: interBatchDelay,
      });

      if (isScheduled) {
        const scheduleVal = this.scheduleDateTimeInput.value;
        if (!scheduleVal) {
          alert('Please pick a date and time to schedule the campaign.');
          return;
        }
        this.campaignManager.schedule(new Date(scheduleVal));
      } else {
        this.btnSendNow.disabled = true;
        this.btnScheduleSend.disabled = true;
        this.toggleMonitorDrawer(true);
        await this.campaignManager.start();
      }
    } catch (err) {
      alert(`Could not start campaign: ${err.message}`);
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    }
  }

  toggleMonitorDrawer(forceOpen) {
    if (!this.liveMonitorDrawer) return;
    const isCollapsed = this.liveMonitorDrawer.classList.contains('collapsed');
    const shouldOpen = forceOpen !== undefined ? forceOpen : isCollapsed;

    if (shouldOpen) {
      this.liveMonitorDrawer.classList.remove('collapsed');
      if (this.toggleMonitorIcon) this.toggleMonitorIcon.textContent = '▼';
      if (this.toggleMonitorText) this.toggleMonitorText.textContent = 'Hide Logs';
    } else {
      this.liveMonitorDrawer.classList.add('collapsed');
      if (this.toggleMonitorIcon) this.toggleMonitorIcon.textContent = '▲';
      const count = this.campaignManager?.allResults?.length || 0;
      if (this.toggleMonitorText) this.toggleMonitorText.textContent = `Logs (${count})`;
    }
  }

  handleCampaignUpdate(event, data) {
    if (event === 'campaign_finished' && this.campaignManager.haltReason) {
      window.alert(this.campaignManager.haltReason);
    }
    const { state, stats } = data;

    // Status text & UI buttons
    this.monitorStatusText.textContent = state.toUpperCase();
    if (this.monitorStatusText.dataset) this.monitorStatusText.dataset.state = state;
    if (state === 'scheduled') {
      // Allow cancelling a scheduled campaign (previously there was no way to stop it).
      this.btnCancelBatch.style.display = 'inline-block';
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    } else if (state === 'running') {
      this.btnCancelBatch.style.display = 'inline-block';
      this.btnSendNow.disabled = true;
      this.btnScheduleSend.disabled = true;
    } else {
      this.btnCancelBatch.style.display = 'none';
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    }

    if (state === 'completed' || state === 'cancelled') {
      if (stats.failedCount > 0) {
        this.btnRetryFailed.style.display = 'inline-block';
      }
      this.updateReportsBadge();
    }

    // Stats Counters
    const totalToTrack = stats.totalMessages || stats.totalRecipients;
    this.statTotal.textContent = totalToTrack;
    this.statSent.textContent = stats.sentCount;
    this.statFailed.textContent = stats.failedCount;
    this.statPending.textContent = stats.pendingCount;

    const completed = stats.sentCount + stats.failedCount;
    const pct = totalToTrack > 0 ? Math.round((completed / totalToTrack) * 100) : 0;
    this.monitorProgressBar.style.width = `${pct}%`;
    this.monitorProgressPercent.textContent = `${pct}%`;

    // Render results in monitor table
    if (event === 'batch_progress' && data.results && data.results.length > 0) {
      const combined = [...this.campaignManager.allResults, ...data.results];
      this.renderMonitorResults(combined);
    } else if (this.campaignManager.allResults.length > 0) {
      this.renderMonitorResults(this.campaignManager.allResults);
    }
  }

  renderMonitorResults(results) {
    if (this.liveMonitorDrawer?.classList.contains('collapsed') && this.toggleMonitorText) {
      this.toggleMonitorText.textContent = `Logs (${results.length})`;
    }

    const tbody = this.monitorResultsBody;
    tbody.innerHTML = '';

    // Show most recent 50 results
    const slice = results.slice(-50).reverse();

    slice.forEach((r, idx) => {
      const tr = document.createElement('tr');
      const isSent = r.status === 'sent';
      const badge = isSent
        ? `<span class="badge badge-sent">Sent</span>`
        : `<span class="badge badge-failed">Failed</span>`;

      const detail = isSent
        ? `<span style="font-family: var(--font-mono); font-size: 11px;">${this.escape(r.messageId || 'Success')}</span>`
        : `<span style="color: #ef4444; font-size: 11px;">${this.escape(r.error?.message || r.error?.code || 'Send Failed')}</span>`;

      const isMedia = r.type && r.type !== 'text';
      const typeBadge = isMedia
        ? `<span class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 9px; padding: 1px 4px; margin-right: 4px;">${this.escape((r.type || 'MEDIA').toUpperCase())}</span>`
        : `<span class="badge" style="background: #f1f5f9; color: #475569; font-size: 9px; padding: 1px 4px; margin-right: 4px;">TEXT</span>`;

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${this.escape(r.chatId)}</strong></td>
        <td>${badge}</td>
        <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #1e293b;" title="${this.escape(r.content || '')}">
          ${typeBadge}<span>${this.escape(r.content || '—')}</span>
        </td>
        <td>${detail}</td>
        <td>${r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : '—'}</td>
        <td style="font-size: 10px; color: #64748b;">${this.escape(r.batchId || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  retryFailedRecipients() {
    const failed = this.campaignManager.getFailedRecipients();
    if (failed.length === 0) {
      alert('No failed recipients to retry.');
      return;
    }

    this.records = failed;
    this.renderContactsTable();
    this.updateStats();
    this.btnRetryFailed.style.display = 'none';
    alert(`Loaded ${failed.length} failed recipient(s) for re-sending. Click "Send Now" to retry.`);
  }

  exportToExcel(data, fileName = 'export.xlsx', sheetName = 'Data') {
    if (typeof window !== 'undefined' && window.XLSX) {
      const ws = window.XLSX.utils.json_to_sheet(data);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
      window.XLSX.writeFile(wb, fileName);
      return true;
    }
    return false;
  }

  exportContactsExcel() {
    if (!this.records || this.records.length === 0) {
      alert('No contacts available to export. Import contacts or click Sample first.');
      return;
    }

    const exportData = this.records.map((r, idx) => ({
      '#': idx + 1,
      'Name': r.name || '',
      'Phone Number': r.number || r.rawNumber || '',
      'Chat ID': r.chatId || '',
      'Var1': r.var1 || '',
      'Var2': r.var2 || '',
      'Var3': r.var3 || '',
      'Status': r.status || '',
      'Selected': r.selected ? 'Yes' : 'No',
    }));

    const success = this.exportToExcel(exportData, `openwa_contacts_${Date.now()}.xlsx`, 'Contacts');
    if (!success) {
      alert('Excel export library (XLSX) is not ready.');
    }
  }

  downloadSampleExcel() {
    const sampleData = [
      { 'Name': 'Rahul Sharma', 'Number': '918109531677', 'Var1': 'ORD-9821', 'Var2': 'Electronics' },
      { 'Name': 'Priya Patel', 'Number': '919826012345', 'Var1': 'ORD-9822', 'Var2': 'Books' },
      { 'Name': 'Amit Verma', 'Number': '918109531677', 'Var1': 'ORD-9823', 'Var2': 'Sample Duplicate' },
      { 'Name': 'Sara Khan', 'Number': '919876543210', 'Var1': 'ORD-9824', 'Var2': 'Apparel' },
    ];
    this.exportToExcel(sampleData, 'openwa_contacts_sample_template.xlsx', 'Sample Template');
  }

  exportCampaignExcel() {
    const results = this.campaignManager.allResults;
    if (!results || results.length === 0) {
      if (this.records.length > 0) {
        if (confirm('No campaign execution results yet. Would you like to export the current contacts list to Excel (.xlsx) instead?')) {
          this.exportContactsExcel();
        }
        return;
      }
      alert('No campaign results or contacts available to export yet.');
      return;
    }

    const exportData = results.map((r, idx) => ({
      '#': idx + 1,
      'Chat ID': r.chatId || '',
      'Status': (r.status || '').toUpperCase(),
      'Type': (r.type || 'text').toUpperCase(),
      'Message Content': r.content || '—',
      'Message ID': r.messageId || '—',
      'Error Code': r.error?.code || '—',
      'Error Reason': r.error?.message || '—',
      'Sent At': r.sentAt ? new Date(r.sentAt).toLocaleString() : '—',
      'Batch ID': r.batchId || '—',
    }));

    this.exportToExcel(exportData, `openwa_campaign_report_${Date.now()}.xlsx`, 'Campaign Report');
  }

  exportCampaignReport() {
    const results = this.campaignManager.allResults;
    if (!results || results.length === 0) {
      if (this.records.length > 0) {
        if (confirm('No campaign execution results yet. Would you like to export the current contacts list to CSV instead?')) {
          const csvLines = ['Name,Phone Number,Chat ID,Var1,Var2,Status,Selected'];
          this.records.forEach(r => {
            csvLines.push(`"${r.name || ''}","${r.number || ''}","${r.chatId || ''}","${r.var1 || ''}","${r.var2 || ''}","${r.status || ''}","${r.selected ? 'Yes' : 'No'}"`);
          });
          const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `openwa_contacts_${Date.now()}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        return;
      }
      alert('No campaign results available to export yet.');
      return;
    }

    const csvContent = this.campaignManager.exportResultsCSV('all');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openwa_campaign_report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ========== Templates Modal ==========

  async openTemplatesModal() {
    if (!this.currentSessionId) {
      alert('Connect a WhatsApp session first.');
      return;
    }

    this.modalTemplates.style.display = 'grid';
    this.createTemplateForm.style.display = 'none';
    this.templateTableBody.innerHTML = '<tr><td colspan="4">Loading templates...</td></tr>';

    try {
      const templates = await this.api.getTemplates(this.currentSessionId);
      if (!Array.isArray(templates) || templates.length === 0) {
        this.templateTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No templates found on this session.</td></tr>';
        return;
      }

      this.templateTableBody.innerHTML = '';
      templates.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${this.escape(t.name)}</strong></td>
          <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${this.escape(t.body)}</td>
          <td style="color: #64748b; font-size: 11px;">${this.escape(t.header || '—')} / ${this.escape(t.footer || '—')}</td>
          <td><button class="btn btn-sm btn-primary" data-use="${t.id}">Use</button></td>
        `;

        tr.querySelector('[data-use]').addEventListener('click', () => {
          this.messageTextarea.value = t.body;
          this.updateComposerStats();
          this.modalTemplates.style.display = 'none';
        });

        this.templateTableBody.appendChild(tr);
      });
    } catch (err) {
      this.templateTableBody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${this.escape(err.message)}</td></tr>`;
    }
  }

  async saveNewTemplate() {
    const name = this.newTemplateName.value.trim();
    const body = this.newTemplateBody.value.trim();
    if (!name || !body) {
      alert('Template name and body are required.');
      return;
    }

    try {
      await this.api.createTemplate(this.currentSessionId, { name, body });
      this.newTemplateName.value = '';
      this.newTemplateBody.value = '';
      this.createTemplateForm.style.display = 'none';
      await this.openTemplatesModal();
    } catch (err) {
      alert(`Could not create template: ${err.message}`);
    }
  }

  // ========== Addressbook & Groups Modal ==========

  async openAddressbookModal() {
    if (!this.currentSessionId) {
      alert('Connect a WhatsApp session first.');
      return;
    }
    this.modalAddressbook.style.display = 'grid';
    this.loadSessionContacts();
  }

  async loadSessionContacts() {
    this.addressbookTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading contacts...</td></tr>';
    try {
      const contacts = await this.api.getContacts(this.currentSessionId, 500);
      if (!Array.isArray(contacts) || contacts.length === 0) {
        this.addressbookTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No contacts found in session addressbook.</td></tr>';
        return;
      }

      this.addressbookTableBody.innerHTML = '';
      contacts.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" data-num="${c.number}" data-name="${c.name || c.pushName || ''}" checked /></td>
          <td><strong>${this.escape(c.name || c.pushName || '—')}</strong></td>
          <td>${this.escape(c.number || c.id)}</td>
        `;
        this.addressbookTableBody.appendChild(tr);
      });
    } catch (err) {
      this.addressbookTableBody.innerHTML = `<tr><td colspan="3" style="color: red;">Error: ${this.escape(err.message)}</td></tr>`;
    }
  }

  async loadSessionGroups() {
    this.addressbookTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading groups...</td></tr>';
    try {
      const groups = await this.api.getGroups(this.currentSessionId, 100);
      if (!Array.isArray(groups) || groups.length === 0) {
        this.addressbookTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No groups found for this session.</td></tr>';
        return;
      }

      this.addressbookTableBody.innerHTML = '';
      groups.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" data-group-id="${g.id}" data-name="${g.name || ''}" checked /></td>
          <td><strong>${this.escape(g.name || 'Untitled Group')}</strong></td>
          <td style="font-size: 11px; color: #64748b;">${this.escape(g.id)}</td>
        `;
        this.addressbookTableBody.appendChild(tr);
      });
    } catch (err) {
      this.addressbookTableBody.innerHTML = `<tr><td colspan="3" style="color: red;">Error: ${this.escape(err.message)}</td></tr>`;
    }
  }

  importSelectedAddressbook() {
    const checked = this.addressbookTableBody.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) {
      alert('Please check at least one contact or group.');
      return;
    }

    const newRows = [];
    checked.forEach(cb => {
      const num = cb.dataset.num;
      const grpId = cb.dataset.groupId;
      const name = cb.dataset.name;

      if (num) {
        newRows.push({ name, number: num, var1: 'Addressbook' });
      } else if (grpId) {
        newRows.push({ name, number: grpId, var1: 'WhatsApp Group' });
      }
    });

    const mapping = { number: 'number', name: 'name', var1: 'var1' };
    const processed = ContactParser.processRecords(newRows, mapping);
    // Keep row IDs unique and flag numbers already present in the list as duplicates.
    const existingChatIds = new Set(this.records.filter(r => r.chatId).map(r => r.chatId));
    let nextId = this.records.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
    processed.records.forEach(r => {
      r.id = ++nextId;
      if (r.isValid && !r.isDuplicate && existingChatIds.has(r.chatId)) {
        r.isDuplicate = true;
        r.selected = false;
        r.status = 'Duplicate';
        processed.stats.duplicates++;
        processed.stats.unique--;
      }
    });
    this.records = [...this.records, ...processed.records];
    this.showDuplicateBanner(processed.stats);
    this.saveCurrentDraft();
    this.renderContactsTable();
    this.updateStats();
    this.modalAddressbook.style.display = 'none';
  }

  // ========== Statistics & Audit Modal ==========

  async openStatsModal() {
    this.modalStats.style.display = 'grid';
    try {
      const overview = await this.api.getStatsOverview();
      this.gwStatSent.textContent = overview.messages?.sent || 0;
      this.gwStatReceived.textContent = overview.messages?.received || 0;
      this.gwStatFailed.textContent = overview.messages?.failed || 0;
      this.gwStatSessions.textContent = overview.sessions?.active || 0;

      const auditLogs = await this.api.getAuditLogs({ limit: 15 });
      const items = auditLogs.items || (Array.isArray(auditLogs) ? auditLogs : []);
      this.auditTableBody.innerHTML = '';

      if (items.length === 0) {
        this.auditTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No audit logs found.</td></tr>';
        return;
      }

      items.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${this.escape(log.action || '—')}</strong></td>
          <td><span class="badge ${log.severity === 'error' ? 'badge-failed' : 'badge-valid'}">${this.escape(log.severity || 'info')}</span></td>
          <td style="font-size: 11px; color: #64748b;">${this.escape(log.sessionId || 'Global')}</td>
          <td>${log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : '—'}</td>
        `;
        this.auditTableBody.appendChild(tr);
      });
    } catch (err) {
      console.warn('Stats fetch error:', err.message);
    }
  }

  // ========== API Settings Modal ==========

  async testApiConnection() {
    let url = this.apiBaseUrlInput.value.trim();
    if (!url || url.includes('localhost:2785') || url.includes('127.0.0.1:2785')) {
      url = '/api';
    }
    const key = this.apiKeyInput.value.trim();
    this.apiTestResult.textContent = 'Testing connection...';
    this.apiTestResult.style.color = '#0284c7';

    try {
      const tempApi = new OpenWaApiService(url);
      if (key) tempApi.setApiKey(key);
      const sessions = await tempApi.getSessions();
      this.apiTestResult.textContent = `Connected successfully! Found ${Array.isArray(sessions) ? sessions.length : 0} session(s).`;
      this.apiTestResult.style.color = '#16a34a';
    } catch (err) {
      this.apiTestResult.textContent = `Connection failed: ${err.message}`;
      this.apiTestResult.style.color = '#ef4444';
    }
  }

  saveApiSettings() {
    let url = this.apiBaseUrlInput.value.trim();
    if (!url || url.includes('localhost:2785') || url.includes('127.0.0.1:2785')) {
      url = '/api';
    }
    const key = this.apiKeyInput.value.trim();
    this.api.setBaseUrl(url);
    if (key) {
      this.api.setApiKey(key);
    }
    this.modalApiSettings.style.display = 'none';
    this.initSession();
  }

  // ========== WhatsApp Session Management & QR Linking ==========

  async refreshSessions(showToast = false) {
    if (this.sessionStatusPill) {
      this.sessionStatusPill.textContent = 'Refreshing...';
    }
    await this.initSession();
    if (this.modalSessionManager && this.modalSessionManager.style.display !== 'none') {
      await this.loadSessionManagerTable();
    }
    if (showToast) {
      const active = this.sessions.find(s => s.id === this.currentSessionId);
      alert(`Sessions refreshed. Active session is "${active?.name || this.currentSessionId || 'None'}" (${active?.status || 'unknown'}).`);
    }
  }

  async openSessionManagerModal() {
    this.modalSessionManager.style.display = 'grid';
    if (this.createSessionMessage) {
      this.createSessionMessage.style.display = 'none';
    }
    if (this.activeSessionFooterDisplay) {
      const active = this.sessions.find(s => s.id === this.currentSessionId);
      this.activeSessionFooterDisplay.textContent = active ? `${active.name || active.id} (${active.status})` : 'None Selected';
    }
    await this.loadSessionManagerTable();
  }

  async loadSessionManagerTable() {
    try {
      this.sessions = await this.api.getSessions();
      const tbody = this.sessionsManagerBody;
      tbody.innerHTML = '';

      if (!Array.isArray(this.sessions) || this.sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 14px;">No WhatsApp sessions created yet. Create one above to get started!</td></tr>';
        return;
      }

      this.sessions.forEach(s => {
        const tr = document.createElement('tr');
        const isActive = s.id === this.currentSessionId;
        const isReady = s.status === 'ready';

        let statusBadgeClass = 'badge-stopped';
        if (isReady) statusBadgeClass = 'badge-ready';
        else if (s.status === 'qr_ready') statusBadgeClass = 'badge-qr-ready';
        else if (s.status === 'authenticating' || s.status === 'initializing') statusBadgeClass = 'badge-auth';
        else if (s.status === 'failed') statusBadgeClass = 'badge-failed';

        const phoneDisplay = s.phone ? `<span style="font-family: var(--font-mono); font-weight: 600;">+${this.escape(s.phone)}</span>` : '<span style="color: #94a3b8;">Not linked</span>';
        const pushDisplay = s.pushName ? ` <small style="color: #64748b;">(${this.escape(s.pushName)})</small>` : '';

        tr.innerHTML = `
          <td style="text-align: center;">
            <input type="radio" name="activeSessionRadio" value="${this.escape(s.id)}" ${isActive ? 'checked' : ''} style="cursor: pointer;" title="Select as Active Campaign Session" />
          </td>
          <td>
            <strong>${this.escape(s.name || s.id)}</strong>
            ${isActive ? ' <span class="badge badge-ready" style="font-size: 9px; padding: 1px 4px;">ACTIVE</span>' : ''}
          </td>
          <td>${phoneDisplay}${pushDisplay}</td>
          <td><span class="badge ${statusBadgeClass}">${this.escape(s.status || 'unknown')}</span></td>
          <td style="font-size: 11px;">
            <span style="color: ${s.engineLoaded ? '#16a34a' : '#94a3b8'}; font-weight: 600;">
              ${s.engineLoaded ? '● Running' : '○ Stopped'}
            </span>
          </td>
          <td style="white-space: nowrap;">
            <div style="display: flex; gap: 4px; align-items: center;">
              <button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'} btn-assign-campaign" data-id="${this.escape(s.id)}" data-name="${this.escape(s.name || s.id)}" style="font-size: 10px; padding: 2px 6px;">
                ${isActive ? 'Selected' : 'Use for Campaign'}
              </button>
              ${!isReady ? `
                <button class="btn btn-sm btn-connect-qr" data-id="${this.escape(s.id)}" data-name="${this.escape(s.name || s.id)}" style="font-size: 10px; padding: 2px 6px; background: #0284c7; color: #fff;">
                  Scan QR
                </button>
              ` : ''}
              ${s.engineLoaded ? `
                <button class="btn btn-sm btn-stop-session" data-id="${this.escape(s.id)}" title="Stop engine" style="font-size: 10px; padding: 2px 5px;">Stop</button>
              ` : `
                <button class="btn btn-sm btn-start-session" data-id="${this.escape(s.id)}" title="Start engine" style="font-size: 10px; padding: 2px 5px;">Start</button>
              `}
              ${isReady ? `
                <button class="btn btn-sm btn-logout-session" data-id="${this.escape(s.id)}" title="Logout from WhatsApp" style="font-size: 10px; padding: 2px 5px; color: #b45309;">Logout</button>
              ` : ''}
              <button class="btn btn-sm btn-delete-session" data-id="${this.escape(s.id)}" data-name="${this.escape(s.name || s.id)}" title="Delete session" style="font-size: 10px; padding: 2px 5px; color: #ef4444;">✕</button>
            </div>
          </td>
        `;

        // Radio change
        tr.querySelector('input[type="radio"]').addEventListener('change', () => {
          this.selectActiveSession(s.id);
        });

        // Use for campaign button
        tr.querySelector('.btn-assign-campaign')?.addEventListener('click', () => {
          this.selectActiveSession(s.id);
        });

        // Connect QR
        tr.querySelector('.btn-connect-qr')?.addEventListener('click', () => {
          this.displaySessionQr(s.id, s.name || s.id);
        });

        // Start session
        tr.querySelector('.btn-start-session')?.addEventListener('click', async () => {
          await this.handleStartSession(s.id);
        });

        // Stop session
        tr.querySelector('.btn-stop-session')?.addEventListener('click', async () => {
          await this.handleStopSession(s.id);
        });

        // Logout session
        tr.querySelector('.btn-logout-session')?.addEventListener('click', async () => {
          await this.handleLogoutSession(s.id);
        });

        // Delete session
        tr.querySelector('.btn-delete-session')?.addEventListener('click', async () => {
          await this.handleDeleteSession(s.id, s.name || s.id);
        });

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading sessions table:', err);
      this.sessionsManagerBody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; padding: 10px;">Failed to load sessions: ${this.escape(err.message)}</td></tr>`;
    }
  }

  selectActiveSession(sessionId) {
    this.currentSessionId = sessionId;
    localStorage.setItem('openwa_bulk_preferred_session', sessionId);
    if (this.sessionSelect) {
      this.sessionSelect.value = sessionId;
    }
    const active = this.sessions.find(s => s.id === sessionId);
    if (this.activeSessionFooterDisplay) {
      this.activeSessionFooterDisplay.textContent = active ? `${active.name || active.id} (${active.status})` : sessionId;
    }
    this.updateSessionStatus();
    this.loadSessionManagerTable();
  }

  async handleCreateSession() {
    const rawName = (this.newSessionNameInput.value || '').trim();
    if (!rawName) {
      this.showCreateSessionMessage('Please enter a session name.', 'error');
      return;
    }

    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(rawName)) {
      this.showCreateSessionMessage('Name must be 3-50 characters with letters, numbers, hyphens or underscores only.', 'error');
      return;
    }

    this.showCreateSessionMessage(`Creating session "${rawName}"...`, 'info');
    this.btnCreateNewSession.disabled = true;

    try {
      const created = await this.api.createSession({ name: rawName });
      const newId = created?.id || rawName;

      this.showCreateSessionMessage(`Session "${rawName}" created! Starting engine...`, 'info');
      try {
        await this.api.startSession(newId);
      } catch (startErr) {
        console.warn('Start session notice:', startErr.message);
      }

      this.newSessionNameInput.value = '';
      this.showCreateSessionMessage(`Session ready. Scan the QR code on the right to link!`, 'success');

      // Refresh list & launch QR viewer
      await this.initSession();
      await this.loadSessionManagerTable();
      this.displaySessionQr(newId, rawName);
    } catch (err) {
      this.showCreateSessionMessage(`Failed to create session: ${err.message}`, 'error');
    } finally {
      this.btnCreateNewSession.disabled = false;
    }
  }

  showCreateSessionMessage(text, type = 'info') {
    if (!this.createSessionMessage) return;
    this.createSessionMessage.style.display = 'block';
    this.createSessionMessage.textContent = text;
    if (type === 'error') {
      this.createSessionMessage.style.color = '#ef4444';
    } else if (type === 'success') {
      this.createSessionMessage.style.color = '#16a34a';
    } else {
      this.createSessionMessage.style.color = '#0284c7';
    }
  }

  async displaySessionQr(sessionId, sessionName) {
    if (this.qrPollInterval) {
      clearInterval(this.qrPollInterval);
      this.qrPollInterval = null;
    }

    this.activeQrSessionId = sessionId;
    this.qrPlaceholder.style.display = 'none';
    this.qrActiveContainer.style.display = 'flex';
    this.qrSessionNameText.textContent = sessionName || sessionId;
    this.qrStatusBadge.textContent = 'Connecting...';
    this.qrStatusBadge.className = 'badge badge-auth';
    this.sessionQrImg.style.display = 'none';
    this.qrLoadingOverlay.style.display = 'flex';
    this.qrLoadingOverlay.innerHTML = `
      <div style="width: 20px; height: 20px; border: 2px solid #cbd5e1; border-top-color: #0284c7; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <span>Fetching WhatsApp QR...</span>
    `;
    this.pairingCodeResult.style.display = 'none';

    // Start engine if stopped
    try {
      await this.api.startSession(sessionId);
    } catch {
      // Ignored if already started
    }

    const poll = async () => {
      try {
        const qrData = await this.api.getSessionQR(sessionId);
        if (qrData?.qrCode) {
          this.sessionQrImg.src = qrData.qrCode;
          this.sessionQrImg.style.display = 'block';
          if (this.enlargedQrImg) {
            this.enlargedQrImg.src = qrData.qrCode;
            this.enlargedQrImg.style.display = 'block';
          }
          if (this.enlargedQrLoadingOverlay) {
            this.enlargedQrLoadingOverlay.style.display = 'none';
          }
          this.qrLoadingOverlay.style.display = 'none';
          this.qrStatusBadge.textContent = 'Scan with WhatsApp';
          this.qrStatusBadge.className = 'badge badge-qr-ready';
        }

        if (qrData?.status === 'ready') {
          clearInterval(this.qrPollInterval);
          this.qrPollInterval = null;
          this.sessionQrImg.style.display = 'none';
          if (this.modalQrEnlarge) this.modalQrEnlarge.style.display = 'none';
          this.qrLoadingOverlay.style.display = 'flex';
          this.qrLoadingOverlay.innerHTML = `
            <div style="color: #16a34a; font-size: 28px; font-weight: bold;">✓</div>
            <strong style="color: #16a34a;">WhatsApp Linked!</strong>
          `;
          this.qrStatusBadge.textContent = 'READY';
          this.qrStatusBadge.className = 'badge badge-ready';
          this.selectActiveSession(sessionId);
          await this.initSession();
          await this.loadSessionManagerTable();
        }
      } catch (err) {
        // If 400 because already authenticated
        try {
          const s = await this.api.getSession(sessionId);
          if (s?.status === 'ready') {
            clearInterval(this.qrPollInterval);
            this.qrPollInterval = null;
            this.sessionQrImg.style.display = 'none';
            this.qrLoadingOverlay.style.display = 'flex';
            this.qrLoadingOverlay.innerHTML = `
              <div style="color: #16a34a; font-size: 28px; font-weight: bold;">✓</div>
              <strong style="color: #16a34a;">WhatsApp Linked!</strong>
            `;
            this.qrStatusBadge.textContent = 'READY';
            this.qrStatusBadge.className = 'badge badge-ready';
            this.selectActiveSession(sessionId);
            await this.initSession();
            await this.loadSessionManagerTable();
          }
        } catch {
          // Continue polling
        }
      }
    };

    await poll();
    this.qrPollInterval = setInterval(poll, 2500);
  }

  async handleGetPairingCode() {
    if (!this.activeQrSessionId) {
      alert('Please start or select a session first to generate a pairing code.');
      return;
    }

    const phone = (this.pairingPhoneInput.value || '').trim().replace(/\D/g, '');
    if (!phone || phone.length < 8) {
      alert('Please enter a valid phone number with country code (e.g. 919876543210).');
      return;
    }

    this.btnGetPairingCode.disabled = true;
    this.btnGetPairingCode.textContent = 'Generating...';

    try {
      const res = await this.api.requestPairingCode(this.activeQrSessionId, phone);
      const code = res?.pairingCode || res?.code || res;
      if (this.pairingCodeValue) {
        this.pairingCodeValue.textContent = String(code);
      }
      this.pairingCodeResult.style.display = 'block';
    } catch (err) {
      alert(`Could not get pairing code: ${err.message}. Make sure the session status is "qr_ready".`);
    } finally {
      this.btnGetPairingCode.disabled = false;
      this.btnGetPairingCode.textContent = 'Get Code';
    }
  }

  switchConnectionMode(mode) {
    if (mode === 'pairing') {
      this.tabModeQr?.classList.remove('active');
      this.tabModePairing?.classList.add('active');
      if (this.sectionModeQr) this.sectionModeQr.style.display = 'none';
      if (this.sectionModePairing) this.sectionModePairing.style.display = 'flex';
    } else {
      this.tabModePairing?.classList.remove('active');
      this.tabModeQr?.classList.add('active');
      if (this.sectionModePairing) this.sectionModePairing.style.display = 'none';
      if (this.sectionModeQr) this.sectionModeQr.style.display = 'flex';
    }
  }

  async forceRefreshCurrentQr() {
    if (!this.activeQrSessionId) return;
    if (this.btnManualRefreshQr) {
      this.btnManualRefreshQr.textContent = '↻ Loading...';
      this.btnManualRefreshQr.disabled = true;
    }
    try {
      const qrData = await this.api.getSessionQR(this.activeQrSessionId);
      if (qrData?.qrCode) {
        this.sessionQrImg.src = qrData.qrCode;
        this.sessionQrImg.style.display = 'block';
        if (this.enlargedQrImg) {
          this.enlargedQrImg.src = qrData.qrCode;
          this.enlargedQrImg.style.display = 'block';
        }
        if (this.enlargedQrLoadingOverlay) {
          this.enlargedQrLoadingOverlay.style.display = 'none';
        }
        this.qrLoadingOverlay.style.display = 'none';
        this.qrStatusBadge.textContent = 'Scan with WhatsApp';
        this.qrStatusBadge.className = 'badge badge-qr-ready';
      }
    } catch (err) {
      console.warn('Manual QR refresh error:', err.message);
    } finally {
      if (this.btnManualRefreshQr) {
        this.btnManualRefreshQr.textContent = '↻ Refresh';
        this.btnManualRefreshQr.disabled = false;
      }
    }
  }

  copyPairingCode() {
    const raw = this.pairingCodeValue?.textContent || '';
    if (!raw) return;
    navigator.clipboard?.writeText(raw.replace(/\s+/g, ''));
    if (this.btnCopyPairingCode) {
      const orig = this.btnCopyPairingCode.textContent;
      this.btnCopyPairingCode.textContent = '✓ Copied!';
      setTimeout(() => {
        if (this.btnCopyPairingCode) this.btnCopyPairingCode.textContent = orig;
      }, 2000);
    }
  }

  async handleStartSession(sessionId) {
    try {
      await this.api.startSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      alert(`Could not start session: ${err.message}`);
    }
  }

  async handleStopSession(sessionId) {
    if (!confirm('Are you sure you want to stop this WhatsApp session?')) return;
    try {
      await this.api.stopSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      alert(`Could not stop session: ${err.message}`);
    }
  }

  async handleLogoutSession(sessionId) {
    if (!confirm('Are you sure you want to log out this WhatsApp account? You will need to scan QR code again.')) return;
    try {
      await this.api.logoutSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      alert(`Could not log out session: ${err.message}`);
    }
  }

  async handleDeleteSession(sessionId, sessionName) {
    if (!confirm(`Are you sure you want to permanently delete session "${sessionName}"? This cannot be undone.`)) return;
    try {
      if (this.qrPollInterval && this.activeQrSessionId === sessionId) {
        clearInterval(this.qrPollInterval);
        this.qrPollInterval = null;
        this.qrPlaceholder.style.display = 'block';
        this.qrActiveContainer.style.display = 'none';
      }
      await this.api.deleteSession(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      await this.initSession();
      await this.loadSessionManagerTable();
    } catch (err) {
      alert(`Could not delete session: ${err.message}`);
    }
  }

  // ========== Reports & Campaign History Methods ==========

  showDraftIndicator(count) {
    if (!this.draftStatusBanner) return;
    this.draftStatusBanner.style.display = 'flex';
    const span = this.draftStatusBanner.querySelector('span');
    if (span) span.textContent = `Auto-saved in browser database (${count} numbers) — Refresh-proof`;
  }

  hideDraftIndicator() {
    if (this.draftStatusBanner) this.draftStatusBanner.style.display = 'none';
  }

  async saveCurrentDraft() {
    if (this.records && this.records.length > 0) {
      await ReportStore.saveContactsDraft(this.records);
      this.showDraftIndicator(this.records.length);
    } else {
      await ReportStore.clearContactsDraft();
      this.hideDraftIndicator();
    }
  }

  async saveComposerDraft() {
    const text = this.messageTextarea.value || '';
    await ReportStore.saveComposerDraft({ text });
  }

  async clearDraftContacts() {
    if (confirm('Clear the saved draft from local database?')) {
      this.records = [];
      await ReportStore.clearContactsDraft();
      this.hideDraftIndicator();
      this.renderContactsTable();
      this.updateStats();
    }
  }

  async checkAndRestoreDraft() {
    try {
      const draft = await ReportStore.getContactsDraft();
      if (draft && Array.isArray(draft.records) && draft.records.length > 0) {
        this.records = draft.records;
        this.renderContactsTable();
        this.updateStats();
        this.showDraftIndicator(draft.records.length);
      }
      const compDraft = await ReportStore.getComposerDraft();
      if (compDraft && compDraft.text && !this.messageTextarea.value) {
        this.messageTextarea.value = compDraft.text;
        this.updateComposerStats();
      }
    } catch (err) {
      console.warn('Could not restore draft:', err);
    }
  }

  async updateReportsBadge() {
    try {
      const stats = await ReportStore.getOverallStats();
      if (this.reportsCountBadge) {
        this.reportsCountBadge.textContent = stats.totalCampaigns;
      }
    } catch (e) {
      console.warn('Could not update reports badge:', e);
    }
  }

  async openReportsModal() {
    if (!this.modalReportsHistory) return;
    this.modalReportsHistory.style.display = 'grid';
    this.closeDrilldownView();
    await this.loadReportsKPIs();
    await this.loadHistoricalCampaigns();
  }

  async loadReportsKPIs() {
    try {
      const stats = await ReportStore.getOverallStats();
      if (this.kpiTotalCampaigns) this.kpiTotalCampaigns.textContent = stats.totalCampaigns;
      if (this.kpiTotalSent) this.kpiTotalSent.textContent = stats.totalMessagesSent;
      if (this.kpiTotalFailed) this.kpiTotalFailed.textContent = stats.totalFailed;
      if (this.kpiSuccessRate) this.kpiSuccessRate.textContent = `${stats.successRate}%`;
      if (this.tabCountBulk) this.tabCountBulk.textContent = stats.totalCampaigns;
      if (this.tabCountSingle) this.tabCountSingle.textContent = stats.totalSingleMessages;
      if (this.reportsCountBadge) this.reportsCountBadge.textContent = stats.totalCampaigns;
    } catch (e) {
      console.warn('Error loading reports KPIs:', e);
    }
  }

  switchReportsTab(tab) {
    if (tab === 'bulk') {
      this.tabBtnBulkReports?.classList.add('active');
      this.tabBtnSingleReports?.classList.remove('active');
      if (this.viewBulkCampaigns) this.viewBulkCampaigns.style.display = 'block';
      if (this.viewSingleMessages) this.viewSingleMessages.style.display = 'none';
      if (this.viewCampaignDetailDrilldown) this.viewCampaignDetailDrilldown.style.display = 'none';
      this.loadHistoricalCampaigns();
    } else {
      this.tabBtnSingleReports?.classList.add('active');
      this.tabBtnBulkReports?.classList.remove('active');
      if (this.viewBulkCampaigns) this.viewBulkCampaigns.style.display = 'none';
      if (this.viewSingleMessages) this.viewSingleMessages.style.display = 'block';
      if (this.viewCampaignDetailDrilldown) this.viewCampaignDetailDrilldown.style.display = 'none';
      this.loadSingleMessages();
    }
  }

  async refreshCurrentReportsView() {
    await this.loadReportsKPIs();
    if (this.tabBtnBulkReports?.classList.contains('active')) {
      if (this.viewCampaignDetailDrilldown?.style.display === 'flex' && this.activeDrilldownCampaignId) {
        await this.openCampaignDrilldown(this.activeDrilldownCampaignId);
      } else {
        await this.loadHistoricalCampaigns();
      }
    } else {
      await this.loadSingleMessages();
    }
  }

  async loadHistoricalCampaigns() {
    const tbody = this.campaignsHistoryBody;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">Loading campaigns...</td></tr>';

    try {
      const campaigns = await ReportStore.getAllCampaigns();
      this.currentLoadedCampaigns = campaigns;
      this.renderHistoricalCampaignsTable(campaigns);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 20px;">Error: ${this.escape(err.message)}</td></tr>`;
    }
  }

  renderHistoricalCampaignsTable(campaigns) {
    const tbody = this.campaignsHistoryBody;
    if (!tbody) return;
    tbody.innerHTML = '';

    const query = (this.reportSearchInput?.value || '').toLowerCase().trim();
    const filtered = query
      ? campaigns.filter(c => (c.name || '').toLowerCase().includes(query) || (c.sessionName || '').toLowerCase().includes(query))
      : campaigns;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">
            ${query ? 'No campaigns matching your search.' : 'No campaigns executed yet. Any campaign you run will permanently appear here.'}
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((c) => {
      const tr = document.createElement('tr');
      const dateStr = new Date(c.createdAt).toLocaleString();
      const statusClass = c.status === 'completed' ? 'completed' : (c.status === 'in_progress' ? 'in_progress' : (c.status === 'cancelled' ? 'cancelled' : 'failed'));
      const statusLabel = (c.status || 'completed').toUpperCase();

      const total = Number(c.totalRecipients) || 0;
      const sent = Number(c.sentCount) || 0;
      const failed = Number(c.failedCount) || 0;
      const successPct = total > 0 ? ((sent / total) * 100).toFixed(1) + '%' : (sent > 0 ? '100%' : '0%');

      tr.innerHTML = `
        <td style="font-size: 11px; color: #64748b;">${dateStr}</td>
        <td>
          <strong style="color: #0f172a; font-size: 12px;">${this.escape(c.name)}</strong>
          <div style="font-size: 10px; color: #64748b; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${this.escape(c.messagePreview || '—')}
          </div>
        </td>
        <td>
          <span class="badge" style="background: #f1f5f9; color: #0284c7; font-weight: 600;">${this.escape(c.sessionName || c.sessionId)}</span>
        </td>
        <td style="text-align: center; font-weight: 600;">${total}</td>
        <td style="text-align: center; color: #059669; font-weight: 700;">${sent}</td>
        <td style="text-align: center; color: ${failed > 0 ? '#ef4444' : '#94a3b8'}; font-weight: 700;">${failed}</td>
        <td style="text-align: center; font-weight: 600; color: #8b5cf6;">${successPct}</td>
        <td>
          <span class="report-status-badge ${statusClass}">${statusLabel}</span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="report-row-action-btn primary" data-action="view" data-id="${c.id}" title="View Recipient Numbers & Delivery Status">
              🔍 View
            </button>
            <button class="report-row-action-btn" data-action="excel" data-id="${c.id}" title="Download Excel (.xlsx) Report">
              📥 Excel
            </button>
            ${failed > 0 ? `<button class="report-row-action-btn" data-action="retry" data-id="${c.id}" style="color: #dc2626;" title="Load failed numbers into composer">🔄 Retry</button>` : ''}
            <button class="report-row-action-btn danger" data-action="delete" data-id="${c.id}" title="Delete Report">
              🗑️
            </button>
          </div>
        </td>
      `;

      // Wire action buttons
      tr.querySelector('[data-action="view"]')?.addEventListener('click', () => this.openCampaignDrilldown(c.id));
      tr.querySelector('[data-action="excel"]')?.addEventListener('click', () => this.exportCampaignExcelById(c.id));
      tr.querySelector('[data-action="retry"]')?.addEventListener('click', () => this.retryFailedFromCampaignId(c.id));
      tr.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.deleteHistoricalCampaign(c.id, c.name));

      tbody.appendChild(tr);
    });
  }

  async openCampaignDrilldown(campaignId) {
    this.activeDrilldownCampaignId = campaignId;
    if (this.viewBulkCampaigns) this.viewBulkCampaigns.style.display = 'none';
    if (this.viewCampaignDetailDrilldown) this.viewCampaignDetailDrilldown.style.display = 'flex';

    try {
      const data = await ReportStore.getCampaignDetails(campaignId);
      if (!data || !data.campaign) {
        alert('Campaign report not found.');
        this.closeDrilldownView();
        return;
      }

      const { campaign, logs } = data;
      this.currentDrilldownLogs = logs || [];

      if (this.drilldownCampaignTitle) this.drilldownCampaignTitle.textContent = campaign.name;
      if (this.drilldownSessionBadge) this.drilldownSessionBadge.textContent = campaign.sessionName || campaign.sessionId;
      if (this.drilldownMetaSubtitle) {
        this.drilldownMetaSubtitle.textContent = `Date: ${new Date(campaign.createdAt).toLocaleString()} | Total: ${campaign.totalRecipients} | Sent: ${campaign.sentCount} | Failed: ${campaign.failedCount}`;
      }

      const sentLogs = this.currentDrilldownLogs.filter(l => l.status === 'sent');
      const failedLogs = this.currentDrilldownLogs.filter(l => l.status === 'failed');

      if (this.drilldownCountAll) this.drilldownCountAll.textContent = this.currentDrilldownLogs.length;
      if (this.drilldownCountSent) this.drilldownCountSent.textContent = sentLogs.length;
      if (this.drilldownCountFailed) this.drilldownCountFailed.textContent = failedLogs.length;

      if (this.btnRetryFailedFromReport) {
        this.btnRetryFailedFromReport.style.display = failedLogs.length > 0 ? 'inline-flex' : 'none';
        this.btnRetryFailedFromReport.textContent = `🔄 Re-Send Failed Numbers (${failedLogs.length})`;
      }

      if (this.drilldownMessagePreviewText) {
        this.drilldownMessagePreviewText.textContent = campaign.messagePreview || logs[0]?.content || '—';
      }

      this.drilldownFilter = 'all';
      document.querySelectorAll('.drilldownFilterBtn').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === 'all');
      });

      this.renderDrilldownNumbersTable();
    } catch (err) {
      alert(`Error opening campaign details: ${err.message}`);
      this.closeDrilldownView();
    }
  }

  renderDrilldownNumbersTable() {
    const tbody = this.drilldownNumbersBody;
    if (!tbody) return;
    tbody.innerHTML = '';

    let list = this.currentDrilldownLogs;
    if (this.drilldownFilter === 'sent') list = list.filter(l => l.status === 'sent');
    if (this.drilldownFilter === 'failed') list = list.filter(l => l.status === 'failed');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 14px;">No records match the "${this.drilldownFilter}" filter.</td></tr>`;
      return;
    }

    list.forEach((log, idx) => {
      const tr = document.createElement('tr');
      const isSent = log.status === 'sent';
      const badge = isSent
        ? `<span class="badge badge-sent">Sent</span>`
        : `<span class="badge badge-failed">Failed</span>`;

      const detailText = isSent
        ? (log.waMessageId ? `<span style="font-family: var(--font-mono); font-size: 10px;">ID: ${this.escape(log.waMessageId)}</span>` : '<span style="color: #059669;">Delivered</span>')
        : `<span style="color: #ef4444; font-size: 11px;">${this.escape(log.error || 'Submission Failed')}</span>`;

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${this.escape(log.recipient)}</strong></td>
        <td>${this.escape(log.name || '—')}</td>
        <td>${badge}</td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${detailText}
        </td>
        <td style="font-size: 11px; color: #64748b;">${log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  closeDrilldownView() {
    this.activeDrilldownCampaignId = null;
    this.currentDrilldownLogs = [];
    if (this.viewCampaignDetailDrilldown) this.viewCampaignDetailDrilldown.style.display = 'none';
    if (this.viewBulkCampaigns) this.viewBulkCampaigns.style.display = 'block';
  }

  async exportCampaignExcelById(campaignId) {
    try {
      const filename = await ReportStore.exportCampaignReport(campaignId, 'xlsx');
      alert(`Report exported successfully: ${filename}`);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    }
  }

  async exportCurrentDrilldownExcel() {
    if (!this.activeDrilldownCampaignId) return;
    await this.exportCampaignExcelById(this.activeDrilldownCampaignId);
  }

  async exportAllSummaryExcel() {
    try {
      const filename = await ReportStore.exportAllCampaignsSummary('xlsx');
      alert(`Summary report exported successfully: ${filename}`);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    }
  }

  async retryFailedFromCampaignId(campaignId) {
    try {
      const data = await ReportStore.getCampaignDetails(campaignId);
      if (!data || !data.logs) {
        alert('No logs found for this campaign.');
        return;
      }
      const failed = data.logs.filter(l => l.status === 'failed');
      if (failed.length === 0) {
        alert('This campaign had no failed numbers!');
        return;
      }

      const retryRows = failed.map(f => ({
        number: f.recipient,
        name: f.name || '',
        var1: 'Retry-Failed',
      }));

      const mapping = { number: 'number', name: 'name', var1: 'var1' };
      const processed = ContactParser.processRecords(retryRows, mapping);

      this.records = processed.records;
      this.showDuplicateBanner(processed.stats);
      this.renderContactsTable();
      this.updateStats();
      this.saveCurrentDraft();

      this.modalReportsHistory.style.display = 'none';
      alert(`Loaded ${failed.length} failed recipient(s) directly into your WhatsApp Numbers table for a retry campaign!`);
    } catch (e) {
      alert(`Failed to load retry numbers: ${e.message}`);
    }
  }

  async retryFailedFromCurrentDrilldown() {
    if (!this.activeDrilldownCampaignId) return;
    await this.retryFailedFromCampaignId(this.activeDrilldownCampaignId);
  }

  async deleteHistoricalCampaign(campaignId, campaignName) {
    if (!confirm(`Delete campaign report "${campaignName}" from local database? This cannot be undone.`)) return;
    try {
      await ReportStore.deleteCampaign(campaignId);
      await this.loadReportsKPIs();
      await this.loadHistoricalCampaigns();
    } catch (e) {
      alert(`Could not delete report: ${e.message}`);
    }
  }

  async clearAllReports() {
    if (!confirm('Are you sure you want to clear ALL campaign reports and message audit logs? This cannot be undone.')) return;
    try {
      await ReportStore.clearAllCampaigns();
      await ReportStore.clearAllSingleMessages();
      await this.loadReportsKPIs();
      await this.loadHistoricalCampaigns();
      alert('All campaign reports have been cleared.');
    } catch (e) {
      alert(`Error clearing reports: ${e.message}`);
    }
  }

  async loadSingleMessages() {
    const tbody = this.singleMessagesBody;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">Loading single messages...</td></tr>';

    try {
      const messages = await ReportStore.getAllSingleMessages();
      tbody.innerHTML = '';
      if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">No single test messages recorded yet.</td></tr>';
        return;
      }

      messages.forEach(m => {
        const tr = document.createElement('tr');
        const isSent = m.status === 'sent';
        const badge = isSent
          ? `<span class="badge badge-sent">Sent</span>`
          : `<span class="badge badge-failed">Failed</span>`;
        const detail = isSent
          ? (m.waMessageId ? `<span style="font-family: var(--font-mono); font-size: 10px;">ID: ${this.escape(m.waMessageId)}</span>` : '<span style="color: #059669;">Delivered</span>')
          : `<span style="color: #ef4444; font-size: 11px;">${this.escape(m.error || 'Failed')}</span>`;

        tr.innerHTML = `
          <td style="font-size: 11px; color: #64748b;">${new Date(m.timestamp).toLocaleString()}</td>
          <td><strong>${this.escape(m.recipient)}</strong></td>
          <td><span class="badge" style="background: #f1f5f9; color: #0284c7;">${this.escape(m.sessionName || m.sessionId)}</span></td>
          <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escape(m.message || '—')}</td>
          <td>${badge}</td>
          <td>${detail}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 20px;">Error: ${this.escape(e.message)}</td></tr>`;
    }
  }

  filterReportsList() {
    if (this.currentLoadedCampaigns && this.tabBtnBulkReports?.classList.contains('active')) {
      this.renderHistoricalCampaignsTable(this.currentLoadedCampaigns);
    }
  }

  // ========== QR Zoom & Sizing Methods ==========

  setQrSize(sizePx) {
    this.currentQrSize = sizePx;
    if (this.qrImageWrapper) {
      this.qrImageWrapper.style.width = `${sizePx}px`;
      this.qrImageWrapper.style.height = `${sizePx}px`;
    }
    if (this.sessionQrImg) {
      this.sessionQrImg.style.width = `${sizePx - 10}px`;
      this.sessionQrImg.style.height = `${sizePx - 10}px`;
    }
  }

  setEnlargedQrZoom(sizePx) {
    if (this.enlargedQrBox) {
      this.enlargedQrBox.style.width = `${sizePx}px`;
      this.enlargedQrBox.style.height = `${sizePx}px`;
    }
    if (this.enlargedQrImg) {
      this.enlargedQrImg.style.width = `${sizePx - 20}px`;
      this.enlargedQrImg.style.height = `${sizePx - 20}px`;
    }
    if (this.qrZoomValText) {
      this.qrZoomValText.textContent = `${sizePx}px`;
    }
  }

  openEnlargedQrModal() {
    const hasQrSrc = this.sessionQrImg && this.sessionQrImg.src && this.sessionQrImg.style.display !== 'none';
    if (!hasQrSrc && !this.activeQrSessionId) {
      alert('Please start or select a session to view its QR code first.');
      return;
    }
    if (!this.modalQrEnlarge) return;

    if (this.enlargedQrSessionName) {
      this.enlargedQrSessionName.textContent = this.qrSessionNameText?.textContent || this.activeQrSessionId || 'WhatsApp';
    }

    if (hasQrSrc && this.enlargedQrImg) {
      this.enlargedQrImg.src = this.sessionQrImg.src;
      this.enlargedQrImg.style.display = 'block';
      if (this.enlargedQrLoadingOverlay) this.enlargedQrLoadingOverlay.style.display = 'none';
    } else {
      if (this.enlargedQrLoadingOverlay) this.enlargedQrLoadingOverlay.style.display = 'flex';
      if (this.enlargedQrImg) this.enlargedQrImg.style.display = 'none';
    }

    this.modalQrEnlarge.style.display = 'grid';
  }

  escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[c]));
  }
}

// Opened directly at /bulk/: show it inside the dashboard so it gets the shared sidebar.
const isEmbedded = window.top !== window.self;
const redirectToShell = !isEmbedded && location.pathname.startsWith('/bulk');
if (redirectToShell) location.replace('/bulk-campaign');

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  if (redirectToShell) return;
  // Inside the dashboard frame, links to other dashboard pages must navigate the whole window.
  if (isEmbedded) document.querySelectorAll('a[href="/"]').forEach(a => { a.target = '_top'; });
  window.bulkApp = new BulkApp();
});
