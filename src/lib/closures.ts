import { createServerFn } from "@tanstack/react-start";
import type { ClosureInput } from "./closures.server";

export const submitClosure = createServerFn({ method: "POST" })
  .validator((data: ClosureInput) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { createClosure } = await import("./closures.server");
    await createClosure({ ...data, employeeId: user.id, employeeName: user.displayName });
    return { ok: true };
  });

export const getClosures = createServerFn({ method: "GET" })
  .validator((data: { date?: string; stationName?: string }) => data)
  .handler(async ({ data }) => {
    const { listClosures } = await import("./closures.server");
    return listClosures(data);
  });
