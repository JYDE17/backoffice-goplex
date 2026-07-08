// Client-only module - QZ Tray's websocket bridge only exists on
// localhost of whichever machine the browser is running on, so this must
// never be imported from server code. Each POS station has its own printer,
// so the selected printer name is stored in that browser's localStorage,
// not in the shared Supabase settings.

const PRINTER_STORAGE_KEY = "backoffice-qz-printer";

export function getStoredPrinterName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PRINTER_STORAGE_KEY) ?? "";
}

export function setStoredPrinterName(name: string) {
  if (typeof window === "undefined") return;
  if (name) window.localStorage.setItem(PRINTER_STORAGE_KEY, name);
  else window.localStorage.removeItem(PRINTER_STORAGE_KEY);
}

async function getQz() {
  const mod = await import("qz-tray");
  return mod.default;
}

export async function connectQz(): Promise<void> {
  const qz = await getQz();
  if (qz.websocket.isActive()) return;
  await qz.websocket.connect({ retries: 2, delay: 1 });
}

export async function isQzTrayReachable(): Promise<boolean> {
  try {
    await connectQz();
    return true;
  } catch {
    return false;
  }
}

export async function listPrinters(): Promise<string[]> {
  const qz = await getQz();
  await connectQz();
  const result = await qz.printers.find();
  return Array.isArray(result) ? result : [result];
}

// 80mm is the most common thermal receipt paper width. If a station uses a
// different width printer, this is the one constant to change (or promote
// to a setting later - not worth the complexity until it's actually needed).
const RECEIPT_WIDTH_IN = 3.15;

export async function printReceiptHtml(html: string): Promise<void> {
  const printerName = getStoredPrinterName();
  if (!printerName) throw new Error("Aucune imprimante recu configuree pour ce poste.");

  const qz = await getQz();
  await connectQz();
  const config = qz.configs.create(printerName, {
    size: { width: RECEIPT_WIDTH_IN, height: 11 },
    units: "in",
    scaleContent: false,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await qz.print(config, [
    { type: "pixel", format: "html", flavor: "plain", data: html, options: { pageWidth: RECEIPT_WIDTH_IN } },
  ]);
}
