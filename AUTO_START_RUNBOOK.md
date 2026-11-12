# OpenWA Windows Auto-Start & Background Service Runbook

> **Target Audience:** Future AI Assistants, Developers, and System Owners.  
> **Purpose:** Explains how the automatic boot, background process management, and port routing operate on this Windows machine.

---

## 📌 Executive Summary (Kaise Kaam Karta Hai)

Aapka system is tarah configure ho chuka hai ki **jab bhi computer ON ya RESTART hoga**, aapko koi bhi command ya terminal kholne ki zarurat **nahi** padegi.

1. **System Boot / Power ON:** Windows jaise hi start hogi, Windows Startup folder se silent launcher (`OpenWA-AutoStart.vbs`) background me execute ho jata hai.
2. **Zero Popups (Silent Run):** Screen par koi black CMD window ya error popup nahi aayega; sab background me chalega.
3. **Automatic Health Check & Launch:**
   - **Port 2785 (OpenWA API Gateway):** Agar band hai, toh `node dist/main.js` start kar dega.
   - **Port 3200 (Bulk Messaging Workspace):** Agar band hai, toh `Vite (port 3200)` start kar dega.
   - **Port 2886 (Core Dashboard):** Agar band hai, toh `Vite (port 2886)` start kar dega.
4. **WhatsApp Session Reconnect:** WhatsApp ka login profile `data/sessions/` me safe rehta hai, isliye **dobara QR code scan karne ki bilkul zarurat nahi hoti**.
5. **Direct Auto-Open in Browser:** Boot hone ke 6 second ke andar aapke browser me dono tabs automatically open ho jayenge:
   - 👉 **Bulk Messaging:** `http://127.0.0.1:3200/`
   - 👉 **Core Dashboard:** `http://localhost:2886/`

---

## 📁 File Map & Important Paths

| File Path | Description |
| :--- | :--- |
| `Setup.exe` / `OpenWA-Setup.exe` | **🎯 Complete Setup Wizard (Next-Next-Finish):** Native Windows installer wizard. Kisi bhi computer par double-click karein, folder choose karein, Next-Next-Finish karein, sab automatic install ho jayega. |
| `SETUP-WIZARD.bat` | 1-Click launcher to open the Setup Wizard dialog. |
| `START-SOFTWARE.bat` | **⭐ 1-Click Master Launcher:** Double-click karte hi sabhi services start hoti hain, dono browser tabs open ho jati hain, aur auto-start register ho jata hai. |
| `SETUP-NEW-COMPUTER.bat` | Naye Computer ka console setup script. |
| `scripts\setup-autostart.js` | **Dynamic Auto-Start Engine:** Windows Startup folder me VBScript install/remove/check karta hai. |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenWA-AutoStart.vbs` | **Windows Startup Hook:** Windows boot hote hi silently run hota hai aur browser tabs open karta hai. |
| `scripts\openwa-service-manager.ps1` | **Core Controller:** Start, stop, status, aur port monitoring dynamically karta hai bina kisi hardcoded path ke. |
| `scripts\openwa-status.bat` | **1-Click Status Checker:** Double-click karke check karein kaunsi service chal rahi hai. |
| `scripts\openwa-start.bat` | **1-Click Manual Start:** Agar kabhi manually chalu karna ho. |
| `scripts\openwa-stop.bat` | **1-Click Manual Stop:** Sabhi background services ko clean band karne ke liye. |
| `data\service-api.log` | API Gateway ka console output aur error log. |
| `data\service-bulk.log` | Bulk messaging module ka log. |
| `data\service-dashboard.log` | Core dashboard module ka log. |

---

## 🌐 URLs & Ports Mapping

| Service Name | Port | Browser URL |
| :--- | :--- | :--- |
| **Bulk Messaging & Campaigns** | `3200` | [http://127.0.0.1:3200/](http://127.0.0.1:3200/) |
| **OpenWA Core Dashboard (Sessions & QR)** | `2886` | [http://localhost:2886/](http://localhost:2886/) |
| **OpenWA API Gateway & Swagger Docs** | `2785` | [http://127.0.0.1:2785/api/docs](http://127.0.0.1:2785/api/docs) |
| **Ngrok Permanent Online Access** | `Tunnel` | [https://earthy-ravioli-litmus.ngrok-free.dev](https://earthy-ravioli-litmus.ngrok-free.dev) |

---

## 💻 Dusre Computer me Install & Setup Karna (Next-Next-Finish)

Aapko koi bhi command chalane ya alag se kuch download karne ki zarurat nahi hai:

1. **Folder ya Setup Copy Karein:**
   - Naye computer par folder copy karein.
2. **`Setup.exe` (ya `OpenWA-Setup.exe`) par Double Click Karein:**
   - Ek sundar, professional Windows Setup Wizard window khulega.
   - **Step 1:** "Next >" click karein.
   - **Step 2:** Jahan bhi install karna ho (e.g. `C:\OpenWA` ya `D:\OpenWA`), path select karein ya Browse karein, fir "Next >" click karein.
   - **Step 3:** Tasks check karein (Desktop Shortcut, Windows Boot Auto-Start, Node.js auto-verify) -> "Next >".
   - **Step 4:** "Install" click karein.
   - **Step 5:** Progress bar complete hote hi "Finish" click karein.
3. **Software Ready:**
   - Desktop par shortcut ban jayega.
   - Browser me dono links automatically khul jayenge:
     - `http://127.0.0.1:3200/`
     - `http://localhost:2886/`
   - Subah PC on hone par bhi software khud chalu ho jayega!
   - Jab bhi dobara manual start karna ho, desktop icon ya `START-SOFTWARE.bat` use karein.

---

## ⏰ Daily Routine (11:00 PM Shutdown & 8:00 AM Startup)

### 1. Subah 8:00 AM (PC Turn ON)
- Computer ka power button on karein.
- Windows login hone ke 30 second me sabhi 3 services background me ready ho jayengi.
- Browser me dono tabs automatically khul jayenge:
  1. `http://127.0.0.1:3200/` (Bulk Messages bhejne ke liye)
  2. `http://localhost:2886/` (WhatsApp connect / session dekhne ke liye)
- WhatsApp apne aap phone se sync ho jayega bina dobara scan kiye!

### 2. Raat ko 11:00 PM (PC Turn OFF)
- Computer ko normal Start menu se **Shutdown** kar dein.
- Hard disk me save kiya gaya data (`data/main.sqlite`, `data/openwa.sqlite`, `data/sessions/`, IndexedDB reports) bilkul safe rahega.
