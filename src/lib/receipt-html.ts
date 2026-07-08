import { DENOMS } from "./denominations";
import type { ClosureRow } from "./closures.server";
import type { DepositRow } from "./deposits.server";

// Plain inline-styled HTML for QZ Tray's pixel/html print (rendered by its
// own embedded engine, not the app's React/Tailwind pipeline) - keep it
// self-contained, narrow (matches the 80mm width set in qz-print.ts), and
// ASCII-only (accented characters and special punctuation garble on the
// thermal printer - see rapport.$id.tsx for the same constraint).

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtEcart(n: number) {
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${fmt(n)}` : `-${fmt(Math.abs(n))}`;
}

// Sans-serif, larger and darker than the initial Courier version - thermal
// print output of thin monospace was hard to read (user feedback with
// photos: wanted the bolder look of the browser-printed report).
const RECEIPT_STYLE = `
  font-family: Arial, Helvetica, sans-serif;
  font-size: 15px;
  line-height: 1.45;
  color: #000;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 6px;
`;

function wrap(bodyHtml: string) {
  return `<div style="${RECEIPT_STYLE}">${bodyHtml}</div>`;
}

function header() {
  return `
    <div style="text-align:center; font-weight:bold; letter-spacing:1px; font-size:19px;">BACKOFFICE</div>
    <div style="text-align:center; font-size:13px;">Goplex Brossard - Karting</div>
  `;
}

function rule() {
  return `<div style="border-top:1px dashed #000; margin:9px 0;"></div>`;
}

function sectionTitle(text: string) {
  return `<div style="font-weight:bold; font-size:14px; margin-top:2px;">${text}</div>`;
}

// Table-based rows instead of flexbox: QZ Tray renders HTML with an
// embedded JavaFX WebView whose flex support is unreliable.
function row(label: string, value: string, bold = false) {
  const weight = bold ? "font-weight:bold;" : "";
  return `<table style="width:100%; border-collapse:collapse;"><tr>
    <td style="${weight} padding:1px 0;">${label}</td>
    <td style="${weight} padding:1px 0; text-align:right; white-space:nowrap;">${value}</td>
  </tr></table>`;
}

function footer() {
  return `
    ${rule()}
    <div style="text-align:center; font-size:12px;">
      <div>Merci d'utiliser BackOffice</div>
      <div>Jeremy Dionne - 2026</div>
    </div>
  `;
}

export function buildClosureReceiptHtml(r: ClosureRow, openingTotal?: number): string {
  const billets = DENOMS.filter((d) => d.type === "billet");
  const pieces = DENOMS.filter((d) => d.type === "piece");
  const totalCompte = r.cashHorsFond + r.fondCaisse;
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  const denomLine = (d: (typeof DENOMS)[number]) => {
    const qty = r.counts[d.label] || 0;
    return row(`${d.label} x${qty}`, fmt(qty * d.value));
  };

  return wrap(`
    ${header()}
    <div style="text-align:center; font-weight:bold; font-size:16px; margin-top:10px;">Rapport de reconciliation de caisse</div>
    ${rule()}
    ${row("Date", r.closureDate)}
    ${row("Point de vente", r.stationName, true)}
    ${row("Employe", r.employeeName, true)}
    ${row("Autorise par", r.authorizedByName)}
    ${row("Heure", new Date(r.closedAt).toLocaleString("fr-CA"))}
    ${openingTotal !== undefined ? row("Caisse initiale (ouverture)", fmt(openingTotal), true) : ""}
    ${rule()}
    ${sectionTitle("COMPTAGE PHYSIQUE")}
    <div style="font-weight:bold; font-size:13px; margin-top:4px;">Billets</div>
    ${billets.map(denomLine).join("")}
    <div style="font-weight:bold; font-size:13px; margin-top:6px;">Pieces</div>
    ${pieces.map(denomLine).join("")}
    ${rule()}
    ${row("Total physique compte", fmt(totalCompte), true)}
    ${row("Fond de caisse (exclu)", fmt(r.fondCaisse))}
    ${row("Total pour depot", fmt(r.cashHorsFond), true)}
    ${rule()}
    ${sectionTitle("RAPPROCHEMENT RACEFACER / CLOVER")}
    ${row("Cash RaceFacer (attendu)", fmt(r.rfCashDelta))}
    ${row("Cash compte (pour depot)", fmt(r.cashHorsFond))}
    ${row("Ecart cash", fmtEcart(r.ecartCash), true)}
    ${row("POS Terminal RaceFacer", fmt(r.rfPosDelta))}
    ${row("Clover (percu)", fmt(r.cloverPosAmount))}
    ${row("Ecart POS Terminal", fmtEcart(r.ecartPos), true)}
    ${rule()}
    ${row("Depot bancaire effectue", fmt(r.depositAmount))}
    ${row("Restant en caisse", fmt(restant))}
    ${
      r.notes
        ? `${rule()}${sectionTitle("COMMENTAIRE")}<div style="font-size:13px;">${r.notes}</div>`
        : ""
    }
    ${footer()}
  `);
}

export function buildDepositReceiptHtml(
  d: DepositRow,
  closures: { closureDate: string; stationName: string; employeeName: string; depositAmount: number }[],
): string {
  return wrap(`
    ${header()}
    <div style="text-align:center; font-weight:bold; font-size:16px; margin-top:10px;">Rapport de depot</div>
    ${rule()}
    ${row("Date", d.depositDate)}
    ${row("Banque", d.bankName || "-")}
    ${row("Cree par", d.createdByName)}
    ${rule()}
    ${sectionTitle("FERMETURES INCLUSES")}
    ${closures
      .map((c) => row(`${c.closureDate} ${c.stationName} ${c.employeeName}`, fmt(c.depositAmount)))
      .join("")}
    ${rule()}
    ${row("Total depose", fmt(d.totalAmount), true)}
    ${footer()}
  `);
}
