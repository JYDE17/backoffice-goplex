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
  // Pairs of stations whose écarts look like a payment recorded on the
  // wrong POS - see pos-swap-detection.server.ts. Covers the last 30 days,
  // not just today, since staff usually only notice the mismatch days later
  // during réconciliation.
  posSwapAlerts: import("./pos-swap-detection.server").PosSwapAlert[];
};

export async function getDashboardStats(today: string, isTest: boolean): Promise<DashboardStats> {
  const { getStoredRaceFacerSales, getStoredCloverSales } = await import("./supabase.server");
  const { getPendingClosures } = await import("./deposits.server");
  const { getVeloceSale } = await import("./veloce-sales.server");
  const { detectPosSwaps } = await import("./pos-swap-detection.server");

  const swapLookbackStart = new Date(`${today}T00:00:00`);
  swapLookbackStart.setDate(swapLookbackStart.getDate() - 30);
  const { localDateString } = await import("./dates");

  const [salesRows, cloverRows, pending, veloceSale, posSwapAlerts] = await Promise.all([
    getStoredRaceFacerSales(today),
    getStoredCloverSales(today),
    getPendingClosures(isTest),
    getVeloceSale(today, isTest),
    detectPosSwaps(localDateString(swapLookbackStart), isTest),
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

  return {
    ventesDuJour,
    onlineSales,
    restoSales,
    cashAttendu,
    depotEnAttente,
    racefacerPosTotal,
    cloverPosTotal,
    ecartCloverRacefacer,
    posSwapAlerts,
  };
}
