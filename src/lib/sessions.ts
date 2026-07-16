import { createServerFn } from "@tanstack/react-start";

// --- Kiosk functions: intentionally NO auth. The /session page is a
// public counting kiosk for CSRs (no employee accounts). It only exposes
// open-session state (station + who opened it) and accepts drawer counts -
// no sales figures or reports are reachable this way. Always real
// (isTest=false) - forced here server-side, not trusted from the client.

export const getOpenSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listOpenSessions } = await import("./sessions.server");
  return listOpenSessions(false);
});

export const getCsrNamesFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { fetchCloverEmployeeNames } =
    await import("./clover.server");

  return fetchCloverEmployeeNames();
});

export const openSessionFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      stationName: string;
      csrName: string;
      counts: Record<string, number>;
      total: number;
    }) => {
      if (!data.stationName.trim()) throw new Error("Point de vente requis.");
      if (!data.csrName.trim()) throw new Error("Nom requis.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { openSession } = await import("./sessions.server");
    return openSession({ ...data, isTest: false });
  });

export const closeSessionFn = createServerFn({
  method: "POST",
})
  .validator(
    (data: {
      sessionId: number;
      counts: Record<string, number>;
      total: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { closeSession } = await import("./sessions.server");

    return closeSession(data);
  });

// --- Dev-only test kiosk functions ------------------------------------------
// Mirror the public kiosk functions above but always isTest=true, gated on
// the logged-in user actually being the dev role. Lets dev exercise the
// full ouverture/fermeture flow without ever touching real CSR sessions.

export const getOpenTestSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, isTestUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user || !isTestUser(user)) throw new Error("Reserve au compte dev.");

  const { listOpenSessions } = await import("./sessions.server");
  return listOpenSessions(true);
});

export const openTestSessionFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      stationName: string;
      csrName: string;
      counts: Record<string, number>;
      total: number;
    }) => {
      if (!data.stationName.trim()) throw new Error("Point de vente requis.");
      if (!data.csrName.trim()) throw new Error("Nom requis.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user || !isTestUser(user)) throw new Error("Reserve au compte dev.");

    const { openSession } = await import("./sessions.server");
    return openSession({ ...data, isTest: true });
  });

export const closeTestSessionFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      sessionId: number;
      csrName: string;
      counts: Record<string, number>;
      total: number;
    }) => {
      if (!data.csrName.trim()) throw new Error("Nom requis.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user || !isTestUser(user)) throw new Error("Reserve au compte dev.");

    const { closeSession } = await import("./sessions.server");
    return closeSession(data);
  });

// --- Supervisor functions (authenticated) ---------------------------------

export const getSessionsForReconciliationFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listSessionsForReconciliation } = await import("./sessions.server");
    return listSessionsForReconciliation(isTestUser(user));
  },
);

export const getSessionFn = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getSessionById } = await import("./sessions.server");
    return getSessionById(data.id);
  });

export const getSessionForClosureFn = createServerFn({ method: "GET" })
  .validator((data: { closureId: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getSessionByClosureId } = await import("./sessions.server");
    return getSessionByClosureId(data.closureId);
  });

export const getSessionsForClosuresFn = createServerFn({ method: "GET" })
  .validator((data: { closureIds: number[] }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listSessionsByClosureIds } = await import("./sessions.server");
    return listSessionsByClosureIds(data.closureIds);
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
