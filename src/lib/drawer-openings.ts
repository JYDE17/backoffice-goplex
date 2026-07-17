import { createServerFn } from "@tanstack/react-start";

// Logged from the public /session kiosk (no auth, same as sessions.ts) right
// after the drawer actually pops. Always real (isTest=false) - forced here
// server-side, not trusted from the client.
export const logDrawerOpeningFn = createServerFn({ method: "POST" })
  .validator((data: { stationName: string; csrName: string }) => {
    if (!data.stationName.trim()) throw new Error("Point de vente requis.");
    if (!data.csrName.trim()) throw new Error("Nom du CSR requis.");
    return data;
  })
  .handler(async ({ data }) => {
    const { createDrawerOpening } = await import("./drawer-openings.server");
    await createDrawerOpening({ ...data, isTest: false });
    return { ok: true };
  });

export const getDrawerOpeningsFn = createServerFn({ method: "GET" })
  .validator((data: { date?: string; stationName?: string; since?: string }) => data)
  .handler(async ({ data }) => {
    const { getCurrentUser, isTestUser } = await import("./auth.server");
    const user = await getCurrentUser();
    if (!user) throw new Error("Non authentifié.");

    const { listDrawerOpenings } = await import("./drawer-openings.server");
    return listDrawerOpenings({ ...data, isTest: isTestUser(user) });
  });
