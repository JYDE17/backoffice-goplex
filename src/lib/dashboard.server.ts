// Per-POS card-money view for today: RaceFacer's own cash + terminal totals
// next to what Clover actually processed on that same station, plus the écart
// between the terminal figure and Clover (rfCard - clover). A non-trivial
// écart on a single station is the earliest per-POS signal of a débalancement.
export type PosBreakdown = {
  station: string;
  rfCash: number;
  rfCard: number;
  clover: number;
  ecart: number;
};

export type DashboardStats = {
  ventesDuJour: number;
  onlineSales: number;
  restoSales: number;
  cashAttendu: number;
  depotEnAttente: number;
  racefacerPosTotal: number;
  cloverPosTotal: number;
  // racefacerPosTotal - cloverPosTotal: positive means RaceFacer shows more
  // card money than Clover actually processed, negative means less. Purely
  // informational (a live sync-lag/mismatch signal) - ventesDuJour above
  // always uses Clover, never this figure, as the authoritative card total.
  ecartCloverRacefacer: number;
  // Same card money as ecartCloverRacefacer, but broken out per station so the
  // dashboard can render one tile per POS and flag the specific one that's off.
  posBreakdown: PosBreakdown[];
  // Pairs of stations whose écarts look like a payment recorded on the
  // wrong POS - see pos-swap-detection.server.ts. Today only, to match the
  // rest of this dashboard (all "du jour").
  posSwapAlerts: import("./pos-swap-detection.server").PosSwapAlert[];
};

export async function getDashboardStats(today: string, isTest: boolean): Promise<DashboardStats> {
  const { getStoredRaceFacerSales, getStoredCloverSales } = await import("./supabase.server");
  const { getPendingClosures } = await import("./deposits.server");
  const { getVeloceSale } = await import("./veloce-sales.server");
  const { detectPosSwaps } = await import("./pos-swap-detection.server");

  const [salesRows, cloverRows, pending, veloceSale, posSwapAlerts] = await Promise.all([
    getStoredRaceFacerSales(today),
    getStoredCloverSales(today),
    getPendingClosures(isTest),
    getVeloceSale(today, isTest),
    detectPosSwaps(today, isTest),
  ]);

  // Both read straight from the raw synced cache, not closures - a POS can
  // sell all day without anyone ever doing a "fermeture" for it (e.g. a
  // superviseur running card-only Clover sales with no cash drawer), and
  // this total still has to reflect that.
  //
  // RaceFacer's pos_terminal_total and Clover's paid/refund figures are the
  // SAME card money seen from two systems, not additive - adding both would
  // roughly double every normal card sale. Clover is the actual payment
  // processor, so it's the authoritative source for card money: it's used
  // here IN PLACE OF RaceFacer's pos_terminal_total, which also means a
  // Clover-only overcharge/refund (never recorded by RaceFacer) is still
  // captured instead of silently vanishing.
  //
  // "Ventes du jour" is in-person tenders only (cash + POS/Clover); bank
  // wire and Bambora are online/remote payments, broken out separately.
  const ventesDuJour =
    salesRows.reduce((sum, r) => sum + r.cash_total, 0) +
    cloverRows.reduce((sum, r) => sum + r.paid_total - r.refund_total, 0);
  const onlineSales = salesRows.reduce((sum, r) => sum + r.bank_wire_total + r.bambora_total, 0);
  // Veloce (the restaurant's own POS) is a separate sales channel entirely -
  // not RaceFacer or Clover money, so it's broken out on its own instead of
  // folded into "Ventes du jour" or "Ventes en ligne".
  const restoSales = (veloceSale?.cashAmount ?? 0) + (veloceSale?.cardAmount ?? 0);
  const cashAttendu = salesRows.reduce((sum, r) => sum + r.cash_total, 0);
  const depotEnAttente = pending.reduce((sum, c) => sum + c.depositAmount, 0);

  // Same two card-money figures as ventesDuJour above, broken back out
  // individually so the dashboard can surface a live Clover-vs-RaceFacer
  // mismatch (sync lag, a missed device, etc.) instead of silently masking
  // it behind the Clover-only total.
  const racefacerPosTotal = salesRows.reduce((sum, r) => sum + r.pos_terminal_total, 0);
  const cloverPosTotal = cloverRows.reduce((sum, r) => sum + r.paid_total - r.refund_total, 0);
  const ecartCloverRacefacer = racefacerPosTotal - cloverPosTotal;

  // One row per station, unioning RaceFacer and Clover (a POS can appear in
  // one source but not the other - e.g. a cash-only station RaceFacer knows
  // about with no Clover activity, or a Clover-only charge with no matching
  // RaceFacer terminal figure yet). Keyed by station_name, the same key
  // upsertCloverSales matches Clover devices to.
  const posByStation = new Map<string, PosBreakdown>();
  const ensurePos = (station: string) => {
    let entry = posByStation.get(station);
    if (!entry) {
      entry = { station, rfCash: 0, rfCard: 0, clover: 0, ecart: 0 };
      posByStation.set(station, entry);
    }
    return entry;
  };
  for (const r of salesRows) {
    const entry = ensurePos(r.station_name);
    entry.rfCash += r.cash_total;
    entry.rfCard += r.pos_terminal_total;
  }
  for (const r of cloverRows) {
    ensurePos(r.station_name).clover += r.paid_total - r.refund_total;
  }
  const posBreakdown = [...posByStation.values()]
    .map((p) => ({ ...p, ecart: p.rfCard - p.clover }))
    .sort((a, b) => a.station.localeCompare(b.station, "fr-CA", { numeric: true }));

  return {
    ventesDuJour,
    onlineSales,
    restoSales,
    cashAttendu,
    depotEnAttente,
    racefacerPosTotal,
    cloverPosTotal,
    ecartCloverRacefacer,
    posBreakdown,
    posSwapAlerts,
  };
}
