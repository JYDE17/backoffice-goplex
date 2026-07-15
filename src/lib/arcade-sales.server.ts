import { getSupabaseServerClient } from "./supabase.server";

// Arcade is entered by hand, one row per business date (upsert on re-entry
// rather than accumulating duplicates), split Cash/Carte like Veloce - but
// unlike Veloce, arcade cash goes into the SAME physical drop box as the
// karting closures (not its own), so it chains into the karting side of
// /recuperation exactly like backoffice_closures does: deposit_id starts
// null ("pending", still in the drop box) and gets set once it's swept up
// alongside that day's closures. No separate confirmed-amount step is
// needed here - the karting drop box's physical count already happens once,
// at récupération time, covering closures and arcade cash together.

export type ArcadeSaleRow = {
  saleDate: string;
  cashAmount: number;
  cardAmount: number;
  createdById: string;
  createdByName: string;
  depositId: number | null;
  updatedAt: string;
};

type DbArcadeSaleRow = {
  sale_date: string;
  cash_amount: number;
  card_amount: number;
  created_by_id: string | null;
  created_by_name: string;
  deposit_id: number | null;
  updated_at: string;
};

function fromDb(row: DbArcadeSaleRow): ArcadeSaleRow {
  return {
    saleDate: row.sale_date,
    cashAmount: row.cash_amount,
    cardAmount: row.card_amount,
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
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => {
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
  };
}

export async function upsertArcadeSale(input: {
  saleDate: string;
  cashAmount: number;
  cardAmount: number;
  createdById: string;
  createdByName: string;
  isTest: boolean;
}): Promise<ArcadeSaleRow> {
  if (input.cashAmount < 0 || input.cardAmount < 0) {
    throw new Error("Les montants ne peuvent pas être négatifs.");
  }

  const { data, error } = await arcadeSalesTable()
    .upsert(
      {
        sale_date: input.saleDate,
        is_test: input.isTest,
        cash_amount: input.cashAmount,
        card_amount: input.cardAmount,
        created_by_id: input.createdById,
        created_by_name: input.createdByName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sale_date,is_test" },
    )
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

// Links only the given sale dates to a deposit (partial sweep, chosen via
// /recuperation's day checkboxes) rather than every pending row - unlike
// Veloce's linkVeloceSalesToDeposit, which always sweeps everything pending
// since the resto side has no per-day selection.
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

// Same "one row per day since the last recuperation" shape as Veloce's
// getVeloceSalesSinceLastRecuperation, but keyed off the last KARTING
// recuperation - arcade shares that drop box, not the resto one.
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
