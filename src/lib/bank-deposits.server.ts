import { getSupabaseServerClient } from "./supabase.server";
import { localDateString } from "./dates";

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
  amount: number;
  bankName: string;
  createdById: string;
  createdByName: string;
  isTest: boolean;
}): Promise<BankDepositRow> {
  if (input.amount <= 0) throw new Error("Le montant doit etre superieur a zero.");

  // The safe balance is a single real ledger with no test/real split (see
  // safe.server.ts) - a test bank deposit has nothing test-specific to
  // check against, so it skips the balance check and never touches the
  // real safe. It still gets recorded (is_test=true) so the dev account
  // can exercise the full form/flow.
  if (!input.isTest) {
    const { getSafeBalance } = await import("./safe.server");
    const balance = await getSafeBalance();
    if (input.amount > balance) {
      throw new Error(
        `Le montant demande (${input.amount.toFixed(2)} $) depasse le solde du coffre-fort (${balance.toFixed(2)} $).`,
      );
    }
  }

  const { data: inserted, error } = await bankDepositsTable()
    .insert({
      deposit_date: localDateString(),
      total_amount: input.amount,
      bank_name: input.bankName || null,
      created_by_id: input.createdById,
      created_by_name: input.createdByName,
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
      amount: input.amount,
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
