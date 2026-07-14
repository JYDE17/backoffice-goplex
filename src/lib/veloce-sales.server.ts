import { getSupabaseServerClient } from "./supabase.server";

// Veloce is the restaurant's own POS - entirely separate from RaceFacer
// (karting/laser tag) and Clover. It has no API access yet, so its daily
// totals are entered manually here, one row per business date (upsert on
// re-entry rather than accumulating duplicates for the same day), broken
// down by Cash vs Carte (debit+credit combined) like the rest of the app
// splits cash from card payments.
//
// The restaurant's cash physically goes into the SAME drop box as the
// karting cash, so Veloce's cash portion chains into the recuperation flow
// exactly like backoffice_closures does: deposit_id starts null ("pending",
// still in the drop box) and gets set to the recuperation's id once it's
// swept up alongside the closures of that same recuperation.

export type VeloceSaleRow = {
  saleDate: string;
  cashAmount: number;
  cardAmount: number;
  createdById: string;
  createdByName: string;
  depositId: number | null;
  updatedAt: string;
  // The physical drop-box count for that day's resto cash, confirmed by
  // whoever counts it during recuperation - separate from cashAmount (what
  // Veloce's own sales report says should be there). Null until confirmed.
  confirmedAmount: number | null;
  confirmedByName: string;
  confirmedAt: string | null;
};

type DbVeloceSaleRow = {
  sale_date: string;
  cash_amount: number;
  card_amount: number;
  created_by_id: string | null;
  created_by_name: string;
  deposit_id: number | null;
  updated_at: string;
  confirmed_amount: number | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
};

function fromDb(row: DbVeloceSaleRow): VeloceSaleRow {
  return {
    saleDate: row.sale_date,
    cashAmount: row.cash_amount,
    cardAmount: row.card_amount,
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    depositId: row.deposit_id,
    updatedAt: row.updated_at,
    confirmedAmount: row.confirmed_amount,
    confirmedByName: row.confirmed_by_name ?? "",
    confirmedAt: row.confirmed_at,
  };
}

function veloceSalesTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_veloce_sales",
  ) as {
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => {
      select: () => {
        single: () => Promise<{ data: DbVeloceSaleRow | null; error: { message: string } | null }>;
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
            data: DbVeloceSaleRow | null;
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
          ) => Promise<{ data: DbVeloceSaleRow[] | null; error: { message: string } | null }>;
        };
        is: (
          column: string,
          value: null,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: DbVeloceSaleRow[] | null; error: { message: string } | null }>;
        };
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: DbVeloceSaleRow[] | null; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        is: (column: string, value: null) => Promise<{ error: { message: string } | null }>;
        eq: (
          column: string,
          value: string | boolean,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

export async function upsertVeloceSale(input: {
  saleDate: string;
  cashAmount: number;
  cardAmount: number;
  createdById: string;
  createdByName: string;
  isTest: boolean;
}): Promise<VeloceSaleRow> {
  if (input.cashAmount < 0 || input.cardAmount < 0) {
    throw new Error("Les montants ne peuvent pas être négatifs.");
  }

  const { data, error } = await veloceSalesTable()
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
    throw new Error(`Failed to save Veloce sale: ${error?.message ?? "unknown error"}`);
  }
  return fromDb(data);
}

export async function getVeloceSale(
  saleDate: string,
  isTest: boolean,
): Promise<VeloceSaleRow | null> {
  const { data, error } = await veloceSalesTable()
    .select("*")
    .eq("sale_date", saleDate)
    .eq("is_test", isTest)
    .single();
  if (error || !data) return null;
  return fromDb(data);
}

export async function listVeloceSales(since: string, isTest: boolean): Promise<VeloceSaleRow[]> {
  const { data, error } = await veloceSalesTable()
    .select("*")
    .eq("is_test", isTest)
    .gte("sale_date", since)
    .order("sale_date", { ascending: false });
  if (error) throw new Error(`Failed to list Veloce sales: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Veloce cash not yet swept into a recuperation - same "deposit_id IS NULL"
// pattern as getPendingClosures in deposits.server.ts.
export async function getPendingVeloceSales(isTest: boolean): Promise<VeloceSaleRow[]> {
  const { data, error } = await veloceSalesTable()
    .select("*")
    .eq("is_test", isTest)
    .is("deposit_id", null)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(`Failed to fetch pending Veloce sales: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Records the physically-counted drop-box amount for one day, separate from
// upsertVeloceSale (which only ever holds Veloce's own reported cashAmount).
// Required before that day's cash can be swept into a "resto" deposit - see
// the confirmedAmount guard in deposits.server.ts's createDeposit.
export async function confirmVeloceSale(input: {
  saleDate: string;
  isTest: boolean;
  confirmedAmount: number;
  confirmedByName: string;
}): Promise<void> {
  if (input.confirmedAmount < 0) {
    throw new Error("Le montant réel ne peut pas être négatif.");
  }
  const { error } = await veloceSalesTable()
    .update({
      confirmed_amount: input.confirmedAmount,
      confirmed_by_name: input.confirmedByName,
      confirmed_at: new Date().toISOString(),
    })
    .eq("sale_date", input.saleDate)
    .eq("is_test", input.isTest);
  if (error) throw new Error(`Failed to confirm Veloce sale: ${error.message}`);
}

export async function linkVeloceSalesToDeposit(depositId: number, isTest: boolean): Promise<void> {
  const { error } = await veloceSalesTable()
    .update({ deposit_id: depositId })
    .eq("is_test", isTest)
    .is("deposit_id", null);
  if (error) throw new Error(`Failed to link Veloce sales to deposit: ${error.message}`);
}

export async function getVeloceSalesByDepositId(depositId: number): Promise<VeloceSaleRow[]> {
  const { data, error } = await veloceSalesTable()
    .select("*")
    .eq("deposit_id", depositId)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(`Failed to fetch Veloce sales for deposit: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// The restaurant has its own drop box, separate from karting's, picked up on
// its own schedule - so the entry form needs one row per day since the last
// RESTO recuperation specifically (not the last karting one), rather than
// just "today". Falls back to today alone if no resto recuperation exists yet.
export async function getVeloceSalesSinceLastRecuperation(isTest: boolean): Promise<{
  lastRecuperationDate: string | null;
  dates: string[];
  sales: VeloceSaleRow[];
}> {
  const { localDateString, dateRangeInclusive } = await import("./dates");
  const { listDeposits } = await import("./deposits.server");

  const deposits = await listDeposits(isTest);
  const lastRecuperationDate = deposits.find((d) => d.source === "resto")?.depositDate ?? null;
  const today = localDateString();
  const dates = dateRangeInclusive(lastRecuperationDate ?? today, today);
  const sales = await listVeloceSales(dates[0] ?? today, isTest);

  return { lastRecuperationDate, dates, sales };
}
