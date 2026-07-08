import { createServerFn } from "@tanstack/react-start";
import type { ClosureInput } from "./closures.server";

export const submitClosure = createServerFn({ method: "POST" })
  .validator((data: Omit<ClosureInput, "authorizedById" | "authorizedByName" | "isTest">) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { createClosure } = await import("./closures.server");
    const id = await createClosure({
      ...data,
      authorizedById: user.id,
      authorizedByName: user.displayName,
      isTest: isTestUser(user),
    });
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
