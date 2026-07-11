import { createServerFn } from "@tanstack/react-start";
import type { ClosureInput } from "./closures.server";

export const submitClosure = createServerFn({ method: "POST" })
  .validator(
    (
      data: Omit<ClosureInput, "authorizedById" | "authorizedByName" | "isTest"> & {
        // Present when this closure resolves a SPECIFIC known session (arriving
        // via /fermeture?sessionId=...) - the caller reconciles that exact
        // session itself right after this call returns (see reconcileSessionFn).
        // Must NOT also run the "absorb whatever's open" auto-close below, or a
        // closure for a past/reopened session can hijack today's real open
        // session on the same station (see closeAndReconcileOpenSession).
        sessionId?: number;
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const isTest = isTestUser(user);
    const { createClosure } = await import("./closures.server");
    const { sessionId, ...closureInput } = data;
    const id = await createClosure({
      ...closureInput,
      authorizedById: user.id,
      authorizedByName: user.displayName,
      isTest,
    });

    // A direct closure (no specific session already known) on a station with
    // an open CSR session acts as the manual end of that shift. isTest scopes
    // this to the matching test/real open session set (see sessions.server.ts)
    // - a dev test closure can only ever absorb a dev test session, never a
    // real one. Failure here shouldn't fail the closure itself.
    if (sessionId === undefined) {
      try {
        const { closeAndReconcileOpenSession } = await import("./sessions.server");
        await closeAndReconcileOpenSession({
          stationName: data.stationName,
          closureId: id,
          byName: user.displayName,
          counts: data.counts,
          total: data.cashHorsFond + data.fondCaisse,
          isTest,
        });
      } catch (error) {
        console.error("Failed to auto-close open CSR session:", error);
      }
    }

    return { ok: true, id };
  });

export const getClosures = createServerFn({ method: "GET" })
  .validator((data: { date?: string; stationName?: string; since?: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listClosures } = await import("./closures.server");
    return listClosures({ ...data, isTest: isTestUser(user) });
  });

export const getClosure = createServerFn({ method: "GET" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getClosureById } = await import("./closures.server");
    return getClosureById(data.id);
  });

// Powers manual entry on /fermeture (admin-only "no sync" override): gives
// the previous closure's cumulative snapshot for this station/date so a
// manually-typed delta can be turned back into the cumulative figure the
// NEXT closure's delta will need to chain off - same math getLastClosure
// already does for the automatic RaceFacer/Clover sync path.
export const getLastClosureSnapshot = createServerFn({ method: "GET" })
  .validator((data: { date: string; stationName: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { getLastClosure } = await import("./closures.server");
    const last = await getLastClosure(data.date, data.stationName, isTestUser(user));
    return {
      rfCashCumulative: last?.rfCashCumulative ?? 0,
      rfPosCumulative: last?.rfPosCumulative ?? 0,
      cloverPaidCumulative: last?.cloverPaidCumulative ?? 0,
      cloverRefundCumulative: last?.cloverRefundCumulative ?? 0,
    };
  });

// Cancels a closure and reopens whatever session it was reconciled from
// (back into the pending-reconciliation queue) - any authenticated
// superviseur/admin can do this, same operational access as the rest of
// /fermeture and /reconciliation. Session is detached BEFORE the closure is
// deleted (backoffice_shift_sessions.closure_id has a foreign key onto it).
export const cancelClosureFn = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { reopenSessionByClosureId } = await import("./sessions.server");
    await reopenSessionByClosureId(data.id);

    const { deleteClosure } = await import("./closures.server");
    await deleteClosure(data.id);

    return { ok: true };
  });
