import { getSupabaseServerClient } from "./supabase.server";

// Tips per employee per business date, synced from Veloce's own /sales/net
// report (see veloce.server.ts) - purely informational (payroll lookup),
// never touches the drop box/reconciliation flow the way Veloce cash sales
// do, so there's no "pending"/deposit_id linkage here.

export type VeloceTipRow = {
  saleDate: string;
  employeeName: string;
  tipsAmount: number;
  updatedAt: string;
};

type DbVeloceTipRow = {
  sale_date: string;
  employee_name: string;
  tips_amount: number;
  updated_at: string;
};

function fromDb(row: DbVeloceTipRow): VeloceTipRow {
  return {
    saleDate: row.sale_date,
    employeeName: row.employee_name,
    tipsAmount: row.tips_amount,
    updatedAt: row.updated_at,
  };
}

function veloceTipsTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_veloce_tips",
  ) as {
    upsert: (
      rows: Record<string, unknown>[],
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    select: (columns: string) => {
      eq: (
        column: string,
        value: boolean,
      ) => {
        gte: (
          column: string,
          value: string,
        ) => {
          lte: (
            column: string,
            value: string,
          ) => {
            order: (
              column: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: DbVeloceTipRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export async function upsertVeloceTips(
  saleDate: string,
  tips: { employeeName: string; tips: number }[],
  isTest: boolean,
): Promise<void> {
  if (tips.length === 0) return;
  const { error } = await veloceTipsTable().upsert(
    tips.map((t) => ({
      sale_date: saleDate,
      employee_name: t.employeeName,
      tips_amount: t.tips,
      is_test: isTest,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "sale_date,employee_name,is_test" },
  );
  if (error) throw new Error(`Failed to save Veloce tips: ${error.message}`);
}

export async function listVeloceTips(
  fromDate: string,
  toDate: string,
  isTest: boolean,
): Promise<VeloceTipRow[]> {
  const { data, error } = await veloceTipsTable()
    .select("*")
    .eq("is_test", isTest)
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(`Failed to list Veloce tips: ${error.message}`);
  return (data ?? []).map(fromDb);
}
