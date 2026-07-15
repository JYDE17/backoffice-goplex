import { getSupabaseServerClient } from "./supabase.server";

// Arcade is entered by hand - one row per SHIFT entry, not per day (a CSR
// batches a week's worth of shifts at once, and a single day can have
// several shifts/CSRs, so this can't be a day-keyed upsert like Veloce's
// sales table). Unlike Veloce, arcade cash goes into the SAME physical drop
// box as the karting closures (not its own), so it chains into the karting
// side of /recuperation exactly like backoffice_closures does: deposit_id
// starts null ("pending", still in the drop box) and gets set once it's
// swept up alongside that day's closures. No separate confirmed-amount step
// is needed here - the karting drop box's physical count already happens
// once, at récupération time, covering closures and arcade cash together.

// Two parallel Cash/Carte paid+refund breakdowns per entry, same "tender"
// shape RaceFacer already uses: Z-out is the arcade system's own expected
// sales (its end-of-shift report); "counted" is what was physically
// counted. The écart between the two is computed on read, never stored -
// same reasoning as ecartCash/ecartPos elsewhere (see report-format.ts).
export type ArcadeSaleRow = {
  id: number;
  saleDate: string;
  csrName: string;
  zoutCashPaid: number;
  zoutCashRefund: number;
  zoutCardPaid: number;
  zoutCardRefund: number;
  countedCashPaid: number;
  countedCashRefund: number;
  countedCardPaid: number;
  countedCardRefund: number;
  createdById: string;
  createdByName: string;
  depositId: number | null;
  updatedAt: string;
};

type DbArcadeSaleRow = {
  id: number;
  sale_date: string;
  csr_name: string | null;
  zout_cash_paid: number;
  zout_cash_refund: number;
  zout_card_paid: number;
  zout_card_refund: number;
  counted_cash_paid: number;
  counted_cash_refund: number;
  counted_card_paid: number;
  counted_card_refund: number;
  created_by_id: string | null;
  created_by_name: string;
  deposit_id: number | null;
  updated_at: string;
};

function fromDb(row: DbArcadeSaleRow): ArcadeSaleRow {
  return {
    id: row.id,
    saleDate: row.sale_date,
    csrName: row.csr_name ?? "",
    zoutCashPaid: row.zout_cash_paid,
    zoutCashRefund: row.zout_cash_refund,
    zoutCardPaid: row.zout_card_paid,
    zoutCardRefund: row.zout_card_refund,
    countedCashPaid: row.counted_cash_paid,
    countedCashRefund: row.counted_cash_refund,
    countedCardPaid: row.counted_card_paid,
    countedCardRefund: row.counted_card_refund,
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    depositId: row.deposit_id,
    updatedAt: row.updated_at,
  };
}

function arcadeSalesTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_arcade_sales",
  ) as {
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: DbArcadeSaleRow | null; error: { message: string } | null }>;
      };
    };
    select: (columns: string) => {
      eq: (
        column: string,
        value: string | boolean | number,
      ) => {
        eq: (
          column: string,
          value: string | boolean,
        ) => {
          single: () => Promise<{
            data: DbArcadeSaleRow | null;
            error: { message: string } | null;
          }>;
        };
        gte: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: DbArcadeSaleRow[] | null; error: { message: string } | null }>;
        };
        is: (
          column: string,
          value: null,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: DbArcadeSaleRow[] | null; error: { message: string } | null }>;
        };
        in: (
          column: string,
          values: string[],
        ) => Promise<{ data: DbArcadeSaleRow[] | null; error: { message: string } | null }>;
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: DbArcadeSaleRow[] | null; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        is: (column: string, value: null) => Promise<{ error: { message: string } | null }>;
        in: (column: string, values: string[]) => Promise<{ error: { message: string } | null }>;
      };
    };
    delete: () => {
      eq: (
        column: string,
        value: number,
      ) => {
        eq: (
          column: string,
          value: boolean,
        ) => {
          is: (column: string, value: null) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
}

export async function createArcadeSale(input: {
  saleDate: string;
  csrName: string;
  zoutCashPaid: number;
  zoutCashRefund: number;
  zoutCardPaid: number;
  zoutCardRefund: number;
  countedCashPaid: number;
  countedCashRefund: number;
  countedCardPaid: number;
  countedCardRefund: number;
  createdById: string;
  createdByName: string;
  isTest: boolean;
}): Promise<ArcadeSaleRow> {
  const amounts = [
    input.zoutCashPaid,
    input.zoutCashRefund,
    input.zoutCardPaid,
    input.zoutCardRefund,
    input.countedCashPaid,
    input.countedCashRefund,
    input.countedCardPaid,
    input.countedCardRefund,
  ];
  if (amounts.some((a) => a < 0)) {
    throw new Error("Les montants ne peuvent pas être négatifs.");
  }

  const { data, error } = await arcadeSalesTable()
    .insert({
      sale_date: input.saleDate,
      is_test: input.isTest,
      csr_name: input.csrName,
      zout_cash_paid: input.zoutCashPaid,
      zout_cash_refund: input.zoutCashRefund,
      zout_card_paid: input.zoutCardPaid,
      zout_card_refund: input.zoutCardRefund,
      counted_cash_paid: input.countedCashPaid,
      counted_cash_refund: input.countedCashRefund,
      counted_card_paid: input.countedCardPaid,
      counted_card_refund: input.countedCardRefund,
      created_by_id: input.createdById,
      created_by_name: input.createdByName,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to save arcade sale: ${error?.message ?? "unknown error"}`);
  }
  return fromDb(data);
}

export async function listArcadeSales(since: string, isTest: boolean): Promise<ArcadeSaleRow[]> {
  const { data, error } = await arcadeSalesTable()
    .select("*")
    .eq("is_test", isTest)
    .gte("sale_date", since)
    .order("sale_date", { ascending: false });
  if (error) throw new Error(`Failed to list arcade sales: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Arcade cash not yet swept into a karting recuperation.
export async function getPendingArcadeSales(isTest: boolean): Promise<ArcadeSaleRow[]> {
  const { data, error } = await arcadeSalesTable()
    .select("*")
    .eq("is_test", isTest)
    .is("deposit_id", null)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(`Failed to fetch pending arcade sales: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Lets a mis-entered shift be removed before it's swept into a récupération
// - blocked once deposit_id is set, so a completed récupération's record
// can never be edited out from under it.
export async function deleteArcadeSale(id: number, isTest: boolean): Promise<void> {
  const { error } = await arcadeSalesTable()
    .delete()
    .eq("id", id)
    .eq("is_test", isTest)
    .is("deposit_id", null);
  if (error) throw new Error(`Failed to delete arcade sale: ${error.message}`);
}

// Links only the given sale dates to a deposit (partial sweep, chosen via
// /recuperation's day checkboxes) rather than every pending row - unlike
// Veloce's linkVeloceSalesToDeposit, which always sweeps everything pending
// since the resto side has no per-day selection. A day can hold several
// shift entries; all of them for that date sweep together.
export async function linkArcadeSalesToDeposit(
  depositId: number,
  isTest: boolean,
  saleDates: string[],
): Promise<void> {
  if (saleDates.length === 0) return;
  const { error } = await arcadeSalesTable()
    .update({ deposit_id: depositId })
    .eq("is_test", isTest)
    .in("sale_date", saleDates);
  if (error) throw new Error(`Failed to link arcade sales to deposit: ${error.message}`);
}

export async function getArcadeSalesByDepositId(depositId: number): Promise<ArcadeSaleRow[]> {
  const { data, error } = await arcadeSalesTable()
    .select("*")
    .eq("deposit_id", depositId)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(`Failed to fetch arcade sales for deposit: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Bounds for the "add an entry" date picker on /ventes-arcade: anything
// since the last KARTING recuperation (arcade shares that drop box, not the
// resto one) up to today. `sales` lists every shift entry already logged in
// that window - possibly several per day - not one row per calendar date.
export async function getArcadeSalesSinceLastRecuperation(isTest: boolean): Promise<{
  lastRecuperationDate: string | null;
  dates: string[];
  sales: ArcadeSaleRow[];
}> {
  const { localDateString, dateRangeInclusive } = await import("./dates");
  const { listDeposits } = await import("./deposits.server");

  const deposits = await listDeposits(isTest);
  const lastRecuperationDate = deposits.find((d) => d.source === "karting")?.depositDate ?? null;
  const today = localDateString();
  const dates = dateRangeInclusive(lastRecuperationDate ?? today, today);
  const sales = await listArcadeSales(dates[0] ?? today, isTest);

  return { lastRecuperationDate, dates, sales };
}
