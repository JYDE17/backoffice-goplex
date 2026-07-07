import { getSupabaseServerClient } from "./supabase.server";

export type SafeMovement = {
  id: number;
  movementType: "depot" | "retrait";
  amount: number;
  createdById: string;
  createdByName: string;
  createdAt: string;
};

type DbSafeMovementRow = {
  id: number;
  movement_type: "depot" | "retrait";
  amount: number;
  created_by_id: string | null;
  created_by_name: string;
  created_at: string;
};

function fromDb(row: DbSafeMovementRow): SafeMovement {
  return {
    id: row.id,
    movementType: row.movement_type,
    amount: row.amount,
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function safeMovementsTable() {
  return getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: DbSafeMovementRow[] | null; error: { message: string } | null }>;
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
}

export async function listSafeMovements(): Promise<SafeMovement[]> {
  const { data, error } = await safeMovementsTable()
    .from("backoffice_safe_movements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list safe movements: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function getSafeBalance(): Promise<number> {
  const movements = await listSafeMovements();
  return movements.reduce(
    (sum, m) => sum + (m.movementType === "depot" ? m.amount : -m.amount),
    0,
  );
}

export async function createSafeMovement(input: {
  movementType: "depot" | "retrait";
  amount: number;
  createdById: string;
  createdByName: string;
}): Promise<void> {
  if (input.amount <= 0) throw new Error("Le montant doit etre superieur a zero.");
  const { error } = await safeMovementsTable().from("backoffice_safe_movements").insert({
    movement_type: input.movementType,
    amount: input.amount,
    created_by_id: input.createdById,
    created_by_name: input.createdByName,
  });
  if (error) throw new Error(`Failed to create safe movement: ${error.message}`);
}
