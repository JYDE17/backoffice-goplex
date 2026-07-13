import { getSupabaseServerClient } from "./supabase.server";

// Veloce is the restaurant's own POS - entirely separate from RaceFacer
// (karting/laser tag) and Clover. It has no API access yet, so its daily
// totals are entered manually here, one row per business date (upsert on
// re-entry rather than accumulating duplicates for the same day), broken
// down by Cash vs Carte (debit+credit combined) like the rest of the app
// splits cash from card payments.

export type VeloceSaleRow = {
  saleDate: string;
  cashAmount: number;
  cardAmount: number;
  createdById: string;
  createdByName: string;
  updatedAt: string;
};

type DbVeloceSaleRow = {
  sale_date: string;
  cash_amount: number;
  card_amount: number;
  created_by_id: string | null;
  created_by_name: string;
  updated_at: string;
};

function fromDb(row: DbVeloceSaleRow): VeloceSaleRow {
  return {
    saleDate: row.sale_date,
    cashAmount: row.cash_amount,
    cardAmount: row.card_amount,
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
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
        value: string | boolean,
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

// The person who reconciles the drop box also picks up the restaurant's
// Veloce sales slips for every day since the last time they did that - so
// the entry form needs one row per day since the last recuperation, not
// just "today". Falls back to today alone if no recuperation exists yet.
export async function getVeloceSalesSinceLastRecuperation(isTest: boolean): Promise<{
  lastRecuperationDate: string | null;
  dates: string[];
  sales: VeloceSaleRow[];
}> {
  const { localDateString, dateRangeInclusive } = await import("./dates");
  const { listDeposits } = await import("./deposits.server");

  const deposits = await listDeposits(isTest);
  const lastRecuperationDate = deposits[0]?.depositDate ?? null;
  const today = localDateString();
  const dates = dateRangeInclusive(lastRecuperationDate ?? today, today);
  const sales = await listVeloceSales(dates[0] ?? today, isTest);

  return { lastRecuperationDate, dates, sales };
}
