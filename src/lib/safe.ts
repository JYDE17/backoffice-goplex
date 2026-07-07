import { createServerFn } from "@tanstack/react-start";

export const getSafeMovementsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifie.");

  const { listSafeMovements, getSafeBalance } = await import("./safe.server");
  const [movements, balance] = await Promise.all([listSafeMovements(), getSafeBalance()]);
  return { movements, balance };
});

export const createSafeMovementFn = createServerFn({ method: "POST" })
  .validator((data: { movementType: "depot" | "retrait"; amount: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifie.");

    const { createSafeMovement } = await import("./safe.server");
    await createSafeMovement({ ...data, createdById: user.id, createdByName: user.displayName });
    return { ok: true };
  });
