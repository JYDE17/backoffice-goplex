import { createServerFn } from "@tanstack/react-start";

export const getPendingClosuresFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { getPendingClosures } = await import("./deposits.server");
  return getPendingClosures(isTestUser(user));
});

export const createDepositFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      bankName: string;
      confirmedAmount: number;
      verifiedByName: string;
      source: "karting" | "resto";
      selectedDates?: string[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { createDeposit } = await import("./deposits.server");
    return createDeposit({
      createdById: user.id,
      createdByName: user.displayName,
      bankName: data.bankName,
      isTest: isTestUser(user),
      confirmedAmount: data.confirmedAmount,
      verifiedByName: data.verifiedByName,
      source: data.source,
      selectedDates: data.selectedDates,
    });
  });

export const getDepositFn = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getDepositById } = await import("./deposits.server");
    return getDepositById(data.id);
  });

export const getDepositsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { listDeposits } = await import("./deposits.server");
  return listDeposits(isTestUser(user));
});
