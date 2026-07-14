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

let securityConfigured = false;

async function getQz() {
  const mod = await import("qz-tray");
  const qz = mod.default;

  // Sign every request so QZ Tray trusts us silently instead of showing an
  // Allow/Block prompt per action. The certificate is public (served as a
  // static asset); signing happens server-side so the private key never
  // reaches the browser. If either step fails we still resolve - QZ Tray
  // then falls back to prompting, which keeps printing usable.
  if (!securityConfigured) {
    securityConfigured = true;
    qz.security.setCertificatePromise((resolve) => {
      fetch("/qz-certificate.txt")
        .then((res) => res.text())
        .then(resolve)
        .catch((error) => {
          console.error("[QZ] Echec du chargement du certificat:", error);
          resolve("");
        });
    });
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign) => (resolve) => {
      import("./qz-sign")
        .then(({ signQzRequestFn }) => signQzRequestFn({ data: { request: toSign } }))
        .then((result) => resolve(result.signature))
        .catch((error) => {
          console.error("[QZ] Echec de la signature (cle privee absente sur le serveur ?):", error);
          resolve("");
        });
    });
  }
  return qz;
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
  // Width only, no height: receipt printers use continuous paper, and a
  // fixed page height makes QZ cut the render at that boundary (observed as
  // "only the first few lines print").
  const config = qz.configs.create(printerName, {
    size: { width: RECEIPT_WIDTH_IN },
    units: "in",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await qz.print(config, [
    {
      type: "pixel",
      format: "html",
      flavor: "plain",
      data: html,
      options: { pageWidth: RECEIPT_WIDTH_IN },
    },
  ]);
}

export async function openCashDrawer(): Promise<void> {
  const printerName = getStoredPrinterName();
  if (!printerName) throw new Error("Aucune imprimante configuree pour ce poste.");

  const qz = await getQz();
  await connectQz();
  // Matches RaceFacer's own window.open_drawer exactly - same target
  // printer ("EPSON TM-T88VI Receipt", confirmed via RaceFacer's own
  // data-termalprintername attribute) and same config (size/margins/
  // colorType/interpolation/scaleContent/density) - meant to pop the drawer
  // with no paper output, the way RaceFacer does.
  const config = qz.configs.create(printerName, {
    size: { width: RECEIPT_WIDTH_IN },
    units: "in",
    margins: { top: 0, right: 0.25, bottom: 0.25, left: 0 },
    colorType: "grayscale",
    interpolation: "nearest-neighbor",
    scaleContent: "true",
    density: "300",
  });
  const results = await Promise.allSettled([
    qz.print(config, ["p\x0022"]),
    qz.print(config, ["p22"]),
  ]);
  const allFailed = results.every((r) => r.status === "rejected");
  if (allFailed) {
    // Falls back to the one approach confirmed to physically pop this
    // drawer (a real, near-blank print job triggers the printer driver's
    // own "pulse after print" behavior) in case the raw macros above
    // still aren't honored on this hardware, so the button keeps working
    // either way instead of silently doing nothing.
    await printReceiptHtml("");
  }
}
