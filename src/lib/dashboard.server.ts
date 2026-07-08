export type DashboardStats = {
  ventesDuJour: number;
  cashAttendu: number;
  depotEnAttente: number;
};

export async function getDashboardStats(today: string, isTest: boolean): Promise<DashboardStats> {
  const { getStoredRaceFacerSales } = await import("./supabase.server");
  const { getPendingClosures } = await import("./deposits.server");

  const [salesRows, pending] = await Promise.all([
    getStoredRaceFacerSales(today),
    getPendingClosures(isTest),
  ]);

  const ventesDuJour = salesRows.reduce(
    (sum, r) => sum + r.cash_total + r.pos_terminal_total + r.bank_wire_total + r.bambora_total,
    0,
  );
  const cashAttendu = salesRows.reduce((sum, r) => sum + r.cash_total, 0);
  const depotEnAttente = pending.reduce((sum, c) => sum + c.depositAmount, 0);

  return { ventesDuJour, cashAttendu, depotEnAttente };
}
