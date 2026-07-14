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

    const { fetchVeloceTipsByEmployee } = await import("./veloce.server");
    const { upsertVeloceTips } = await import("./veloce-tips.server");

    const tips = await fetchVeloceTipsByEmployee(data.date);
    await upsertVeloceTips(data.date, tips, isTestUser(user));
    return { count: tips.length };
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
