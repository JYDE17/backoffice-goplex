import { createServerFn } from "@tanstack/react-start";
import type { CloverSalesRow } from "./supabase.server";

export type CloverSalesRowWithDelta = CloverSalesRow & {
  paid_delta: number;
  refund_delta: number;
  collected_delta: number;
};

// Same reasoning as racefacer-sync.ts's attachDeltas: paid_total/refund_total
// are cumulative since the start of the business day, so the same POS closed
// multiple times a day would otherwise report the whole day's Clover sales at
// EVERY closure - each closure needs just the portion since the last one.
async function attachDeltas(
  rows: CloverSalesRow[],
  date: string,
): Promise<CloverSalesRowWithDelta[]> {
  const { getLastClosure } = await import("./closures.server");
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  const isTest = user ? isTestUser(user) : false;
  return Promise.all(
    rows.map(async (row) => {
      const last = await getLastClosure(date, row.station_name, isTest);
      const paid_delta = row.paid_total - (last?.cloverPaidCumulative ?? 0);
      const refund_delta = row.refund_total - (last?.cloverRefundCumulative ?? 0);
      return {
        ...row,
        paid_delta,
        refund_delta,
        collected_delta: paid_delta - refund_delta,
      };
    }),
  );
}

// Fetch a fresh per-terminal sales report from Clover, match each device to
// its POS (see clover-terminals.ts), and store it — mirrors racefacer-sync.ts.
export const syncCloverSales = createServerFn({ method: "POST" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { fetchCloverSalesByDevice } = await import("./clover.server");
    const { upsertCloverSales } = await import("./supabase.server");

    const report = await fetchCloverSalesByDevice(data.date);
    const { rows, unmatchedDeviceIds } = await upsertCloverSales(data.date, report);
    const rowsWithDeltas = await attachDeltas(rows, data.date);
    return { rows: rowsWithDeltas, unmatchedDeviceIds, syncedAt: new Date().toISOString() };
  });

// Read previously-synced Clover data for a date without contacting Clover.
export const getCloverSales = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getStoredCloverSales } = await import("./supabase.server");
    const rows = await getStoredCloverSales(data.date);
    const rowsWithDeltas = await attachDeltas(rows, data.date);
    return { rows: rowsWithDeltas };
  });

// One-off helper for initial setup: lists every device Clover knows about for
// this merchant, so its `id` can be copied into CLOVER_DEVICE_POS_MAP.
export const listCloverDevices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCloverDevices } = await import("./clover.server");
  return { devices: await fetchCloverDevices() };
});
