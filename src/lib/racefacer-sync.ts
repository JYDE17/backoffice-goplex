import { createServerFn } from "@tanstack/react-start";
import type { RaceFacerSalesRow } from "./supabase.server";

export type RaceFacerSalesRowWithDelta = RaceFacerSalesRow & {
  cash_delta: number;
  pos_terminal_delta: number;
};

// Cash: the physical drawer only ever holds the CURRENT shift's cash (the
// previous shift's cash was counted, deposited, and removed), so we attach
// the amount attributable to a NEW closure: the RaceFacer cumulative total
// minus whatever the last closure for that same station/date already
// claimed. This lets the same POS be closed multiple times a day (different
// employees/shifts) without double-counting.
//
// POS terminal (Clover): unlike cash, the Clover terminal's own display is
// ALSO cumulative since the start of the day (it doesn't reset per shift).
// So the RaceFacer "POS terminal" figure a cashier compares against must
// stay cumulative too, not a delta - otherwise it wouldn't match what's on
// the Clover screen. Do not subtract the previous closure's snapshot here.
async function attachDeltas(
  rows: RaceFacerSalesRow[],
  date: string,
): Promise<RaceFacerSalesRowWithDelta[]> {
  const { getLastClosure } = await import("./closures.server");
  return Promise.all(
    rows.map(async (row) => {
      const last = await getLastClosure(date, row.station_name);
      return {
        ...row,
        cash_delta: row.cash_total - (last?.rfCashCumulative ?? 0),
        pos_terminal_delta: row.pos_terminal_total,
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
