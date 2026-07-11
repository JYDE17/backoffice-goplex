// Local-timezone date helpers. NEVER use new Date().toISOString().slice(0,10)
// for "today": toISOString is UTC, which rolls to tomorrow at 20:00 Quebec
// time (UTC-4) - that made evening closures query RaceFacer for the wrong
// day (all zeros). The fr-CA locale formats dates as YYYY-MM-DD.
export function localDateString(d: Date = new Date()): string {
  return d.toLocaleDateString("fr-CA");
}

// Business ("comptable") day cutoff: activity between midnight and this hour
// still belongs to the PREVIOUS business day, not the new calendar day. Two
// nights a week the site stays open past midnight, and Clover doesn't batch
// out (settle) until 4h - so a shift closed at e.g. 1h must still reconcile
// against yesterday's RaceFacer/Clover/closure data, not an empty new day.
// Exported so clover.server.ts can fetch the matching 4h-to-4h window instead
// of Clover's own midnight-to-midnight report window (its own on-screen
// report doesn't shift for the batch cutoff - ours has to, since a refund at
// 00h04 still belongs to the previous business day here).
export const BUSINESS_DAY_CUTOFF_HOUR = 4;

// The "date comptable" (accounting/business date) for a given instant - use
// this instead of localDateString() anywhere "today" means "the business day
// currently open for operations" (closures, reconciliation, session lookups).
// localDateString() itself is still correct for "date réelle" uses (export
// filenames, deposit timestamps) where the actual calendar date is wanted.
export function businessDateString(d: Date = new Date()): string {
  const shifted = new Date(d);
  if (shifted.getHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return localDateString(shifted);
}
