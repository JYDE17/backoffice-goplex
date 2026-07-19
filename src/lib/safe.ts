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
// createDeposit/createBankDeposit never go through this endpoint. Comptable
// can view the safe (see canAccessPage's "coffre" entry) but can no longer
// create manual movements themselves - only admin/dev/super_admin, enforced
// here server-side (the client also hides the form, but that's UX only).
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
    const { hasAdminRights } = await import("./roles");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifie.");
    if (!hasAdminRights(user.role)) {
      throw new Error(
        "Réservé aux admins - un comptable ne peut pas ajuster le coffre manuellement.",
      );
    }

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
