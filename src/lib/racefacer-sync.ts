import { createServerFn } from "@tanstack/react-start";

// Fetch a fresh Sales Summary Report from RaceFacer and store it in Supabase.
// Must run on a machine with LAN access to RACEFACER_BASE_URL (see .env.example).
export const syncRaceFacerSales = createServerFn({ method: "POST" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { fetchRaceFacerSalesSummary } = await import("./racefacer.server");
    const { upsertRaceFacerSales } = await import("./supabase.server");

    const summary = await fetchRaceFacerSalesSummary(data.date);
    const rows = await upsertRaceFacerSales(data.date, summary);
    return { rows, syncedAt: new Date().toISOString() };
  });

// Read previously-synced RaceFacer data for a date without contacting RaceFacer.
export const getRaceFacerSales = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getStoredRaceFacerSales } = await import("./supabase.server");
    const rows = await getStoredRaceFacerSales(data.date);
    return { rows };
  });
