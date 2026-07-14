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

// Offset (ms) to add to a UTC instant to get that same instant's wall-clock
// reading in `timeZone` - used by getUtcDayRange to turn "YYYY-MM-DD" into
// the actual UTC start/end of that calendar day at a given venue, DST-safe.
function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - utcMs;
}

// Midnight-to-midnight UTC bounds of a calendar day as experienced in
// `timeZone` - used to match a third-party report window that only ever
// takes a date and can't be shifted (RaceFacer, Clover, Veloce), rather than
// BUSINESS_DAY_CUTOFF_HOUR above which only governs our own closure_date
// filing. See clover.server.ts for why Clover in particular has to stay
// midnight-to-midnight rather than shift with the cutoff.
export function getUtcDayRange(isoDate: string, timeZone: string): { start: number; end: number } {
  const naiveUtc = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  const offset = getTimeZoneOffsetMs(naiveUtc, timeZone);
  const start = naiveUtc - offset;
  return { start, end: start + 24 * 60 * 60 * 1000 };
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
