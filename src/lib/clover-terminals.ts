// Maps each physical Clover terminal (device) to the POS station it sits at.
// Clover identifies terminals by its own device UUID, not by "POS 1".."POS 5",
// so this table is what lets a fetched Clover report be matched to the right POS.
//
// To fill this in: after setting CLOVER_MERCHANT_ID / CLOVER_API_TOKEN in .env,
// call the `listCloverDevices` server function (src/lib/clover-sync.ts) once -
// it lists every device on the merchant account with its `id`, `name`, and
// `serial`. Copy each device's `id` below next to the POS it's plugged into.
export const CLOVER_DEVICE_POS_MAP: Record<string, string> = {
  // "3f9a1b2c-...": "POS 1",
  // "8d4e5f6a-...": "POS 2",
  // "1a2b3c4d-...": "POS 3",
  // "5e6f7a8b-...": "POS 4",
  // "9c0d1e2f-...": "POS 5",
};

export function posNameForDevice(deviceId: string): string | undefined {
  return CLOVER_DEVICE_POS_MAP[deviceId];
}
