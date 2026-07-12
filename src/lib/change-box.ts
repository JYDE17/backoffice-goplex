import { createServerFn } from "@tanstack/react-start";

export const getLatestChangeBoxCountFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { getLatestChangeBoxCount } = await import("./change-box.server");
  return getLatestChangeBoxCount();
});

export const getChangeBoxCountByBankDepositFn = createServerFn({ method: "GET" })
  .validator((data: { bankDepositId: number }) => data)
  .handler(async ({ data }) => {
    const { getChangeBoxCountByBankDepositId } = await import("./change-box.server");
    return getChangeBoxCountByBankDepositId(data.bankDepositId);
  });
