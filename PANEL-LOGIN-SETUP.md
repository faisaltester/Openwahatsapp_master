# WA3-style panel login setup

1. Start OpenWA normally and read the initial administrator API key from `data/.api-key`.
2. Create the first panel administrator once, replacing the values below:

```powershell
$key = (Get-Content .\data\.api-key -Raw).Trim()
$body = @{ username = 'admin'; password = 'choose-a-strong-password'; displayName = 'Administrator'; role = 'admin' } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:2785/api/panel/users -Method Post -Headers @{ 'X-API-Key' = $key } -ContentType 'application/json' -Body $body
```

3. Open the dashboard and sign in with that username and password. The login is held in an HttpOnly cookie; do not enter the OpenWA master key in the browser.
4. Create customer/reseller users through `POST /api/panel/users`, then grant their allowed WhatsApp sessions through `PUT /api/panel/users/{userId}/sessions`.

The dashboard now includes **Panel Users** (admin only) and **Credits**. Use Panel Users to create accounts and assign OpenWA WhatsApp sessions. Use Credits to add positive or negative immutable ledger entries; customers see only their own balance and history.

Panel endpoints:

```text
POST /api/panel/auth/login       POST /api/panel/auth/logout
GET  /api/panel/auth/me          GET  /api/panel/users                 (admin)
POST /api/panel/users            PUT  /api/panel/users/{userId}/sessions (admin)
GET  /api/panel/credits/me       GET  /api/panel/users/{userId}/credits  (admin)
POST /api/panel/credits          (admin)
```

Passwords are scrypt-hashed. The panel accepts passwords of three or more characters; use a longer password for public deployments. The old WA3 plain-text passwords must not be imported; issue password resets instead.

For an HTTPS deployment, add `PANEL_COOKIE_SECURE=true` to the environment. Leave it unset for the local `http://127.0.0.1` desktop installation.
