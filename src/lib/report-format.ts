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

export function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekEnd(startStr: string): string {
  const d = new Date(`${startStr}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}
