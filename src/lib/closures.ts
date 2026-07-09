import { createServerFn } from "@tanstack/react-start";
import type { ClosureInput } from "./closures.server";

export const submitClosure = createServerFn({ method: "POST" })
  .validator((data: Omit<ClosureInput, "authorizedById" | "authorizedByName" | "isTest">) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const isTest = isTestUser(user);
    const { createClosure } = await import("./closures.server");
    const id = await createClosure({
      ...data,
      authorizedById: user.id,
      authorizedByName: user.displayName,
      isTest,
    });

    // A direct closure on a station with an open CSR session acts as the
    // manual end of that shift. isTest scopes this to the matching
    // test/real open session set (see sessions.server.ts) - a dev test
    // closure can only ever absorb a dev test session, never a real one.
    // Failure here shouldn't fail the closure itself.
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
