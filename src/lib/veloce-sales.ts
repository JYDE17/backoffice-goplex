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

export const getPendingVeloceSalesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { getPendingVeloceSales } = await import("./veloce-sales.server");
  return getPendingVeloceSales(isTestUser(user));
});
