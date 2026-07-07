import { createServerFn } from "@tanstack/react-start";

export const getPendingClosuresFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getPendingClosures } = await import("./deposits.server");
  return getPendingClosures();
});

export const createDepositFn = createServerFn({ method: "POST" })
  .validator((data: { bankName: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { createDeposit } = await import("./deposits.server");
    return createDeposit({ createdById: user.id, createdByName: user.displayName, bankName: data.bankName });
  });

export const getDepositFn = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getDepositById } = await import("./deposits.server");
    return getDepositById(data.id);
  });

export const getDepositsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listDeposits } = await import("./deposits.server");
  return listDeposits();
});
