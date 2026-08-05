import { createServerFn } from "@tanstack/react-start";

// Writes straight to the database (unlike ventes-resto's sync, which only
// prefills a form for review) - tips are purely informational, not tied to
// the drop box/reconciliation, so there's no risk in saving them directly.
export const syncVeloceTipsFn = createServerFn({ method: "POST" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");
    const isTest = isTestUser(user);

    const { localDateString } = await import("./dates");
    const { listVeloceTips, upsertVeloceTips } = await import("./veloce-tips.server");

    // Past days are write-once. Once a day has any tips recorded, it's locked:
    // a later re-sync can never overwrite or re-attribute it. This protects
    // against an employee switch in Veloce - reusing an old employee's id under
    // a new name makes Veloce report that day's old tips under the NEW name, so
    // a re-sync would otherwise merge/rewrite already-finalized payroll history.
    // Today stays re-syncable (still being finalized), and a past day with no
    // tips yet can still be backfilled once.
    const today = localDateString();
    if (data.date < today) {
      const existing = await listVeloceTips(data.date, data.date, isTest);
      if (existing.length > 0) {
        return { count: existing.length, locked: true as const };
      }
    }

    const { fetchVeloceTipsByEmployee } = await import("./veloce.server");
    const tips = await fetchVeloceTipsByEmployee(data.date);
    await upsertVeloceTips(data.date, tips, isTest);
    return { count: tips.length, locked: false as const };
  });

export const listVeloceTipsFn = createServerFn({ method: "GET" })
  .validator((data: { from: string; to: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listVeloceTips } = await import("./veloce-tips.server");
    return listVeloceTips(data.from, data.to, isTestUser(user));
  });
