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
// against yesterday's closure data, not an empty new day.
// NOTE: this only governs which closure_date a session/closure is filed
// under (see fermeture.tsx). It does NOT shift the RaceFacer or Clover fetch
// windows themselves - both of those stay midnight-to-midnight, matching
// their own native reports (RaceFacer only takes a date, can't be shifted;
// see clover.server.ts for why Clover has to match it).
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

// Every calendar day from startDate through endDate, both inclusive
// (YYYY-MM-DD strings compare lexically fine). Used for catch-up entry
// forms that need one row per day in a range, e.g. Ventes resto since the
// last drop box recuperation.
export function dateRangeInclusive(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cur = startDate;
  while (cur <= endDate) {
    days.push(cur);
    const d = new Date(`${cur}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cur = localDateString(d);
  }
  return days;
}
