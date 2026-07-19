import { createServerFn } from "@tanstack/react-start";

export const getSafeMovementsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifie.");

  const { listSafeMovements, getSafeBalance } = await import("./safe.server");
  const isTest = isTestUser(user);
  const [movements, balance] = await Promise.all([
    listSafeMovements(isTest),
    getSafeBalance(isTest),
  ]);
  return { movements, balance };
});

// Manual /coffre entry - the only caller that opts into the duplicate check
// (see createSafeMovement's checkDuplicate). Automatic movements created by
// createDeposit/createBankDeposit never go through this endpoint.
export const createSafeMovementFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      movementType: "depot" | "retrait";
      amount: number;
      reason: string;
      confirmDuplicate?: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifie.");

    const { createSafeMovement } = await import("./safe.server");
    await createSafeMovement({
      ...data,
      createdById: user.id,
      createdByName: user.displayName,
      isTest: isTestUser(user),
      checkDuplicate: true,
    });
    return { ok: true };
  });
