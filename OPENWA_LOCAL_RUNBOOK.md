# OpenWA Local Runbook

This file is a handoff for a future AI or developer working on this local OpenWA instance.
It records the working setup and the failures already resolved. Do not put API keys, phone numbers,
QR images, or message contents in this file.

## Working local URLs

- Vite dashboard: `http://localhost:2886`
- OpenWA API: `http://localhost:2785/api`
- Swagger: `http://localhost:2785/api/docs`

## Normal startup

The root API and dashboard are separate development processes on Windows.

```powershell
# Terminal 1, project root
node dist\main.js

# Terminal 2
cd dashboard
npm run dev
```

The API's generated local configuration and session data live under `data/`. Preserve that folder:

- `data/.api-key` is the local dashboard/API bootstrap key; never print, commit, or share it.
- `data/sessions/` contains WhatsApp Web session profiles.
- `data/main.sqlite` and `data/openwa.sqlite` contain local app state.

## Resolved issues and fixes

### Dashboard shows HTTP 500 for Chats or Message Tester

**Symptom:** The session can show `ready`, but `/chats` and message sends return `500`.

**Cause found:** `whatsapp-web.js` was installed without OpenWA's required compatibility patches.
This happened after `npm ci --ignore-scripts`.

**Fix:** From the project root, apply all patches, then restart API and session:

```powershell
node scripts\patch-wwebjs-201832.js
node scripts\patch-wwebjs-newsletter-preview.js
node scripts\patch-wwebjs-status.js
node scripts\patch-wwebjs-ready-sync.js
node scripts\patch-wwebjs-participant-arity.js
node scripts\patch-wwebjs-block.js
node scripts\patch-wwebjs-group-description.js
```

After patching, stop the API and **only the OpenWA headless Chrome processes** that use the
session profile under `data/sessions/`, then start `node dist\main.js` again. Do not broadly kill
the user's normal Chrome browser.

Avoid `npm ci --ignore-scripts`. If a clean dependency install is needed, use normal `npm install`
so the `postinstall` hook can apply the patches. If npm is interrupted or leaves missing packages,
rerun the install after stopping any OpenWA Node processes that may lock `node_modules`.

### Session cannot start: browser is already running for `data/sessions/...`

**Cause:** A stale Puppeteer/Chrome process kept the WhatsApp profile directory locked after an API
restart.

**Safe fix:** Identify only `chrome.exe` processes whose command line contains the exact
`data/sessions/session-<session-name>` profile path and stop those processes. Then start the session
again from Dashboard > Sessions. Do not delete the session profile unless a fresh QR login is intended.

### Session error: `ERR_NAME_NOT_RESOLVED` or `ERR_INTERNET_DISCONNECTED`

**Cause:** The headless WhatsApp Web browser temporarily cannot reach `https://web.whatsapp.com`.

**Checks:** Confirm normal internet access and DNS resolution first:

```powershell
Resolve-DnsName web.whatsapp.com -Type A
Invoke-WebRequest https://web.whatsapp.com/ -UseBasicParsing -TimeoutSec 15
```

When both work, retry **Start** for the affected session. If it remains failed, inspect API output
and verify there is no proxy, firewall, VPN, or antivirus rule blocking the Puppeteer Chrome process.

## Safe diagnosis checklist

1. Check API listener: `Get-NetTCPConnection -LocalPort 2785 -State Listen`.
2. Use Dashboard > Sessions and confirm the session status is `ready`.
3. Verify chat loading with a read-only API request before attempting a new message.
4. Check the exact error in API logs before deleting/recreating a session.
5. Never expose the bootstrap API key in terminal output, chat, source control, or screenshots.

## Important operational notes

- WhatsApp connection can drop if internet is unstable; restarting the session is normally enough.
- Recreating/deleting a session removes its local link profile and can require scanning QR again.
- Sending a test message is an external action; confirm the recipient and content before retrying.
