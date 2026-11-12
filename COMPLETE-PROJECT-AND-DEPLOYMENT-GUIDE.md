# 🚀 OpenWA - Master Project, Setup & Deployment Guide

> **Dastavez Ka Maqsad (Document Purpose):**  
> Yeh guide is poore WhatsApp Automation & Bulk Messaging software ka **Complete Blueprint** hai. Agar aapko yeh software kisi **naye computer** par install karna ho, **naye Ngrok account/domain** se internet par live karna ho, ya koi problem troubleshoot karni ho, toh is ek file me poora process detail me diya gaya hai.

---

## 📑 Index (Table of Contents)
1. [Architecture & Project Components (Project Kaise Kaam Karta Hai)](#1-architecture--project-components)
2. [Naye Computer Par Setup Karna (Setup.exe & Wizard)](#2-naye-computer-par-setup-karna)
3. [Naye System Par Ngrok Se 100% Free Live Karna (Step-by-Step)](#3-ngrok-se-naye-system-par-online-live-karna)
4. [Windows Auto-Boot System (PC On Hote Hi Auto-Start)](#4-windows-auto-boot-system)
5. [Important Troubleshooting & Chat History Issues Solved](#5-troubleshooting--common-issues)
6. [Daily Routine & Best Practices](#6-daily-routine--best-practices)

---

## 1. Architecture & Project Components

Is software ke andar **3 main services** background me run hoti hain aur 2 databases use hote hain:

```
                      +------------------------------------------+
                      |         Internet / Mobile Device         |
                      +------------------------------------------+
                                           |
                              (Ngrok Free Live Tunnel)
                                           v
+-----------------------------------------------------------------------------------+
|                              AAPKA WINDOWS COMPUTER                                |
|                                                                                   |
|  [Port 3200] Bulk Messaging Workspace (Vite + React / HTML)                       |
|  - Campaign Builder, CSV Upload, Numbers Rotation, Report Generator               |
|                                           |                                       |
|                                           v                                       |
|  [Port 2785] OpenWA API Gateway (NestJS + Baileys / Puppeteer Engine)             |
|  - Core WhatsApp Engine, Handles Multi-Sessions, Message Queues, REST APIs        |
|  - Docs: http://127.0.0.1:2785/api/docs                                           |
|                                           ^                                       |
|                                           |                                       |
|  [Port 2886] Core Admin Dashboard (Vite + React)                                  |
|  - WhatsApp QR Scan, Sessions, API Keys, System Health & Webhooks                 |
+-----------------------------------------------------------------------------------+
```

### File & Database Locations:
* **`data/main.sqlite`**: Isme Admin API Keys aur system configuration safe rehti hai.
* **`data/.api-key`**: Current active admin key ka text backup.
* **`data/openwa.sqlite`**: WhatsApp message logs, contacts aur status ka database.
* **`data/sessions/`**: WhatsApp ke authenticated session tokens. (Yahan data safe hone se PC restart hone par **QR code dobara scan nahi karna padta**).
* **`scripts/ngrok.exe`**: Pre-bundled Ngrok tunnel client.

---

## 2. Naye Computer Par Setup Karna

Naye Windows PC (Windows 10 / 11) par software chalane ke 2 sabse aasan tareeqe hain:

### Tareeqa A: 🎯 Native Setup Wizard (`Setup.exe` / `OpenWA-Setup.exe`) - (Recommended)
Yeh 100% professional Windows wizard hai (Next > Next > Install > Finish):

1. **Folder Copy Karein:** Is poore folder (`OpenWA-main`) ko naye PC par copy karein (Jaise `D:\OpenWA` ya `C:\OpenWA`).
2. **Prerequisite Check:** Naye computer me **Node.js (v22 ya LTS)** install hona chahiye ([https://nodejs.org/](https://nodejs.org/)).
3. **`Setup.exe` par Double-Click Karein:**
   * Ek graphical installer window khulegi.
   * **Step 1 (Welcome):** "Next >" dabayein.
   * **Step 2 (Directory):** Folder path verify karein aur "Next >" dabayein.
   * **Step 3 (Options):** 
     - ✅ *Create Desktop Shortcut*
     - ✅ *Auto-Start on Windows Boot*
     - ✅ *Check Node.js & Dependencies*
   * **Step 4 (Install):** "Install" dabayein. Yeh missing files aur patches khud apply karega.
   * **Step 5 (Finish):** "Finish" dabayein.
4. Setup complete hote hi dono software tabs browser me automatically open ho jayenge!

---

### Tareeqa B: ⚡ 1-Click Console Setup (`SETUP-NEW-COMPUTER.bat`)
Agar wizard ke bajaye fast setup karna ho:
1. Naye PC par `SETUP-NEW-COMPUTER.bat` par double-click karein.
2. Yeh automatic check karega:
   - Node.js installed hai ya nahi.
   - `node_modules` installed hain ya nahi (missing hone par `npm install` khud chalayega).
   - WhatsApp Web ke sabhi patches (`patch-wwebjs-*.js`) apply karega.
   - Windows Startup Auto-Boot enable karne ka option dega (`Y/N`).
3. Setup complete hone par `START-SOFTWARE.bat` par click karke software chalu kar dein.

---

## 3. Ngrok Se Naye System Par Online Live Karna

Agar aap kisi naye computer par naya Ngrok account ya naya domain use karke software ko mobile/internet par live karna chahte hain:

### Step 1: Ngrok Par Free Account Banayein
1. Browser me open karein: **[https://ngrok.com](https://ngrok.com)**
2. Free account sign-up karein (Google account se 1 click me ho jata hai).

### Step 2: Naya Free Lifetime Domain Claim Karein
1. Ngrok Dashboard me left menu me **Cloud Edge** -> **Domains** par jayein.
2. **"Create Domain"** ya **"Claim Free Static Domain"** par click karein.
3. Ngrok aapko ek free domain dega, jaise:
   👉 `my-wa-panel-123.ngrok-free.dev`
   *(Yeh domain hamesha ke liye free rehta hai aur kabhi change nahi hota).*

### Step 3: Auth Token Copy Karein
1. Ngrok Dashboard me left menu me **Your Authtoken** par click karein.
2. Apna token copy karein (Example: `3J5tGbtw6oy2...`).

### Step 4: Naye Computer Par Auth Token Save Karein
1. Project folder me CMD ya PowerShell kholein aur command chalayein:
   ```cmd
   scripts\ngrok.exe config add-authtoken <AAPKA_NAYA_AUTHTOKEN>
   ```
   *(Yeh command aapka token `%LOCALAPPDATA%\ngrok\ngrok.yml` me permanently save kar deti hai).*

### Step 5: `START-ONLINE-TUNNEL.bat` Update Karein
1. [START-ONLINE-TUNNEL.bat](file:///d:/xampp/htdocs/openwhatsappapp/OpenWA-main/START-ONLINE-TUNNEL.bat) ko right click karke Edit karein (Notepad me).
2. Jahan purana domain likha hai (`earthy-ravioli-litmus.ngrok-free.dev`), wahan apna naya domain daal dein:
   ```bat
   start "" "%~dp0scripts\ngrok.exe" http 3200 --url=APNA-NAYA-DOMAIN.ngrok-free.dev
   start https://APNA-NAYA-DOMAIN.ngrok-free.dev
   ```
3. File save kar dein.

### Step 6: Vite Allowed Hosts Check (Already Done)
* Humne already `bulk-messaging/vite.config.js` me `allowedHosts: true` set kiya hua hai:
  ```js
  server: {
    port: 3200,
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true
  }
  ```
  Is wajah se koi bhi naya domain use karne par **"403 Blocked Host"** ka error nahi aayega!

### Step 7: Live Test Karein!
1. **[START-ONLINE-TUNNEL.bat](file:///d:/xampp/htdocs/openwhatsappapp/OpenWA-main/START-ONLINE-TUNNEL.bat)** par double click karein.
2. Yeh background me Ngrok connect karega aur browser me aapka public URL open kar dega.
3. Is link ko aap **duniya ke kisi bhi mobile ya computer** me open karke Bulk WhatsApp Messaging chala sakte hain!

---

## 4. Windows Auto-Boot System (Zero-Click Startup)

Aapko roz subah ya restart hone par kuch bhi type karne ki zaroorat nahi hai:

### Kaise Kaam Karta Hai:
1. Windows boot hote hi Startup folder me rakhi script chalegi:
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenWA-AutoStart.vbs`
2. Yeh script silently (bina kisi black console window ke) sabhi services start kar deti hai:
   - OpenWA Core Gateway: `http://localhost:2785`
   - Bulk Messaging: `http://localhost:3200`
   - Core Dashboard: `http://localhost:2886`
3. 6 seconds ke andar browser me dono URLs khul jate hain.

### Auto-Start Management Commands:
Agar kisi PC par Auto-Start check, enable ya disable karna ho:
* **Check Status:** `node scripts/setup-autostart.js status`
* **Enable Auto-Start:** `node scripts/setup-autostart.js install`
* **Disable Auto-Start:** `node scripts/setup-autostart.js remove`
* Ya phir **[START-SOFTWARE.bat](file:///d:/xampp/htdocs/openwhatsappapp/OpenWA-main/START-SOFTWARE.bat)** open karein aur key **`[A]`** dabayein.

---

## 5. Troubleshooting & Common Issues (Chat History Solution Guide)

Yeh problems hamare setup ke dauran aayi thin aur unka permanent solution yeh hai:

### Q1: Admin Login nahi ho raha / "API Key Invalid or Revoked" error aa raha hai?
* **Wajah:** Agar galti se Core Dashboard (`http://localhost:2886/`) me API key revoke ho gayi ho.
* **Solution:**
  1. Project folder me CMD kholein aur command chalayein:
     ```cmd
     node scripts\restore-key.js
     ```
     (Key `data/.api-key` se padhi jati hai. Doosri key ke liye: `node scripts\restore-key.js owa_k1_...`)
  2. Yeh script `data/main.sqlite` database me key ka status wapas `isActive = 1` kar deti hai aur `data/.api-key` me likh deti hai.
  3. Dashboard par ja kar wapas login karein, login ho jayega!
  4. Active Admin Key: `data/.api-key` file me save hai. Key ko kabhi bhi docs ya Git me na likhein.

### Q2: Cloudflare Tunnel kyun nahi chalaya?
* **Wajah:** Cloudflare Tunnel aapse personal domain khareedne (`No zones found`) ko bolta hai aur $10-$15 maangta hai.
* **Solution:** Humne **Ngrok** use kiya kyunki Ngrok 100% lifetime free permanent static domain provide karta hai bina kisi domain purchase ke.

### Q3: Ngrok link kholne par "Blocked Host" ya "403 Forbidden" error aaye toh?
* **Wajah:** Vite 6 / Vite 8 security feature anjaane domains ko block karta hai.
* **Solution:** `bulk-messaging/vite.config.js` me `allowedHosts: true` add kiya hua hai, jisse koi bhi external domain access kar sakta hai.

### Q4: Services stuck ho jayein ya port busy ho jaye toh?
* **Solution:**
  - `START-SOFTWARE.bat` run karein aur **`[R]`** dabayein (Restart All).
  - Ya command line se:
    ```powershell
    powershell -ExecutionPolicy Bypass -File scripts\openwa-service-manager.ps1 restart
    ```

---

## 6. Daily Routine & Best Practices

| Time / Action | Kya Karna Hai? |
| :--- | :--- |
| **Subah 8:00 AM (PC Turn ON)** | PC on karein. Auto-Start script khud chalegi aur browser tabs open ho jayenge. WhatsApp token pehle se save hone ki wajah se QR code dobara scan **nahi** karna padega. |
| **Campaign Run Karna** | `http://127.0.0.1:3200/` par jayein. CSV file upload karein, message draft karein aur Send Campaign click karein. |
| **Mobile Se Chalana (Online)** | `START-ONLINE-TUNNEL.bat` double click karein. Apne mobile browser me link kholein: `https://earthy-ravioli-litmus.ngrok-free.dev`. |
| **Raat 11:00 PM (PC Turn OFF)** | PC ko normal Start Menu se **Shutdown** kar dein. Saara data, reports aur session tokens hard disk me safely save rehte hain. |

---
**Guide Version:** 1.0 (2026)  
**Maintained for:** OpenWA Multi-Session WhatsApp Automation Platform
