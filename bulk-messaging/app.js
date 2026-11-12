/**
 * OpenWA Dedicated Bulk Messaging Module - Main Application Controller
 */

import { OpenWaApiService } from './api-service.js?v=20261112d';
import { ContactParser } from './contact-parser.js?v=20261112d';
import { CampaignManager } from './campaign-manager.js?v=20261112d';
import { ReportStore, OPEN_CAMPAIGN_STATES } from './report-store.js?v=20261112d';
import { icon, hydrateIcons } from './icons.js?v=20261112d';

/** Visibility is driven by the `hidden` attribute (styles.css: [hidden] { display:none !important }). */
const show = (el, visible = true) => { if (el) el.hidden = !visible; };
const hide = el => show(el, false);

// Backend contract (src/modules/message/dto/*.ts): text max 4096, caption max 1024,
// <= 100 messages per send-bulk call, delayBetweenMessages 1000..60000 ms, randomizeDelay adds 0..2 s.
const TEXT_MAX = 4096;
const CAPTION_MAX = 1024;
const MAX_BLOCKS = 5;
// Each base64 attachment is repeated in every item of a batch and the whole request must fit the
// server's default 25 MB body limit, so local uploads are capped well below it (URLs are not).
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const EMOJI_SETS = {
  Smileys: '😀 😃 😄 😁 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 😇 🤗 🤔 😅 😂 🤣 😢 😮 😴 🙄 😬',
  Gestures: '👋 👍 👎 👏 🙌 🙏 🤝 💪 👉 👆 ✌️ 🤞 👌 ✋ 🫶 ✍️',
  Symbols: '✅ ☑️ ✔️ ❌ ⚠️ ❗ ❓ ⭐ 🌟 ✨ 🔥 💯 ❤️ 💚 💙 💛 🎉 🎊 🎁 🏆 💡 🔔 📢 🆕',
  Business: '📦 🚚 🛒 🛍️ 💳 💰 💵 🧾 📅 ⏰ ⏳ 📍 📞 📱 💬 📧 🔗 📝 📄 📊 🏷️ 🔖 🎟️ 🏪',
};

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
    this.blocks = ['']; // Message blocks, each sent as its own WhatsApp message in order
    this.activeBlock = 0;
    this.addressbookMode = 'contacts';
    this.recoveries = new Map(); // campaignId -> verdict from CampaignManager.inspect (unfinished after a reload)
    this.monitorTab = 'deliveries';
    this.drillTab = 'recipients';
    this.pauseUntil = null;

    hydrateIcons();
    this.initElements();
    this.bindEvents();
    this.renderBlockTabs();
    this.updateDelayDisplay(this.delaySlider.value);
    this.renderContactsTable();
    this.renderMonitorResults([]);
    this.renderMonitorActivity();
    this.refreshComposer();
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

    // Redesign: KPIs, blocks, emoji, preview, checklist, toasts
    this.kpiRecipients = document.getElementById('kpiRecipients');
    this.kpiMessages = document.getElementById('kpiMessages');
    this.kpiBatches = document.getElementById('kpiBatches');
    this.kpiDuration = document.getElementById('kpiDuration');
    this.internetStatusTag = document.getElementById('internetStatusTag');
    this.messageBlockTabs = document.getElementById('messageBlockTabs');
    this.btnAddBlock = document.getElementById('btnAddBlock');
    this.btnRemoveBlock = document.getElementById('btnRemoveBlock');
    this.blockLabel = document.getElementById('blockLabel');
    this.btnMono = document.getElementById('btnMono');
    this.emojiPicker = document.getElementById('emojiPicker');
    this.btnClearMedia = document.getElementById('btnClearMedia');
    this.messagePreview = document.getElementById('messagePreview');
    this.previewRecipient = document.getElementById('previewRecipient');
    this.itemsPerRecipient = document.getElementById('itemsPerRecipient');
    this.sendChecklist = document.getElementById('sendChecklist');
    this.monitorSubText = document.getElementById('monitorSubText');
    this.toastHost = document.getElementById('toastHost');
    this.btnSaveCurrentAsTemplate = document.getElementById('btnSaveCurrentAsTemplate');
    this.addressbookSearchInput = document.getElementById('addressbookSearchInput');
    this.addressbookSelectAll = document.getElementById('addressbookSelectAll');
    this.addressbookSelectedCount = document.getElementById('addressbookSelectedCount');
    this.panelRecipients = document.querySelector('.panel-recipients');

    // Status overview, step badges, progress views
    this.recoveryHost = document.getElementById('recoveryHost');
    this.statusTile = document.getElementById('statusTile');
    this.statusTileTitle = document.getElementById('statusTileTitle');
    this.statusTileText = document.getElementById('statusTileText');
    this.statusTileBar = document.getElementById('statusTileBar');
    this.kpiMessagesSub = document.getElementById('kpiMessagesSub');
    this.stepStatus = [1, 2, 3].map(n => document.getElementById(`stepStatus${n}`));
    this.monitorExplain = document.getElementById('monitorExplain');
    this.monitorExplainText = document.getElementById('monitorExplainText');
    this.batchStripWrap = document.getElementById('batchStripWrap');
    this.batchStrip = document.getElementById('batchStrip');
    this.tabMonitorDeliveries = document.getElementById('tabMonitorDeliveries');
    this.tabMonitorActivity = document.getElementById('tabMonitorActivity');
    this.countDeliveries = document.getElementById('countDeliveries');
    this.countActivity = document.getElementById('countActivity');
    this.viewMonitorDeliveries = document.getElementById('viewMonitorDeliveries');
    this.viewMonitorActivity = document.getElementById('viewMonitorActivity');
    this.activityList = document.getElementById('activityList');

    // Report detail additions
    this.drilldownStatusBadge = document.getElementById('drilldownStatusBadge');
    this.drilldownNote = document.getElementById('drilldownNote');
    this.drilldownNoteText = document.getElementById('drilldownNoteText');
    this.btnDrillResume = document.getElementById('btnDrillResume');
    this.btnDrillStop = document.getElementById('btnDrillStop');
    this.drillKpiRecipients = document.getElementById('drillKpiRecipients');
    this.drillKpiMessages = document.getElementById('drillKpiMessages');
    this.drillKpiSent = document.getElementById('drillKpiSent');
    this.drillKpiFailed = document.getElementById('drillKpiFailed');
    this.drillKpiPending = document.getElementById('drillKpiPending');
    this.drillBatchWrap = document.getElementById('drillBatchWrap');
    this.drillBatchStrip = document.getElementById('drillBatchStrip');
    this.tabDrillRecipients = document.getElementById('tabDrillRecipients');
    this.tabDrillActivity = document.getElementById('tabDrillActivity');
    this.drilldownCountEvents = document.getElementById('drilldownCountEvents');
    this.drillViewRecipients = document.getElementById('drillViewRecipients');
    this.drillViewActivity = document.getElementById('drillViewActivity');
    this.drilldownActivityList = document.getElementById('drilldownActivityList');
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
      this.setEnlargedQrZoom(parseInt(e.target.value, 10) || 320);
    });

    this.btnZoomOutSlider?.addEventListener('click', () => {
      if (this.qrZoomSlider) {
        this.qrZoomSlider.value = Math.max(240, parseInt(this.qrZoomSlider.value, 10) - 20);
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
        this.qrZoomSlider.value = 320;
        this.setEnlargedQrZoom(320);
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

    // Auto-save composer text changes (debounced: avoid an IndexedDB write on every keystroke).
    this.messageTextarea.addEventListener('input', () => this.scheduleComposerDraft());
    this.messageTextarea.addEventListener('keydown', (e) => this.handleEditorShortcut(e));

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
        this.syncSelectAllCheckbox();
      }
    });

    this.contactFilterSelect.addEventListener('change', (e) => {
      this.activeFilter = e.target.value;
      this.renderContactsTable();
    });

    this.selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      // Applies to the rows currently shown. Never auto-select duplicates: that would message a number twice.
      this.getFilteredRecords().forEach(r => {
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
        this.scheduleComposerDraft();
      }
    });

    this.btnBold.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '*'));
    this.btnItalic.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '_'));
    this.btnStrike.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '~'));
    this.btnMono?.addEventListener('click', () => this.wrapSelectedText(this.messageTextarea, '```'));

    // Emoji picker
    this.buildEmojiPicker();
    this.btnEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker();
    });
    this.emojiPicker?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emoji]');
      if (btn) this.insertEmoji(btn.dataset.emoji);
    });
    document.addEventListener('click', (e) => {
      if (this.emojiPicker && !this.emojiPicker.hidden && !e.target.closest('.emoji-anchor')) this.toggleEmojiPicker(false);
    });

    // Message blocks
    this.messageBlockTabs?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-block]');
      if (tab) this.switchBlock(Number(tab.dataset.block));
    });
    this.btnAddBlock?.addEventListener('click', () => this.addBlock());
    this.btnRemoveBlock?.addEventListener('click', () => this.removeBlock());

    // Media
    this.btnAttachFile.addEventListener('click', () => this.mediaFileInput.click());
    this.mediaFileInput.addEventListener('change', (e) => this.handleMediaFileUpload(e));
    this.mediaTypeSelect.addEventListener('change', () => this.handleMediaTypeChange());
    this.mediaUrlInput.addEventListener('input', () => this.handleMediaUrlChange());
    this.btnClearMedia?.addEventListener('click', () => this.clearMedia());
    this.mediaCaptionInput.addEventListener('input', () => this.refreshComposer());
    this.sendSeparateTextMessageCheck?.addEventListener('change', () => this.refreshComposer());

    // Speed Presets
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delay = parseInt(btn.dataset.delay, 10);
        this.delaySlider.value = delay;
        this.updateDelayDisplay(delay);
      });
    });

    this.delaySlider.addEventListener('input', (e) => {
      this.updateDelayDisplay(e.target.value);
    });

    // Anything that changes the estimate or the checklist
    this.batchSizeInput.addEventListener('change', () => {
      this.batchSizeInput.value = this.getBatchSize();
      this.refreshComposer();
    });
    this.batchSizeInput.addEventListener('input', () => this.updateKpis());
    [this.interBatchDelaySelect, this.randomizeDelayCheck].forEach(el => el.addEventListener('change', () => this.updateKpis()));
    this.scheduleDateTimeInput.addEventListener('change', () => this.renderChecklist());

    // Connectivity indicator
    const updateOnline = () => {
      if (!this.internetStatusTag) return;
      this.internetStatusTag.className = `status-dot ${navigator.onLine ? 'ok' : 'bad'}`;
      this.internetStatusTag.textContent = navigator.onLine ? 'Online' : 'Offline';
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    updateOnline();

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

    // Progress views & status overview
    this.tabMonitorDeliveries?.addEventListener('click', () => this.switchMonitorTab('deliveries'));
    this.tabMonitorActivity?.addEventListener('click', () => this.switchMonitorTab('activity'));
    this.statusTile?.addEventListener('click', () => {
      const attention = this.recoveryHost && !this.recoveryHost.hidden && !this.campaignManager.campaignId;
      const target = attention ? this.recoveryHost : this.liveMonitorDrawer;
      if (!attention) this.toggleMonitorDrawer(true);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    this.recoveryHost?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-recovery]');
      if (btn) this.handleRecoveryAction(btn.dataset.recovery, btn.dataset.id, btn);
    });
    this.tabDrillRecipients?.addEventListener('click', () => this.switchDrillTab('recipients'));
    this.tabDrillActivity?.addEventListener('click', () => this.switchDrillTab('activity'));
    this.btnDrillResume?.addEventListener('click', () => this.handleRecoveryAction('resume', this.activeDrilldownCampaignId, this.btnDrillResume));
    this.btnDrillStop?.addEventListener('click', () => this.handleRecoveryAction('stop', this.activeDrilldownCampaignId, this.btnDrillStop));

    // Closing or reloading mid-campaign leaves the remaining batches unsent: ask first.
    window.addEventListener('beforeunload', (e) => {
      if (!this.campaignManager.isBusy) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // Modals
    document.querySelectorAll('.btnCloseModal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        if (modalId) this.closeModal(document.getElementById(modalId));
      });
    });
    // Backdrop click and Escape close the top-most open modal.
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) this.closeModal(overlay);
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.emojiPicker && !this.emojiPicker.hidden) {
        this.toggleEmojiPicker(false);
        this.btnEmoji?.focus();
        return;
      }
      const open = [...document.querySelectorAll('.modal-overlay:not([hidden])')];
      if (open.length) this.closeModal(open[open.length - 1]);
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
      show(this.modalApiSettings);
    });

    this.btnTestApiConnection.addEventListener('click', () => this.testApiConnection());
    this.btnSaveApiSettings.addEventListener('click', () => this.saveApiSettings());

    this.btnLoadTemplates.addEventListener('click', () => this.openTemplatesModal());
    this.btnShowCreateTemplate.addEventListener('click', () => {
      show(this.createTemplateForm);
    });
    this.btnCancelNewTemplate.addEventListener('click', () => {
      hide(this.createTemplateForm);
    });
    this.btnSaveNewTemplate.addEventListener('click', () => this.saveNewTemplate());
    this.btnSaveCurrentAsTemplate?.addEventListener('click', () => {
      this.newTemplateBody.value = this.messageTextarea.value || '';
      show(this.createTemplateForm);
      this.newTemplateName.focus();
    });

    this.btnFetchAddressbook.addEventListener('click', () => this.openAddressbookModal());
    this.btnTabLoadContacts.addEventListener('click', () => this.loadSessionContacts());
    this.btnTabLoadGroups.addEventListener('click', () => this.loadSessionGroups());
    this.btnImportSelectedAddressbook.addEventListener('click', () => this.importSelectedAddressbook());
    this.addressbookSearchInput?.addEventListener('input', () => this.filterAddressbook());
    this.addressbookSelectAll?.addEventListener('change', (e) => {
      this.addressbookTableBody.querySelectorAll('tr:not([hidden]) input[type="checkbox"]').forEach(cb => { cb.checked = e.target.checked; });
      this.updateAddressbookCount();
    });
    this.addressbookTableBody.addEventListener('change', () => this.updateAddressbookCount());

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
        this.currentSessionId = null;
        this.sessionSelect.innerHTML = '<option value="">No numbers yet. Add one in Manage numbers</option>';
        this.sessionStatusPill.className = 'status-badge bad';
        this.sessionStatusPill.textContent = 'No number';
        this.activeSessionNameTag.textContent = '—';
        this.waReadyStatusTag.className = 'status-dot bad';
        this.waReadyStatusTag.textContent = 'No number linked';
      }

      this.apiConnectionStatus.className = 'status-dot ok';
      this.apiConnectionStatus.textContent = 'Connected';
      this.apiConnectionStatus.onclick = null;
      this.apiConnectionStatus.removeAttribute('role');
    } catch (err) {
      console.warn('Could not fetch sessions on load:', err.message);
      const isAuth = err.status === 401 || String(err.message).toLowerCase().includes('api key');
      this.apiConnectionStatus.className = 'status-dot bad clickable';
      this.apiConnectionStatus.setAttribute('role', 'button');
      this.apiConnectionStatus.textContent = isAuth ? 'API key needed (click to set)' : 'Unreachable (click to configure)';
      this.apiConnectionStatus.onclick = () => this.btnOpenApiConfig.click();
      this.sessionSelect.innerHTML = `<option value="">${isAuth ? 'Enter API key in settings' : 'Cannot reach API'}</option>`;
      this.sessionStatusPill.className = 'status-badge bad';
      this.sessionStatusPill.textContent = 'Offline';
    }

    if (!this.draftRestored) {
      this.draftRestored = true;
      await this.checkAndRestoreDraft();
    }
    this.refreshComposer();
    await this.updateReportsBadge();
    if (!this.recoveryChecked) {
      this.recoveryChecked = true;
      await this.checkOpenCampaigns();
    }
  }

  /** Human label for a session status (badges capitalise via CSS). */
  statusLabel(status) {
    if (status === 'qr_ready') return 'QR ready';
    return String(status || 'unknown').replace(/_/g, ' ');
  }

  /** status-badge colour modifier for a session status. */
  sessionTone(status) {
    if (status === 'ready') return 'ok';
    if (status === 'qr_ready' || status === 'authenticating' || status === 'initializing') return 'warn';
    if (status === 'failed' || status === 'disconnected') return 'bad';
    return 'neutral';
  }

  async updateSessionStatus() {
    if (!this.currentSessionId) return;

    try {
      const session = await this.api.getSession(this.currentSessionId);
      const isReady = session.status === 'ready';
      const sessionName = session.name || 'Unknown';
      const sessionPhone = session.phone ? ` · +${session.phone}` : '';
      // Keep the cached list in step so the checklist and send guard see the live status.
      const cached = this.sessions.find(s => s.id === session.id);
      if (cached) Object.assign(cached, { status: session.status, phone: session.phone });

      this.activeSessionNameTag.textContent = `${sessionName}${sessionPhone}`;
      this.sessionStatusPill.className = `status-badge ${this.sessionTone(session.status)}`;
      this.sessionStatusPill.textContent = this.statusLabel(session.status);

      this.waReadyStatusTag.className = `status-dot ${isReady ? 'ok' : 'bad'}`;
      this.waReadyStatusTag.textContent = isReady ? 'Ready to send' : this.capitalize(this.statusLabel(session.status));
    } catch {
      const fallback = this.sessions.find(s => s.id === this.currentSessionId);
      this.sessionStatusPill.className = 'status-badge bad';
      this.sessionStatusPill.textContent = fallback?.status || 'disconnected';
      this.waReadyStatusTag.className = 'status-dot bad';
      this.waReadyStatusTag.textContent = 'Could not check';
    }
    this.renderChecklist();
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
        this.toast('Could not detect columns in the uploaded file.', 'bad');
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
      this.toast(`Error parsing file: ${err.message}`, 'bad');
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
    hide(this.duplicateBanner);
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
  }

  removeDuplicates() {
    const beforeCount = this.records.length;
    this.records = ContactParser.removeDuplicates(this.records);
    const removed = beforeCount - this.records.length;
    
    hide(this.duplicateBanner);
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
    this.toast(`Successfully removed ${removed} duplicate number(s). Unique valid recipients preserved.`, 'ok');
  }

  showDuplicateBanner(stats) {
    if (stats.duplicates > 0 || stats.invalid > 0) {
      this.dupCount.textContent = stats.duplicates;
      this.uniqueCount.textContent = stats.unique;
      this.invalidCount.textContent = stats.invalid;
      show(this.duplicateBanner);
    } else {
      hide(this.duplicateBanner);
    }
  }

  isGroupRecord(r) {
    return Boolean(r.chatId && r.chatId.endsWith('@g.us'));
  }

  /** Records matching the active filter and search, in list order. */
  getFilteredRecords() {
    let filtered = this.records;
    switch (this.activeFilter) {
      case 'unique': filtered = filtered.filter(r => r.isValid && !r.isDuplicate); break;
      case 'selected': filtered = filtered.filter(r => r.selected && r.isValid); break;
      case 'duplicates': filtered = filtered.filter(r => r.isDuplicate); break;
      case 'invalid': filtered = filtered.filter(r => !r.isValid); break;
      case 'groups': filtered = filtered.filter(r => this.isGroupRecord(r)); break;
      default: break;
    }
    const q = this.searchQuery;
    if (q) {
      filtered = filtered.filter(r =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.number && r.number.includes(q)) ||
        (r.rawNumber && String(r.rawNumber).includes(q)) ||
        [r.var1, r.var2, r.var3].some(v => v && String(v).toLowerCase().includes(q))
      );
    }
    return filtered;
  }

  syncSelectAllCheckbox(filtered = this.getFilteredRecords()) {
    const selectable = filtered.filter(r => r.isValid && !r.isDuplicate);
    const selectedCount = selectable.filter(r => r.selected).length;
    this.selectAllCheckbox.checked = selectable.length > 0 && selectedCount === selectable.length;
    this.selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
    this.selectAllCheckbox.disabled = selectable.length === 0;
  }

  renderContactsTable() {
    const tbody = this.contactsTableBody;
    const filtered = this.getFilteredRecords();
    this.syncSelectAllCheckbox(filtered);

    if (filtered.length === 0) {
      tbody.innerHTML = this.records.length === 0
        ? `<tr><td colspan="5" class="table-empty">${icon('users', 28)}<strong>No recipients yet</strong>Import an Excel/CSV file or pick WhatsApp contacts.</td></tr>`
        : `<tr><td colspan="5" class="table-empty">${icon('search', 28)}<strong>No matches</strong>Try another search or filter.</td></tr>`;
      return;
    }

    // Render in a single DOM write and cap visible rows; all records still stay selected/sendable.
    const MAX_ROWS = 500;
    const visible = filtered.length > MAX_ROWS ? filtered.slice(0, MAX_ROWS) : filtered;
    let html = '';
    for (const r of visible) {
      const rowClass = !r.isValid ? 'is-invalid' : (r.isDuplicate ? 'is-duplicate' : '');
      const badgeHtml = !r.isValid
        ? '<span class="status-badge bad sm">Invalid</span>'
        : r.isDuplicate
          ? '<span class="status-badge warn sm">Duplicate</span>'
          : this.isGroupRecord(r)
            ? '<span class="status-badge purple sm">Group</span>'
            : '<span class="status-badge ok sm">Valid</span>';
      html += `<tr class="${rowClass}">
        <td class="col-check"><input type="checkbox" data-id="${this.escape(r.id)}" aria-label="Select ${this.escape(r.name || r.number || r.rawNumber)}" ${r.selected ? 'checked' : ''} ${!r.isValid ? 'disabled' : ''} /></td>
        <td><strong>${this.escape(r.name || '—')}</strong></td>
        <td class="mono">${this.escape(r.number || r.rawNumber)}</td>
        <td class="col-var cell-muted">${this.escape(r.var1 || '—')}</td>
        <td class="col-status">${badgeHtml}</td>
      </tr>`;
    }
    if (filtered.length > MAX_ROWS) {
      html += `<tr><td colspan="5" class="table-empty">Showing the first ${MAX_ROWS} of ${filtered.length.toLocaleString()} records. Search or filter to narrow the list; all rows are still included when sending.</td></tr>`;
    }
    tbody.innerHTML = html;
  }

  updateStats() {
    const total = this.records.length;
    const selected = this.getSelectedRecipients().length;
    const groups = this.records.filter(r => this.isGroupRecord(r)).length;
    const contacts = total - groups;

    this.footerTotal.textContent = total.toLocaleString();
    this.footerContacts.textContent = contacts.toLocaleString();
    this.footerGroups.textContent = groups.toLocaleString();
    this.footerSelected.textContent = selected.toLocaleString();
    this.composerRecipientCount.textContent = selected.toLocaleString();
    this.refreshComposer();
  }

  // ========== Message Composer & Media ==========

  /** Sync the textarea into the active block, then refresh every view that depends on the message. */
  updateComposerStats() {
    this.blocks[this.activeBlock] = this.messageTextarea.value || '';
    this.refreshComposer();
  }

  refreshComposer() {
    const text = this.messageTextarea.value || '';
    this.charCount.textContent = text.length;
    this.charCount.parentElement?.classList.toggle('over', text.length > TEXT_MAX);
    if (this.blockLabel) this.blockLabel.textContent = `Block ${this.activeBlock + 1} of ${this.blocks.length}`;
    // Tab "empty" dots follow the text live without rebuilding the tab list.
    this.messageBlockTabs?.querySelectorAll('.block-tab').forEach((tab, i) => {
      const dot = tab.querySelector('.dot-empty');
      if (dot) dot.hidden = Boolean(this.blocks[i]?.trim());
    });
    this.renderPreview();
    this.updateKpis();
    this.renderChecklist();
  }

  // ----- Message blocks -----

  renderBlockTabs() {
    if (!this.messageBlockTabs) return;
    this.messageBlockTabs.innerHTML = this.blocks.map((b, i) => `
      <button type="button" class="block-tab${i === this.activeBlock ? ' active' : ''}" role="tab"
        aria-selected="${i === this.activeBlock}" data-block="${i}">
        Block ${i + 1}<span class="dot-empty" title="Empty block" ${b.trim() ? 'hidden' : ''}></span>
      </button>`).join('');
    if (this.btnAddBlock) this.btnAddBlock.disabled = this.blocks.length >= MAX_BLOCKS;
    if (this.btnRemoveBlock) this.btnRemoveBlock.disabled = this.blocks.length <= 1;
  }

  switchBlock(index) {
    if (index < 0 || index >= this.blocks.length) return;
    this.blocks[this.activeBlock] = this.messageTextarea.value || '';
    this.activeBlock = index;
    this.messageTextarea.value = this.blocks[index];
    this.renderBlockTabs();
    this.refreshComposer();
    this.messageTextarea.focus();
  }

  addBlock() {
    if (this.blocks.length >= MAX_BLOCKS) {
      this.toast(`Up to ${MAX_BLOCKS} message blocks per campaign.`, 'warn');
      return;
    }
    this.blocks[this.activeBlock] = this.messageTextarea.value || '';
    this.blocks.push('');
    this.switchBlock(this.blocks.length - 1);
    this.saveComposerDraft();
  }

  removeBlock() {
    if (this.blocks.length <= 1) return;
    const current = (this.messageTextarea.value || '').trim();
    if (current && !confirm(`Delete message block ${this.activeBlock + 1}?`)) return;
    this.blocks.splice(this.activeBlock, 1);
    this.activeBlock = Math.min(this.activeBlock, this.blocks.length - 1);
    this.messageTextarea.value = this.blocks[this.activeBlock];
    this.renderBlockTabs();
    this.refreshComposer();
    this.saveComposerDraft();
  }

  /** Replace the active block's text (templates, drafts). */
  setActiveBlockText(text) {
    this.messageTextarea.value = text || '';
    this.updateComposerStats();
    this.saveComposerDraft();
  }

  // ----- Editing helpers -----

  insertTextAtCursor(textarea, textToInsert) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + textToInsert + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    textarea.focus();
  }

  /** Wrap the selection in WhatsApp markers; the inner text stays selected so it can be re-wrapped. */
  wrapSelectedText(textarea, symbol) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || 'text';
    textarea.value = textarea.value.substring(0, start) + symbol + selected + symbol + textarea.value.substring(end);
    textarea.selectionStart = start + symbol.length;
    textarea.selectionEnd = start + symbol.length + selected.length;
    textarea.focus();
    this.updateComposerStats();
    this.scheduleComposerDraft();
  }

  handleEditorShortcut(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    let symbol = null;
    if (key === 'b' && !e.shiftKey) symbol = '*';
    else if (key === 'i' && !e.shiftKey) symbol = '_';
    else if (key === 'x' && e.shiftKey) symbol = '~';
    else if (key === 'e' && !e.shiftKey) symbol = '```';
    if (!symbol) return;
    e.preventDefault();
    this.wrapSelectedText(this.messageTextarea, symbol);
  }

  buildEmojiPicker() {
    if (!this.emojiPicker) return;
    const html = Object.entries(EMOJI_SETS).map(([cat, list]) =>
      `<div class="emoji-cat">${cat}</div>` +
      list.split(' ').map(e => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')
    ).join('');
    this.emojiPicker.innerHTML = `<div class="emoji-grid" role="listbox" aria-label="Emoji">${html}</div>`;
  }

  toggleEmojiPicker(open) {
    if (!this.emojiPicker) return;
    const willOpen = open ?? this.emojiPicker.hidden;
    show(this.emojiPicker, willOpen);
    this.btnEmoji?.setAttribute('aria-expanded', String(willOpen));
  }

  insertEmoji(emoji) {
    this.insertTextAtCursor(this.messageTextarea, emoji);
    this.updateComposerStats();
    this.scheduleComposerDraft();
  }

  // ----- Preview -----

  /** First selected recipient, used for preview values. */
  getPreviewRecipient() {
    return this.records.find(r => r.selected && r.isValid) || null;
  }

  /** Render WhatsApp-formatted text as safe HTML, substituting variables like the backend does. */
  formatWhatsApp(text, vars) {
    // Same placeholder rules as src/common/utils/template-render.ts: {{key}} (canonical) or {key}.
    const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{([a-zA-Z0-9_]+)\}/g;
    const parts = [];
    let last = 0;
    String(text).replace(VAR_RE, (m, k1, k2, offset) => {
      parts.push(this.escape(text.slice(last, offset)));
      const key = (k1 || k2).toLowerCase();
      const value = vars ? vars[key] : undefined;
      parts.push(value !== undefined && value !== ''
        ? this.escape(value)
        : `<span class="var-missing" title="No value for ${this.escape(key)}">${this.escape(m)}</span>`);
      last = offset + m.length;
      return m;
    });
    parts.push(this.escape(text.slice(last)));
    let html = parts.join('');
    html = html.replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/(^|[\s>(])\*(?!\s)([^*\n]+?)\*(?=$|[\s<.,!?:;)])/gm, '$1<strong>$2</strong>');
    html = html.replace(/(^|[\s>(])_(?!\s)([^_\n]+?)_(?=$|[\s<.,!?:;)])/gm, '$1<em>$2</em>');
    html = html.replace(/(^|[\s>(])~(?!\s)([^~\n]+?)~(?=$|[\s<.,!?:;)])/gm, '$1<s>$2</s>');
    return html;
  }

  renderPreview() {
    if (!this.messagePreview) return;
    const recipient = this.getPreviewRecipient();
    const vars = recipient
      ? recipient.variables || { name: recipient.name, number: recipient.number, var1: recipient.var1, var2: recipient.var2, var3: recipient.var3 }
      : { name: 'Rahul', number: '919876543210', var1: 'ORD-1024', var2: 'Sample', var3: 'Sample' };
    if (this.previewRecipient) {
      this.previewRecipient.textContent = recipient ? `As ${recipient.name || recipient.number}` : 'Sample values';
    }

    const config = this.buildMessageConfig();
    const blocks = CampaignManager.getTextBlocks(config);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = (inner) => `<div class="bubble">${inner}<span class="bubble-time">${time}</span></div>`;
    const out = [];

    if (CampaignManager.hasMediaPayload(config)) {
      const separate = config.sendSeparateTextMessage !== false;
      const caption = separate || blocks.length === 0
        ? (config.media.caption || '')
        : [config.media.caption, blocks[0]].filter(Boolean).join('\n\n');
      const label = config.media.filename || (config.media.url ? 'Linked file' : config.type);
      const mediaIcon = config.type === 'image' ? 'image' : config.type === 'audio' ? 'activity' : 'file';
      out.push(bubble(`<div class="bubble-media">${icon(mediaIcon, 16)}<span>${this.escape(config.type.toUpperCase())} · ${this.escape(label)}</span></div>${this.formatWhatsApp(caption, vars)}`));
      (separate ? blocks : blocks.slice(1)).forEach(b => out.push(bubble(this.formatWhatsApp(b, vars))));
    } else {
      blocks.forEach(b => out.push(bubble(this.formatWhatsApp(b, vars))));
    }

    this.messagePreview.innerHTML = out.length
      ? out.join('')
      : '<div class="chat-empty">Your message preview appears here</div>';
  }

  // ----- Campaign summary -----

  /** Unique, valid, selected recipients (one per chat ID), exactly what a send would use. */
  getSelectedRecipients() {
    const seen = new Set();
    return this.records.filter(r => {
      if (!r.selected || !r.isValid || !r.chatId || seen.has(r.chatId)) return false;
      seen.add(r.chatId);
      return true;
    });
  }

  updateKpis() {
    const recipients = this.getSelectedRecipients().length;
    const config = this.buildMessageConfig();
    const perRecipient = CampaignManager.itemsPerRecipient(config);
    const messages = recipients * perRecipient;
    const batchSize = this.getBatchSize();
    const recipientsPerBatch = Math.max(1, Math.floor(batchSize / perRecipient));
    const batches = recipients ? Math.ceil(recipients / recipientsPerBatch) : 0;

    if (this.kpiRecipients) this.kpiRecipients.textContent = recipients.toLocaleString();
    if (this.kpiMessages) this.kpiMessages.textContent = messages.toLocaleString();
    if (this.kpiBatches) this.kpiBatches.textContent = batches.toLocaleString();
    if (this.itemsPerRecipient) this.itemsPerRecipient.textContent = perRecipient;
    if (this.kpiMessagesSub) this.kpiMessagesSub.textContent = `${perRecipient} per recipient`;

    if (this.kpiDuration) {
      if (!messages) {
        this.kpiDuration.textContent = '—';
      } else {
        // Server waits delayBetweenMessages (+0–2 s jitter, ~1 s average) between items; the client
        // pauses interBatch seconds between batches.
        const delayMs = Number(this.delaySlider.value) + (this.randomizeDelayCheck.checked ? 1000 : 0);
        const interBatch = (parseInt(this.interBatchDelaySelect.value, 10) || 30) * 1000;
        const totalMs = Math.max(0, messages - batches) * delayMs + Math.max(0, batches - 1) * interBatch;
        this.kpiDuration.textContent = `≈ ${this.formatDuration(totalMs)}`;
      }
    }
  }

  formatDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h ${m % 60} min`;
  }

  getBatchSize() {
    return Math.min(100, Math.max(1, parseInt(this.batchSizeInput.value, 10) || 100));
  }

  /** Problems that block sending (bad) plus advisories (warn), shared by the checklist and executeCampaign. */
  getSendIssues() {
    const issues = [];
    const session = this.sessions.find(s => s.id === this.currentSessionId);
    const config = this.buildMessageConfig();
    const blocks = CampaignManager.getTextBlocks(config);
    const recipients = this.getSelectedRecipients().length;

    issues.push(session?.status === 'ready'
      ? { level: 'ok', text: `Sending from ${session.name || session.id}` }
      : { level: 'bad', text: session ? `Number "${session.name || session.id}" is ${this.statusLabel(session.status)}; it must be ready` : 'Choose a connected WhatsApp number' });

    issues.push(recipients
      ? { level: 'ok', text: `${recipients.toLocaleString()} recipient${recipients === 1 ? '' : 's'} selected` }
      : { level: 'bad', text: 'Select at least one valid recipient' });

    const mediaChosen = this.mediaTypeSelect.value !== 'text';
    const hasMedia = CampaignManager.hasMediaPayload(config);
    if (mediaChosen && !hasMedia) {
      issues.push({ level: 'bad', text: 'Upload a file or paste a link, or choose "No attachment"' });
    } else if (!blocks.length && !hasMedia) {
      issues.push({ level: 'bad', text: 'Write a message' });
    } else {
      issues.push({ level: 'ok', text: `${blocks.length} message block${blocks.length === 1 ? '' : 's'}${hasMedia ? ' + attachment' : ''}` });
    }

    const tooLong = this.blocks.findIndex(b => b.trim().length > TEXT_MAX);
    if (tooLong >= 0) issues.push({ level: 'bad', text: `Block ${tooLong + 1} is over ${TEXT_MAX} characters` });

    if (hasMedia) {
      const separate = config.sendSeparateTextMessage !== false;
      const caption = separate || !blocks.length ? (config.media.caption || '') : [config.media.caption, blocks[0]].filter(Boolean).join('\n\n');
      if (caption.length > CAPTION_MAX) {
        issues.push({ level: 'bad', text: `Caption is ${caption.length}/${CAPTION_MAX} characters; shorten it or send blocks as separate texts` });
      }
    }

    const empties = this.blocks.length - this.blocks.filter(b => b.trim()).length;
    if (empties && this.blocks.length > 1) {
      issues.push({ level: 'warn', text: `${empties} empty block${empties === 1 ? '' : 's'} will be skipped` });
    }

    if (this.scheduleDateTimeInput.value) {
      const at = new Date(this.scheduleDateTimeInput.value).getTime();
      if (!(at > Date.now())) issues.push({ level: 'warn', text: 'Scheduled time is in the past' });
    }
    return issues;
  }

  renderChecklist() {
    const issues = this.getSendIssues();
    if (this.sendChecklist) {
      const glyph = { ok: 'check', bad: 'x', warn: 'alert' };
      this.sendChecklist.innerHTML = issues.map(i =>
        `<div class="check-item ${i.level}">${icon(glyph[i.level], 15)}<span>${this.escape(i.text)}</span></div>`
      ).join('');
    }
    this.renderStepStatus(issues);
    this.renderLiveStatus(issues);
  }

  /** Current composer state as a CampaignManager messageConfig. */
  buildMessageConfig() {
    const type = this.mediaTypeSelect.value;
    const caption = (this.mediaCaptionInput.value || '').trim();
    const urlValue = (this.mediaUrlInput.value || '').trim();
    let media;
    if (type !== 'text') {
      if (this.currentAttachedMedia?.base64) {
        media = { ...this.currentAttachedMedia, caption: caption || undefined, ptt: this.pttVoiceCheck.checked };
      } else if (urlValue) {
        media = { url: urlValue, caption: caption || undefined, ptt: this.pttVoiceCheck.checked };
      }
    }
    const texts = this.blocks.map((b, i) => (i === this.activeBlock ? this.messageTextarea.value : b) || '');
    return {
      type,
      texts,
      text: texts.find(t => t.trim()) || '',
      media,
      sendSeparateTextMessage: this.sendSeparateTextMessageCheck ? this.sendSeparateTextMessageCheck.checked : true,
    };
  }

  // ----- Toasts -----

  toast(message, type = 'info', timeout) {
    if (!this.toastHost) { console.log(message); return; }
    const glyph = { ok: 'check', bad: 'alert', warn: 'alert', info: 'info' }[type] || 'info';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'bad' ? 'alert' : 'status');
    el.innerHTML = `${icon(glyph, 16)}<span></span><button type="button" class="chip-x" aria-label="Dismiss">${icon('x', 13)}</button>`;
    el.querySelector('span').textContent = message;
    const close = () => {
      if (!el.isConnected) return;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('button').addEventListener('click', close);
    this.toastHost.appendChild(el);
    while (this.toastHost.children.length > 4) this.toastHost.firstElementChild.remove();
    setTimeout(close, timeout ?? (type === 'bad' ? 9000 : 4500));
  }

  handleMediaTypeChange() {
    const type = this.mediaTypeSelect.value;
    if (type === 'text') {
      this.clearMedia();
      return;
    }
    show(this.mediaDetailsRow);
    show(this.pttVoiceToggleWrap, type === 'audio');
    if (!this.currentAttachedMedia && !this.mediaUrlInput.value.trim()) {
      this.attachedFileName.textContent = `No ${type} chosen: upload a file or paste a link`;
    }
    if (this.currentAttachedMedia) this.currentAttachedMedia.type = type;
    this.refreshComposer();
  }

  handleMediaUrlChange() {
    const url = this.mediaUrlInput.value.trim();
    if (url) {
      // A link replaces any uploaded file.
      this.currentAttachedMedia = null;
      this.mediaFileInput.value = '';
      if (this.mediaTypeSelect.value === 'text') {
        this.mediaTypeSelect.value = /\.(mp4|mov|webm|3gp)(\?|$)/i.test(url) ? 'video'
          : /\.(mp3|ogg|opus|m4a|wav|aac)(\?|$)/i.test(url) ? 'audio'
          : /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)(\?|$)/i.test(url) ? 'document' : 'image';
      }
      show(this.mediaDetailsRow);
      show(this.pttVoiceToggleWrap, this.mediaTypeSelect.value === 'audio');
      this.attachedFileName.textContent = /^https?:\/\//i.test(url) ? url : `Link must start with https:// (${url})`;
    } else if (!this.currentAttachedMedia && this.mediaTypeSelect.value !== 'text') {
      this.attachedFileName.textContent = 'No file selected';
    }
    this.refreshComposer();
  }

  async handleMediaFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      this.toast(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. Upload files up to ${MAX_UPLOAD_BYTES / 1048576} MB, or paste a public https:// link for larger files.`, 'bad');
      this.mediaFileInput.value = '';
      return;
    }

    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    this.mediaTypeSelect.value = mediaType;
    this.mediaUrlInput.value = '';
    show(this.mediaDetailsRow);
    this.attachedFileName.textContent = `Reading ${file.name}…`;
    show(this.pttVoiceToggleWrap, mediaType === 'audio');

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = String(reader.result).split(',')[1];
      this.currentAttachedMedia = {
        type: mediaType,
        base64: base64Data,
        mimetype: file.type || 'application/octet-stream',
        filename: file.name,
      };
      const size = file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(1)} KB`;
      this.attachedFileName.textContent = `${file.name} · ${size}`;
      this.refreshComposer();
    };
    reader.onerror = () => {
      this.toast(`Could not read "${file.name}".`, 'bad');
      this.clearMedia();
    };
    reader.readAsDataURL(file);
  }

  clearMedia() {
    this.currentAttachedMedia = null;
    this.mediaFileInput.value = '';
    this.mediaUrlInput.value = '';
    this.mediaCaptionInput.value = '';
    this.pttVoiceCheck.checked = false;
    this.mediaTypeSelect.value = 'text';
    this.attachedFileName.textContent = 'No file selected';
    hide(this.mediaDetailsRow);
    hide(this.pttVoiceToggleWrap);
    this.refreshComposer();
  }

  updateDelayDisplay(ms) {
    const value = Number(ms);
    this.delayDisplay.textContent = `${(value / 1000).toFixed(1)} s`;
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.delay) === value);
    });
    this.updateKpis();
  }

  // ========== Execution & Live Monitoring ==========

  async executeCampaign(isScheduled = false) {
    if (!this.currentSessionId) {
      this.toast('Please select a connected WhatsApp session first.', 'warn');
      return;
    }

    const activeSession = this.sessions.find(s => s.id === this.currentSessionId);
    if (activeSession && activeSession.status !== 'ready') {
      const confirmOpen = confirm(`The selected number "${activeSession.name || this.currentSessionId}" is "${activeSession.status}". It must be ready to send WhatsApp messages.\n\nOpen Manage numbers to connect it now?`);
      if (confirmOpen) {
        this.openSessionManagerModal();
        this.displaySessionQr(this.currentSessionId, activeSession.name);
      }
      return;
    }

    this.blocks[this.activeBlock] = this.messageTextarea.value || '';
    const blocking = this.getSendIssues().filter(i => i.level === 'bad');
    if (blocking.length) {
      this.renderChecklist();
      this.toast(blocking[0].text, 'bad');
      return;
    }

    const url = (this.mediaUrlInput.value || '').trim();
    if (this.mediaTypeSelect.value !== 'text' && !this.currentAttachedMedia && url && !/^https?:\/\//i.test(url)) {
      this.toast('The attachment link must start with https://', 'bad');
      return;
    }

    // Final duplicate guard: one message set per chat ID, whatever the selection state.
    const selectedRecipients = this.getSelectedRecipients();
    const messageConfig = this.buildMessageConfig();

    let scheduleAt = null;
    if (isScheduled) {
      if (!this.scheduleDateTimeInput.value) {
        this.toast('Pick a date and time to schedule the campaign.', 'warn');
        this.scheduleDateTimeInput.focus();
        return;
      }
      scheduleAt = new Date(this.scheduleDateTimeInput.value);
      if (!(scheduleAt.getTime() > Date.now())) {
        this.toast('The scheduled time must be in the future.', 'bad');
        return;
      }
    }

    const batchSize = this.getBatchSize();
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

    if (this.campaignManager.state === 'running' || this.campaignManager.loopActive) {
      this.toast('A campaign is already sending from this page. Wait for it to finish or cancel it first.', 'warn');
      return;
    }
    const busyOnServer = [...this.recoveries.values()].find(v =>
      (v.kind === 'server_running' || v.kind === 'other_tab') && v.campaign?.sessionId === this.currentSessionId);
    if (busyOnServer) {
      this.toast(`“${busyOnServer.campaign.name}” is still sending on this number. Resume or stop it (notice at the top) before starting another campaign.`, 'bad', 12000);
      this.recoveryHost?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (this.campaignManager.state === 'scheduled') {
      if (!confirm('A campaign is already scheduled. Replace it with this one?')) return;
      this.replacingSchedule = true;
      this.campaignManager.cancelSchedule('Replaced by a newer campaign before it started. Nothing was sent.');
      this.replacingSchedule = false;
    }

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

      hide(this.btnRetryFailed);
      if (isScheduled) {
        await this.campaignManager.schedule(scheduleAt);
        this.toast(`Scheduled ${selectedRecipients.length.toLocaleString()} recipient(s) for ${scheduleAt.toLocaleString()}. Keep this tab open.`, 'ok');
      } else {
        this.btnSendNow.disabled = true;
        this.btnScheduleSend.disabled = true;
        this.toggleMonitorDrawer(true);
        this.liveMonitorDrawer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        await this.campaignManager.start();
      }
    } catch (err) {
      this.toast(`Could not start campaign: ${err.message}`, 'bad');
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    }
  }

  toggleMonitorDrawer(forceOpen) {
    if (!this.liveMonitorDrawer) return;
    const isCollapsed = this.liveMonitorDrawer.classList.contains('collapsed');
    const shouldOpen = forceOpen !== undefined ? forceOpen : isCollapsed;

    // The chevron rotates via `.monitor.collapsed .chev` in styles.css.
    this.liveMonitorDrawer.classList.toggle('collapsed', !shouldOpen);
    this.btnToggleMonitor?.setAttribute('aria-expanded', String(shouldOpen));
    if (this.toggleMonitorText) {
      const count = this.campaignManager?.allResults?.length || 0;
      this.toggleMonitorText.textContent = shouldOpen ? 'Hide details' : `Show details${count ? ` (${count})` : ''}`;
    }
  }

  /** Live countdown under the schedule input while a campaign is waiting to start. */
  startScheduleCountdown() {
    clearInterval(this.scheduleCountdownTimer);
    const tick = () => {
      const target = this.campaignManager.scheduleTargetTime;
      if (!target || this.campaignManager.state !== 'scheduled') {
        this.stopScheduleCountdown();
        return;
      }
      const left = Math.max(0, target - Date.now());
      const s = Math.floor(left / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const text = h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
      if (this.scheduleCountdownText) this.scheduleCountdownText.textContent = text;
      if (this.monitorSubText) this.monitorSubText.textContent = `Starts ${new Date(target).toLocaleString()} (in ${text})`;
      if (this.statusTileText) this.statusTileText.textContent = `Starts in ${text}. Keep this page open.`;
    };
    show(this.scheduleCountdownDisplay);
    tick();
    this.scheduleCountdownTimer = setInterval(tick, 1000);
  }

  stopScheduleCountdown() {
    clearInterval(this.scheduleCountdownTimer);
    this.scheduleCountdownTimer = null;
    hide(this.scheduleCountdownDisplay);
  }

  handleCampaignUpdate(event, data) {
    const { state, stats } = data;
    const cm = this.campaignManager;

    if (event === 'log') {
      this.renderMonitorActivity();
      this.refreshLiveDrilldown();
      return;
    }
    if (event === 'inter_batch_delay') this.pauseUntil = Date.now() + data.seconds * 1000;
    else if (event === 'batch_started' || event === 'campaign_finished' || event === 'setup') this.pauseUntil = null;

    if (event === 'campaign_finished') {
      if (cm.haltReason) {
        this.toast(cm.haltReason, 'bad', 15000);
      } else if (state === 'stopped') {
        this.toast(cm.stopNote || 'Campaign stopped.', 'warn', 12000);
      } else if (state === 'completed') {
        this.toast(`Campaign finished: ${stats.sentCount} sent, ${stats.failedCount} failed.`, stats.failedCount ? 'warn' : 'ok');
      }
    } else if (event === 'cancelled') {
      this.toast('Campaign cancelled. Messages already sent cannot be recalled.', 'warn');
    } else if (event === 'schedule_cancelled' && !this.replacingSchedule) {
      this.toast('Scheduled campaign cancelled. Nothing was sent.', 'info');
    }

    // Status text & UI buttons
    this.monitorStatusText.textContent = this.stateLabel(state);
    this.monitorStatusText.dataset.state = state;
    if (this.liveMonitorDrawer) this.liveMonitorDrawer.dataset.state = state;
    if (this.monitorSubText) {
      if (event === 'inter_batch_delay') {
        this.monitorSubText.textContent = `${cm.campaignName} · pausing ${data.seconds} s before batch ${data.nextBatch} of ${stats.totalBatches}`;
      } else if (state === 'running') {
        this.monitorSubText.textContent = `${cm.campaignName} · batch ${stats.currentBatchIndex + 1} of ${stats.totalBatches}`;
      } else if (['completed', 'cancelled', 'stopped'].includes(state)) {
        this.monitorSubText.textContent = `${cm.campaignName} · ${stats.sentCount} sent, ${stats.failedCount} failed`;
      } else if (state === 'idle' && event === 'setup') {
        this.monitorSubText.textContent = cm.campaignName;
      } else if (state === 'idle') {
        this.monitorSubText.textContent = 'No campaign running';
      }
    }

    if (state === 'scheduled') this.startScheduleCountdown();
    else this.stopScheduleCountdown();

    if (state === 'scheduled') {
      show(this.btnCancelBatch);
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    } else if (state === 'running') {
      show(this.btnCancelBatch);
      this.btnSendNow.disabled = true;
      this.btnScheduleSend.disabled = true;
    } else {
      hide(this.btnCancelBatch);
      this.btnSendNow.disabled = false;
      this.btnScheduleSend.disabled = false;
    }

    if (['completed', 'cancelled', 'stopped'].includes(state)) {
      show(this.btnRetryFailed, stats.failedCount > 0);
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
      const earlier = this.campaignManager.batches.filter(b => b.index < data.batch.index).flatMap(b => b.results || []);
      this.renderMonitorResults([...earlier, ...data.results]);
    } else {
      this.renderMonitorResults(this.campaignManager.allResults);
    }

    this.renderBatchChips(this.batchStrip, this.batchStripWrap, cm.campaignId ? cm.batches.map(b => cm.batchMeta(b)) : []);
    if (event === 'setup') this.renderMonitorActivity();
    this.renderChecklist();
    this.refreshLiveDrilldown();
  }

  renderMonitorResults(results) {
    if (this.liveMonitorDrawer?.classList.contains('collapsed') && this.toggleMonitorText) {
      this.toggleMonitorText.textContent = `Show details (${results.length})`;
    }

    // Most recent 50 results first; # is the position in the whole campaign.
    const total = results.length;
    if (this.countDeliveries) this.countDeliveries.textContent = total.toLocaleString();
    if (!total) {
      this.monitorResultsBody.innerHTML = `<tr><td colspan="6" class="table-empty">${icon('inbox', 28)}<strong>No deliveries yet</strong>Results appear here as each message is sent.</td></tr>`;
      return;
    }
    const slice = results.slice(-50).reverse();
    const tone = { sent: 'ok', failed: 'bad', pending: 'info', processing: 'info', cancelled: 'warn' };

    this.monitorResultsBody.innerHTML = slice.map((r, idx) => {
      const status = r.status || 'pending';
      const isSent = status === 'sent';
      const detail = isSent
        ? `<span class="mono">${this.escape(r.messageId || 'Sent')}</span>`
        : status === 'failed'
          ? `<span class="text-bad">${this.escape(r.error?.message || r.error?.code || 'Send failed')}</span>`
          : '<span class="cell-muted">—</span>';
      const isMedia = r.type && r.type !== 'text';
      const typeTag = `<span class="type-tag${isMedia ? ' media' : ''}">${this.escape((r.type || 'text').toUpperCase())}</span>`;
      const recipient = String(r.chatId || '').replace(/@c\.us$/, '');
      return `<tr>
        <td class="col-num">${total - idx}</td>
        <td><strong class="mono">${this.escape(recipient)}</strong></td>
        <td class="col-status"><span class="status-badge sm ${tone[status] || ''}">${this.escape(status)}</span></td>
        <td class="col-content"><div class="cell-ellipsis" title="${this.escape(r.content || '')}">${typeTag}${this.escape(r.content || '—')}</div></td>
        <td class="col-detail"><div class="cell-ellipsis">${detail}</div></td>
        <td class="col-time">${r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : '—'}</td>
      </tr>`;
    }).join('');
  }

  retryFailedRecipients() {
    const failed = this.campaignManager.getFailedRecipients();
    if (failed.length === 0) {
      this.toast('No failed recipients to retry.', 'warn');
      return;
    }

    this.records = failed;
    hide(this.duplicateBanner);
    this.renderContactsTable();
    this.updateStats();
    this.saveCurrentDraft();
    hide(this.btnRetryFailed);
    this.toast(`Loaded ${failed.length} failed recipient(s). Review the message, then choose "Send now" to retry.`, 'ok');
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
      this.toast('No contacts available to export. Import contacts or click Sample first.', 'warn');
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
      this.toast('Excel export library (XLSX) is not ready.', 'bad');
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
      this.toast('No campaign results or contacts available to export yet.', 'warn');
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
      this.toast('No campaign results available to export yet.', 'warn');
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
      this.toast('Connect a WhatsApp session first.', 'warn');
      return;
    }

    show(this.modalTemplates);
    hide(this.createTemplateForm);
    this.templateTableBody.innerHTML = `<tr><td colspan="3" class="table-empty"><span class="spinner"></span> Loading templates…</td></tr>`;

    try {
      const templates = await this.api.getTemplates(this.currentSessionId);
      if (!Array.isArray(templates) || templates.length === 0) {
        this.templateTableBody.innerHTML = `<tr><td colspan="3" class="table-empty">${icon('file', 26)}<strong>No templates yet</strong>Save the current block or create a new one.</td></tr>`;
        return;
      }

      this.templateTableBody.innerHTML = '';
      templates.forEach(t => {
        const tr = document.createElement('tr');
        const extras = [t.header, t.footer].filter(Boolean).join(' · ');
        tr.innerHTML = `
          <td><strong>${this.escape(t.name)}</strong></td>
          <td><div class="cell-ellipsis" title="${this.escape(t.body)}">${this.escape(t.body)}</div>${extras ? `<span class="cell-sub">${this.escape(extras)}</span>` : ''}</td>
          <td class="col-action"><button class="btn btn-sm btn-primary" data-use>Use</button></td>
        `;

        tr.querySelector('[data-use]').addEventListener('click', () => {
          this.setActiveBlockText(t.body);
          hide(this.modalTemplates);
          this.toast(`Template "${t.name}" placed in block ${this.activeBlock + 1}.`, 'ok');
        });

        this.templateTableBody.appendChild(tr);
      });
    } catch (err) {
      this.templateTableBody.innerHTML = `<tr><td colspan="3" class="table-empty error">Could not load templates: ${this.escape(err.message)}</td></tr>`;
    }
  }

  async saveNewTemplate() {
    const name = this.newTemplateName.value.trim();
    const body = this.newTemplateBody.value.trim();
    if (!name || !body) {
      this.toast('Template name and body are required.', 'warn');
      return;
    }

    try {
      await this.api.createTemplate(this.currentSessionId, { name, body });
      this.newTemplateName.value = '';
      this.newTemplateBody.value = '';
      hide(this.createTemplateForm);
      await this.openTemplatesModal();
    } catch (err) {
      this.toast(`Could not create template: ${err.message}`, 'bad');
    }
  }

  // ========== Addressbook & Groups Modal ==========

  async openAddressbookModal() {
    if (!this.currentSessionId) {
      this.toast('Connect a WhatsApp session first.', 'warn');
      return;
    }
    show(this.modalAddressbook);
    this.loadSessionContacts();
  }

  setAddressbookMode(mode) {
    this.addressbookMode = mode;
    this.btnTabLoadContacts.classList.toggle('active', mode === 'contacts');
    this.btnTabLoadGroups.classList.toggle('active', mode === 'groups');
    if (this.addressbookSearchInput) this.addressbookSearchInput.value = '';
  }

  renderAddressbookRows(rows) {
    this.addressbookTableBody.innerHTML = rows.map(r => `
      <tr data-search="${this.escape(`${r.name} ${r.id}`.toLowerCase())}">
        <td class="col-check"><input type="checkbox" ${r.attr}="${this.escape(r.value)}" data-name="${this.escape(r.name)}" aria-label="Select ${this.escape(r.name || r.id)}" checked /></td>
        <td><strong>${this.escape(r.name || '—')}</strong></td>
        <td class="mono">${this.escape(r.id)}</td>
      </tr>`).join('');
    if (this.addressbookSelectAll) this.addressbookSelectAll.checked = true;
    this.updateAddressbookCount();
  }

  addressbookMessage(html, isError = false) {
    this.addressbookTableBody.innerHTML = `<tr><td colspan="3" class="table-empty${isError ? ' error' : ''}">${html}</td></tr>`;
    this.updateAddressbookCount();
  }

  async loadSessionContacts() {
    this.setAddressbookMode('contacts');
    this.addressbookMessage('<span class="spinner"></span> Loading contacts…');
    try {
      const contacts = await this.api.getContacts(this.currentSessionId, 500);
      if (!Array.isArray(contacts) || contacts.length === 0) {
        this.addressbookMessage(`${icon('users', 26)}<strong>No contacts found</strong>This number's address book is empty.`);
        return;
      }
      this.renderAddressbookRows(contacts.filter(c => c.number || c.id).map(c => ({
        attr: 'data-num',
        value: c.number || String(c.id || '').replace(/@.*$/, ''),
        name: c.name || c.pushName || '',
        id: c.number || c.id,
      })));
    } catch (err) {
      this.addressbookMessage(`Could not load contacts: ${this.escape(err.message)}`, true);
    }
  }

  async loadSessionGroups() {
    this.setAddressbookMode('groups');
    this.addressbookMessage('<span class="spinner"></span> Loading groups…');
    try {
      const groups = await this.api.getGroups(this.currentSessionId, 100);
      if (!Array.isArray(groups) || groups.length === 0) {
        this.addressbookMessage(`${icon('group', 26)}<strong>No groups found</strong>This number is not in any groups.`);
        return;
      }
      this.renderAddressbookRows(groups.map(g => ({
        attr: 'data-group-id',
        value: g.id,
        name: g.name || 'Untitled group',
        id: g.id,
      })));
    } catch (err) {
      this.addressbookMessage(`Could not load groups: ${this.escape(err.message)}`, true);
    }
  }

  filterAddressbook() {
    const q = (this.addressbookSearchInput?.value || '').toLowerCase().trim();
    this.addressbookTableBody.querySelectorAll('tr[data-search]').forEach(tr => {
      tr.hidden = Boolean(q) && !tr.dataset.search.includes(q);
    });
    this.updateAddressbookCount();
  }

  updateAddressbookCount() {
    const boxes = [...this.addressbookTableBody.querySelectorAll('input[type="checkbox"]')];
    const checked = boxes.filter(cb => cb.checked).length;
    if (this.addressbookSelectedCount) this.addressbookSelectedCount.textContent = `${checked} of ${boxes.length} selected`;
    const visible = boxes.filter(cb => !cb.closest('tr').hidden);
    if (this.addressbookSelectAll) {
      const visibleChecked = visible.filter(cb => cb.checked).length;
      this.addressbookSelectAll.checked = visible.length > 0 && visibleChecked === visible.length;
      this.addressbookSelectAll.indeterminate = visibleChecked > 0 && visibleChecked < visible.length;
    }
    this.btnImportSelectedAddressbook.disabled = checked === 0;
  }

  importSelectedAddressbook() {
    const checked = this.addressbookTableBody.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) {
      this.toast('Tick at least one contact or group.', 'warn');
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
    hide(this.modalAddressbook);
    this.toast(`Added ${processed.records.length} ${this.addressbookMode === 'groups' ? 'group(s)' : 'contact(s)'} to recipients.`, 'ok');
  }

  // ========== Statistics & Audit Modal ==========

  async openStatsModal() {
    show(this.modalStats);
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
        this.auditTableBody.innerHTML = `<tr><td colspan="4" class="table-empty">${icon('shield', 26)}<strong>No audit entries</strong></td></tr>`;
        return;
      }

      const tone = { error: 'bad', critical: 'bad', warn: 'warn', warning: 'warn', info: 'info' };
      this.auditTableBody.innerHTML = items.map(log => `<tr>
          <td><strong>${this.escape(log.action || '—')}</strong></td>
          <td class="col-status"><span class="status-badge sm ${tone[log.severity] || 'info'}">${this.escape(log.severity || 'info')}</span></td>
          <td class="cell-muted mono">${this.escape(log.sessionId || 'Global')}</td>
          <td class="col-time">${log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
        </tr>`).join('');
    } catch (err) {
      console.warn('Stats fetch error:', err.message);
      this.auditTableBody.innerHTML = `<tr><td colspan="4" class="table-empty error">Could not load analytics: ${this.escape(err.message)}</td></tr>`;
    }
  }

  // ========== API Settings Modal ==========

  async testApiConnection() {
    let url = this.apiBaseUrlInput.value.trim();
    if (!url || url.includes('localhost:2785') || url.includes('127.0.0.1:2785')) {
      url = '/api';
    }
    const key = this.apiKeyInput.value.trim();
    this.apiTestResult.textContent = 'Testing connection…';
    this.apiTestResult.className = 'test-result info';

    try {
      const tempApi = new OpenWaApiService(url);
      if (key) tempApi.setApiKey(key);
      const sessions = await tempApi.getSessions();
      this.apiTestResult.textContent = `Connected. Found ${Array.isArray(sessions) ? sessions.length : 0} number(s).`;
      this.apiTestResult.className = 'test-result ok';
    } catch (err) {
      this.apiTestResult.textContent = `Connection failed: ${err.message}`;
      this.apiTestResult.className = 'test-result bad';
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
    hide(this.modalApiSettings);
    this.initSession();
  }

  // ========== WhatsApp Session Management & QR Linking ==========

  async refreshSessions(showToast = false) {
    if (this.sessionStatusPill) {
      this.sessionStatusPill.textContent = 'Refreshing...';
    }
    await this.initSession();
    if (this.modalSessionManager && !this.modalSessionManager.hidden) {
      await this.loadSessionManagerTable();
    }
    if (showToast) {
      const active = this.sessions.find(s => s.id === this.currentSessionId);
      this.toast(`Sessions refreshed. Active session is "${active?.name || this.currentSessionId || 'None'}" (${active?.status || 'unknown'}).`, 'info');
    }
  }

  async openSessionManagerModal() {
    show(this.modalSessionManager);
    if (this.createSessionMessage) {
      hide(this.createSessionMessage);
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
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">${icon('phone', 26)}<strong>No numbers yet</strong>Create one above, then scan its QR code.</td></tr>`;
        return;
      }

      this.sessions.forEach(s => {
        const tr = document.createElement('tr');
        const isActive = s.id === this.currentSessionId;
        const isReady = s.status === 'ready';
        const label = this.escape(s.name || s.id);

        const phoneDisplay = s.phone
          ? `<span class="mono">+${this.escape(s.phone)}</span>${s.pushName ? `<span class="cell-sub">${this.escape(s.pushName)}</span>` : ''}`
          : '<span class="cell-muted">Not linked</span>';

        tr.innerHTML = `
          <td class="col-check">
            <input type="radio" name="activeSessionRadio" value="${this.escape(s.id)}" ${isActive ? 'checked' : ''} aria-label="Send from ${label}" />
          </td>
          <td>
            <strong>${label}</strong>
            ${isActive ? ' <span class="status-badge ok sm">Active</span>' : ''}
          </td>
          <td class="col-phone">${phoneDisplay}</td>
          <td class="col-status">
            <span class="status-badge sm ${this.sessionTone(s.status)}">${this.escape(this.statusLabel(s.status))}</span>
            <span class="cell-sub">Engine ${s.engineLoaded ? 'running' : 'stopped'}</span>
          </td>
          <td>
            <div class="row-actions">
              ${isActive ? '' : `<button class="btn btn-xs btn-primary btn-assign-campaign">Use</button>`}
              ${!isReady ? `<button class="btn btn-xs btn-connect-qr">${icon('qr', 12)}Connect</button>` : ''}
              ${s.engineLoaded
                ? `<button class="btn btn-xs btn-stop-session" title="Stop engine">${icon('stop', 12)}Stop</button>`
                : `<button class="btn btn-xs btn-start-session" title="Start engine">${icon('play', 12)}Start</button>`}
              ${isReady ? `<button class="btn btn-xs btn-logout-session" title="Log out of WhatsApp">${icon('logout', 12)}Log out</button>` : ''}
              <button class="btn btn-xs btn-ghost-danger btn-delete-session" title="Delete number" aria-label="Delete ${label}">${icon('trash', 12)}</button>
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
      this.sessionsManagerBody.innerHTML = `<tr><td colspan="5" class="table-empty error">Could not load numbers: ${this.escape(err.message)}</td></tr>`;
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
    show(this.createSessionMessage);
    this.createSessionMessage.textContent = text;
    this.createSessionMessage.className = `test-result ${type === 'error' ? 'bad' : type === 'success' ? 'ok' : 'info'}`;
  }

  /** QR overlay states: a spinner with a message, or the "linked" confirmation. */
  setQrOverlay(state, text = '') {
    if (!this.qrLoadingOverlay) return;
    show(this.qrLoadingOverlay);
    this.qrLoadingOverlay.innerHTML = state === 'done'
      ? `<span class="qr-done-mark">${icon('check', 26)}</span><strong class="qr-done-text">WhatsApp linked</strong>`
      : `<span class="spinner"></span><span>${this.escape(text)}</span>`;
  }

  markQrLinked(sessionId) {
    clearInterval(this.qrPollInterval);
    this.qrPollInterval = null;
    hide(this.sessionQrImg);
    if (this.modalQrEnlarge) hide(this.modalQrEnlarge);
    this.setQrOverlay('done');
    this.qrStatusBadge.textContent = 'Ready';
    this.qrStatusBadge.className = 'status-badge ok';
  }

  showQrImage(src) {
    this.sessionQrImg.src = src;
    show(this.sessionQrImg);
    if (this.enlargedQrImg) {
      this.enlargedQrImg.src = src;
      show(this.enlargedQrImg);
    }
    if (this.enlargedQrLoadingOverlay) hide(this.enlargedQrLoadingOverlay);
    hide(this.qrLoadingOverlay);
    this.qrStatusBadge.textContent = 'Scan with WhatsApp';
    this.qrStatusBadge.className = 'status-badge info';
  }

  stopQrPolling() {
    if (this.qrPollInterval) {
      clearInterval(this.qrPollInterval);
      this.qrPollInterval = null;
    }
  }

  closeModal(modal) {
    if (!modal) return;
    hide(modal);
    // Leaving the number manager stops background QR polling (the enlarged QR sits on top of it).
    if (modal === this.modalSessionManager) {
      this.stopQrPolling();
      this.activeQrSessionId = null;
      show(this.qrPlaceholder);
      hide(this.qrActiveContainer);
      hide(this.modalQrEnlarge);
    }
  }

  async displaySessionQr(sessionId, sessionName) {
    if (this.qrPollInterval) {
      clearInterval(this.qrPollInterval);
      this.qrPollInterval = null;
    }

    this.activeQrSessionId = sessionId;
    hide(this.qrPlaceholder);
    show(this.qrActiveContainer);
    this.qrSessionNameText.textContent = sessionName || sessionId;
    this.qrStatusBadge.textContent = 'Connecting…';
    this.qrStatusBadge.className = 'status-badge warn';
    hide(this.sessionQrImg);
    this.setQrOverlay('loading', 'Fetching WhatsApp QR…');
    hide(this.pairingCodeResult);

    // Start engine if stopped
    try {
      await this.api.startSession(sessionId);
    } catch {
      // Ignored if already started
    }

    const onLinked = async () => {
      this.markQrLinked(sessionId);
      this.toast(`${sessionName || sessionId} is linked and ready to send.`, 'ok');
      this.selectActiveSession(sessionId);
      await this.initSession();
      await this.loadSessionManagerTable();
    };

    const poll = async () => {
      // A newer displaySessionQr call (or closing the dialog) supersedes this loop.
      if (this.activeQrSessionId !== sessionId) return;
      try {
        const qrData = await this.api.getSessionQR(sessionId);
        if (this.activeQrSessionId !== sessionId) return;
        if (qrData?.qrCode) this.showQrImage(qrData.qrCode);
        if (qrData?.status === 'ready') await onLinked();
      } catch {
        // The QR endpoint errors once the session is authenticated; check for that.
        try {
          const s = await this.api.getSession(sessionId);
          if (s?.status === 'ready' && this.activeQrSessionId === sessionId) await onLinked();
        } catch {
          // Continue polling
        }
      }
    };

    await poll();
    if (this.activeQrSessionId === sessionId && !this.qrPollInterval && this.qrStatusBadge.textContent !== 'Ready') {
      this.qrPollInterval = setInterval(poll, 2500);
    }
  }

  async handleGetPairingCode() {
    if (!this.activeQrSessionId) {
      this.toast('Please start or select a session first to generate a pairing code.', 'warn');
      return;
    }

    const phone = (this.pairingPhoneInput.value || '').trim().replace(/\D/g, '');
    if (!phone || phone.length < 8) {
      this.toast('Please enter a valid phone number with country code (e.g. 919876543210).', 'warn');
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
      show(this.pairingCodeResult);
    } catch (err) {
      this.toast(`Could not get pairing code: ${err.message}. Make sure the session status is "qr_ready".`, 'bad');
    } finally {
      this.btnGetPairingCode.disabled = false;
      this.btnGetPairingCode.textContent = 'Get code';
    }
  }

  switchConnectionMode(mode) {
    if (mode === 'pairing') {
      this.tabModeQr?.classList.remove('active');
      this.tabModePairing?.classList.add('active');
      if (this.sectionModeQr) hide(this.sectionModeQr);
      if (this.sectionModePairing) show(this.sectionModePairing);
    } else {
      this.tabModePairing?.classList.remove('active');
      this.tabModeQr?.classList.add('active');
      if (this.sectionModePairing) hide(this.sectionModePairing);
      if (this.sectionModeQr) show(this.sectionModeQr);
    }
  }

  async forceRefreshCurrentQr() {
    if (!this.activeQrSessionId) return;
    if (this.btnManualRefreshQr) {
      this.btnManualRefreshQr.textContent = 'Loading…';
      this.btnManualRefreshQr.disabled = true;
    }
    try {
      const qrData = await this.api.getSessionQR(this.activeQrSessionId);
      if (qrData?.qrCode) this.showQrImage(qrData.qrCode);
    } catch (err) {
      console.warn('Manual QR refresh error:', err.message);
      this.toast(`Could not refresh the QR code: ${err.message}`, 'bad');
    } finally {
      if (this.btnManualRefreshQr) {
        this.btnManualRefreshQr.textContent = 'Refresh';
        this.btnManualRefreshQr.disabled = false;
      }
    }
  }

  copyPairingCode() {
    const raw = this.pairingCodeValue?.textContent || '';
    if (!raw) return;
    navigator.clipboard?.writeText(raw.replace(/\s+/g, ''))
      .then(() => this.toast('Pairing code copied.', 'ok', 2500))
      .catch(() => this.toast('Could not copy. Select the code and copy it manually.', 'warn'));
  }

  async handleStartSession(sessionId) {
    try {
      await this.api.startSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      this.toast(`Could not start session: ${err.message}`, 'bad');
    }
  }

  async handleStopSession(sessionId) {
    if (!confirm('Are you sure you want to stop this WhatsApp session?')) return;
    try {
      await this.api.stopSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      this.toast(`Could not stop session: ${err.message}`, 'bad');
    }
  }

  async handleLogoutSession(sessionId) {
    if (!confirm('Are you sure you want to log out this WhatsApp account? You will need to scan QR code again.')) return;
    try {
      await this.api.logoutSession(sessionId);
      await this.loadSessionManagerTable();
      await this.initSession();
    } catch (err) {
      this.toast(`Could not log out session: ${err.message}`, 'bad');
    }
  }

  async handleDeleteSession(sessionId, sessionName) {
    if (!confirm(`Are you sure you want to permanently delete session "${sessionName}"? This cannot be undone.`)) return;
    try {
      if (this.qrPollInterval && this.activeQrSessionId === sessionId) {
        clearInterval(this.qrPollInterval);
        this.qrPollInterval = null;
        show(this.qrPlaceholder);
        hide(this.qrActiveContainer);
      }
      await this.api.deleteSession(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      await this.initSession();
      await this.loadSessionManagerTable();
    } catch (err) {
      this.toast(`Could not delete session: ${err.message}`, 'bad');
    }
  }

  // ========== Reports & Campaign History Methods ==========

  showDraftIndicator(count) {
    if (!this.draftStatusBanner) return;
    show(this.draftStatusBanner);
    const span = this.draftStatusBanner.querySelector('span');
    if (span) span.textContent = `${count.toLocaleString()} recipient${count === 1 ? '' : 's'} saved in this browser. They survive a refresh.`;
  }

  hideDraftIndicator() {
    if (this.draftStatusBanner) hide(this.draftStatusBanner);
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

  scheduleComposerDraft() {
    clearTimeout(this.composerDraftTimer);
    this.composerDraftTimer = setTimeout(() => this.saveComposerDraft(), 400);
  }

  async saveComposerDraft() {
    this.blocks[this.activeBlock] = this.messageTextarea.value || '';
    // `text` keeps older builds able to restore the first block.
    await ReportStore.saveComposerDraft({ text: this.blocks[0] || '', blocks: [...this.blocks] });
  }

  async clearDraftContacts() {
    if (confirm('Remove the saved recipient list from this browser?')) {
      this.records = [];
      await ReportStore.clearContactsDraft();
      this.hideDraftIndicator();
      hide(this.duplicateBanner);
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
      const untouched = this.blocks.length === 1 && !this.messageTextarea.value;
      if (compDraft && untouched) {
        const blocks = Array.isArray(compDraft.blocks) && compDraft.blocks.length
          ? compDraft.blocks.slice(0, MAX_BLOCKS).map(b => String(b ?? ''))
          : compDraft.text ? [String(compDraft.text)] : null;
        if (blocks) {
          this.blocks = blocks;
          this.activeBlock = 0;
          this.messageTextarea.value = blocks[0];
          this.renderBlockTabs();
          this.refreshComposer();
        }
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
    show(this.modalReportsHistory);
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
      if (this.viewBulkCampaigns) show(this.viewBulkCampaigns);
      if (this.viewSingleMessages) hide(this.viewSingleMessages);
      if (this.viewCampaignDetailDrilldown) hide(this.viewCampaignDetailDrilldown);
      this.loadHistoricalCampaigns();
    } else {
      this.tabBtnSingleReports?.classList.add('active');
      this.tabBtnBulkReports?.classList.remove('active');
      if (this.viewBulkCampaigns) hide(this.viewBulkCampaigns);
      if (this.viewSingleMessages) show(this.viewSingleMessages);
      if (this.viewCampaignDetailDrilldown) hide(this.viewCampaignDetailDrilldown);
      this.loadSingleMessages();
    }
  }

  async refreshCurrentReportsView() {
    await this.loadReportsKPIs();
    if (this.tabBtnBulkReports?.classList.contains('active')) {
      if (this.viewCampaignDetailDrilldown && !this.viewCampaignDetailDrilldown.hidden && this.activeDrilldownCampaignId) {
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
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><span class="spinner"></span> Loading campaigns…</td></tr>';

    try {
      const campaigns = await ReportStore.getAllCampaigns();
      this.currentLoadedCampaigns = campaigns;
      this.renderHistoricalCampaignsTable(campaigns);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty error">Could not load reports: ${this.escape(err.message)}</td></tr>`;
    }
  }

  /** status-badge tone + label for a stored campaign status. */
  campaignStatusBadge(status) {
    const map = {
      completed: ['ok', 'Completed'],
      in_progress: ['info', 'In progress'],
      running: ['info', 'Sending now'],
      scheduled: ['purple', 'Scheduled'],
      interrupted: ['warn', 'Interrupted'],
      stopped: ['warn', 'Stopped'],
      cancelled: ['warn', 'Cancelled'],
      failed: ['bad', 'Failed'],
    };
    const [tone, label] = map[status] || ['', String(status || 'unknown').replace(/_/g, ' ')];
    return `<span class="status-badge sm ${tone}">${this.escape(label)}</span>`;
  }

  deliveryBadge(status) {
    return status === 'sent'
      ? '<span class="status-badge ok sm">Sent</span>'
      : status === 'failed'
        ? '<span class="status-badge bad sm">Failed</span>'
        : `<span class="status-badge sm">${this.escape(status || 'pending')}</span>`;
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
      tbody.innerHTML = query
        ? `<tr><td colspan="8" class="table-empty">${icon('search', 26)}<strong>No matches</strong>No campaign matches “${this.escape(query)}”.</td></tr>`
        : `<tr><td colspan="8" class="table-empty">${icon('file', 26)}<strong>No campaigns yet</strong>Every campaign you send is recorded here.</td></tr>`;
      return;
    }

    filtered.forEach((c) => {
      const tr = document.createElement('tr');
      const dateStr = new Date(c.createdAt).toLocaleString();

      // Success is measured against messages (a recipient can receive several blocks).
      const sent = Number(c.sentCount) || 0;
      const failed = Number(c.failedCount) || 0;
      const totalMessages = Number(c.totalMessages) || Number(c.totalRecipients) || 0;
      const successPct = totalMessages > 0 ? `${Math.min(100, (sent / totalMessages) * 100).toFixed(1)}%` : '—';
      const notSent = Math.max(0, totalMessages - sent - failed);
      const status = this.effectiveStatus(c);
      const note = status === 'running' ? 'Sending from this page right now.' : (c.statusNote || '');
      const timing = [
        c.startedAt ? `started ${new Date(c.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : (c.scheduledFor ? `scheduled for ${new Date(c.scheduledFor).toLocaleString()}` : ''),
        c.completedAt ? `ended ${new Date(c.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '',
      ].filter(Boolean).join(' · ');

      tr.innerHTML = `
        <td>
          <strong>${this.escape(c.name)}</strong>
          <span class="cell-sub">${dateStr} · ${Number(c.totalRecipients) || 0} recipients · ${totalMessages} messages${timing ? ` · ${timing}` : ''}</span>
          <span class="cell-sub cell-ellipsis" title="${this.escape(c.messagePreview || '')}">${this.escape(c.messagePreview || '—')}</span>
        </td>
        <td class="col-hide-sm"><span class="status-badge info sm">${this.escape(c.sessionName || c.sessionId)}</span></td>
        <td class="num text-ok">${sent}</td>
        <td class="num ${failed > 0 ? 'text-bad' : 'cell-muted'}">${failed}</td>
        <td class="num col-hide-sm ${notSent > 0 ? 'text-info' : 'cell-muted'}">${notSent}</td>
        <td class="num col-hide-sm text-purple">${successPct}</td>
        <td class="col-status">${this.campaignStatusBadge(status)}${note ? `<span class="cell-note">${this.escape(note)}</span>` : ''}</td>
        <td class="col-action">
          <div class="row-actions">
            <button class="btn btn-xs btn-primary" data-action="view" title="Recipients, delivery status and activity log">${icon('eye', 12)}Details</button>
            <button class="btn btn-xs" data-action="excel" title="Download Excel (.xlsx) report">${icon('download', 12)}Excel</button>
            ${failed > 0 ? `<button class="btn btn-xs" data-action="retry" title="Load failed numbers as recipients">${icon('retry', 12)}Retry</button>` : ''}
            <button class="btn btn-xs btn-ghost-danger" data-action="delete" title="Delete report" aria-label="Delete report ${this.escape(c.name)}">${icon('trash', 12)}</button>
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

  async openCampaignDrilldown(campaignId, { tab, keepView = false } = {}) {
    this.activeDrilldownCampaignId = campaignId;
    if (this.viewBulkCampaigns) hide(this.viewBulkCampaigns);
    if (this.viewCampaignDetailDrilldown) show(this.viewCampaignDetailDrilldown);

    try {
      const data = await ReportStore.getCampaignDetails(campaignId);
      if (!data || !data.campaign) {
        this.toast('Campaign report not found.', 'bad');
        this.closeDrilldownView();
        return;
      }

      const { campaign, logs } = data;
      if (this.activeDrilldownCampaignId !== campaignId) return; // user moved on while loading
      this.currentDrilldownLogs = logs || [];
      this.renderDrilldownSummary(campaign, await ReportStore.getCampaignEvents(campaignId));

      const sentLogs = this.currentDrilldownLogs.filter(l => l.status === 'sent');
      const failedLogs = this.currentDrilldownLogs.filter(l => l.status === 'failed');

      if (this.drilldownCountAll) this.drilldownCountAll.textContent = this.currentDrilldownLogs.length;
      if (this.drilldownCountSent) this.drilldownCountSent.textContent = sentLogs.length;
      if (this.drilldownCountFailed) this.drilldownCountFailed.textContent = failedLogs.length;

      if (this.btnRetryFailedFromReport) {
        show(this.btnRetryFailedFromReport, failedLogs.length > 0);
        this.btnRetryFailedFromReport.innerHTML = `${icon('retry', 13)}Re-send failed (${failedLogs.length})`;
      }

      if (this.drilldownMessagePreviewText) {
        this.drilldownMessagePreviewText.textContent = campaign.messagePreview || logs[0]?.content || '—';
      }

      if (!keepView) {
        this.drilldownFilter = 'all';
        document.querySelectorAll('.drilldownFilterBtn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === 'all');
        });
        this.switchDrillTab(tab || 'recipients');
      }

      this.renderDrilldownNumbersTable();
    } catch (err) {
      this.toast(`Error opening campaign details: ${err.message}`, 'bad');
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
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No ${this.drilldownFilter === 'all' ? '' : `${this.escape(this.drilldownFilter)} `}delivery records yet. The Activity log tab shows every step taken.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((log, idx) => {
      const isSent = log.status === 'sent';
      const detailText = isSent
        ? (log.waMessageId ? `<span class="mono">${this.escape(log.waMessageId)}</span>` : '<span class="text-ok">Delivered</span>')
        : `<span class="text-bad">${this.escape(log.error || 'Submission failed')}</span>`;
      return `<tr>
        <td class="col-num">${idx + 1}</td>
        <td><strong class="mono">${this.escape(log.recipient)}</strong></td>
        <td class="col-hide-sm">${this.escape(log.name || '—')}</td>
        <td class="col-status">${this.deliveryBadge(log.status)}</td>
        <td><div class="cell-ellipsis">${detailText}</div></td>
        <td class="col-time">${log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</td>
      </tr>`;
    }).join('');
  }

  closeDrilldownView() {
    this.activeDrilldownCampaignId = null;
    this.currentDrilldownLogs = [];
    if (this.viewCampaignDetailDrilldown) hide(this.viewCampaignDetailDrilldown);
    if (this.viewBulkCampaigns) show(this.viewBulkCampaigns);
  }

  async exportCampaignExcelById(campaignId) {
    try {
      const filename = await ReportStore.exportCampaignReport(campaignId, 'xlsx');
      this.toast(`Report exported successfully: ${filename}`, 'ok');
    } catch (e) {
      this.toast(`Export failed: ${e.message}`, 'bad');
    }
  }

  async exportCurrentDrilldownExcel() {
    if (!this.activeDrilldownCampaignId) return;
    await this.exportCampaignExcelById(this.activeDrilldownCampaignId);
  }

  async exportAllSummaryExcel() {
    try {
      const filename = await ReportStore.exportAllCampaignsSummary('xlsx');
      this.toast(`Summary report exported successfully: ${filename}`, 'ok');
    } catch (e) {
      this.toast(`Export failed: ${e.message}`, 'bad');
    }
  }

  async retryFailedFromCampaignId(campaignId) {
    try {
      const data = await ReportStore.getCampaignDetails(campaignId);
      if (!data || !data.logs) {
        this.toast('No logs found for this campaign.', 'warn');
        return;
      }
      const failed = data.logs.filter(l => l.status === 'failed');
      if (failed.length === 0) {
        this.toast('This campaign had no failed numbers!', 'warn');
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

      hide(this.modalReportsHistory);
      this.toast(`Loaded ${failed.length} failed recipient(s) directly into your WhatsApp Numbers table for a retry campaign!`, 'ok');
    } catch (e) {
      this.toast(`Failed to load retry numbers: ${e.message}`, 'bad');
    }
  }

  async retryFailedFromCurrentDrilldown() {
    if (!this.activeDrilldownCampaignId) return;
    await this.retryFailedFromCampaignId(this.activeDrilldownCampaignId);
  }

  async deleteHistoricalCampaign(campaignId, campaignName) {
    if (!confirm(`Delete campaign report "${campaignName}" from local database? This cannot be undone.`)) return;
    if (this.campaignManager.campaignId === campaignId && this.campaignManager.isBusy) {
      this.toast('This campaign is sending right now. Cancel it before deleting its report.', 'warn');
      return;
    }
    try {
      await ReportStore.deleteCampaign(campaignId);
      this.recoveries.delete(campaignId);
      this.renderRecovery();
      await this.loadReportsKPIs();
      await this.loadHistoricalCampaigns();
    } catch (e) {
      this.toast(`Could not delete report: ${e.message}`, 'bad');
    }
  }

  async clearAllReports() {
    if (this.campaignManager.isBusy) {
      this.toast('A campaign is running. Wait for it to finish before clearing all reports.', 'warn');
      return;
    }
    if (!confirm('Are you sure you want to clear ALL campaign reports and message audit logs? This cannot be undone.')) return;
    try {
      await ReportStore.clearAllCampaigns();
      await ReportStore.clearAllSingleMessages();
      this.recoveries.clear();
      this.renderRecovery();
      await this.loadReportsKPIs();
      await this.loadHistoricalCampaigns();
      this.toast('All campaign reports have been cleared.', 'ok');
    } catch (e) {
      this.toast(`Error clearing reports: ${e.message}`, 'bad');
    }
  }

  async loadSingleMessages() {
    const tbody = this.singleMessagesBody;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty"><span class="spinner"></span> Loading messages…</td></tr>';

    try {
      const messages = await ReportStore.getAllSingleMessages();
      if (messages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">${icon('message', 26)}<strong>No single messages</strong>One-off messages sent from this browser appear here.</td></tr>`;
        return;
      }

      tbody.innerHTML = messages.map(m => {
        const detail = m.status === 'sent'
          ? (m.waMessageId ? `<span class="cell-sub mono">${this.escape(m.waMessageId)}</span>` : '')
          : `<span class="cell-sub text-bad">${this.escape(m.error || 'Failed')}</span>`;
        return `<tr>
          <td class="col-time">${new Date(m.timestamp).toLocaleString()}</td>
          <td><strong class="mono">${this.escape(m.recipient)}</strong></td>
          <td class="col-hide-sm"><span class="status-badge info sm">${this.escape(m.sessionName || m.sessionId)}</span></td>
          <td><div class="cell-ellipsis" title="${this.escape(m.message || '')}">${this.escape(m.message || '—')}</div></td>
          <td class="col-status">${this.deliveryBadge(m.status)}${detail}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty error">Could not load messages: ${this.escape(e.message)}</td></tr>`;
    }
  }

  filterReportsList() {
    if (this.currentLoadedCampaigns && this.tabBtnBulkReports?.classList.contains('active')) {
      this.renderHistoricalCampaignsTable(this.currentLoadedCampaigns);
    }
  }

  // ========== QR Zoom & Sizing Methods ==========

  setQrSize(sizePx) {
    // .qr-box sizes itself (and its image) from --qr-size in styles.css.
    this.currentQrSize = sizePx;
    this.qrImageWrapper?.style.setProperty('--qr-size', `${sizePx}px`);
  }

  setEnlargedQrZoom(sizePx) {
    // min() keeps the big QR inside narrow (phone) viewports.
    this.enlargedQrBox?.style.setProperty('--qr-size', `min(${sizePx}px, calc(100vw - 60px))`);
    if (this.qrZoomValText) {
      this.qrZoomValText.textContent = `${sizePx}px`;
    }
  }

  openEnlargedQrModal() {
    const hasQrSrc = this.sessionQrImg && this.sessionQrImg.src && !this.sessionQrImg.hidden;
    if (!hasQrSrc && !this.activeQrSessionId) {
      this.toast('Please start or select a session to view its QR code first.', 'warn');
      return;
    }
    if (!this.modalQrEnlarge) return;

    if (this.enlargedQrSessionName) {
      this.enlargedQrSessionName.textContent = this.qrSessionNameText?.textContent || this.activeQrSessionId || 'WhatsApp';
    }

    if (hasQrSrc && this.enlargedQrImg) {
      this.enlargedQrImg.src = this.sessionQrImg.src;
      show(this.enlargedQrImg);
      if (this.enlargedQrLoadingOverlay) hide(this.enlargedQrLoadingOverlay);
    } else {
      if (this.enlargedQrLoadingOverlay) show(this.enlargedQrLoadingOverlay);
      if (this.enlargedQrImg) hide(this.enlargedQrImg);
    }

    show(this.modalQrEnlarge);
  }

  // ========== Status overview, step badges & progress views ==========

  capitalize(str) {
    const s = String(str || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  stateLabel(state) {
    return {
      idle: 'Idle',
      scheduled: 'Scheduled',
      running: 'Sending',
      completed: 'Completed',
      stopped: 'Stopped',
      cancelled: 'Cancelled',
    }[state] || this.capitalize(state);
  }

  /** A stored campaign's status, corrected to "running" when this tab is sending it right now. */
  effectiveStatus(c) {
    const cm = this.campaignManager;
    if (c.id === cm.campaignId && cm.isBusy) return cm.state === 'scheduled' ? 'scheduled' : 'running';
    return c.status;
  }

  setBadge(el, tone, text) {
    if (!el) return;
    el.className = `status-badge sm ${tone}`;
    el.textContent = text;
  }

  /** One-word status chip next to each step title. */
  renderStepStatus(issues) {
    const [s1, s2, s3] = this.stepStatus || [];
    const cm = this.campaignManager;
    const selected = this.getSelectedRecipients().length;

    if (selected) this.setBadge(s1, 'ok', `${selected.toLocaleString()} selected`);
    else if (this.records.length) this.setBadge(s1, 'warn', 'None selected');
    else this.setBadge(s1, '', 'Add recipients');

    const config = this.buildMessageConfig();
    const blocks = CampaignManager.getTextBlocks(config).length;
    const hasMedia = CampaignManager.hasMediaPayload(config);
    const tooLong = issues.some(i => i.level === 'bad' && /over \d+ characters|Caption is/.test(i.text));
    if (this.mediaTypeSelect.value !== 'text' && !hasMedia) this.setBadge(s2, 'warn', 'File missing');
    else if (tooLong) this.setBadge(s2, 'bad', 'Too long');
    else if (!blocks && !hasMedia) this.setBadge(s2, '', 'Write a message');
    else this.setBadge(s2, 'ok', `${blocks} block${blocks === 1 ? '' : 's'}${hasMedia ? ' + file' : ''}`);

    const blocking = issues.filter(i => i.level === 'bad');
    if (cm.state === 'running') this.setBadge(s3, 'info', 'Sending');
    else if (cm.state === 'scheduled') this.setBadge(s3, 'purple', 'Scheduled');
    else if (!blocking.length) this.setBadge(s3, 'ok', 'Ready to send');
    else if (blocking[0] === issues[0]) this.setBadge(s3, 'bad', 'Number not ready');
    else this.setBadge(s3, 'warn', 'Complete steps 1–2');
  }

  /** Plain-language status for the overview tile and the explanation line in Campaign progress. */
  renderLiveStatus(issues = this.getSendIssues()) {
    const cm = this.campaignManager;
    const s = cm.stats;
    const state = cm.state;
    const total = s.totalMessages || s.totalRecipients || 0;
    const done = s.sentCount + s.failedCount;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const attention = [...this.recoveries.values()].find(v => ['server_running', 'interrupted', 'schedule_lost', 'legacy', 'unreachable'].includes(v.kind));
    let tileState = state;
    let title;
    let text;
    let explain;
    let tone = 'info';

    if (state === 'running') {
      const pausing = this.pauseUntil && this.pauseUntil > Date.now();
      title = pausing ? `Pausing · next is batch ${s.currentBatchIndex + 2} of ${s.totalBatches}` : `Sending · batch ${s.currentBatchIndex + 1} of ${s.totalBatches}`;
      text = `${s.sentCount.toLocaleString()} of ${total.toLocaleString()} sent${s.failedCount ? `, ${s.failedCount} failed` : ''}.`;
      explain = `“${cm.campaignName}” is sending from ${cm.sessionName}. Keep this page open. If it is closed or reloaded, the batch in progress still finishes on the server, but the batches after it wait until you come back and choose Resume.`;
    } else if (state === 'scheduled') {
      title = 'Scheduled';
      text = cm.scheduleTargetTime ? `Starts ${new Date(cm.scheduleTargetTime).toLocaleString()}.` : 'Waiting to start.';
      explain = `“${cm.campaignName}” starts automatically at ${cm.scheduleTargetTime ? new Date(cm.scheduleTargetTime).toLocaleString() : 'the chosen time'}. The schedule lives in this page: keep it open until then.`;
      tone = 'info';
    } else if (state === 'completed') {
      title = 'Completed';
      text = `${s.sentCount} sent, ${s.failedCount} failed.`;
      explain = `“${cm.campaignName}” finished: ${s.sentCount} sent, ${s.failedCount} failed. Reports has the full delivery list and the activity log.`;
      tone = s.failedCount ? 'warn' : 'ok';
    } else if (state === 'stopped') {
      title = 'Stopped';
      text = `${s.sentCount} sent, ${s.pendingCount} not sent.`;
      explain = `${cm.haltReason || cm.stopNote || 'The campaign stopped.'} ${s.sentCount} sent, ${s.failedCount} failed, ${s.pendingCount} not sent.`;
      tone = 'warn';
    } else if (state === 'cancelled') {
      title = 'Cancelled';
      text = `${s.sentCount} sent before cancelling.`;
      explain = `“${cm.campaignName}” was cancelled. ${s.sentCount} messages had already been sent; the rest were not.`;
      tone = 'warn';
    } else if (attention) {
      tileState = 'interrupted';
      title = 'Needs your attention';
      text = 'A campaign did not finish. See the notice at the top.';
      explain = `“${attention.campaign?.name || 'A campaign'}” did not finish because its page was closed or reloaded. Use the notice at the top of the page to resume or stop it.`;
      tone = 'warn';
    } else {
      const blocking = issues.filter(i => i.level === 'bad');
      tileState = blocking.length ? 'idle' : 'completed';
      title = blocking.length ? 'Setting up' : 'Ready to send';
      text = blocking.length ? `Next: ${blocking[0].text.charAt(0).toLowerCase()}${blocking[0].text.slice(1)}.` : 'Everything is in place. Choose Send now.';
      explain = 'Set up recipients and a message above, then choose Send now. Progress and a log of every step appear here.';
    }

    if (this.statusTile) this.statusTile.dataset.state = tileState;
    if (this.statusTileTitle) this.statusTileTitle.textContent = title;
    if (this.statusTileText && !(state === 'scheduled' && this.scheduleCountdownTimer)) this.statusTileText.textContent = text;
    if (this.statusTileBar) this.statusTileBar.style.width = `${['idle'].includes(state) ? 0 : pct}%`;
    if (this.monitorExplain) this.monitorExplain.className = `notice compact explain ${tone}`;
    if (this.monitorExplainText) this.monitorExplainText.textContent = explain;
  }

  switchMonitorTab(tab) {
    this.monitorTab = tab;
    const isActivity = tab === 'activity';
    this.tabMonitorDeliveries?.classList.toggle('active', !isActivity);
    this.tabMonitorActivity?.classList.toggle('active', isActivity);
    this.tabMonitorDeliveries?.setAttribute('aria-selected', String(!isActivity));
    this.tabMonitorActivity?.setAttribute('aria-selected', String(isActivity));
    show(this.viewMonitorDeliveries, !isActivity);
    show(this.viewMonitorActivity, isActivity);
  }

  switchDrillTab(tab) {
    this.drillTab = tab;
    const isActivity = tab === 'activity';
    this.tabDrillRecipients?.classList.toggle('active', !isActivity);
    this.tabDrillActivity?.classList.toggle('active', isActivity);
    this.tabDrillRecipients?.setAttribute('aria-selected', String(!isActivity));
    this.tabDrillActivity?.setAttribute('aria-selected', String(isActivity));
    show(this.drillViewRecipients, !isActivity);
    show(this.drillViewActivity, isActivity);
  }

  renderMonitorActivity() {
    const events = this.campaignManager.events || [];
    if (this.countActivity) this.countActivity.textContent = events.length.toLocaleString();
    this.renderActivityList(this.activityList, events);
  }

  /** Activity log rows, newest first, with a date row whenever the day changes. */
  renderActivityList(el, events) {
    if (!el) return;
    if (!events.length) {
      el.innerHTML = '<li class="empty-row"><span class="empty">No actions recorded yet. Every step of a campaign (start, each batch, pauses, cancels, reloads, resumes) is listed here.</span></li>';
      return;
    }
    const glyph = { ok: 'check', warn: 'alert', bad: 'alert', info: 'info' };
    let lastDay = '';
    const rows = [];
    [...events].sort((a, b) => b.ts - a.ts).forEach(e => {
      const d = new Date(e.ts);
      const day = d.toDateString();
      if (day !== lastDay) {
        lastDay = day;
        rows.push(`<li class="day-row"><span class="day">${this.escape(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span></li>`);
      }
      rows.push(`<li class="${this.escape(e.level)}"><time datetime="${d.toISOString()}" title="${this.escape(d.toLocaleString())}">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>${icon(glyph[e.level] || 'info', 15)}<span>${this.escape(e.message)}</span></li>`);
    });
    el.innerHTML = rows.join('');
  }

  /** One chip per batch: done / sending / waiting, with counts. */
  renderBatchChips(el, wrap, metas) {
    if (!el) return;
    show(wrap, metas.length > 0);
    el.innerHTML = metas.map(m => {
      const n = (m.index ?? 0) + 1;
      const total = m.total || 0;
      const sent = m.sent || 0;
      const failed = m.failed || 0;
      let cls = '';
      let label;
      switch (m.status) {
        case 'completed':
          cls = failed ? 'warn' : 'ok';
          label = `${sent}/${total} sent${failed ? `, ${failed} failed` : ''}`;
          break;
        case 'failed':
          cls = 'bad';
          label = sent ? `${sent}/${total} sent, ${failed} failed` : 'failed';
          break;
        case 'cancelled':
          cls = 'warn';
          label = `cancelled · ${sent}/${total} sent`;
          break;
        case 'submitting':
          cls = 'live';
          label = 'submitting…';
          break;
        case 'processing':
          cls = 'live';
          label = `sending ${sent + failed}/${total}`;
          break;
        default:
          label = 'waiting';
      }
      return `<span class="batch-chip ${cls}" title="Batch ${n}: ${total} messages for ${m.recipients || '?'} recipients">Batch ${n} · ${this.escape(label)}</span>`;
    }).join('');
  }

  // ========== Recovery: campaigns left unfinished by a closed or reloaded page ==========

  async checkOpenCampaigns() {
    let open = [];
    try {
      open = await ReportStore.getOpenCampaigns();
    } catch (err) {
      console.warn('Could not look for unfinished campaigns:', err);
      return;
    }
    for (const c of open) {
      if (c.id === this.campaignManager.campaignId && this.campaignManager.isBusy) continue;
      await this.inspectOne(c.id, c);
    }
    this.renderRecovery();
    this.renderChecklist();
  }

  /** Ask the server what happened to one unfinished campaign, record what was learned, keep the verdict. */
  async inspectOne(id, prev) {
    let v;
    try {
      v = await CampaignManager.inspect(this.api, id);
    } catch (err) {
      v = { kind: 'unreachable', campaign: prev, error: err.message };
    }
    if (!v || v.kind === 'gone' || !v.campaign) {
      this.recoveries.delete(id);
      return;
    }
    const before = v.campaign;
    // Finished elsewhere (another tab completed it) — nothing to recover.
    if (!OPEN_CAMPAIGN_STATES.includes(before.status)) {
      this.recoveries.delete(id);
      return;
    }

    const firstNotice = ['in_progress', 'running', 'scheduled'].includes(before.status) && v.kind !== 'other_tab' && v.kind !== 'unreachable';
    if (firstNotice) {
      const last = before.heartbeatAt ? ` Last activity from that page: ${new Date(before.heartbeatAt).toLocaleString()}.` : '';
      const what = v.kind === 'schedule_lost'
        ? 'The page holding this schedule was closed or reloaded, so it will not start on its own.'
        : 'The page was closed or reloaded while this campaign was sending.';
      await ReportStore.addCampaignEvent(id, { level: 'warn', type: 'page_closed', message: `${what}${last}` });
    }
    for (const msg of v.learned || []) {
      await ReportStore.addCampaignEvent(id, { level: 'info', type: 'server_check', message: msg });
    }

    const c = v.campaign;
    const totalMsgs = c.totalMessages || c.totalRecipients || 0;
    let note = '';
    if (v.kind === 'server_running') {
      note = `Paused by a page reload. Batch ${v.active.meta.index + 1} of ${v.totalBatches} is still being sent by the server; ${v.remainingBatches} batch${v.remainingBatches === 1 ? '' : 'es'} after it wait until you resume.`;
    } else if (v.kind === 'interrupted') {
      note = `Interrupted by a page reload after ${v.finishedBatches} of ${v.totalBatches} batches. ${c.pendingCount} message${c.pendingCount === 1 ? ' was' : 's were'} not sent.`;
    } else if (v.kind === 'legacy') {
      note = 'Interrupted by a page reload. It was started before progress tracking existed, so it cannot be resumed.';
    } else if (v.kind === 'schedule_lost') {
      note = v.missed
        ? `Its start time (${new Date(c.scheduledFor).toLocaleString()}) passed while the page was closed. Nothing was sent.`
        : `Scheduled for ${new Date(c.scheduledFor).toLocaleString()}, but the page holding the schedule was closed. Re-arm it to keep it.`;
    }

    if (note) {
      await ReportStore.updateCampaign(id, { status: 'interrupted', statusNote: note });
      c.status = 'interrupted';
      c.statusNote = note;
    } else if (v.kind === 'finished') {
      note = `Finished on the server while the page was closed: ${c.sentCount} of ${totalMsgs} sent, ${c.failedCount} failed.`;
      await ReportStore.updateCampaign(id, { status: 'completed', completedAt: Date.now(), statusNote: note });
      await ReportStore.addCampaignEvent(id, { level: c.failedCount ? 'warn' : 'ok', type: 'finished_while_closed', message: note });
      await ReportStore.deleteCampaignPlan(id);
      c.status = 'completed';
      c.statusNote = note;
      this.updateReportsBadge();
    }

    this.recoveries.set(id, v);
    if (v.kind === 'server_running' || v.kind === 'other_tab') this.scheduleRecheck();
  }

  /** While a batch is still running on the server (or in another tab), refresh its card every few seconds. */
  scheduleRecheck() {
    clearTimeout(this.recheckTimer);
    this.recheckTimer = setTimeout(async () => {
      const live = [...this.recoveries.values()].filter(v => v.kind === 'server_running' || v.kind === 'other_tab');
      for (const v of live) await this.inspectOne(v.campaign.id, v.campaign);
      this.renderRecovery();
      this.renderChecklist();
    }, 5000);
  }

  renderRecovery() {
    const host = this.recoveryHost;
    if (!host) return;
    const cards = [...this.recoveries.values()].map(v => this.recoveryCard(v)).filter(Boolean);
    host.innerHTML = cards.join('');
    show(host, cards.length > 0);
  }

  recoveryCard(v) {
    const c = v.campaign;
    if (!c) return '';
    const id = this.escape(c.id);
    const name = this.escape(c.name);
    const total = c.totalMessages || c.totalRecipients || 0;
    const btn = (action, label, cls = '', glyph = '') =>
      `<button class="btn btn-sm ${cls}" data-recovery="${action}" data-id="${id}">${glyph ? icon(glyph, 14) : ''}<span>${label}</span></button>`;
    const viewLog = btn('view', 'View activity log', '', 'file');
    const facts = `<div class="recovery-facts">
        <div><span>Sent</span><strong class="text-ok">${(c.sentCount || 0).toLocaleString()}</strong></div>
        <div><span>Failed</span><strong class="${c.failedCount ? 'text-bad' : ''}">${(c.failedCount || 0).toLocaleString()}</strong></div>
        <div><span>Not sent yet</span><strong class="text-info">${Math.max(0, total - (c.sentCount || 0) - (c.failedCount || 0)).toLocaleString()}</strong></div>
        <div><span>Batches finished</span><strong>${v.finishedBatches ?? '—'} / ${v.totalBatches ?? c.totalBatches ?? '—'}</strong></div>
      </div>`;
    const lastSeen = c.heartbeatAt ? `<span class="meta-text">Last activity ${this.escape(new Date(c.heartbeatAt).toLocaleString())}</span>` : '';
    const noPlan = v.plan ? '' : ' Its recipient list was not saved, so it cannot be resumed.';
    let tone = 'warn';
    let glyph = 'alert';
    let title;
    let body;
    let actions;

    switch (v.kind) {
      case 'server_running': {
        const p = v.active.progress || {};
        title = `“${name}” is still sending on the server <span class="status-badge sm warn">Paused by page reload</span>`;
        body = `The page was closed or reloaded during this campaign. The server is still sending batch ${v.active.meta.index + 1} of ${v.totalBatches} (${(p.sent || 0) + (p.failed || 0)} of ${p.total || v.active.meta.total} done). ${v.remainingBatches ? `The ${v.remainingBatches} batch${v.remainingBatches === 1 ? '' : 'es'} after it will not start until you choose Resume.` : 'It is the last batch, so the campaign will complete on its own.'}${noPlan}`;
        actions = [v.plan ? btn('resume', 'Resume sending', 'btn-primary', 'play') : '', btn('stop', 'Stop campaign', 'btn-danger', 'stop'), viewLog, lastSeen];
        break;
      }
      case 'interrupted':
        title = `“${name}” was interrupted <span class="status-badge sm warn">Not finished</span>`;
        body = `The page was closed or reloaded while sending. ${v.finishedBatches} of ${v.totalBatches} batches finished; ${v.remainingBatches === 1 ? 'the other batch was' : `the other ${v.remainingBatches} batches were`} never sent. Resume continues with the first unsent batch, so nobody is messaged twice.${noPlan}`;
        actions = [v.plan ? btn('resume', 'Resume sending', 'btn-primary', 'play') : '', btn('stop', 'Stop and close report', 'btn-danger', 'stop'), viewLog, lastSeen];
        break;
      case 'finished':
        tone = 'ok';
        glyph = 'check';
        title = `“${name}” finished while the page was closed <span class="status-badge sm ok">Completed</span>`;
        body = `The last batch was already on the server, so it completed without this page. ${c.sentCount} of ${total} sent, ${c.failedCount} failed.`;
        actions = [btn('view', 'Open report', 'btn-primary', 'file'), btn('dismiss', 'Dismiss')];
        break;
      case 'schedule_lost':
        tone = 'info';
        glyph = 'calendar';
        title = `Scheduled campaign “${name}” ${v.missed ? 'missed its start time' : 'needs to be re-armed'}`;
        body = `${this.escape(c.statusNote || '')} Schedules only run while the page that created them is open.${noPlan}`;
        actions = [
          v.plan && !v.missed ? btn('rearm', 'Re-arm schedule', 'btn-primary', 'calendar') : '',
          v.plan ? btn('start_now', 'Send now', v.missed ? 'btn-primary' : '', 'send') : '',
          btn('cancel_schedule', 'Cancel it', 'btn-ghost-danger', 'x'),
          viewLog,
        ];
        return this.recoveryShell(tone, glyph, title, body, '', actions);
      case 'other_tab':
        tone = 'info';
        glyph = 'activity';
        title = `“${name}” is being sent from another open tab`;
        body = 'That tab controls this campaign. These numbers refresh every few seconds; to stop it, use Cancel in that tab.';
        actions = [viewLog];
        break;
      case 'unreachable':
        tone = 'bad';
        title = `Can't check “${name}”`;
        body = `This campaign did not finish, but the server could not be reached to see what happened (${this.escape(v.error || 'no response')}). Nothing will be sent until you check again.`;
        actions = [btn('recheck', 'Check again', 'btn-primary', 'refresh'), viewLog];
        break;
      case 'legacy':
        title = `“${name}” stopped when the page was reloaded`;
        body = `It was started before progress tracking was added, so its remaining batches cannot be resumed. ${c.sentCount || 0} sent and ${c.failedCount || 0} failed were recorded; the rest were not sent.`;
        actions = [btn('close_legacy', 'Close report', 'btn-primary', 'check'), viewLog];
        break;
      default:
        return '';
    }
    return this.recoveryShell(tone, glyph, title, body, facts, actions);
  }

  recoveryShell(tone, glyph, title, body, facts, actions) {
    return `<section class="recovery ${tone}" role="status">
      <div class="recovery-head">${icon(glyph, 20)}<div><h3>${title}</h3><p>${body}</p></div></div>
      ${facts}
      <div class="recovery-actions">${actions.filter(Boolean).join('')}</div>
    </section>`;
  }

  async handleRecoveryAction(action, id, button) {
    if (!id) return;
    if (button) button.disabled = true;
    try {
      switch (action) {
        case 'view':
          await this.openReportsModal();
          await this.openCampaignDrilldown(id, { tab: 'activity' });
          return;
        case 'dismiss':
          this.recoveries.delete(id);
          this.renderRecovery();
          this.renderChecklist();
          return;
        case 'recheck':
          await this.inspectOne(id, this.recoveries.get(id)?.campaign);
          this.renderRecovery();
          this.renderChecklist();
          return;
        default:
          break;
      }

      // Everything else acts on the latest truth from the server.
      const verdict = await CampaignManager.inspect(this.api, id).catch(err => ({ kind: 'unreachable', error: err.message, campaign: this.recoveries.get(id)?.campaign }));
      if (verdict.kind === 'other_tab') {
        this.toast('Another open tab is sending this campaign. Use that tab to control it.', 'warn');
        return;
      }
      if (verdict.kind === 'unreachable') {
        this.toast(`The server could not be reached: ${verdict.error}`, 'bad');
        return;
      }

      if (action === 'resume' || action === 'start_now' || action === 'rearm') {
        await this.resumeOrphan(verdict, action === 'rearm' ? 'schedule' : 'start');
        return;
      }

      const name = verdict.campaign?.name || 'this campaign';
      if (action === 'stop') {
        if (verdict.kind === 'finished') {
          await this.inspectOne(id, verdict.campaign);
          this.toast(`“${name}” had already finished.`, 'info');
        } else {
          const msg = verdict.active
            ? `Stop “${name}”?\n\nThe batch the server is sending now will be cancelled, and the remaining batches will not be sent. Messages already delivered cannot be recalled.`
            : `Stop “${name}”?\n\nThe batches that were never sent will not be sent. The report is kept.`;
          if (!confirm(msg)) return;
          const note = await CampaignManager.stopOrphan(this.api, verdict, 'Stopped by user after the page was reloaded.');
          this.recoveries.delete(id);
          this.toast(note, 'warn', 9000);
        }
      } else if (action === 'cancel_schedule') {
        if (!confirm(`Cancel the scheduled campaign “${name}”? Nothing has been sent.`)) return;
        const note = 'Scheduled campaign cancelled after the page was reloaded. Nothing was sent.';
        await ReportStore.updateCampaign(id, { status: 'cancelled', completedAt: Date.now(), statusNote: note });
        await ReportStore.addCampaignEvent(id, { level: 'warn', type: 'schedule_cancelled', message: note });
        await ReportStore.deleteCampaignPlan(id);
        this.recoveries.delete(id);
        this.toast(note, 'info');
      } else if (action === 'close_legacy') {
        const c = verdict.campaign || {};
        const note = `Closed by user after a page reload. ${c.sentCount || 0} sent, ${c.failedCount || 0} failed; the remaining messages were not sent.`;
        await ReportStore.updateCampaign(id, { status: 'stopped', completedAt: Date.now(), statusNote: note });
        await ReportStore.addCampaignEvent(id, { level: 'warn', type: 'closed', message: note });
        this.recoveries.delete(id);
      }
      this.renderRecovery();
      this.renderChecklist();
      this.updateReportsBadge();
      if (this.modalReportsHistory && !this.modalReportsHistory.hidden) await this.refreshCurrentReportsView();
    } catch (err) {
      this.toast(`Could not complete that: ${err.message}`, 'bad');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  /** Take over an unfinished campaign in this tab and continue (or re-arm) it. */
  async resumeOrphan(verdict, mode) {
    const cm = this.campaignManager;
    const c = verdict.campaign;
    if (cm.isBusy) {
      this.toast('Another campaign is running in this page. Wait for it to finish first.', 'warn');
      return;
    }
    if (!['server_running', 'interrupted', 'schedule_lost'].includes(verdict.kind)) {
      await this.inspectOne(c.id, c);
      this.renderRecovery();
      this.toast(verdict.kind === 'finished' ? `“${c.name}” has already finished.` : 'This campaign cannot be resumed.', 'info');
      return;
    }
    if (!verdict.plan) {
      this.toast('This campaign cannot be resumed: its recipient list was not saved.', 'bad');
      return;
    }
    const session = this.sessions.find(s => s.id === c.sessionId);
    if (!session) {
      this.toast(`The number this campaign used (${c.sessionName || c.sessionId}) no longer exists.`, 'bad');
      return;
    }
    if (session.status !== 'ready' && !verdict.active) {
      this.toast(`Number “${session.name || session.id}” is ${this.statusLabel(session.status)}. Connect it in Manage numbers, then resume.`, 'bad', 10000);
      return;
    }

    const logs = verdict.logs || (await ReportStore.getCampaignDetails(c.id))?.logs || [];
    await cm.resumeFrom(c, verdict.plan, logs);
    this.recoveries.delete(c.id);
    this.renderRecovery();
    if (this.modalReportsHistory && !this.modalReportsHistory.hidden) this.closeModal(this.modalReportsHistory);
    hide(this.btnRetryFailed);

    if (mode === 'schedule' && c.scheduledFor > Date.now()) {
      cm.log('info', 'schedule_rearmed', `Schedule re-armed after the page was reloaded. Starts ${new Date(c.scheduledFor).toLocaleString()}.`);
      await cm.schedule(new Date(c.scheduledFor));
      this.toast(`Schedule re-armed for ${new Date(c.scheduledFor).toLocaleString()}. Keep this page open.`, 'ok');
      return;
    }

    cm.log('info', 'resume_requested', verdict.active
      ? 'Resume chosen after the page was reloaded. Watching the batch the server is sending, then continuing.'
      : verdict.kind === 'schedule_lost' ? 'Send now chosen for a schedule that was lost in a page reload.' : 'Resume chosen after the page was reloaded.');
    this.toggleMonitorDrawer(true);
    this.liveMonitorDrawer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      await cm.start();
    } catch (err) {
      this.toast(`Could not resume: ${err.message}`, 'bad');
    }
  }

  // ========== Report detail summary ==========

  renderDrilldownSummary(campaign, events) {
    const cm = this.campaignManager;
    const live = campaign.id === cm.campaignId && cm.isBusy;
    const status = this.effectiveStatus(campaign);
    const totalMessages = Number(campaign.totalMessages) || Number(campaign.totalRecipients) || 0;
    const sent = live ? cm.stats.sentCount : Number(campaign.sentCount) || 0;
    const failed = live ? cm.stats.failedCount : Number(campaign.failedCount) || 0;

    if (this.drilldownCampaignTitle) this.drilldownCampaignTitle.textContent = campaign.name;
    if (this.drilldownStatusBadge) this.drilldownStatusBadge.innerHTML = this.campaignStatusBadge(status);
    if (this.drilldownSessionBadge) this.drilldownSessionBadge.textContent = campaign.sessionName || campaign.sessionId;
    if (this.drilldownMetaSubtitle) {
      const parts = [`Created ${new Date(campaign.createdAt).toLocaleString()}`];
      if (campaign.startedAt) parts.push(`started ${new Date(campaign.startedAt).toLocaleString()}`);
      if (campaign.completedAt) parts.push(`ended ${new Date(campaign.completedAt).toLocaleString()}`);
      if (campaign.options?.delayBetweenMessages) parts.push(`${(campaign.options.delayBetweenMessages / 1000).toFixed(1)} s between messages`);
      this.drilldownMetaSubtitle.textContent = parts.join(' · ');
    }

    if (this.drillKpiRecipients) this.drillKpiRecipients.textContent = (Number(campaign.totalRecipients) || 0).toLocaleString();
    if (this.drillKpiMessages) this.drillKpiMessages.textContent = totalMessages.toLocaleString();
    if (this.drillKpiSent) this.drillKpiSent.textContent = sent.toLocaleString();
    if (this.drillKpiFailed) this.drillKpiFailed.textContent = failed.toLocaleString();
    if (this.drillKpiPending) this.drillKpiPending.textContent = Math.max(0, totalMessages - sent - failed).toLocaleString();

    const open = !live && OPEN_CAMPAIGN_STATES.includes(campaign.status);
    const note = live
      ? (cm.state === 'scheduled' ? 'Scheduled from this page. It starts automatically while this page stays open.' : 'Sending from this page right now. Figures update as each batch finishes.')
      : campaign.statusNote || {
        completed: 'Finished.',
        cancelled: 'Cancelled. Messages already sent were not recalled.',
        stopped: 'Stopped before every message was sent.',
      }[campaign.status] || '';
    if (this.drilldownNote) {
      this.drilldownNote.className = `notice compact ${open || ['stopped', 'cancelled'].includes(status) ? 'warn' : status === 'completed' ? 'ok' : 'info'}`;
      show(this.drilldownNote, Boolean(note) || open);
    }
    if (this.drilldownNoteText) this.drilldownNoteText.textContent = note || 'This campaign did not finish.';
    show(this.btnDrillResume, open && campaign.status !== 'scheduled');
    show(this.btnDrillStop, open);

    const metas = live ? cm.batches.map(b => cm.batchMeta(b)) : (campaign.batches || []);
    this.renderBatchChips(this.drillBatchStrip, this.drillBatchWrap, metas);

    const list = live ? cm.events : events;
    if (this.drilldownCountEvents) this.drilldownCountEvents.textContent = list.length.toLocaleString();
    this.renderActivityList(this.drilldownActivityList, list);
  }

  /** Keep an open report detail of the campaign this tab is sending in step with it (throttled). */
  refreshLiveDrilldown() {
    const cm = this.campaignManager;
    if (!this.modalReportsHistory || this.modalReportsHistory.hidden) return;
    if (!this.activeDrilldownCampaignId || this.activeDrilldownCampaignId !== cm.campaignId) return;
    if (this.drillRefreshTimer) return;
    this.drillRefreshTimer = setTimeout(() => {
      this.drillRefreshTimer = null;
      if (this.activeDrilldownCampaignId === cm.campaignId) this.openCampaignDrilldown(cm.campaignId, { keepView: true });
    }, 1500);
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
