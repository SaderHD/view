# View — Project Plan

A personal, calendar-first organization app for Android. It runs on top of your
**Outlook calendar** and **OneDrive** (personal Microsoft account, @outlook.com). You tap a
date, see the jobs on it, open a job's folder of reports, receipts and photos,
and upload new files from your phone straight to OneDrive. You can type in a new
job and the app finds the best open slots based on the work hours you've set
for that week.

This app is for one user and won't go on the Play Store. It's an installable
web app (PWA) that lives on your home screen.

---

## 1. Goals

| # | Goal | Notes |
|---|------|-------|
| G1 | See the full Outlook calendar on the phone | Month / week / day / agenda views, two-way sync |
| G2 | Each job is a calendar event with its own OneDrive folder | Tap a date → tap a job → see its files |
| G3 | Attach existing OneDrive files/folders to a job | Browse OneDrive in the app and link |
| G4 | Upload from the phone to the job folder | Camera, gallery, files, and Android's "Share" menu |
| G5 | Set work hours, which can differ week to week | A default weekly template plus per-week overrides |
| G6 | Type in a job and auto-schedule it | Finds the best open slots within your work hours |
| G7 | Search everything | Jobs, dates, customers/locations, file names |

**Not in scope (for now):** multi-user support, Play Store release, invoicing or
accounting, and offline editing of calendar events (offline *viewing* and queued
uploads are in scope).

---

## 2. Architecture

```
┌──────────────────────────────┐
│  Android phone                │
│  "View" PWA (home-screen app) │
│  ┌────────────────────────┐   │        ┌──────────────────────────────┐
│  │ React UI               │   │  HTTPS │  Microsoft Graph API         │
│  │ MSAL (sign-in/tokens)  │───┼───────▶│  • Outlook calendar (events) │
│  │ IndexedDB cache/queue  │   │        │  • OneDrive (files/folders)  │
│  │ Service worker         │   │        │  • Event extensions (links)  │
│  └────────────────────────┘   │        └──────────────────────────────┘
└──────────────────────────────┘
          ▲ static files only
┌──────────────────────────────┐
│  Static hosting               │
│  (GitHub Pages / Cloudflare)  │
└──────────────────────────────┘
```

- **No backend server and no separate database.** The phone talks directly to
  Microsoft, so your data stays in your Microsoft 365 tenant.
- **Where things are stored:**
  - Jobs are Outlook calendar events.
  - Job-to-folder links are stored as a hidden *open extension* on each event
    (`com.saderhd.view.job`). The OneDrive folder link is also written into the
    event body so you can still find it from regular Outlook.
  - Files go in OneDrive under `View/Jobs/…`.
  - Settings and work hours are stored in a JSON file in OneDrive
    (`View/view-settings.json`), so they survive reinstalling the app or
    changing phones.

### Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript | Catches mistakes early, easier to maintain |
| UI framework | React + Vite | Fast, well supported |
| PWA | `vite-plugin-pwa` (Workbox) | Installable app, offline shell, share target |
| Auth | `@azure/msal-browser` (+ `@azure/msal-react`) | Microsoft's official sign-in library (Auth Code + PKCE) |
| API client | `@microsoft/microsoft-graph-client` or a thin `fetch` wrapper | Calls Graph |
| Calendar UI | FullCalendar (MIT core: daygrid, timegrid, list) | Mature, touch-friendly calendar views |
| Local storage | IndexedDB (via `idb`) | Offline cache and upload queue |
| Styling | Tailwind CSS | Quick to build a mobile-first UI |
| Hosting | GitHub Pages via GitHub Actions (or Cloudflare Pages) | Free; see note in §9 |

---

## 3. Microsoft 365 / Entra ID setup (one-time)

Your Outlook is a **personal Microsoft account** (@outlook.com), so the app is
registered for *personal Microsoft accounts* and signs in through the
`consumers` endpoint. (A company Microsoft 365 account would instead use a
single-tenant registration and the directory's tenant ID; see docs/SETUP.md.)

1. Go to **https://entra.microsoft.com** → *Applications* → *App registrations* → **New registration**.
2. Fill in:
   - **Name:** `View`
   - **Supported account types:** *Personal Microsoft accounts only*
   - **Redirect URI:** platform **Single-page application (SPA)**, then add:
     - `http://localhost:5173` (for development)
     - `https://saderhd.github.io/view/` (or the final hosting URL)
3. Copy the **Application (client) ID**; the tenant setting is `consumers`. These go
   in the app's config. They aren't secrets, and no client secret is needed.
4. Under **API permissions** → *Microsoft Graph* → **Delegated**, add:

   | Permission | Used for |
   |------------|----------|
   | `User.Read` | Your name and profile |
   | `Calendars.ReadWrite` | Read your calendar, create and update job events |
   | `Files.ReadWrite.All` | Browse all of your OneDrive, create folders, upload |
   | `offline_access` | Stay signed in (refresh tokens) |

   Optional, later: `Calendars.ReadWrite.Shared` (only if you want shared or
   other calendars) and `Sites.ReadWrite.All` (only if job files ever need to
   live in SharePoint or Teams sites instead of your OneDrive).
5. **Consent:** with a personal account there's no admin. You approve the
   permissions yourself the first time you sign in.

All of this happens in Microsoft's portal, not in code. I'll walk you through it
when we start Phase 1.

---

## 4. Features in detail

### 4.1 Calendar (G1)
- **Views:** month (default on the phone), week, 3-day, day, and agenda list.
- **Data:** Graph `GET /me/calendarView?startDateTime=…&endDateTime=…`, which
  correctly expands recurring events. Only the visible range (± one month) is
  fetched.
- **Sync:** pull-to-refresh, a refresh when the app opens or comes back to the
  foreground, and delta queries (`/me/calendarView/delta`) so only changes are
  downloaded.
- **Event colors:** job events, regular appointments and blocked time are
  colored differently, using Outlook categories (e.g. a `Job` category).
- **Tap a date:** a sheet slides up showing that day's jobs and appointments,
  with your work hours for the day at the top.
- **Create, edit and delete events:** title, time, location, notes, category.
  Changes go back to Outlook immediately.
- **Offline:** the last-synced calendar is cached in IndexedDB, so it can be
  viewed with no signal.

### 4.2 Jobs and job folders (G2, G3)
A **job** is a calendar event with View's extension on it:

```jsonc
// Open extension on the Outlook event: com.saderhd.view.job
{
  "jobId": "J-2026-0142",          // short human-readable ID
  "folderDriveId": "b!…",
  "folderItemId": "01ABC…",
  "folderWebUrl": "https://…-my.sharepoint.com/…",
  "status": "scheduled",            // lead | scheduled | in-progress | done | invoiced
  "customer": "Smith",
  "estimatedHours": 3,
  "tags": ["roof", "inspection"]
}
```

- **Folder convention:** `OneDrive/View/Jobs/<YYYY-MM-DD> - <Customer> - <Job title>/`
  with default subfolders `Reports/`, `Receipts/`, `Photos/` (configurable).
- **Creating a job** creates the event and the folder together and links them.
- **Link an existing folder:** browse OneDrive in the app and choose a folder to
  link to a job, without moving it.
- **Attach individual files:** pick any OneDrive file to add as a shortcut on
  the job. The links are stored in the extension, and the files stay where they
  are.
- **Job screen:** details, map link for the location, status, notes, and the
  folder contents as a grid/list with thumbnails. Tapping a file opens it in
  the OneDrive / Office app or the built-in PDF/image viewer.
- **Turn an existing appointment into a job:** this adds the extension and
  creates the folder.
- **If a job is rescheduled to another date**, the app offers to rename the
  folder so the date prefix matches.

### 4.3 Uploading from the phone (G4)
- **Upload button on every job:** take a photo (camera), pick from the gallery,
  or pick any file. Uses `<input type="file" accept="…" capture>`.
- **Android Share menu:** the PWA registers as a **Web Share Target**, so you
  can share a photo or PDF from any app → **View** → choose the job (today's
  jobs listed first) and the subfolder (Receipts, Reports, …).
- **Upload method:**
  - Files ≤ 4 MB: `PUT /me/drive/items/{folderId}:/{name}:/content`
  - Larger files (videos, big PDFs): `createUploadSession` with 5–10 MB chunks
    that resume after interruptions.
- **Offline queue:** with no signal, uploads are saved in IndexedDB and sent
  automatically when you're back online, with a status badge showing what's
  queued.
- **Smart naming (optional):** e.g. `Receipt_2026-11-24_Smith_01.jpg`.
- **Image handling:** an option to shrink large photos before uploading to save
  data (off by default for receipts so they stay sharp).

### 4.4 Work hours (G5)
Because your hours change from week to week, there are two layers:

1. **Default weekly template.** For example: Mon–Fri 7:00–15:30, Sat off, Sun off.
   Each day can have **multiple blocks** (e.g. 7:00–11:00 and 12:00–17:00) or be
   set to *off*.
2. **Per-week overrides.** A "Work Hours" screen shows a week at a time. You can:
   - change any day's hours for that week only,
   - **copy last week** or **apply a saved preset** (e.g. "Early week",
     "Long week", "Half week"),
   - mark a day as off or PTO.

```jsonc
// OneDrive: View/view-settings.json (excerpt)
{
  "defaultWeek": {
    "mon": [["07:00","15:30"]], "tue": [["07:00","15:30"]], "wed": [["07:00","15:30"]],
    "thu": [["07:00","15:30"]], "fri": [["07:00","15:30"]], "sat": [], "sun": []
  },
  "presets": {
    "Long week": { "mon": [["06:00","18:00"]], "...": "..." }
  },
  "weekOverrides": {
    "2026-11-22": { "wed": [], "sat": [["08:00","12:00"]] }   // keyed by the week's Sunday
  },
  "scheduling": {
    "bufferMinutes": 30,
    "maxJobHoursPerDay": 9,
    "lookaheadDays": 21
  }
}
```

- The calendar shades time outside your work hours for each day.
- **Optional:** sync work hours to Outlook as "Working elsewhere" or "Free"
  blocks, or set Outlook's mailbox working hours, so coworkers see them too.
  Off by default.

### 4.5 Smart scheduling (G6)
**Entering a job:** a form with title, customer, location, estimated duration,
earliest start, deadline, preferred time of day (morning / afternoon / any),
whether it can be split across days, and priority.

**How the app picks slots:**
1. Get busy time: `calendarView` for the lookahead window (default 21 days).
   Events marked *Free* are ignored. Events marked *Tentative* count as busy,
   with a lower penalty.
2. Get available time: the work hours for each day (template + overrides),
   minus busy events, minus buffers before and after each event (travel/setup
   time).
3. Find candidate slots that fit the duration (or, for splittable jobs, sets of
   blocks across days that add up to it).
4. **Score** each candidate:

   | Factor | Effect |
   |--------|--------|
   | Earlier date (and before the deadline) | ＋ (anything past the deadline is excluded) |
   | Matches preferred time of day | ＋ |
   | Close to other jobs that day (same area or zip) | ＋ (less driving) |
   | Day already heavily booked | － (balances the workload) |
   | Leaves an awkward unusable gap | － |
   | Priority = urgent | Strongly weights earlier dates |

5. **Show the top 3–5 options** (e.g. *"Tue Nov 25, 8:00–11:00, morning, near
   your 12:00 job"*). Tap one to book it, which creates the event, extension and
   folder in one step.
6. **"Find me a day" from any date:** long-press a date to see what still fits
   that day.

Phase 3 starts with distance by zip code or address text. Real drive times
(through a maps API) can be added later if you want them.

**Optional add-on: plain-English job entry.** Type *"3 hr roof inspection at
412 Oak St for Smith, needs to be done before Friday, mornings"*, and an AI
model (Claude API) fills in the form for you to check. This needs an API key
and costs a few cents per use. It would also need a small serverless function
so the key isn't exposed in the app. Optional, and done last.

### 4.6 Search (G7)
- One search bar for job title, customer, location, notes, job ID and status.
- Calendar search uses Graph `$search` / `$filter` on events, plus the local
  cache for instant results.
- File search uses Graph `GET /me/drive/root/search(q='…')`, limited to
  `View/Jobs`.
- Filters: date range, status, tag.

---

## 5. Screens

1. **Sign-in:** "Sign in with Microsoft".
2. **Calendar (home):** month grid, a dot per job, shaded off-hours, floating
   **＋ New Job** button.
3. **Day sheet:** that day's work hours, a timeline of events, and job cards
   with file counts.
4. **Job detail:** info, status, map link, notes, file browser, upload button.
5. **New job / Smart schedule:** form → suggested slots → confirm.
6. **OneDrive picker:** browse folders and files to link.
7. **Work hours:** week-by-week editor, presets, default template.
8. **Upload queue:** pending and failed uploads, retry.
9. **Search.**
10. **Settings:** folder naming, subfolders, buffers, lookahead, time zone,
    sign out.

---

## 6. Repo layout (planned)

```
view/
├─ PLAN.md                 ← this file
├─ README.md
├─ index.html
├─ vite.config.ts          (PWA manifest + share target)
├─ public/                 (icons, manifest assets)
├─ src/
│  ├─ main.tsx
│  ├─ config.ts            (client ID, tenant ID, redirect URI)
│  ├─ auth/                (MSAL setup, token helpers)
│  ├─ graph/               (calendar.ts, drive.ts, extensions.ts, upload.ts)
│  ├─ scheduling/          (availability.ts, scorer.ts, workHours.ts + tests)
│  ├─ storage/             (IndexedDB cache, upload queue)
│  ├─ components/
│  ├─ screens/
│  └─ sw/                  (service worker: share target, background sync)
├─ tests/
└─ .github/workflows/deploy.yml
```

---

## 7. Phases and milestones

### Phase 0: Setup
Step-by-step instructions: [docs/SETUP.md](docs/SETUP.md).

- [x] Register the app in Entra ID (§3), get admin consent if needed
- [x] Scaffold the Vite + React + TS + PWA project
- [x] GitHub Actions build/deploy workflow
- [x] Hosting: GitHub Pages at https://saderhd.github.io/view/
- [x] Sign-in screen + connection check (profile, calendar, OneDrive)
- [x] Install on Android (Chrome → ⋮ → *Install app*)

### Phase 1: Calendar
- [x] Microsoft sign-in (MSAL, redirect flow, stays signed in)
- [x] Month / week / 3-day / day / list views from `calendarView`
- [x] Day sheet when a date is tapped
- [x] Create / edit / delete events → Outlook (other people's meetings are read-only;
      repeating events edit one occurrence)
- [x] Offline cache (IndexedDB) + refresh button + auto-refresh on app open / reconnect
- [x] Swipe left/right to change month/week/day; Android Back closes sheets
- [ ] Delta sync (`calendarView/delta`), deferred because a full refresh of the
      visible range is one request and fast enough for now
- **Milestone:** your real Outlook calendar on your phone, editable.

### Phase 2: Jobs, folders and uploads
- [x] Job model (event + open extension `com.saderhd.view.job`), `Job` category, job ID, customer, status
- [x] Auto-create job folders (`View/Jobs/<date> - <customer> - <title>`) with Reports / Receipts / Photos
- [x] "Make this a job" on any of your events, or "This is a job" when creating one
- [x] OneDrive browser/picker with search; link an existing folder as the job folder; attach extra files
- [x] Job files screen: subfolders, thumbnails, open in OneDrive/Office, new folder
- [x] Upload from camera (auto-named `Photo_<date>_<time>`), gallery and files; files over 4 MB go up in resumable 5 MB chunks
- [x] Android Share-to-View (Web Share Target): pick the job and subfolder for shared files
- [x] Offline upload queue (saved on the phone, sent when back online, retry/remove failed uploads)
- **Milestone:** tap a date → job → see and add files, all saved in OneDrive.

### Phase 3: Work hours and smart scheduling
- [x] Settings file in OneDrive (`View/view-settings.json`), cached on the phone, synced when back online
- [x] Default weekly template (split shifts allowed) + per-week overrides + presets + "copy last week" + reset
- [x] Scheduling rules: buffer around appointments, max job hours per day, look-ahead days
- [x] Off-hours and days-off shading on the calendar
- [x] Availability engine + scorer (`src/schedule/`, 22 unit tests, run in CI)
- [x] "Schedule a job" → ranked suggestions with reasons → one-tap booking (event + job folder);
      long jobs can be split across days (one shared job folder)
- [x] Day sheet shows that day's hours and open time, with "Schedule job" for that date
- **Milestone:** type a job, get the best open times based on that week's hours.

### Phase 4: Search and polish
- [x] Unified search: title, customer, address, notes, job number, status (six months back to a year ahead,
      searched on the phone so it also works offline) plus OneDrive file search (job folders or all OneDrive)
- [x] Job list ("All jobs") with status and upcoming/past filters; done/invoiced jobs show ✓ on the calendar
- [x] Moving a job to another date offers to rename its folder's date prefix
- [x] Dark mode, haptic feedback on key actions
- [x] Speed: libraries split into separately cached files (app code ~48 KB), rarely used screens load on demand,
      early connection to Microsoft servers
- **Milestone:** find any job, customer or file in a couple of taps.

### Phase 5: Optional add-ons
- [ ] Plain-English job entry (Claude API via a small serverless function)
- [ ] Real drive times between jobs (maps API)
- [ ] Push notification reminders for upcoming jobs
- [ ] Daily summary ("3 jobs today, 2 receipts not uploaded yet")

---

## 8. Security and privacy

- Sign-in uses Microsoft's standard OAuth (Auth Code + PKCE). The app never
  sees your password.
- There are no secrets in the code. The client and tenant IDs are public
  identifiers by design.
- Tokens are stored on the phone only (MSAL cache) and refreshed automatically.
- No third-party servers. Everything goes phone ↔ Microsoft (except the
  optional AI add-on, which would go through a function you control).
- Only the account types the app registration allows can sign in (personal Microsoft accounts).

---

## 9. Decisions and open questions

| Topic | Decision / question |
|-------|---------------------|
| Hosting | **GitHub Pages on a free plan requires the repo to be public.** The code contains no secrets, so a public repo is safe. If you'd rather keep it private, use **Cloudflare Pages** (free, works with private repos) or GitHub Pro. → *Pick one before Phase 0.* |
| Account type | Personal Microsoft account (@outlook.com) → registration for *Personal Microsoft accounts only*, `VITE_TENANT_ID=consumers`. |
| Where job files live | Default: your OneDrive under `View/Jobs`. If your team keeps job files in a shared SharePoint or Teams library, that can be supported instead. → *Confirm.* |
| Folder naming | Default `YYYY-MM-DD - Customer - Title`. → *Change if you have an existing convention.* |
| Which calendar | Default: your primary Outlook calendar. Other or shared calendars can be added. |
| Time zone | Taken from your Outlook mailbox settings; can be overridden in Settings. |

---

## 10. Next step

Do Phase 0: register the app in Entra ID together, pick the hosting option, and
scaffold the project so a "Sign in with Microsoft" screen is running on your
phone.
