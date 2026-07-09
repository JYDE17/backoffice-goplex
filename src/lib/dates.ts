// Local-timezone date helpers. NEVER use new Date().toISOString().slice(0,10)
// for "today": toISOString is UTC, which rolls to tomorrow at 20:00 Quebec
// time (UTC-4) - that made evening closures query RaceFacer for the wrong
// day (all zeros). The fr-CA locale formats dates as YYYY-MM-DD.
export function localDateString(d: Date = new Date()): string {
  return d.toLocaleDateString("fr-CA");
}
