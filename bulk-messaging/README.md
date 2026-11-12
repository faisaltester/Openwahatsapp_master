# OpenWA Bulk Messaging & Campaign Module

A dedicated, isolated desktop-grade Bulk WhatsApp Campaign and Batch Sending workspace built directly on top of the **OpenWA API Gateway** (`http://localhost:2785/api`).

---

## 🛡️ Complete Isolation Guarantee

* **Zero changes to existing project code**: All new files, components, services, and parsers reside strictly inside `bulk-messaging/`.
* Does not modify or interfere with `dashboard/`, `business-dashboard/`, or the NestJS backend in `src/`.

---

## 📡 API Discovered Capabilities & Compliance

All features strictly reflect the live OpenAPI v3.0 documentation at `http://localhost:2785/api/docs#/`:

| Feature | OpenWA API Status | Implementation Details |
| :--- | :--- | :--- |
| **WhatsApp Bulk Messaging** | ✅ Supported | `POST /api/sessions/{sessionId}/messages/send-bulk` |
| **Batch Size Limit** | ✅ Supported | Max 100 messages per request (`ArrayMaxSize(100)`). Lists > 100 are automatically chunked and sequentially dispatched. |
| **Duplicate Handling** | ✅ Supported | Backend collapses exact duplicates (`first occurrence wins`). Pre-send duplicate detection & removal tool provided in UI. |
| **Speed / Delay Pacing** | ✅ Supported | `BulkMessageOptionsDto`: `delayBetweenMessages` (1,000ms–60,000ms), `randomizeDelay` (0–2s jitter), `stopOnError`. |
| **Live Batch Tracking** | ✅ Supported | `GET /api/sessions/{sessionId}/messages/batch/{batchId}` with live progress counters (`sent`, `failed`, `pending`, `cancelled`). |
| **Batch Cancellation** | ✅ Supported | `POST /api/sessions/{sessionId}/messages/batch/{batchId}/cancel`. |
| **Message Templates** | ✅ Supported | `GET` & `POST /api/sessions/{sessionId}/templates` with `{{variables}}` placeholders. |
| **Addressbook & Groups** | ✅ Supported | `GET /api/sessions/{sessionId}/contacts` and `GET /api/sessions/{sessionId}/groups`. |
| **SMS Messaging** | ❌ API Not Supported | OpenWA is exclusively a WhatsApp gateway. SMS is explicitly designated as **API Not Supported** in the UI. |
| **Campaigns & Scheduling** | ⚠️ Client-Managed | Orchestrated reliably in the browser queue with live countdown timers and retry handling. |

---

## 🚀 How to Run

### Option 1: Development Server (Port 3200)

From the `bulk-messaging` folder:

```powershell
cd d:\xampp\htdocs\openwhatsappapp\OpenWA-main\bulk-messaging
npm run dev
```

Then open your browser at:
`http://127.0.0.1:3200`

### Option 2: Direct / Any Static Server

Since all scripts, styles, and vendor libraries (`SheetJS` and `PapaParse`) are completely self-contained in `bulk-messaging/vendor/`, you can also serve this folder with any static HTTP server or reverse proxy.

---

## 📋 Features Overview

1. **Top API & Capabilities Matrix Bar**:
   - Real-time connection to `http://localhost:2785/api`.
   - Active session selector with live engine status (`ready`, `authenticated`, `scan_qr_code`).
   - Clear badges identifying supported vs unsupported API features.

2. **Column 1 — WhatsApp Numbers & Contact Import**:
   - Drag-and-drop or select Excel (`.xlsx`, `.xls`) or CSV (`.csv`, `.txt`) files.
   - 1-click **Sample Contacts** button to test immediately.
   - **Duplicate Detection & Removal Banner**: Displays total imported, duplicates, unique, and invalid numbers, with a 1-click `Remove Duplicates` action.
   - Addressbook & Groups direct import from active OpenWA session.
   - Dynamic search and filter by category (All, Unique Only, Duplicates, Invalid).

3. **Column 2 — Message Composer & Media**:
   - WhatsApp channel (active) vs SMS (disabled with "API Not Supported" badge).
   - Dynamic variable insertion (`{{name}}`, `{{number}}`, `{{var1}}`, `{{var2}}`).
   - WhatsApp formatting tools: Bold (`*`), Italic (`_`), Strikethrough (`~`), Emoji picker.
   - OpenWA Server Template integration: browse and use existing templates or create new ones.
   - Media attachments: Image, Video, Audio (with PTT Voice Note toggle), and Document (with filename and caption).

4. **Column 3 — Batch Sending & Pacing Settings**:
   - Batch size configuration (1–100, clamped to API limit).
   - Delay between messages slider (1,000ms–60,000ms) with presets (Fast, Normal, Slow, Safe).
   - Jitter (`randomizeDelay`) and error-stopping (`stopOnError`).
   - Send Now and Schedule Send with live countdown timer.

5. **Live Campaign Monitor & Export**:
   - Real-time progress bar, delivery counts (`Sent`, `Failed`, `Pending`).
   - Per-recipient results table with WhatsApp message IDs and sanitized error messages.
   - Live **Cancel Batch** and **Retry Failed** buttons.
   - CSV export for campaign audit reports.
