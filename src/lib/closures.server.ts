import { getSupabaseServerClient } from "./supabase.server";

export type ClosureInput = {
  closureDate: string;
  stationName: string;
  employeeName: string;
  authorizedById: string;
  authorizedByName: string;
  fondCaisse: number;
  cashHorsFond: number;
  rfCashCumulative: number;
  rfPosCumulative: number;
  rfCashDelta: number;
  rfPosDelta: number;
  cloverPosAmount: number;
  cloverPaidCumulative: number;
  cloverRefundCumulative: number;
  ecartCash: number;
  ecartPos: number;
  depositAmount: number;
  notes: string;
  counts: Record<string, number>;
  isTest: boolean;
};

export type ClosureRow = ClosureInput & {
  id: number;
  closedAt: string;
};

type DbClosureRow = {
  id: number;
  closure_date: string;
  station_name: string;
  employee_name: string;
  authorized_by_id: string | null;
  authorized_by_name: string | null;
  fond_caisse: number;
  cash_hors_fond: number;
  rf_cash_cumulative: number;
  rf_pos_cumulative: number;
  rf_cash_delta: number;
  rf_pos_delta: number;
  clover_pos_amount: number;
  clover_paid_cumulative: number | null;
  clover_refund_cumulative: number | null;
  ecart_cash: number;
  ecart_pos: number;
  deposit_amount: number;
  notes: string | null;
  counts: Record<string, number> | null;
  is_test: boolean;
  closed_at: string;
};

function fromDb(row: DbClosureRow): ClosureRow {
  return {
    id: row.id,
    closureDate: row.closure_date,
    stationName: row.station_name,
    employeeName: row.employee_name,
    authorizedById: row.authorized_by_id ?? "",
    authorizedByName: row.authorized_by_name ?? "",
    fondCaisse: row.fond_caisse,
    cashHorsFond: row.cash_hors_fond,
    rfCashCumulative: row.rf_cash_cumulative,
    rfPosCumulative: row.rf_pos_cumulative,
    rfCashDelta: row.rf_cash_delta,
    rfPosDelta: row.rf_pos_delta,
    cloverPosAmount: row.clover_pos_amount,
    cloverPaidCumulative: row.clover_paid_cumulative ?? 0,
    cloverRefundCumulative: row.clover_refund_cumulative ?? 0,
    ecartCash: row.ecart_cash,
    ecartPos: row.ecart_pos,
    depositAmount: row.deposit_amount,
    notes: row.notes ?? "",
    counts: row.counts ?? {},
    isTest: row.is_test,
    closedAt: row.closed_at,
  };
}

// The Supabase/PostgREST query builder is a chainable thenable whose exact
// shape depends on which filters get applied — not worth hand-typing every
// combination. We only need the resolved { data, error } shape, typed below.
type ClosuresQueryResult = Promise<{ data: DbClosureRow[] | null; error: { message: string } | null }>;

function closuresTable(): {
  select: (columns: string) => {
    eq: (column: string, value: string | boolean) => ClosuresQueryChain;
    gte: (column: string, value: string) => ClosuresQueryChain;
    order: (column: string, opts: { ascending: boolean }) => ClosuresQueryResult;
  };
  insert: (row: Record<string, unknown>) => {
    select: () => {
      single: () => Promise<{ data: DbClosureRow | null; error: { message: string } | null }>;
    };
  };
  delete: () => {
    eq: (column: string, value: number) => Promise<{ error: { message: string } | null }>;
  };
} {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_closures",
  ) as ReturnType<typeof closuresTable>;
}

type ClosuresQueryChain = {
  eq: (column: string, value: string | boolean) => ClosuresQueryChain;
  gte: (column: string, value: string) => ClosuresQueryChain;
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
export async function getLastClosure(
  closureDate: string,
  stationName: string,
  isTest: boolean,
): Promise<ClosureRow | null> {
  const { data, error } = await closuresTable()
    .select("*")
    .eq("closure_date", closureDate)
    .eq("station_name", stationName)
    .eq("is_test", isTest)
    .order("closed_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to fetch last closure: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

export async function createClosure(input: ClosureInput): Promise<number> {
  const { data, error } = await closuresTable()
    .insert({
      closure_date: input.closureDate,
      station_name: input.stationName,
      employee_name: input.employeeName,
      authorized_by_id: input.authorizedById,
      authorized_by_name: input.authorizedByName,
      fond_caisse: input.fondCaisse,
      cash_hors_fond: input.cashHorsFond,
      rf_cash_cumulative: input.rfCashCumulative,
      rf_pos_cumulative: input.rfPosCumulative,
      rf_cash_delta: input.rfCashDelta,
      rf_pos_delta: input.rfPosDelta,
      clover_pos_amount: input.cloverPosAmount,
      clover_paid_cumulative: input.cloverPaidCumulative,
      clover_refund_cumulative: input.cloverRefundCumulative,
      ecart_cash: input.ecartCash,
      ecart_pos: input.ecartPos,
      deposit_amount: input.depositAmount,
      notes: input.notes || null,
      counts: input.counts,
      is_test: input.isTest,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create closure: ${error?.message ?? "unknown error"}`);
  return data.id;
}

// Hard-deletes a closure - only ever called after the linked session (if
// any) has been detached (see reopenSessionByClosureId), since
// backoffice_shift_sessions.closure_id has a foreign key onto this table.
export async function deleteClosure(id: number): Promise<void> {
  const { error } = await closuresTable().delete().eq("id", id);
  if (error) throw new Error(`Failed to delete closure: ${error.message}`);
}

export async function getClosureById(id: number): Promise<ClosureRow | null> {
  const { data, error } = await closuresTable().select("*").eq("id", String(id)).order("closed_at", {
    ascending: false,
  });
  if (error) throw new Error(`Failed to fetch closure: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

export async function listClosures(filters: {
  date?: string;
  stationName?: string;
  since?: string;
  isTest: boolean;
}): Promise<ClosureRow[]> {
  let query = (closuresTable().select("*") as unknown as ClosuresQueryChain).eq("is_test", filters.isTest);
  if (filters.date) query = query.eq("closure_date", filters.date);
  if (filters.stationName) query = query.eq("station_name", filters.stationName);
  if (filters.since) query = query.gte("closure_date", filters.since);

  const { data, error } = await query.order("closed_at", { ascending: false });
  if (error) throw new Error(`Failed to list closures: ${error.message}`);
  return (data ?? []).map(fromDb);
}
