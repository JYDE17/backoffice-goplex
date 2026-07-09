import { createServerFn } from "@tanstack/react-start";

export const getSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifie.");

  const { getSettings } = await import("./settings.server");
  return getSettings();
});

export const updateSettingsFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      fondCaisse: number;
      ecartThreshold: number;
      devise: string;
      doubleValidationCoffre: boolean;
      defaultBankName: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireDev } = await import("./auth.server");
    const user = await requireDev();

    const { updateSettings } = await import("./settings.server");
    await updateSettings({ ...data, updatedById: user.id, updatedByName: user.displayName });
    return { ok: true };
  });
