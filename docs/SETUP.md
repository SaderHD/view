# Setup guide (Phase 0)

Four steps get **View** running on your Android phone:

1. [Choose hosting](#1-choose-hosting)
2. [Register the app in Microsoft Entra ID](#2-register-the-app-in-microsoft-entra-id)
3. [Give GitHub the app IDs and deploy](#3-give-github-the-ids-and-deploy)
4. [Install on your phone](#4-install-on-android)

---

## 1. Choose hosting

The app is a set of static files, and any static host works. You need its final
URL **before** step 2, because Microsoft only sends sign-ins back to URLs you list.

| Option | App URL | Cost | Notes |
|--------|---------|------|-------|
| **A. GitHub Pages** (set up in this repo) | `https://saderhd.github.io/view/` | Free if the repo is **public**; a private repo needs GitHub Pro (~$4/mo) | The code has no secrets, so making it public is safe |
| **B. Cloudflare Pages** | `https://view-xxx.pages.dev/` | Free, private repo OK | Connect the repo in the Cloudflare dashboard (see below) |

> This repo is currently **private**. For option A, either make it public
> (*Settings → General → Danger Zone → Change visibility*) or upgrade to GitHub Pro.

**Option A, turn on Pages:** *Settings → Pages → Build and deployment → Source:*
**GitHub Actions**.

**Option B, Cloudflare Pages:** *Workers & Pages → Create → Pages → Connect to Git*,
pick `SaderHD/view`, and set:
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_CLIENT_ID`, `VITE_TENANT_ID` (from step 2), `BASE_PATH` = `/`

---

## 2. Register the app in Microsoft Entra ID

1. Open **https://entra.microsoft.com** and sign in with your work account.
2. Go to **Identity → Applications → App registrations → + New registration**.
   - **Name:** `View`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)*
   - **Redirect URI:** choose **Single-page application (SPA)** and enter your app URL
     from step 1, e.g. `https://saderhd.github.io/view/` (the trailing `/` matters).
   - Click **Register**.
3. On the app's **Overview** page, copy:
   - **Application (client) ID** → this is `VITE_CLIENT_ID`
   - **Directory (tenant) ID** → this is `VITE_TENANT_ID`
4. **Authentication** (left menu): under *Single-page application*, also add
   `http://localhost:5173/` so the app can be tested on a computer.
5. **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**, then add:
   - `User.Read` (usually already there)
   - `Calendars.ReadWrite`
   - `Files.ReadWrite.All`
   - `offline_access`
6. **Consent:**
   - If you see **Grant admin consent for <your company>** and you're allowed to
     click it, do. All rows should show a green check.
   - If you can't, that's fine. You'll be asked to approve on first sign-in.
     If the sign-in instead says **"Need admin approval"**, send IT this:

     > Please grant admin consent for the app registration "View"
     > (client ID `<paste ID>`) for delegated Microsoft Graph permissions
     > User.Read, Calendars.ReadWrite, Files.ReadWrite.All and offline_access.
     > It's a personal productivity app that only accesses my own calendar and OneDrive.

No client secret or certificate is needed. Don't create one.

---

## 3. Give GitHub the IDs and deploy

In the repo, open **Settings → Secrets and variables → Actions → Variables tab →
New repository variable** and add:

| Name | Value |
|------|-------|
| `VITE_CLIENT_ID` | Application (client) ID |
| `VITE_TENANT_ID` | Directory (tenant) ID |
| `PAGES_ENABLED` | `true` (only for option A, once Pages is turned on) |

Then go to **Actions → Build & deploy → Run workflow** (or push to `main`).
When it finishes, open the app URL. You should see **Sign in with Microsoft**.

---

## 4. Install on Android

1. Open the app URL in **Chrome** on your phone.
2. Tap **Sign in with Microsoft** and sign in with your work account.
   Approve the permissions if asked.
3. The home screen runs a connection check. **Profile**, **Outlook calendar**
   and **OneDrive** should all show a green ✓.
4. Tap Chrome's **⋮ menu → Add to Home screen → Install**.
   **View** now has its own icon and opens full-screen.

Updates install automatically the next time you open the app after a deploy.

---

## Troubleshooting

| What you see | Fix |
|--------------|-----|
| "Almost there", app registration missing | `VITE_CLIENT_ID` / `VITE_TENANT_ID` weren't set when it was built. Add the variables (step 3) and re-run the workflow. |
| `AADSTS50011` redirect URI mismatch | The URL in the browser doesn't exactly match a SPA redirect URI in Entra (check `https`, the `/view/` path, and the trailing slash). |
| `AADSTS65001` / "Need admin approval" | Your tenant blocks user consent. Send IT the request in step 2.6. |
| `AADSTS53003` / blocked by Conditional Access | Company policy blocks this device or browser. Ask IT to allow the "View" app or your phone. |
| A row shows ✕ "Access denied" | That permission wasn't granted. Check API permissions in Entra and grant consent, then **Sign out → Sign in**. |
| Deploy job skipped | Set the `PAGES_ENABLED` variable to `true` after turning on Pages. |

---

## Running locally (optional, on a computer)

```bash
cp .env.example .env.local   # then fill in the two IDs
npm install
npm run dev                  # http://localhost:5173/
```
