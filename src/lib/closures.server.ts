import { getSupabaseServerClient } from "./supabase.server";

export type ClosureInput = {
  closureDate: string;
  stationName: string;
  employeeId: string;
  employeeName: string;
  fondCaisse: number;
  cashHorsFond: number;
  rfCashCumulative: number;
  rfPosCumulative: number;
  rfCashDelta: number;
  rfPosDelta: number;
  cloverPosAmount: number;
  ecartCash: number;
  ecartPos: number;
  depositAmount: number;
  notes: string;
};

export type ClosureRow = ClosureInput & {
  id: number;
  closedAt: string;
};

type DbClosureRow = {
  id: number;
  closure_date: string;
  station_name: string;
  employee_id: string;
  employee_name: string;
  fond_caisse: number;
  cash_hors_fond: number;
  rf_cash_cumulative: number;
  rf_pos_cumulative: number;
  rf_cash_delta: number;
  rf_pos_delta: number;
  clover_pos_amount: number;
  ecart_cash: number;
  ecart_pos: number;
  deposit_amount: number;
  notes: string | null;
  closed_at: string;
};

function fromDb(row: DbClosureRow): ClosureRow {
  return {
    id: row.id,
    closureDate: row.closure_date,
    stationName: row.station_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    fondCaisse: row.fond_caisse,
    cashHorsFond: row.cash_hors_fond,
    rfCashCumulative: row.rf_cash_cumulative,
    rfPosCumulative: row.rf_pos_cumulative,
    rfCashDelta: row.rf_cash_delta,
    rfPosDelta: row.rf_pos_delta,
    cloverPosAmount: row.clover_pos_amount,
    ecartCash: row.ecart_cash,
    ecartPos: row.ecart_pos,
    depositAmount: row.deposit_amount,
    notes: row.notes ?? "",
    closedAt: row.closed_at,
  };
}

// The Supabase/PostgREST query builder is a chainable thenable whose exact
// shape depends on which filters get applied — not worth hand-typing every
// combination. We only need the resolved { data, error } shape, typed below.
type ClosuresQueryResult = Promise<{ data: DbClosureRow[] | null; error: { message: string } | null }>;

function closuresTable(): {
  select: (columns: string) => {
    eq: (column: string, value: string) => ClosuresQueryChain;
    order: (column: string, opts: { ascending: boolean }) => ClosuresQueryResult;
  };
  insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
} {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_closures",
  ) as ReturnType<typeof closuresTable>;
}

type ClosuresQueryChain = {
  eq: (column: string, value: string) => ClosuresQueryChain;
  order: (
    column: string,
    opts: { ascending: boolean },
  ) => ClosuresQueryResult & { limit: (n: number) => ClosuresQueryResult };
};

// The RaceFacer cumulative total for a station is scoped to a single calendar
// date (it resets to 0 at midnight in RaceFacer's own report). So the "last
// closure" for computing this shift's delta only needs to look at closures on
// the SAME date for the SAME station — an earlier date's cumulative figure is
// not comparable.
export async function getLastClosure(closureDate: string, stationName: string): Promise<ClosureRow | null> {
  const { data, error } = await closuresTable()
    .select("*")
    .eq("closure_date", closureDate)
    .eq("station_name", stationName)
    .order("closed_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to fetch last closure: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

export async function createClosure(input: ClosureInput): Promise<void> {
  const { error } = await closuresTable().insert({
      closure_date: input.closureDate,
      station_name: input.stationName,
      employee_id: input.employeeId,
      employee_name: input.employeeName,
      fond_caisse: input.fondCaisse,
      cash_hors_fond: input.cashHorsFond,
      rf_cash_cumulative: input.rfCashCumulative,
      rf_pos_cumulative: input.rfPosCumulative,
      rf_cash_delta: input.rfCashDelta,
      rf_pos_delta: input.rfPosDelta,
      clover_pos_amount: input.cloverPosAmount,
      ecart_cash: input.ecartCash,
      ecart_pos: input.ecartPos,
      deposit_amount: input.depositAmount,
      notes: input.notes || null,
    });

  if (error) throw new Error(`Failed to create closure: ${error.message}`);
}

export async function listClosures(filters: { date?: string; stationName?: string }): Promise<ClosureRow[]> {
  const table = closuresTable().select("*");

  let query: ClosuresQueryResult;
  if (filters.date && filters.stationName) {
    query = table
      .eq("closure_date", filters.date)
      .eq("station_name", filters.stationName)
      .order("closed_at", { ascending: false });
  } else if (filters.date) {
    query = table.eq("closure_date", filters.date).order("closed_at", { ascending: false });
  } else if (filters.stationName) {
    query = table.eq("station_name", filters.stationName).order("closed_at", { ascending: false });
  } else {
    query = table.order("closed_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list closures: ${error.message}`);
  return (data ?? []).map(fromDb);
}
