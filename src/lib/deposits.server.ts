import { getSupabaseServerClient } from "./supabase.server";
import { localDateString } from "./dates";
import type { ClosureRow } from "./closures.server";
import type { VeloceSaleRow } from "./veloce-sales.server";

export type DepositSource = "karting" | "resto";

export type DepositRow = {
  id: number;
  depositDate: string;
  totalAmount: number;
  bankName: string;
  createdById: string;
  createdByName: string;
  verifiedByName: string;
  source: DepositSource;
  createdAt: string;
};

type DbDepositRow = {
  id: number;
  deposit_date: string;
  total_amount: number;
  bank_name: string | null;
  created_by_id: string | null;
  created_by_name: string;
  verified_by_name: string | null;
  source: string | null;
  created_at: string;
};

function fromDb(row: DbDepositRow): DepositRow {
  return {
    id: row.id,
    depositDate: row.deposit_date,
    totalAmount: row.total_amount,
    bankName: row.bank_name ?? "",
    createdById: row.created_by_id ?? "",
    createdByName: row.created_by_name,
    verifiedByName: row.verified_by_name ?? "",
    source: (row.source as DepositSource) ?? "karting",
    createdAt: row.created_at,
  };
}

// Same pragmatic typing approach as closures.server.ts — the PostgREST query
// builder's exact shape varies by which filters are chained, so we only type
// the resolved { data, error } result.
function depositsTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_deposits",
  ) as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        single: () => Promise<{ data: DbDepositRow | null; error: { message: string } | null }>;
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: DbDepositRow[] | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{ data: DbDepositRow | null; error: { message: string } | null }>;
      };
    };
  };
}

function closuresTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_closures",
  ) as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        is: (
          column: string,
          value: null,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string | boolean,
      ) => {
        is: (column: string, value: null) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

function closureFromDb(row: unknown): ClosureRow {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as number,
    closureDate: r.closure_date as string,
    stationName: r.station_name as string,
    employeeName: r.employee_name as string,
    authorizedById: (r.authorized_by_id as string) ?? "",
    authorizedByName: (r.authorized_by_name as string) ?? "",
    fondCaisse: r.fond_caisse as number,
    cashHorsFond: r.cash_hors_fond as number,
    rfCashCumulative: r.rf_cash_cumulative as number,
    rfPosCumulative: r.rf_pos_cumulative as number,
    rfCashDelta: r.rf_cash_delta as number,
    rfPosDelta: r.rf_pos_delta as number,
    cloverPosAmount: r.clover_pos_amount as number,
    cloverPaidCumulative: (r.clover_paid_cumulative as number) ?? 0,
    cloverRefundCumulative: (r.clover_refund_cumulative as number) ?? 0,
    ecartCash: r.ecart_cash as number,
    ecartPos: r.ecart_pos as number,
    depositAmount: r.deposit_amount as number,
    notes: (r.notes as string) ?? "",
    counts: (r.counts as Record<string, number>) ?? {},
    isTest: (r.is_test as boolean) ?? false,
    closedAt: r.closed_at as string,
  };
}

export async function getPendingClosures(isTest: boolean): Promise<ClosureRow[]> {
  const { data, error } = await closuresTable()
    .select("*")
    .eq("is_test", isTest)
    .is("deposit_id", null)
    .order("closed_at", { ascending: true });
  if (error) throw new Error(`Failed to fetch pending closures: ${error.message}`);
  return (data ?? []).map(closureFromDb);
}

export async function createDeposit(input: {
  createdById: string;
  createdByName: string;
  bankName: string;
  isTest: boolean;
  confirmedAmount: number;
  verifiedByName: string;
  source: DepositSource;
}): Promise<{ deposit: DepositRow; closures: ClosureRow[]; veloceSales: VeloceSaleRow[] }> {
  if (!input.verifiedByName.trim()) {
    throw new Error("Le nom de la personne qui a vérifié est obligatoire.");
  }

  // Karting and the restaurant each have their OWN physical drop box, picked
  // up separately - a "karting" recuperation only ever sweeps closures, a
  // "resto" recuperation only ever sweeps Veloce's cash. Never both at once.
  const { getPendingVeloceSales } = await import("./veloce-sales.server");
  const pending = input.source === "karting" ? await getPendingClosures(input.isTest) : [];
  const pendingVeloce = input.source === "resto" ? await getPendingVeloceSales(input.isTest) : [];
  if (pending.length === 0 && pendingVeloce.length === 0) {
    throw new Error(
      input.source === "karting"
        ? "Aucune fermeture en attente de dépôt."
        : "Aucune vente resto en attente de dépôt.",
    );
  }
  // Each pending resto day must have its physically-counted amount confirmed
  // first - the recuperation sweeps that real count, not Veloce's reported
  // cashAmount, into the safe.
  if (pendingVeloce.some((s) => s.confirmedAmount === null)) {
    throw new Error(
      "Chaque jour de vente resto en attente doit être confirmé (montant réel) avant la récupération.",
    );
  }
  const totalAmount =
    pending.reduce((sum, c) => sum + c.depositAmount, 0) +
    pendingVeloce.reduce((sum, s) => sum + (s.confirmedAmount ?? s.cashAmount), 0);

  // The double-entry check itself happens client-side (the employee retypes
  // the amount twice); this re-checks the confirmed amount against the
  // system total server-side so a stale/tampered client can't sweep the
  // drop box for the wrong amount.
  if (Math.abs(input.confirmedAmount - totalAmount) > 0.01) {
    throw new Error(
      `Le montant confirmé (${input.confirmedAmount.toFixed(2)} $) ne correspond pas au total en attente (${totalAmount.toFixed(2)} $).`,
    );
  }

  const { data: inserted, error: insertError } = await depositsTable()
    .insert({
      deposit_date: localDateString(),
      total_amount: totalAmount,
      bank_name: input.bankName || null,
      created_by_id: input.createdById,
      created_by_name: input.createdByName,
      verified_by_name: input.verifiedByName.trim(),
      source: input.source,
      is_test: input.isTest,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to create deposit: ${insertError?.message ?? "unknown error"}`);
  }

  if (input.source === "karting") {
    const { error: updateError } = await closuresTable()
      .update({ deposit_id: inserted.id })
      .eq("is_test", input.isTest)
      .is("deposit_id", null);
    if (updateError) throw new Error(`Failed to link closures to deposit: ${updateError.message}`);
  } else {
    const { linkVeloceSalesToDeposit } = await import("./veloce-sales.server");
    await linkVeloceSalesToDeposit(inserted.id, input.isTest);
  }

  // A recuperation is money physically pulled from a drop box into the
  // safe - not yet at the bank. Reflect that in the coffre-fort balance
  // automatically instead of requiring a separate manual entry on /coffre.
  // Test-account recuperations must never touch the real safe balance.
  if (!input.isTest) {
    const { createSafeMovement } = await import("./safe.server");
    await createSafeMovement({
      movementType: "depot",
      amount: totalAmount,
      createdById: input.createdById,
      createdByName: input.createdByName,
    });
  }

  return { deposit: fromDb(inserted), closures: pending, veloceSales: pendingVeloce };
}

export async function getDepositById(
  id: number,
): Promise<{ deposit: DepositRow; closures: ClosureRow[]; veloceSales: VeloceSaleRow[] } | null> {
  const { data: deposit, error } = await depositsTable().select("*").eq("id", String(id)).single();
  if (error || !deposit) return null;

  const { data: closuresData, error: closuresError } = await closuresTable()
    .select("*")
    .eq("deposit_id", String(id))
    .order("closed_at", { ascending: true });
  if (closuresError) throw new Error(`Failed to fetch deposit closures: ${closuresError.message}`);

  const { getVeloceSalesByDepositId } = await import("./veloce-sales.server");
  const veloceSales = await getVeloceSalesByDepositId(id);

  return {
    deposit: fromDb(deposit),
    closures: (closuresData ?? []).map(closureFromDb),
    veloceSales,
  };
}

export async function listDeposits(isTest: boolean): Promise<DepositRow[]> {
  const { data, error } = await depositsTable()
    .select("*")
    .eq("is_test", isTest)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list deposits: ${error.message}`);
  return (data ?? []).map(fromDb);
}
