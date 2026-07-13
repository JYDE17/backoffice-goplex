export type DashboardStats = {
  ventesDuJour: number;
  onlineSales: number;
  restoSales: number;
  cashAttendu: number;
  depotEnAttente: number;
};

export async function getDashboardStats(today: string, isTest: boolean): Promise<DashboardStats> {
  const { getStoredRaceFacerSales, getStoredCloverSales } = await import("./supabase.server");
  const { getPendingClosures } = await import("./deposits.server");
  const { getVeloceSale } = await import("./veloce-sales.server");

  const [salesRows, cloverRows, pending, veloceSale] = await Promise.all([
    getStoredRaceFacerSales(today),
    getStoredCloverSales(today),
    getPendingClosures(isTest),
    getVeloceSale(today, isTest),
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
  const restoSales = veloceSale?.amount ?? 0;
  const cashAttendu = salesRows.reduce((sum, r) => sum + r.cash_total, 0);
  const depotEnAttente = pending.reduce((sum, c) => sum + c.depositAmount, 0);

  return { ventesDuJour, onlineSales, restoSales, cashAttendu, depotEnAttente };
}
