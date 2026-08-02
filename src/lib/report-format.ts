export function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// An écart is always a float subtraction (clover - rfCard, compté - attendu),
// so a genuine "no écart" almost never lands on exactly 0 - it lands on sub-cent
// residue like -1e-9 or 0,004. Anything that rounds to under a cent IS no écart
// and must be treated as zero everywhere: display, colour tone, and the "Aucun"
// wording. Without this, that residue took fmtEcart's sign branch and rendered
// as a misleading +0,00 $ / -0,00 $ (and lit ecartTone up warning-yellow).
export function isNoEcart(n: number): boolean {
  return Math.abs(n) < 0.005;
}

export function fmtEcart(n: number) {
  if (isNoEcart(n)) return "0,00 $";
  const s = fmt(Math.abs(n));
  return n > 0 ? `+${s}` : `-${s}`;
}

const ECART_ALERT_THRESHOLD = 1;

export function ecartTone(n: number) {
  if (isNoEcart(n)) return "text-success";
  return Math.abs(n) < ECART_ALERT_THRESHOLD ? "text-warning" : "text-destructive";
}

import { localDateString } from "./dates";

export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localDateString(d);
}

export function weekEnd(startStr: string): string {
  const d = new Date(`${startStr}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return localDateString(d);
}

export function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return localDateString(d);
}

import type { ArcadeSaleRow } from "./arcade-sales.server";

// Cash is the only tender that physically enters the karting drop box -
// Carte never touches it, same rule Véloce's cash/card split follows. This
// is what /recuperation and createDeposit sum for a given day - card sales
// (Z-out or counted) never feed the safe.
export function arcadeZoutCashNet(s: ArcadeSaleRow): number {
  return s.zoutCashPaid - s.zoutCashRefund;
}

export function arcadeZoutCardNet(s: ArcadeSaleRow): number {
  return s.zoutCardPaid - s.zoutCardRefund;
}

export function arcadeZoutTotal(s: ArcadeSaleRow): number {
  return arcadeZoutCashNet(s) + arcadeZoutCardNet(s);
}

export function arcadeCountedCashNet(s: ArcadeSaleRow): number {
  return s.countedCashPaid - s.countedCashRefund;
}

export function arcadeCountedCardNet(s: ArcadeSaleRow): number {
  return s.countedCardPaid - s.countedCardRefund;
}

export function arcadeCountedTotal(s: ArcadeSaleRow): number {
  return arcadeCountedCashNet(s) + arcadeCountedCardNet(s);
}

// Overall débalancement: compté vs Z-out (attendu), cash + carte combined.
// Positive = excédent (compté > attendu), negative = manquant, same sign
// convention as the cash session ecart in fermeture.tsx.
export function arcadeEcart(s: ArcadeSaleRow): number {
  return arcadeCountedTotal(s) - arcadeZoutTotal(s);
}
