import { createServerFn } from "@tanstack/react-start";

// --- Kiosk functions: intentionally NO auth. The /session page is a
// public counting kiosk for CSRs (no employee accounts). It only exposes
// open-session state (station + who opened it) and accepts drawer counts -
// no sales figures or reports are reachable this way.

export const getOpenSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listOpenSessions } = await import("./sessions.server");
  return listOpenSessions();
});

export const openSessionFn = createServerFn({ method: "POST" })
  .validator(
    (data: { stationName: string; csrName: string; counts: Record<string, number>; total: number }) => {
      if (!data.stationName.trim()) throw new Error("Point de vente requis.");
      if (!data.csrName.trim()) throw new Error("Nom requis.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { openSession } = await import("./sessions.server");
    return openSession(data);
  });

export const closeSessionFn = createServerFn({ method: "POST" })
  .validator(
    (data: { sessionId: number; csrName: string; counts: Record<string, number>; total: number }) => {
      if (!data.csrName.trim()) throw new Error("Nom requis.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { closeSession } = await import("./sessions.server");
    return closeSession(data);
  });

// --- Supervisor functions (authenticated) ---------------------------------

export const getSessionsForReconciliationFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");

  const { listSessionsForReconciliation } = await import("./sessions.server");
  return listSessionsForReconciliation();
});

export const getSessionFn = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getSessionById } = await import("./sessions.server");
    return getSessionById(data.id);
  });

export const forceCloseSessionFn = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { forceCloseSession } = await import("./sessions.server");
    await forceCloseSession(data.id, user.displayName);
    return { ok: true };
  });

export const cancelSessionFn = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { cancelSession } = await import("./sessions.server");
    await cancelSession(data.id);
    return { ok: true };
  });

export const reconcileSessionFn = createServerFn({ method: "POST" })
  .validator((data: { sessionId: number; closureId: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { markSessionReconciled } = await import("./sessions.server");
    await markSessionReconciled({ ...data, reconciledByName: user.displayName });
    return { ok: true };
  });
