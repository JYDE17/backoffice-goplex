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
  // Neither generic ESC/POS bytes nor RaceFacer's own raw macros
  // ("p22"/"p\x0022", with a config matching RaceFacer's own exactly) pop
  // this drawer through QZ's raw pipeline on this machine - only a real
  // completed print job does (confirmed: a test receipt pops it every
  // time). Reuses that exact same proven pixel/html print call with
  // genuinely empty content instead of a real receipt, so the print job
  // still completes (triggering the drawer pulse) with as little paper fed
  // as the printer's own cut/feed behavior allows.
  await printReceiptHtml("");
}
