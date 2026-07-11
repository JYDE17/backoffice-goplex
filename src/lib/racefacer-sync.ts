import { createServerFn } from "@tanstack/react-start";
import type { RaceFacerSalesRow } from "./supabase.server";

export type RaceFacerSalesRowWithDelta = RaceFacerSalesRow & {
  cash_delta: number;
  pos_terminal_delta: number;
};

// Both cash and POS terminal are cumulative-since-start-of-day figures (the
// drawer resets per shift, but RaceFacer's own report and the Clover
// terminal's on-screen total do not), so each closure attaches the amount
// attributable to a NEW closure only: the cumulative total minus whatever
// the last closure for that same station/date already claimed. This lets
// the same POS be closed multiple times a day (different employees/shifts)
// without double- or triple-counting the same sales in daily totals.
async function attachDeltas(
  rows: RaceFacerSalesRow[],
  date: string,
): Promise<RaceFacerSalesRowWithDelta[]> {
  const { getLastClosure } = await import("./closures.server");
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  // The dev account's test closures live in a parallel world: its deltas
  // chain off test closures only, and real accounts never chain off test
  // closures.
  const isTest = user ? isTestUser(user) : false;
  return Promise.all(
    rows.map(async (row) => {
      const last = await getLastClosure(date, row.station_name, isTest);
      return {
        ...row,
        cash_delta: row.cash_total - (last?.rfCashCumulative ?? 0),
        pos_terminal_delta: row.pos_terminal_total - (last?.rfPosCumulative ?? 0),
      };
    }),
  );
}

// Fetch a fresh Sales Summary Report from RaceFacer and store it in Supabase.
// Must run on a machine with LAN access to RACEFACER_BASE_URL (see .env.example).
export const syncRaceFacerSales = createServerFn({ method: "POST" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { fetchRaceFacerSalesSummary } = await import("./racefacer.server");
    const { upsertRaceFacerSales } = await import("./supabase.server");

    const summary = await fetchRaceFacerSalesSummary(data.date);
    const rows = await upsertRaceFacerSales(data.date, summary);
    const rowsWithDeltas = await attachDeltas(rows, data.date);
    return { rows: rowsWithDeltas, syncedAt: new Date().toISOString() };
  });

// Read previously-synced RaceFacer data for a date without contacting RaceFacer.
export const getRaceFacerSales = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getStoredRaceFacerSales } = await import("./supabase.server");
    const rows = await getStoredRaceFacerSales(data.date);
    const rowsWithDeltas = await attachDeltas(rows, data.date);
    return { rows: rowsWithDeltas };
  });
