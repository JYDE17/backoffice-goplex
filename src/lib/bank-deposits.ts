import { createServerFn } from "@tanstack/react-start";

export const createBankDepositFn = createServerFn({ method: "POST" })
  .validator((data: { amount: number; bankName: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { createBankDeposit } = await import("./bank-deposits.server");
    return createBankDeposit({
      amount: data.amount,
      bankName: data.bankName,
      createdById: user.id,
      createdByName: user.displayName,
      isTest: isTestUser(user),
    });
  });

export const getBankDepositFn = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getBankDepositById } = await import("./bank-deposits.server");
    return getBankDepositById(data.id);
  });

export const getBankDepositsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { listBankDeposits } = await import("./bank-deposits.server");
  return listBankDeposits(isTestUser(user));
});
