import { createServerFn } from "@tanstack/react-start";

export const upsertVeloceSaleFn = createServerFn({ method: "POST" })
  .validator((data: { saleDate: string; cashAmount: number; cardAmount: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { upsertVeloceSale } = await import("./veloce-sales.server");
    return upsertVeloceSale({
      saleDate: data.saleDate,
      cashAmount: data.cashAmount,
      cardAmount: data.cardAmount,
      createdById: user.id,
      createdByName: user.displayName,
      isTest: isTestUser(user),
    });
  });

export const getVeloceSaleFn = createServerFn({ method: "GET" })
  .validator((data: { saleDate: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getVeloceSale } = await import("./veloce-sales.server");
    return getVeloceSale(data.saleDate, isTestUser(user));
  });

export const listVeloceSalesFn = createServerFn({ method: "GET" })
  .validator((data: { since: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listVeloceSales } = await import("./veloce-sales.server");
    return listVeloceSales(data.since, isTestUser(user));
  });

export const getVeloceSalesSinceLastRecuperationFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getVeloceSalesSinceLastRecuperation } = await import("./veloce-sales.server");
    return getVeloceSalesSinceLastRecuperation(isTestUser(user));
  },
);

// Confirms the physically-counted drop-box amount for one pending day -
// required before that day's cash can be swept into a "resto" recuperation.
export const confirmVeloceSaleFn = createServerFn({ method: "POST" })
  .validator((data: { saleDate: string; confirmedAmount: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { confirmVeloceSale } = await import("./veloce-sales.server");
    await confirmVeloceSale({
      saleDate: data.saleDate,
      isTest: isTestUser(user),
      confirmedAmount: data.confirmedAmount,
      confirmedByName: user.displayName,
    });
  });

export const getPendingVeloceSalesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { autoSyncPendingVeloceSales, getPendingVeloceSales } =
    await import("./veloce-sales.server");
  const isTest = isTestUser(user);
  await autoSyncPendingVeloceSales({ isTest, actorId: user.id, actorName: user.displayName });
  return getPendingVeloceSales(isTest);
});

// Manual "Rafraîchir" button on /recuperation - unlike the passive sync
// above (which skips already-confirmed days), this resyncs EVERY pending
// day's cashAmount from Veloce, including ones already confirmed but not yet
// swept into a deposit. Needed when a day's "montant supposé" was synced
// before Veloce had posted final numbers for that date (e.g. resto still
// open) and stayed wrong/stale forever after being confirmed, since the
// passive sync would never touch it again.
export const refreshPendingVeloceSalesFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { autoSyncPendingVeloceSales, getPendingVeloceSales } =
    await import("./veloce-sales.server");
  const isTest = isTestUser(user);
  await autoSyncPendingVeloceSales({
    isTest,
    actorId: user.id,
    actorName: user.displayName,
    includeConfirmed: true,
  });
  return getPendingVeloceSales(isTest);
});

// Pure fetch from Veloce's API - does not write to the database. The caller
// (ventes-resto.tsx) fills the same draft inputs the manual entry form uses,
// so the values still go through the normal review + "Enregistrer tout" save
// step rather than writing straight through.
export const syncVeloceSalesFn = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { fetchVeloceSalesByTenderType } = await import("./veloce.server");
    return fetchVeloceSalesByTenderType(data.date);
  });

// Full daily summary (gross/net sales, taxes, every tender type) for
// rapports/ventes-veloce.tsx - a proper report, not just the Cash/Carte
// slice used for the drop-box reconciliation flow above.
export const getVeloceDaySummaryFn = createServerFn({ method: "GET" })
  .validator((data: { date: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { fetchVeloceDaySummary } = await import("./veloce.server");
    return fetchVeloceDaySummary(data.date);
  });
