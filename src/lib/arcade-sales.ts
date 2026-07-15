import { createServerFn } from "@tanstack/react-start";

export const upsertArcadeSaleFn = createServerFn({ method: "POST" })
  .validator((data: { saleDate: string; cashAmount: number; cardAmount: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { upsertArcadeSale } = await import("./arcade-sales.server");
    return upsertArcadeSale({
      saleDate: data.saleDate,
      cashAmount: data.cashAmount,
      cardAmount: data.cardAmount,
      createdById: user.id,
      createdByName: user.displayName,
      isTest: isTestUser(user),
    });
  });

export const getArcadeSalesSinceLastRecuperationFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getArcadeSalesSinceLastRecuperation } = await import("./arcade-sales.server");
    return getArcadeSalesSinceLastRecuperation(isTestUser(user));
  },
);

export const getPendingArcadeSalesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { getPendingArcadeSales } = await import("./arcade-sales.server");
  return getPendingArcadeSales(isTestUser(user));
});

export const listArcadeSalesFn = createServerFn({ method: "GET" })
  .validator((data: { since: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listArcadeSales } = await import("./arcade-sales.server");
    return listArcadeSales(data.since, isTestUser(user));
  });
