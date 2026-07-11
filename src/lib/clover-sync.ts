import { createServerFn } from "@tanstack/react-start";

// Fetch a fresh per-terminal sales report from Clover, match each device to
// its POS (see clover-terminals.ts), and store it — mirrors racefacer-sync.ts.
export const syncCloverSales = createServerFn({ method: "POST" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { fetchCloverSalesByDevice } = await import("./clover.server");
    const { upsertCloverSales } = await import("./supabase.server");

    const report = await fetchCloverSalesByDevice(data.date);
    const { rows, unmatchedDeviceIds } = await upsertCloverSales(data.date, report);
    return { rows, unmatchedDeviceIds, syncedAt: new Date().toISOString() };
  });

// Read previously-synced Clover data for a date without contacting Clover.
export const getCloverSales = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getStoredCloverSales } = await import("./supabase.server");
    const rows = await getStoredCloverSales(data.date);
    return { rows };
  });

// One-off helper for initial setup: lists every device Clover knows about for
// this merchant, so its `id` can be copied into CLOVER_DEVICE_POS_MAP.
export const listCloverDevices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCloverDevices } = await import("./clover.server");
  return { devices: await fetchCloverDevices() };
});
