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

`/fermeture` re-syncs RaceFacer and Clover a second time right at submit, not just on page mount. A POS terminal's browser tab can sit open on this page for hours across a shift change; without this, submitting would compute the delta against whichever "last closure" existed when the page happened to load — which, if an earlier employee's closure was created *after* that mount, doesn't include it, and the later closure ends up reproducing that earlier closure's own écart instead of a real delta since the last one.

**Saisie manuelle** — accounts with the `super_admin` role (see roles.ts — deliberately not a regular admin capability, and not offered on the `/employes` add-employee form; only ever set directly in the database) get a "Saisie manuelle" toggle on `/fermeture` that skips RaceFacer/Clover entirely and lets the four figures (Cash RaceFacer, POS Terminal RaceFacer, Vente Clover, Remboursement Clover) be typed in directly from the operator's own records — for catching up closures from before this integration existed, or when the sync itself is untrustworthy. The typed values are treated as deltas (same meaning as the auto-synced fields); `getLastClosureSnapshot` (`src/lib/closures.ts`) turns them back into the cumulative snapshot the *next* closure's delta needs, so manual and synced closures chain together correctly.

**Aucun tiroir-caisse** — a superviseur sometimes runs card-only Clover sales on a POS with no cash drawer at all (no CSR session ever opened for it). The Clover/RaceFacer deltas above still work fine either way (they key off the last *closure* for that station, not a CSR session), but the usual fond de caisse subtraction would otherwise manufacture a fake cash écart every time. The "Aucun tiroir-caisse pour cette fermeture" switch on `/fermeture` sets that one closure's `fondCaisse` to 0 instead of the global setting.

**Annuler une fermeture** — any superviseur/admin can cancel a closure from `/rapport/$id` ("Annuler la fermeture"): deletes the closure and, if it came from a reconciled CSR session, puts that session back into the pending-reconciliation queue (`cancelClosureFn` in `src/lib/closures.ts`).

**Écart (Oui/Non)** — `/fermeture` shows a compact "Écart" card with a binary Oui/Non badge (green Non / red Oui) plus the montant, for both cash and POS Terminal — separate from the existing `SummaryCard`s above it, which show the amount with a three-tier success/warning/destructive tone tied to `ecartThreshold`. The badge only answers "is there an écart at all" (`amount !== 0`), matching the old écart tab's simpler yes/no framing.

**Le dépôt (`depositAmount`) est verrouillé au cash attendu (RaceFacer), pas au cash compté** — the till is reconciled against RaceFacer as the system of record; any discrepancy between what was physically counted and what RaceFacer expected is tracked as `ecartCash`, not silently absorbed into what actually gets carried to the drop box/deposited. This means "Restant caisse" on `/fermeture` can go negative (shown in red) if the physical count comes up short of what RaceFacer expects — that's a real shortfall to flag/investigate, not hidden by clamping to zero the way historical reports/receipts still do for display purposes (`Math.max(0, cashHorsFond - depositAmount)` in `receipt-html.ts`/`rapport.$id.tsx`, unchanged — those are past-tense views of an already-decided number).

## Double verification (drop box → safe, safe → bank)

Both money-transfer steps — `/recuperation` (drop box into the safe) and `/depots` (safe out to the bank) — require typing the transferred amount twice (must match) plus the name of a second person who verified the count, before the "Confirmer" button is enabled. The server re-checks both on submit (`createDeposit` in `src/lib/deposits.server.ts`, `createBankDeposit` in `src/lib/bank-deposits.server.ts`) — a stale or tampered client can't sweep the drop box, or move cash out of the safe, without both numbers actually matching. The second person's name is stored as `verified_by_name` alongside the existing `created_by_name` and shown on every receipt/report for that deposit.

Karting and the restaurant have their own separate physical drop boxes, picked up independently (see "Ventes resto (Véloce)" below), so `/recuperation` has two parallel sections — each with its own "Boîte à dépôt en cours" card (running total + date range currently sitting in that box) and its own double-verification confirmation form — even though both recuperations add to the same coffre-fort. `backoffice_deposits.source` (`"karting"` | `"resto"`) tags which drop box a given recuperation came from.

The sidebar's Coffre-fort group is ordered to match the actual money flow: **Récupération** (drop box → safe) → **Action bancaire (coffre-fort)** (`/coffre` — manual safe adjustment, exceptional use only) → **Dépôt bancaire** (safe → bank).

## Bank deposit denomination count + change box

`/depots` no longer takes a typed lump-sum amount. Instead, "Sommaire du dépôt" counts every bill/coin going to the bank one denomination at a time (same `DenomList` component as `/fermeture`'s physical count) and the deposit amount is *derived* from that count (`bankDepositAmount` in `src/lib/denominations.ts`) — the server recomputes it independently on submit and rejects anything that doesn't match, so a stale client can't sneak in a different total. The breakdown is stored on `backoffice_bank_deposits.counts` (jsonb) and shown on that deposit's receipt/PDF.

"Boîte de change" tracks the site's $500 on-site change float (`CHANGE_BOX_ITEMS` in `src/lib/denominations.ts` — mirrors the paper form: $5 bills plus rolls of toonies/loonies/quarters/dimes/nickels, each with an ideal quantity that sums to $500). Every real bank deposit records a count of what's currently in the box (`backoffice_change_box_counts`, linked to the bank deposit that triggered it) so the shortfall vs the ideal quantity — "à recevoir de la banque" — can be requested from BMO on that same trip, and the count history can be tracked over time. `/depots` shows the most recent count as a quick reference before starting a new one.

## Ventes resto (Véloce)

Véloce is the restaurant's own POS — an entirely separate system from RaceFacer/Clover. Its daily totals are broken out as its own category everywhere (dashboard "Ventes resto" card, Ventes quotidiennes — with the Cash/Carte split shown, Rapport mensuel — combined total) rather than folded into "Ventes en ligne" or "Ventes du jour", since it's not karting/laser tag revenue and isn't seen by RaceFacer or Clover at all.

`/ventes-resto` can either sync totals from the Véloce API (`src/lib/veloce.server.ts`) or take them by hand — one row per business date either way (`src/lib/veloce-sales.server.ts` — `backoffice_veloce_sales`, upserted so re-entering a date replaces rather than duplicates). The "Synchroniser depuis Véloce" button only does a read-only fetch and fills the input fields — nothing is written to the database until "Enregistrer tout" is clicked, so synced amounts stay reviewable/adjustable before saving.

**Véloce auth**: email + password (`VELOCE_EMAIL`/`VELOCE_PASSWORD` in `.env`, a real Véloce console account) → `POST /users/authenticate` returns a JWT, re-authenticated on every call (no caching/refresh — call volume is too low to justify the complexity). `VELOCE_LOCATION_ID` identifies Goplex Brossard's location within Véloce (`GET /locations`, not a secret).

**Cash vs Carte**: `GET /sales/tenderTypes` with `groupBy=tenderTypeName`, filtered by `from`/`to` (midnight-to-midnight in the venue's timezone, same window as Clover — see `getUtcDayRange` in `dates.ts`, shared with `clover.server.ts`). The tender type names configured in Véloce for Goplex were confirmed against a real `GET /tenderTypes` call on 2026-07-14: `COMPTANT` = Cash; `VISA`/`MASTERCARD`/`AMEX`/`INTERAC` (plus their hand-keyed "MANUEL" variants) and `DEBIT CREDIT` = Carte. Everything else (`POURBOIRE`, `SKIP`/`UBER`/`DOORDASH`, `PAIEMENT WEB`, house-account charges, gift cards, till adjustments, etc.) is excluded from both totals — it's neither physical cash in the drawer/safe nor a card sale on the site's own terminal.

**Rapports — Ventes resto (Véloce)** (`/rapports/ventes-veloce`) is a full sales report, always live — one `/sales/net` call (gross/net sales, discounts, taxes via `includeTaxSales=true`) plus one `/sales/tenderTypes` call (every configured payment method, not just Cash/Carte) per day of the selected range, via `fetchVeloceDaySummary`. Independent of whatever's been saved via `/ventes-resto` (no local table backs this report, by design) — it also keeps the narrower Cash/Carte-by-day table from `fetchVeloceSalesByTenderType`, since that's the slice actually used for the drop-box reconciliation flow. **Rapports — Pourboires** (`/rapports/pourboires`) works differently: `/sales/tenderTypes` can't group by employee (only `location`/`date`/`revenueCenter`/`tenderTypeName`), so tips instead come from `GET /sales/net?groupBy=employeeName` (each employee group's `tips` field, via `fetchVeloceTipsByEmployee`) — and since a real report needs history across days, results get saved into their own table (`backoffice_veloce_tips`, `veloce-tips.server.ts`) via a "Synchroniser la période" button, rather than re-fetched live on every view like the sales report. The detail table can group by day or by week (same grouping logic as `rapports/hebdomadaire.tsx`). Tips are purely informational (a payroll lookup) — they never touch the drop box/deposit reconciliation the way Cash sales do.

Both reports use a shared `DateRangePicker` (`src/components/date-range-picker.tsx`) — manual "du/au" entry plus quick presets (Aujourd'hui/Hier/7 derniers jours/30 derniers jours/Ce mois-ci/Mois dernier), matching the style of Véloce's own native reports, instead of a single-month dropdown.

**"GOPLEX" in the tips report isn't an employee** — it's the code Véloce uses for tips left on group/party bookings with no server assigned (it's literally the location's own name). It's excluded from the per-employee table/totals (payroll needs that list to only contain real employees) and shown as its own separate "Pourboire groupe" total instead.

**GOPLEX's amount is derived, not read directly** — `/sales/net`'s per-employee `tips` field is documented by Véloce as always non-negative (`minimum: 0`), so it can't reflect a negative correction the way `/sales/tenderTypes`' `POURBOIRE` line can. Confirmed empirically on 2026-07-09 (a day with a duplicate-tip correction): the raw GOPLEX value came back as exactly double the true amount. `fetchVeloceTipsByEmployee` (`veloce.server.ts`) works around this by computing GOPLEX's figure instead of trusting it: `abs(that day's POURBOIRE total from /sales/tenderTypes) − (sum of that day's real employees' tips from /sales/net)` — the real per-employee tips held up as reliable, and this subtraction reproduced the true corrected figure (831.41$, confirmed against Véloce's own native "Tender types" screen) exactly.

Whoever reconciles the *restaurant's own* drop box also picks up Véloce's paper sales slips at the same time, so `/ventes-resto` shows one row per day since the *last resto recuperation specifically* (`getVeloceSalesSinceLastRecuperation`, which looks at the most recent `backoffice_deposits` row with `source = 'resto'`) rather than just today — a single "Enregistrer tout" saves the whole catch-up batch at once instead of forcing a page reload per day.

Véloce's restaurant cash goes into its own drop box (not karting's), so it chains into `/recuperation`'s resto section the same way `backoffice_closures` chains into the karting section: `backoffice_veloce_sales.deposit_id` starts null ("pending", still in the resto drop box) and gets set to that resto recuperation's id once it's swept up (`getPendingVeloceSales`/`linkVeloceSalesToDeposit` in `veloce-sales.server.ts`). A "karting" recuperation only ever sweeps closures; a "resto" recuperation only ever sweeps Véloce cash — never both at once. Only the Cash portion counts — Carte never touches a drop box. The resulting récupération's receipt (`/rapport-depot/$id`) shows whichever of closures/Véloce days applies to that recuperation.

Before a resto recuperation can go through, every pending day must be individually confirmed: the "Cash resto en attente" table on `/recuperation` shows each day's *montant supposé* (Véloce's own `cashAmount`, already synced/saved via `/ventes-resto`) next to an editable *montant réel* (a physical count of that day's cash, prefilled from the supposed amount) and a per-row "Confirmer" button (`confirmVeloceSaleFn` → `confirmVeloceSale` in `veloce-sales.server.ts`, storing `confirmed_amount`/`confirmed_by_name`/`confirmed_at`). The écart between the two shows inline as a green "Aucun" or red amount badge. `ConfirmTransferForm`'s resto instance stays disabled (with an explanatory `blockedReason` message) until every pending day has a non-null `confirmedAmount` — and once unblocked, it's the sum of those confirmed (physically counted) amounts, not the raw Véloce-reported totals, that both the running "Boîte à dépôt en cours" total and `createDeposit`'s server-side match check use. `createDeposit` itself re-guards this: it throws if any pending resto row still has a null `confirmedAmount`, so a stale client can't bypass the per-day confirmation step. Historical reports/receipts (`/rapport-depot/$id`, its PDF export, `receipt-html.ts`) show both figures side by side for the record.

## Impression & tiroir-caisse (QZ Tray)

Receipt printing (`src/lib/qz-print.ts`) goes through [QZ Tray](https://qz.io/), a small native app each POS machine runs that exposes a signed localhost WebSocket bridge — this is what lets the browser print silently to whatever printer is plugged into that specific machine, without a per-print Allow/Block dialog (see `qz-sign.ts`: requests are signed server-side so the private key never reaches the browser). The printer name is stored in that browser's `localStorage` (`backoffice-qz-printer`), not in shared Supabase settings, since every POS has its own printer. Selection/test happens on `/parametres` (dev-only).

`openCashDrawer(label?)` pops the cash drawer, which is wired through the receipt printer's port rather than being its own USB device, by calling `printReceiptHtml` with a small audit slip — since a real print job is unavoidable to trigger the pulse (see below) and paper gets used regardless, it prints "OUVERTURE TIROIR-CAISSE", an optional label (station + CSR name from `/session`, or admin name from `/parametres`), and a timestamp instead of wasting a blank strip.

RaceFacer's own `window.open_drawer` (recovered from its `pos.js`) sends two raw text macros instead (`"p\x0022"` and `"p22"`), which looked like a paperless equivalent worth copying — printer identity (`EPSON TM-T88VI Receipt`, confirmed against RaceFacer's own `data-termalprintername`) and QZ config were both matched exactly, but the macros turned out not to behave as drawer commands on this machine's print queue at all: QZ Tray resolves them successfully, yet they just sit as inert leftover data that bleeds out as garbled text prepended onto whatever prints next (confirmed by triggering a test print right after — a stray `"p22"` appeared on the receipt). RaceFacer's own `open_drawer()` is only ever called immediately before printing an actual receipt during a real cash sale, so its apparently-paperless drawer-open was likely never actually isolated from a real print job either — same underlying mechanism as here, just with the stray macro text quietly absorbed into a receipt that was printing anyway. The button is on `/session` (kiosk mode, F9) so a CSR can open the drawer without a supervisor login, and also on `/parametres` for testing.

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
5. Double verification (drop box → safe, safe → bank) needs a `verified_by_name` column on both deposit tables; the bank deposit denomination count/change box feature needs a `counts` column plus a new table:
   ```sql
   alter table backoffice_deposits add column verified_by_name text;
   alter table backoffice_bank_deposits add column verified_by_name text;
   alter table backoffice_bank_deposits add column counts jsonb;

   create table backoffice_change_box_counts (
     id bigint generated always as identity primary key,
     bank_deposit_id bigint references backoffice_bank_deposits(id),
     count_date date not null,
     counts jsonb not null,
     created_by_id text,
     created_by_name text not null,
     created_at timestamptz not null default now()
   );
   ```
6. Ventes resto (Véloce) needs its own table, split Cash/Carte, plus a `deposit_id` so its cash can chain into the recuperation flow like closures do:
   ```sql
   create table backoffice_veloce_sales (
     sale_date date not null,
     is_test boolean not null default false,
     cash_amount numeric not null default 0,
     card_amount numeric not null default 0,
     created_by_id text,
     created_by_name text not null,
     deposit_id bigint references backoffice_deposits(id),
     updated_at timestamptz not null default now(),
     primary key (sale_date, is_test)
   );
   ```
   If the table already exists from before `deposit_id` was added, just run:
   ```sql
   alter table backoffice_veloce_sales add column deposit_id bigint references backoffice_deposits(id);
   ```
7. Karting and the restaurant each have their own drop box, so `backoffice_deposits` needs a `source` column distinguishing which recuperation flow a row belongs to (existing rows default to `'karting'`, since that's the only flow that existed before):
   ```sql
   alter table backoffice_deposits add column source text not null default 'karting';
   ```
8. Per-day real-vs-supposed confirmation on the resto recuperation flow needs three more columns on `backoffice_veloce_sales`:
   ```sql
   alter table backoffice_veloce_sales
     add column confirmed_amount numeric,
     add column confirmed_by_name text,
     add column confirmed_at timestamptz;
   ```
9. For a quick manual test: `bun run dev`. For always-on production use, see below.

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
