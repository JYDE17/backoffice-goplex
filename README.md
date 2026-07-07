# BackOffice

TanStack Start app for daily cash closing, bank deposits, safe, and history at Goplex Brossard.

## RaceFacer sales sync

`/fermeture` pulls the RaceFacer **Sales Summary Report** (Cash / POS terminal totals per station) to pre-fill the "RaceFacer — montants supposés" fields, instead of manual entry.

**Important: this only works on a machine with network access to `racefacer.brossard.goplex.ca`.** That domain is reachable only from the site's local network. The app's server process (the part that talks to RaceFacer) must run on **POS 4** at the Brossard site — not on a developer's personal/remote machine, even one used to edit this code (e.g. via Claude Code). A dev machine that isn't on that local network cannot reach RaceFacer at all, regardless of what's in `.env`.

### Setup (on POS 4)

1. Get this project's code onto POS 4 (git clone/pull, or copy the folder).
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase dashboard for project `avkakvoinkuseseqkigm` (GoplexLaserTag) → Project Settings → API → `service_role` key. Keep this secret; it bypasses row-level security.
   - `RACEFACER_USERNAME` / `RACEFACER_PASSWORD` — a RaceFacer admin login with access to Rapports → Other Reports.
4. For a quick manual test: `bun run dev` on POS 4. For always-on production use, see below.

### Running at all times on POS 4 (survives reboots, restarts on crash)

The default `bun run build` targets Cloudflare Workers (see `vite.config.ts` / `nitro`'s zero-config target detection) — that build can't reach RaceFacer even on POS 4. Use the Node-server build instead:

- `bun run build:node-server` — builds a plain Node server into `.output/server/index.mjs`.
- `bun run start` — runs it (`node .output/server/index.mjs`), default port 3000 (override with `PORT` in `.env`).

To keep it running permanently as a Windows service that starts at boot and auto-restarts on crash, run **as Administrator on POS 4**, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\install-windows-service.ps1
```

This registers a Scheduled Task (`VisionCaisseBackoffice`) that builds the app, starts it at system startup, and restarts it automatically if it crashes. See `deploy/install-windows-service.ps1` for how to check status or uninstall it.

### How it works

- `src/lib/racefacer.server.ts` logs into RaceFacer (`/fr/auth/login`, form-based with CSRF token) and calls the same JSON endpoint the admin UI uses (`/ajax/reports/others/sales-summary-report`).
- `src/lib/supabase.server.ts` upserts the per-station tender breakdown into `backoffice_racefacer_sales_reports` (Supabase project `avkakvoinkuseseqkigm`, table is dedicated to this app — other tables in that project belong to the GoplexLaserTag app).
- `src/lib/racefacer-sync.ts` exposes two TanStack Start server functions consumed by `/fermeture`: `syncRaceFacerSales` (fetch + store) and `getRaceFacerSales` (read stored data).
- All RaceFacer/Supabase calls run server-side only — credentials never reach the browser.
