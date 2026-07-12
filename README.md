# BackOffice

TanStack Start app for daily cash closing, bank deposits, safe, and history at Goplex Brossard.

Runs on **POS 4** at the Brossard site (see below for why), accessible from every other POS on the same local network.

## RaceFacer sales sync

`/fermeture` pulls the RaceFacer **Sales Summary Report** (Cash / POS terminal totals per station) to pre-fill the "RaceFacer" fields, instead of manual entry. These fields are locked (read-only) — they're computed automatically and shouldn't be hand-edited.

**Important: this only works on a machine with network access to `racefacer.brossard.goplex.ca`.** That domain is reachable only from the site's local network. The app's server process must run on **POS 4** — not on a developer's personal/remote machine, even one used to edit this code. A dev machine that isn't on that local network cannot reach RaceFacer at all, regardless of what's in `.env`.

Since the same POS can be closed multiple times a day (different employees/shifts), both RaceFacer amounts shown for a closure (Cash and POS Terminal) are **deltas**: the cumulative total for that station/date minus whatever the previous closure of that same station already claimed — not the full day's cumulative total. Without this, a POS closed 3 times in a day would report the whole day's sales at every single closure. See `src/lib/racefacer-sync.ts` (`attachDeltas`) and `src/lib/closures.server.ts` (`getLastClosure`).

## Clover sales sync

`/fermeture` also pulls each POS's Clover terminal total directly from the Clover API (Goplex e-karting+, merchant `6KAXS6QR8SCG1`), instead of the CSR typing in what's on the terminal screen. Clover is cloud-hosted (`api.clover.com`) — unlike RaceFacer, this works from any machine with internet access, no local network required.

Clover identifies terminals by their own device UUID, not "POS 1".."POS 5", so `src/lib/clover-terminals.ts` (`CLOVER_DEVICE_POS_MAP`) maps each device id to the POS it's plugged into. To fill it in:
1. Set `CLOVER_MERCHANT_ID` / `CLOVER_API_TOKEN` in `.env` (see `.env.example` — token from the Clover merchant dashboard's API Tokens setup, **not** the Developer Dashboard sandbox).
2. Call the `listCloverDevices` server function once (`src/lib/clover-sync.ts`) to list every device with its `id`/`name`/`serial`.
3. Copy each device's `id` into `CLOVER_DEVICE_POS_MAP` next to the matching POS.

Until a device is mapped, its sales are reported back as `unmatchedDeviceIds` (surfaced as a toast on `/fermeture`) instead of being silently dropped.

The fetch window is midnight-to-midnight, matching both Clover's own on-screen report and RaceFacer's (RaceFacer only ever takes a date, never a time, and can't be shifted). Clover's window must match RaceFacer's exactly, or Écart POS becomes meaningless: anything in the gap between the two windows gets counted on one side and not the other, producing a phantom écart for money that was never actually missing. (An earlier version shifted Clover to a 4h-to-4h window to correctly attribute a 00h04 refund to the right *closure*, but that broke parity with RaceFacer, which has no equivalent shift. Revisit only once RaceFacer's own day boundary can also be confirmed to move — the merchant is evaluating changing Clover's report-generation time to 4h.)

Same reasoning as RaceFacer above: Vente/Remboursement/Montant Collecté are all **deltas** since the last closure of that POS (`src/lib/clover-sync.ts`, `attachDeltas`), using two extra columns on `backoffice_closures` (`clover_paid_cumulative`/`clover_refund_cumulative`) to remember each closure's cumulative snapshot.

**Saisie manuelle** — accounts with the `super_admin` role (see roles.ts — deliberately not a regular admin capability, and not offered on the `/employes` add-employee form; only ever set directly in the database) get a "Saisie manuelle" toggle on `/fermeture` that skips RaceFacer/Clover entirely and lets the four figures (Cash RaceFacer, POS Terminal RaceFacer, Vente Clover, Remboursement Clover) be typed in directly from the operator's own records — for catching up closures from before this integration existed, or when the sync itself is untrustworthy. The typed values are treated as deltas (same meaning as the auto-synced fields); `getLastClosureSnapshot` (`src/lib/closures.ts`) turns them back into the cumulative snapshot the *next* closure's delta needs, so manual and synced closures chain together correctly.

**Aucun tiroir-caisse** — a superviseur sometimes runs card-only Clover sales on a POS with no cash drawer at all (no CSR session ever opened for it). The Clover/RaceFacer deltas above still work fine either way (they key off the last *closure* for that station, not a CSR session), but the usual fond de caisse subtraction would otherwise manufacture a fake cash écart every time. The "Aucun tiroir-caisse pour cette fermeture" switch on `/fermeture` sets that one closure's `fondCaisse` to 0 instead of the global setting.

**Annuler une fermeture** — any superviseur/admin can cancel a closure from `/rapport/$id` ("Annuler la fermeture"): deletes the closure and, if it came from a reconciled CSR session, puts that session back into the pending-reconciliation queue (`cancelClosureFn` in `src/lib/closures.ts`).

## Auth

Employees log in with a username/password (separate from RaceFacer's own login). Two roles:
- **Superviseur** — full access to all operational pages.
- **Admin** — same, plus can add/remove employee accounts (`/employes`).

Sessions are opaque tokens in an HttpOnly cookie, stored in `backoffice_sessions`. Passwords are verified via Supabase Auth (`backoffice_employees.id` maps 1:1 to a Supabase Auth user with a synthetic `username@backoffice.internal` email — nothing is ever emailed).

## Setup (on POS 4)

1. Get this project's code onto POS 4: `git clone https://github.com/JYDE17/backoffice-goplex.git`.
2. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard, project `avkakvoinkuseseqkigm` (GoplexLaserTag) → Project Settings → API → `service_role` key. Secret — bypasses row-level security.
   - `SUPABASE_ANON_KEY` — same page, the publishable/anon key. Not secret, but still server-only in this app (used to verify employee login passwords).
   - `RACEFACER_USERNAME` / `RACEFACER_PASSWORD` — a RaceFacer admin login with access to Rapports → Other Reports.
   - `CLOVER_API_TOKEN` — from the Clover merchant dashboard (`clover.com/dashboard` → Setup → API Tokens). `CLOVER_MERCHANT_ID` is already filled in above. See "Clover sales sync" below for mapping terminals to POS.
3. Create the `backoffice_clover_sales_reports` table (Supabase dashboard → SQL Editor), same project as the other `backoffice_*` tables:
   ```sql
   create table backoffice_clover_sales_reports (
     report_date date not null,
     station_name text not null,
     device_id text not null,
     paid_total numeric not null,
     refund_total numeric not null default 0,
     payment_count integer not null,
     fetched_at timestamptz not null,
     primary key (report_date, station_name)
   );
   ```
   If the table already exists from before `refund_total` was added, just run:
   ```sql
   alter table backoffice_clover_sales_reports add column refund_total numeric not null default 0;
   ```
4. `backoffice_closures` needs two more columns, so a closure's Clover cumulative snapshot can be diffed against the next one (same trick as `rf_cash_cumulative`/`rf_pos_cumulative`):
   ```sql
   alter table backoffice_closures add column clover_paid_cumulative numeric;
   alter table backoffice_closures add column clover_refund_cumulative numeric;
   ```
5. For a quick manual test: `bun run dev`. For always-on production use, see below.

## Running at all times on POS 4 (survives reboots, restarts on crash, reachable from other POS)

The default `bun run build` targets Cloudflare Workers (see `vite.config.ts` / `nitro`'s zero-config target detection) — that build can't reach RaceFacer even on POS 4. Use the Node-server build instead:

- `bun run build:node-server` — builds a plain Node server into `.output/server/index.mjs`. Listens on all network interfaces (`0.0.0.0`), not just `localhost`.
- `bun run start` — runs it (`node .output/server/index.mjs`), default port 3000 (override with `PORT` in `.env`).

To install it as a permanent Windows service — starts at boot, restarts on crash, and opens the firewall so other POS on the network can reach it — run **as Administrator on POS 4**, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\install-windows-service.ps1
```

This registers a Scheduled Task (`BackOfficeGoplex`) and prints the URL(s) other POS should use, e.g. `http://192.168.x.x:3000`. See the script for status/uninstall commands.

### Updating POS 4 after code changes

Run **as Administrator on POS 4**, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\update.ps1
```

This pulls the latest `main`, rebuilds, and restarts the service — one command, run whenever you want to push out an update.

**Optional — check for updates automatically every hour:**

```powershell
powershell -ExecutionPolicy Bypass -File deploy\install-auto-update.ps1
```

This registers a second Scheduled Task that runs `update.ps1` hourly. It's a no-op (no rebuild, no restart, no interruption) when there's nothing new — it only rebuilds and restarts the service when `git pull` actually finds new commits. Disable it any time with `Unregister-ScheduledTask -TaskName "BackOfficeGoplex-AutoUpdate" -Confirm:$false`.

## How it works

- `src/lib/racefacer.server.ts` logs into RaceFacer (`/fr/auth/login`, form-based with CSRF token) and calls the same JSON endpoint the admin UI uses (`/ajax/reports/others/sales-summary-report`).
- `src/lib/supabase.server.ts` upserts the per-station tender breakdown into `backoffice_racefacer_sales_reports`.
- `src/lib/racefacer-sync.ts` exposes the server functions consumed by `/fermeture`: `syncRaceFacerSales` (fetch + store) and `getRaceFacerSales` (read stored data), both returning per-station deltas.
- `src/lib/clover.server.ts` calls the Clover REST API (`GET .../payments?expand=device`, `GET .../refunds?expand=payment.device`, and `GET .../credits?expand=device`) and totals successful payments (Vente) and refunds (Remboursement) per terminal for a given day; Montant Collecté = Vente − Remboursement. Refunds come from TWO different Clover resources: `/refunds` (tied to an existing payment) and `/credits` (Clover's own "Manual Refund" - a standalone refund not tied to any payment, e.g. an employee crediting back an overcharge from the terminal itself - carries `device` directly, no `payment` nesting). A merchant that only ever does manual refunds will see zero rows from `/refunds` and everything from `/credits`.
- `src/lib/clover-terminals.ts` maps each Clover device id to its POS (`CLOVER_DEVICE_POS_MAP`).
- `src/lib/clover-sync.ts` exposes `syncCloverSales` / `getCloverSales` (same shape as the RaceFacer pair) plus `listCloverDevices`, a one-off helper for discovering device ids during setup.
- `src/lib/closures.server.ts` / `src/lib/closures.ts` persist each cash closure (`backoffice_closures`) and serve `/historique`.
- `src/lib/auth.server.ts` / `src/lib/auth.ts` handle login/logout/session/employee management.
- All Supabase project data lives in project `avkakvoinkuseseqkigm` (shared with the separate GoplexLaserTag app — tables are prefixed `backoffice_` to keep them distinct).
- All RaceFacer/Supabase calls run server-side only — credentials never reach the browser.
