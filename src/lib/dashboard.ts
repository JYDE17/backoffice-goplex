import { createServerFn } from "@tanstack/react-start";

export const getDashboardStatsFn = createServerFn({ method: "GET" })
  .validator((data: { today: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifie.");

    const { getDashboardStats } = await import("./dashboard.server");
    return getDashboardStats(data.today);
  });
