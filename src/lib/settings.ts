import { createServerFn } from "@tanstack/react-start";
import type { ReceiptStyle } from "./settings.server";

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
      receiptStyle: ReceiptStyle;
      kioskDrawerEnabled: boolean;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireDev } = await import("./auth.server");
    const user = await requireDev();

    const { updateSettings } = await import("./settings.server");
    await updateSettings({ ...data, updatedById: user.id, updatedByName: user.displayName });
    return { ok: true };
  });

// Public - called from the unauthenticated CSR kiosk (/session) to decide
// whether to show its "Ouvrir le tiroir-caisse" button at all. See
// isKioskDrawerEnabled's comment for why this only ever returns a boolean.
export const getKioskDrawerEnabledFn = createServerFn({ method: "GET" }).handler(async () => {
  const { isKioskDrawerEnabled } = await import("./settings.server");
  return isKioskDrawerEnabled();
});
