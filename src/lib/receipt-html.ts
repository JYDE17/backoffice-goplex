import { DENOMS } from "./denominations";
import type { ClosureRow } from "./closures.server";
import type { DepositRow } from "./deposits.server";
import type { ReceiptStyle } from "./settings.server";
import type { VeloceSaleRow } from "./veloce-sales.server";

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

function title(text: string) {
  return `<div style="text-align:center; font-weight:bold; font-size:16px; margin-top:10px;">${text}</div>`;
}

function rule() {
  return `<div style="border-top:1px dashed #000; margin:9px 0;"></div>`;
}

function sectionTitle(text: string) {
  return `<div style="font-weight:bold; font-size:14px; margin-top:2px;">${text}</div>`;
}

function sectionTitleSmall(text: string) {
  return `<div style="font-weight:bold; font-size:11px; margin-top:6px; color:#333;">${text}</div>`;
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

function rowSmall(label: string, value: string, bold = false) {
  const weight = bold ? "font-weight:bold;" : "";
  return `<table style="width:100%; border-collapse:collapse; font-size:11.5px; color:#333;"><tr>
    <td style="${weight} padding:1px 0;">${label}</td>
    <td style="${weight} padding:1px 0; text-align:right; white-space:nowrap;">${value}</td>
  </tr></table>`;
}

function box(innerHtml: string) {
  return `<div style="border:1.5px solid #000; padding:6px 8px; margin:8px 0;">${innerHtml}</div>`;
}

function bigNumber(amount: string, label: string) {
  return `
    <div style="text-align:center; margin:10px 0;">
      <div style="font-size:26px; font-weight:800;">${amount}</div>
      <div style="font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#333;">${label}</div>
    </div>
  `;
}

function infoLine2col(a: string, b: string, c: string, d: string) {
  return `<table style="width:100%; border-collapse:collapse; font-size:12px;">
    <tr><td style="padding:1px 0;">${a}</td><td style="padding:1px 0; text-align:right;">${b}</td></tr>
    <tr><td style="padding:1px 0;">${c}</td><td style="padding:1px 0; text-align:right;">${d}</td></tr>
  </table>`;
}

function compareTable(rows: { label: string; attendu: string; compte: string; ecart: string }[]) {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:2px 3px;">${r.label}</td><td style="padding:2px 3px; text-align:right;">${r.attendu}</td><td style="padding:2px 3px; text-align:right;">${r.compte}</td><td style="padding:2px 3px; text-align:right; font-weight:bold;">${r.ecart}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%; border-collapse:collapse; font-size:11px; margin:4px 0;">
    <tr>
      <th></th>
      <th style="text-align:right; padding:2px 3px; border-bottom:1px solid #000;">RaceFacer</th>
      <th style="text-align:right; padding:2px 3px; border-bottom:1px solid #000;">Actuel</th>
      <th style="text-align:right; padding:2px 3px; border-bottom:1px solid #000;">Ecart</th>
    </tr>
    ${body}
  </table>`;
}

function signature() {
  return `
    <div style="margin-top:26px; border-bottom:1px solid #000;"></div>
    <div style="font-size:12px; margin-top:2px;">Signature du responsable</div>
  `;
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

function noteBlock(notes: string, small = false) {
  if (!notes) return "";
  const size = small ? "11px" : "13px";
  return `${rule()}${small ? sectionTitleSmall("COMMENTAIRE") : sectionTitle("COMMENTAIRE")}<div style="font-size:${size};">${notes}</div>`;
}

// --- Style: "actuel" - everything, stacked (the original layout) ----------
function buildActuel(
  r: ClosureRow,
  openingTotal: number | undefined,
  ownClover: number | undefined,
): string {
  const totalCompte = r.cashHorsFond + r.fondCaisse;
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  const countedLines = DENOMS.filter((d) => (r.counts[d.label] || 0) > 0)
    .map((d) => {
      const qty = r.counts[d.label] || 0;
      return row(`${d.label} x${qty}`, fmt(qty * d.value));
    })
    .join("");

  return wrap(`
    ${header()}
    ${title("Rapport de reconciliation de caisse")}
    ${rule()}
    ${row("Date", r.closureDate)}
    ${row("Point de vente", r.stationName, true)}
    ${row("Employe", r.employeeName, true)}
    ${row("Heure", new Date(r.closedAt).toLocaleString("fr-CA"))}
    ${openingTotal !== undefined ? row("Caisse initiale (ouverture)", fmt(openingTotal), true) : ""}
    ${rule()}
    ${sectionTitle("COMPTAGE DE FERMETURE")}
    ${countedLines || `<div style="font-size:13px; color:#333;">Aucune coupure comptee</div>`}
    ${row("Total physique compte", fmt(totalCompte), true)}
    ${row("Fond de caisse (exclu)", fmt(r.fondCaisse))}
    ${row("Total pour depot", fmt(r.cashHorsFond), true)}
    ${rule()}
    ${sectionTitle("RAPPROCHEMENT RACEFACER / CLOVER")}
    ${row("Cash RaceFacer (attendu)", fmt(r.rfCashDelta))}
    ${row("Cash compte (pour depot)", fmt(r.cashHorsFond))}
    ${row("Ecart cash", fmtEcart(r.ecartCash), true)}
    ${row("POS Terminal RaceFacer (cumulatif jour)", fmt(r.rfPosDelta))}
    ${row("Clover (cumulatif jour)", fmt(r.cloverPosAmount))}
    ${row("Ecart POS Terminal (cumulatif jour)", fmtEcart(r.ecartPos), true)}
    ${ownClover !== undefined ? row("Clover - vente de ce shift", fmt(ownClover), true) : ""}
    ${rule()}
    ${row("Depot bancaire effectue", fmt(r.depositAmount))}
    ${row("Restant en caisse", fmt(restant))}
    ${noteBlock(r.notes)}
    ${rule()}
    ${row("Responsable", r.authorizedByName, true)}
    ${signature()}
    ${footer()}
  `);
}

// --- Style: "essentiel" - no itemized counting, no raw cumulative figures -
// only what matters to close a shift: écarts, deposit, signature.
function buildEssentiel(r: ClosureRow, ownClover: number | undefined): string {
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  return wrap(`
    ${header()}
    ${title("Fermeture de caisse")}
    ${rule()}
    ${infoLine2col(
      r.stationName,
      r.closureDate,
      r.employeeName,
      new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }),
    )}
    ${rule()}
    ${bigNumber(fmt(r.cashHorsFond + r.fondCaisse), "Total compte au tiroir")}
    ${row("Fond de caisse (exclu)", fmt(r.fondCaisse))}
    ${row("Pour depot", fmt(r.cashHorsFond), true)}
    ${box(
      row("Ecart cash", fmtEcart(r.ecartCash), true) +
        row("Ecart POS Terminal", fmtEcart(r.ecartPos), true) +
        (ownClover !== undefined ? row("Clover - vente de ce shift", fmt(ownClover)) : ""),
    )}
    ${row("Depot bancaire effectue", fmt(r.depositAmount))}
    ${row("Restant en caisse", fmt(restant))}
    ${noteBlock(r.notes)}
    ${rule()}
    ${row("Responsable", r.authorizedByName, true)}
    ${signature()}
    ${footer()}
  `);
}

// --- Style: "resume" - a scan-first summary box, full detail below --------
function buildResume(
  r: ClosureRow,
  openingTotal: number | undefined,
  ownClover: number | undefined,
): string {
  const totalCompte = r.cashHorsFond + r.fondCaisse;
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  const countedLines = DENOMS.filter((d) => (r.counts[d.label] || 0) > 0)
    .map((d) => {
      const qty = r.counts[d.label] || 0;
      return rowSmall(`${d.label} x${qty}`, fmt(qty * d.value));
    })
    .join("");

  return wrap(`
    ${header()}
    ${title("Fermeture de caisse")}
    ${rule()}
    ${infoLine2col(
      r.stationName,
      r.closureDate,
      r.employeeName,
      new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }),
    )}
    ${box(
      row("Total compte", fmt(totalCompte), true) +
        row("Ecart cash", fmtEcart(r.ecartCash), true) +
        row("Ecart POS", fmtEcart(r.ecartPos), true) +
        (ownClover !== undefined ? row("Clover ce shift", fmt(ownClover), true) : ""),
    )}
    ${openingTotal !== undefined ? rowSmall("Caisse initiale (ouverture)", fmt(openingTotal)) : ""}
    ${rule()}
    ${sectionTitleSmall("DETAIL DU COMPTAGE")}
    ${countedLines || `<div style="font-size:11px; color:#333;">Aucune coupure comptee</div>`}
    ${rowSmall("Fond de caisse (exclu)", fmt(r.fondCaisse))}
    ${rule()}
    ${sectionTitleSmall("RAPPROCHEMENT COMPLET")}
    ${rowSmall("Cash RaceFacer (attendu)", fmt(r.rfCashDelta))}
    ${rowSmall("POS Terminal (cumulatif jour)", fmt(r.rfPosDelta))}
    ${rowSmall("Clover (cumulatif jour)", fmt(r.cloverPosAmount))}
    ${rule()}
    ${row("Depot bancaire effectue", fmt(r.depositAmount))}
    ${row("Restant en caisse", fmt(restant))}
    ${noteBlock(r.notes)}
    ${rule()}
    ${row("Responsable", r.authorizedByName, true)}
    ${signature()}
    ${footer()}
  `);
}

// --- Style: "compact" - everything, but tightened into dense tables -------
function buildCompact(r: ClosureRow, ownClover: number | undefined): string {
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  const countedLine = DENOMS.filter((d) => (r.counts[d.label] || 0) > 0)
    .map((d) => `${d.label}x${r.counts[d.label] || 0}`)
    .join("  ");

  return wrap(`
    ${header()}
    <div style="text-align:center; font-size:12px; margin-top:4px;">
      ${r.closureDate} - ${r.stationName} - ${r.employeeName} - ${new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
    </div>
    ${rule()}
    <div style="font-size:11px;">${countedLine || "Aucune coupure comptee"}</div>
    ${row("Total compte", fmt(r.cashHorsFond + r.fondCaisse), true)}
    ${rowSmall("Fond (exclu) / Pour depot", `${fmt(r.fondCaisse)} / ${fmt(r.cashHorsFond)}`)}
    ${rule()}
    ${compareTable([
      {
        label: "Cash",
        attendu: fmt(r.rfCashDelta),
        compte: fmt(r.cashHorsFond),
        ecart: fmtEcart(r.ecartCash),
      },
      {
        label: "POS",
        attendu: fmt(r.rfPosDelta),
        compte: fmt(r.cloverPosAmount),
        ecart: fmtEcart(r.ecartPos),
      },
    ])}
    ${ownClover !== undefined ? rowSmall("Clover - vente de ce shift", fmt(ownClover)) : ""}
    ${rule()}
    ${row("Restant en caisse", fmt(restant))}
    ${row("Responsable", r.authorizedByName, true)}
    ${noteBlock(r.notes, true)}
    ${signature()}
    ${footer()}
  `);
}

export function buildClosureReceiptHtml(
  r: ClosureRow,
  openingTotal?: number,
  ownClover?: number,
  style: ReceiptStyle = "actuel",
): string {
  switch (style) {
    case "essentiel":
      return buildEssentiel(r, ownClover);
    case "resume":
      return buildResume(r, openingTotal, ownClover);
    case "compact":
      return buildCompact(r, ownClover);
    default:
      return buildActuel(r, openingTotal, ownClover);
  }
}

export function buildDepositReceiptHtml(
  d: DepositRow,
  closures: {
    closureDate: string;
    stationName: string;
    employeeName: string;
    depositAmount: number;
  }[],
  veloceSales: VeloceSaleRow[] = [],
): string {
  return wrap(`
    ${header()}
    ${title("Rapport de depot")}
    ${rule()}
    ${row("Date", d.depositDate)}
    ${row("Banque", d.bankName || "-")}
    ${row("Cree par", d.createdByName)}
    ${row("Verifie par", d.verifiedByName || "-")}
    ${rule()}
    ${sectionTitle("FERMETURES INCLUSES")}
    ${closures
      .map((c) => row(`${c.closureDate} ${c.stationName} ${c.employeeName}`, fmt(c.depositAmount)))
      .join("")}
    ${
      veloceSales.length > 0
        ? `${rule()}${sectionTitle("VENTES RESTO (VELOCE) INCLUSES")}${veloceSales
            .map((s) => row(`${s.saleDate} Resto`, fmt(s.cashAmount)))
            .join("")}`
        : ""
    }
    ${rule()}
    ${row("Total depose", fmt(d.totalAmount), true)}
    ${footer()}
  `);
}
