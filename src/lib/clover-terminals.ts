// Maps each physical Clover terminal (device) to the POS station it sits at.
// Clover identifies terminals by its own device UUID, not by "POS 1".."POS 5",
// so this table is what lets a fetched Clover report be matched to the right POS.
//
// Confirmed against the merchant's device list (GET /v3/merchants/{mId}/devices)
// on 2026-07-11 - the account has 7 provisioned devices total; the two not
// listed here (serials C043UQ01560397 and C043UQ01570075) are not one of the
// 5 POS and are intentionally left unmapped (their sales surface as
// `unmatchedDeviceIds` on sync instead of being silently dropped).
export const CLOVER_DEVICE_POS_MAP: Record<string, string> = {
  "810c0ab5-8244-8791-d787-89f592a89719": "POS 1", // serial C046UG52959652
  "000000ba-ef87-9d90-65ed-743b61bf4aa2": "POS 2", // serial C045UQ40520511
  "00000095-7689-ea4e-b35d-e74a5452ca7c": "POS 3", // serial C045UQ40520484
  "00000132-492b-2ee7-13b3-8c84f4773900": "POS 4", // serial C045UQ40520444
  "00000126-3d71-a48d-ad44-0756de216f5e": "POS 5", // serial C045UQ35230647
};

export function posNameForDevice(deviceId: string): string | undefined {
  return CLOVER_DEVICE_POS_MAP[deviceId];
}
