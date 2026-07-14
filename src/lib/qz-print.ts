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

export async function openCashDrawer(label?: string): Promise<void> {
  // The raw text macros RaceFacer sends ("p22"/"p\x0022") don't behave as
  // drawer-kick commands on this machine's printer queue - QZ Tray resolves
  // them successfully (no error), but they just sit as inert leftover data
  // in the OS print queue and bleed out as garbled text prepended onto
  // whatever prints next. RaceFacer's own open_drawer() is only ever called
  // immediately before printing an actual receipt during a real cash sale,
  // so its "paperless" drawer-open was never actually isolated from a real
  // print job either - the pulse comes from that receipt printing, with the
  // stray macro text quietly absorbed into it. Reusing the same proven
  // pixel/html print path is the one approach that reliably pops this
  // drawer on its own - since paper is unavoidable either way, it prints a
  // small audit slip (who/when) instead of a blank strip.
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  await printReceiptHtml(`
    <div style="font-family: monospace; font-size: 11px; text-align: center; line-height: 1.4;">
      <div>OUVERTURE TIROIR-CAISSE</div>
      ${label ? `<div>${label}</div>` : ""}
      <div>Date: ${dateStr}</div>
      <div>Heure: ${timeStr}</div>
    </div>
  `);
}
