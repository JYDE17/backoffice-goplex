export function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

export function fmtEcart(n: number) {
  const s = fmt(Math.abs(n));
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${s}` : `-${s}`;
}

const ECART_ALERT_THRESHOLD = 1;

export function ecartTone(n: number) {
  if (n === 0) return "text-success";
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

// Overall débalancement: Z-out (attendu) vs compté, cash + carte combined.
export function arcadeEcart(s: ArcadeSaleRow): number {
  return arcadeZoutTotal(s) - arcadeCountedTotal(s);
}
