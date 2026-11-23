# View

A personal, calendar-first job organizer for Android, built on Outlook calendar and OneDrive (Microsoft 365) through Microsoft Graph.

- Tap a date → see jobs → open the job's OneDrive folder (reports, receipts, photos)
- Upload from the phone (camera, gallery, Share menu) straight to the job folder
- Set work hours week by week
- Type in a job and get the best open time slots

**Status:** Phase 0: Microsoft sign-in, installable app, connection check.

- **[docs/SETUP.md](docs/SETUP.md)**: get it running on your phone (start here)
- **[PLAN.md](PLAN.md)**: full plan, architecture and roadmap

## Development

```bash
cp .env.example .env.local   # add your Entra client + tenant IDs
npm install
npm run dev
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Local dev server at http://localhost:5173/ |
| `npm run build` | Type-check and build to `dist/` (`BASE_PATH=/view/` for GitHub Pages) |
| `npm run lint` | Lint |
| `node scripts/make-icons.mjs` | Regenerate PNG app icons from `public/favicon.svg` |
