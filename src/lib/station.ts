// Which POS this physical machine is - stored per-browser, like the
// printer choice. Set by the dev account in Parametres; used as the default
// station on the /session kiosk page.
const STATION_STORAGE_KEY = "backoffice-station";

export const POS_LIST = ["POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;

export function getStoredStation(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STATION_STORAGE_KEY) ?? "";
}

export function setStoredStation(name: string) {
  if (typeof window === "undefined") return;
  if (name) window.localStorage.setItem(STATION_STORAGE_KEY, name);
  else window.localStorage.removeItem(STATION_STORAGE_KEY);
}
