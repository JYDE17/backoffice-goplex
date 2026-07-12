import { getSupabaseServerClient } from "./supabase.server";
import { localDateString } from "./dates";
import { bankDepositAmount } from "./denominations";

// The final step of the money route: cash actually leaving the coffre-fort
// (safe) to be physically deposited at the bank. Distinct from
// backoffice_deposits (deposits.server.ts), which is the earlier
// "recuperation" step - drop box into the safe, not yet at the bank.

export type BankDepositRow = {
  id: number;
  depositDate: string;
  totalAmount: number;
  bankName: string;
  createdById: string;
  createdByName: string;
  verifiedByName: string;
  counts: Record<string, number>;
  createdAt: string;
  isTest: boolean;
};

type DbBankDepositRow = {
  id: number;
  deposit_date: string;
  total_amount: number;
  bank_name: string | null;
  created_by_id: string | null;
  created_by_name: string;
  verified_by_name: string | null;
  counts: Record<string, number> | null;
  created_at: string;
  is_test: boolean;
};

function fromDb(row: DbBankDepositRow): BankDepositRow {
  return {
    id: row.id,
    depositDate: row.deposit_date,
    totalAmount: row.total_amount,
    bankName: row.bank_name ?? "",
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    verifiedByName: row.verified_by_name ?? "",
    counts: row.counts ?? {},
    createdAt: row.created_at,
    isTest: row.is_test,
  };
}

function bankDepositsTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_bank_deposits",
  ) as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        single: () => Promise<{ data: DbBankDepositRow | null; error: { message: string } | null }>;
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: DbBankDepositRow[] | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: DbBankDepositRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export async function createBankDeposit(input: {
  counts: Record<string, number>;
  confirmedAmount: number;
  bankName: string;
  createdById: string;
  createdByName: string;
  verifiedByName: string;
  changeBoxCounts: Record<string, number>;
  isTest: boolean;
}): Promise<BankDepositRow> {
  const amount = bankDepositAmount(input.counts);
  if (amount <= 0) throw new Error("Le montant doit etre superieur a zero.");
  if (!input.verifiedByName.trim()) {
    throw new Error("Le nom de la personne qui a vérifié est obligatoire.");
  }
  // Same double-entry re-check as createDeposit: the employee retypes the
  // computed total client-side, this confirms the server got the same
  // value twice - a stale/tampered client can't submit a mismatched amount.
  if (Math.abs(amount - input.confirmedAmount) > 0.01) {
    throw new Error("Les deux montants saisis ne correspondent pas.");
  }

  // The safe balance is a single real ledger with no test/real split (see
  // safe.server.ts) - a test bank deposit has nothing test-specific to
  // check against, so it skips the balance check and never touches the
  // real safe. It still gets recorded (is_test=true) so the dev account
  // can exercise the full form/flow.
  if (!input.isTest) {
    const { getSafeBalance } = await import("./safe.server");
    const balance = await getSafeBalance();
    if (amount > balance) {
      throw new Error(
        `Le montant demande (${amount.toFixed(2)} $) depasse le solde du coffre-fort (${balance.toFixed(2)} $).`,
      );
    }
  }

  const depositDate = localDateString();
  const { data: inserted, error } = await bankDepositsTable()
    .insert({
      deposit_date: depositDate,
      total_amount: amount,
      bank_name: input.bankName || null,
      created_by_id: input.createdById,
      created_by_name: input.createdByName,
      verified_by_name: input.verifiedByName.trim(),
      counts: input.counts,
      is_test: input.isTest,
    })
    .select()
    .single();
  if (error || !inserted) {
    throw new Error(`Failed to create bank deposit: ${error?.message ?? "unknown error"}`);
  }

  if (!input.isTest) {
    const { createSafeMovement } = await import("./safe.server");
    await createSafeMovement({
      movementType: "retrait",
      amount,
      createdById: input.createdById,
      createdByName: input.createdByName,
    });
  }

  // The change box count is tracked alongside every real bank deposit so its
  // history can be followed over time - test deposits skip it (nothing to
  // track for a sandbox run).
  if (!input.isTest) {
    const { createChangeBoxCount } = await import("./change-box.server");
    await createChangeBoxCount({
      bankDepositId: inserted.id,
      countDate: depositDate,
      counts: input.changeBoxCounts,
      createdById: input.createdById,
      createdByName: input.createdByName,
    });
  }

  return fromDb(inserted);
}

export async function getBankDepositById(id: number): Promise<BankDepositRow | null> {
  const { data, error } = await bankDepositsTable().select("*").eq("id", String(id)).single();
  if (error || !data) return null;
  return fromDb(data);
}

export async function listBankDeposits(isTest: boolean): Promise<BankDepositRow[]> {
  const { data, error } = await bankDepositsTable()
    .select("*")
    .eq("is_test", isTest)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list bank deposits: ${error.message}`);
  return (data ?? []).map(fromDb);
}
