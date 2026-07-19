import { getSupabaseServerClient } from "./supabase.server";

export type SafeMovement = {
  id: number;
  movementType: "depot" | "retrait";
  amount: number;
  createdById: string;
  createdByName: string;
  reason: string;
  isTest: boolean;
  createdAt: string;
};

type DbSafeMovementRow = {
  id: number;
  movement_type: "depot" | "retrait";
  amount: number;
  created_by_id: string | null;
  created_by_name: string;
  reason: string | null;
  is_test: boolean;
  created_at: string;
};

function fromDb(row: DbSafeMovementRow): SafeMovement {
  return {
    id: row.id,
    movementType: row.movement_type,
    amount: row.amount,
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    reason: row.reason ?? "",
    isTest: row.is_test,
    createdAt: row.created_at,
  };
}

function safeMovementsTable() {
  return getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: boolean,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: DbSafeMovementRow[] | null; error: { message: string } | null }>;
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
}

export async function listSafeMovements(isTest: boolean): Promise<SafeMovement[]> {
  const { data, error } = await safeMovementsTable()
    .from("backoffice_safe_movements")
    .select("*")
    .eq("is_test", isTest)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list safe movements: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function getSafeBalance(isTest: boolean): Promise<number> {
  const movements = await listSafeMovements(isTest);
  return movements.reduce((sum, m) => sum + (m.movementType === "depot" ? m.amount : -m.amount), 0);
}

// A manual /coffre entry that happens to match the exact total of a REAL
// recuperation/bank deposit made recently is almost certainly someone
// re-entering money the app already accounted for automatically (see the
// createDeposit/createBankDeposit calls below) rather than a genuine second
// movement - that's exactly how a real duplicate got created on 2026-07-17.
const DUPLICATE_LOOKBACK_DAYS = 14;
const DUPLICATE_AMOUNT_TOLERANCE = 0.01;

async function findMatchingRecentTransfer(
  movementType: "depot" | "retrait",
  amount: number,
): Promise<{ date: string; byName: string; kind: string } | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DUPLICATE_LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString();

  if (movementType === "depot") {
    const { listDeposits } = await import("./deposits.server");
    const match = (await listDeposits(false)).find(
      (d) =>
        Math.abs(d.totalAmount - amount) < DUPLICATE_AMOUNT_TOLERANCE && d.createdAt >= cutoffIso,
    );
    return match
      ? { date: match.depositDate, byName: match.createdByName, kind: "une récupération" }
      : null;
  }

  const { listBankDeposits } = await import("./bank-deposits.server");
  const match = (await listBankDeposits(false)).find(
    (d) =>
      Math.abs(d.totalAmount - amount) < DUPLICATE_AMOUNT_TOLERANCE && d.createdAt >= cutoffIso,
  );
  return match
    ? { date: match.depositDate, byName: match.createdByName, kind: "un dépôt bancaire" }
    : null;
}

// Prefixed so the /coffre UI can recognize this specific failure and offer a
// "confirmer quand même" retry (with confirmDuplicate: true) instead of just
// showing a dead-end error. Not exported (this file is server-only) - kept
// in sync with the identical constant in coffre.tsx by hand.
const DUPLICATE_MOVEMENT_MARKER = "DUPLICATE_SUSPECTED:";

export async function createSafeMovement(input: {
  movementType: "depot" | "retrait";
  amount: number;
  createdById: string;
  createdByName: string;
  reason: string;
  isTest: boolean;
  // Only set true by the manual /coffre form - the automatic calls below
  // (recuperation, bank deposit) ARE the source of truth for their own
  // amount, so checking them against themselves would be pointless.
  checkDuplicate?: boolean;
  confirmDuplicate?: boolean;
}): Promise<void> {
  if (input.amount <= 0) throw new Error("Le montant doit etre superieur a zero.");
  if (!input.reason.trim()) {
    throw new Error("Indique un motif pour ce mouvement manuel.");
  }

  if (input.checkDuplicate && !input.isTest && !input.confirmDuplicate) {
    const match = await findMatchingRecentTransfer(input.movementType, input.amount);
    if (match) {
      throw new Error(
        `${DUPLICATE_MOVEMENT_MARKER} Ce montant (${input.amount.toFixed(2)} $) correspond à ${match.kind} déjà enregistrée le ${match.date} par ${match.byName}. Si tu es certain que ce n'est pas un doublon, confirme quand même.`,
      );
    }
  }

  const { error } = await safeMovementsTable().from("backoffice_safe_movements").insert({
    movement_type: input.movementType,
    amount: input.amount,
    created_by_id: input.createdById,
    created_by_name: input.createdByName,
    reason: input.reason.trim(),
    is_test: input.isTest,
  });
  if (error) throw new Error(`Failed to create safe movement: ${error.message}`);
}
