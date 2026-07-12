import { getSupabaseServerClient } from "./supabase.server";
import { CHANGE_BOX_ITEMS } from "./denominations";

// The on-site "boîte de change" ($500 float kept for making change) is
// counted and recorded every time a bank deposit is confirmed, so its
// history can be tracked over time and pulled up on that deposit's receipt.
// Not linked to the safe ledger - this money never leaves the premises.

export type ChangeBoxCount = {
  id: number;
  bankDepositId: number | null;
  countDate: string;
  counts: Record<string, number>;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

type DbChangeBoxCountRow = {
  id: number;
  bank_deposit_id: number | null;
  count_date: string;
  counts: Record<string, number>;
  created_by_id: string | null;
  created_by_name: string;
  created_at: string;
};

function fromDb(row: DbChangeBoxCountRow): ChangeBoxCount {
  return {
    id: row.id,
    bankDepositId: row.bank_deposit_id,
    countDate: row.count_date,
    counts: row.counts ?? {},
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function changeBoxTable() {
  return getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (
            n: number,
          ) => Promise<{ data: DbChangeBoxCountRow[] | null; error: { message: string } | null }>;
        };
        eq: (
          column: string,
          value: number,
        ) => {
          single: () => Promise<{
            data: DbChangeBoxCountRow | null;
            error: { message: string } | null;
          }>;
        };
      };
      insert: (row: Record<string, unknown>) => {
        select: () => {
          single: () => Promise<{
            data: DbChangeBoxCountRow | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export function changeBoxAmount(counts: Record<string, number>): number {
  return CHANGE_BOX_ITEMS.reduce((sum, item) => sum + (counts[item.label] ?? 0) * item.value, 0);
}

export async function createChangeBoxCount(input: {
  bankDepositId: number;
  countDate: string;
  counts: Record<string, number>;
  createdById: string;
  createdByName: string;
}): Promise<ChangeBoxCount> {
  const { data, error } = await changeBoxTable()
    .from("backoffice_change_box_counts")
    .insert({
      bank_deposit_id: input.bankDepositId,
      count_date: input.countDate,
      counts: input.counts,
      created_by_id: input.createdById,
      created_by_name: input.createdByName,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create change box count: ${error?.message ?? "unknown error"}`);
  }
  return fromDb(data);
}

export async function getLatestChangeBoxCount(): Promise<ChangeBoxCount | null> {
  const { data, error } = await changeBoxTable()
    .from("backoffice_change_box_counts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to fetch latest change box count: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

export async function getChangeBoxCountByBankDepositId(
  bankDepositId: number,
): Promise<ChangeBoxCount | null> {
  const { data, error } = await changeBoxTable()
    .from("backoffice_change_box_counts")
    .select("*")
    .eq("bank_deposit_id", bankDepositId)
    .single();
  if (error || !data) return null;
  return fromDb(data);
}
