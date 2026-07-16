import { getSupabaseServerClient } from "./supabase.server";

export type ShiftSessionStatus = "open" | "closed" | "reconciled" | "cancelled";

export type ShiftSession = {
  id: number;
  stationName: string;
  csrName: string;
  openCounts: Record<string, number>;
  openTotal: number;
  openedAt: string;
  closeCsrName: string;
  closeCounts: Record<string, number>;
  closeTotal: number;
  closedAt: string;
  status: ShiftSessionStatus;
  reconciledByName: string;
  reconciledAt: string;
  closureId: number | null;
  isTest: boolean;
};

type DbShiftSessionRow = {
  id: number;
  station_name: string;
  csr_name: string;
  open_counts: Record<string, number> | null;
  open_total: number;
  opened_at: string;
  close_csr_name: string | null;
  close_counts: Record<string, number> | null;
  close_total: number | null;
  closed_at: string | null;
  status: ShiftSessionStatus;
  reconciled_by_name: string | null;
  reconciled_at: string | null;
  closure_id: number | null;
  is_test: boolean;
};

function fromDb(row: DbShiftSessionRow): ShiftSession {
  return {
    id: row.id,
    stationName: row.station_name,
    csrName: row.csr_name,
    openCounts: row.open_counts ?? {},
    openTotal: row.open_total,
    openedAt: row.opened_at,
    closeCsrName: row.close_csr_name ?? "",
    closeCounts: row.close_counts ?? {},
    closeTotal: row.close_total ?? 0,
    closedAt: row.closed_at ?? "",
    status: row.status,
    reconciledByName: row.reconciled_by_name ?? "",
    reconciledAt: row.reconciled_at ?? "",
    closureId: row.closure_id,
    isTest: row.is_test,
  };
}

type QueryResult = Promise<{ data: DbShiftSessionRow[] | null; error: { message: string } | null }>;
type SingleResult = Promise<{ data: DbShiftSessionRow | null; error: { message: string } | null }>;

type Chain = {
  eq: (column: string, value: string | number | boolean) => Chain;
  in: (column: string, values: string[]) => Chain;
  order: (column: string, opts: { ascending: boolean }) => QueryResult;
};

function sessionsTable() {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_shift_sessions",
  ) as {
    select: (columns: string) => Chain;
    insert: (row: Record<string, unknown>) => {
      select: () => { single: () => SingleResult };
    };
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: number,
      ) => {
        eq: (column: string, value: string) => { select: () => { single: () => SingleResult } };
      };
    };
  };
}

// --- Kiosk operations ------------------------------------------------------
// Called both from the public /session page (no auth, always isTest=false -
// see sessions.ts) and from the dev-only test dialog (always isTest=true).
// The (station_name, is_test) unique index lets a real and a test session
// coexist on the same station without conflicting.

export async function listCsrNames(): Promise<string[]> {
  const { data, error } = await (
    getSupabaseServerClient() as any
  )
    .from("backoffice_csrs")
    .select("name")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(
      `Impossible de charger les CSR : ${error.message}`,
    );
  }

  return (data ?? [])
    .map((csr: { name: string }) => csr.name.trim())
    .filter(Boolean);
}

export async function listOpenSessions(isTest: boolean): Promise<ShiftSession[]> {
  const { data, error } = await sessionsTable()
    .select("*")
    .eq("status", "open")
    .eq("is_test", isTest)
    .order("opened_at", { ascending: true });
  if (error) throw new Error(`Failed to list open sessions: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function openSession(input: {
  stationName: string;
  csrName: string;
  counts: Record<string, number>;
  total: number;
  isTest: boolean;
}): Promise<ShiftSession> {
  const { data, error } = await sessionsTable()
    .insert({
      station_name: input.stationName,
      csr_name: input.csrName,
      open_counts: input.counts,
      open_total: input.total,
      is_test: input.isTest,
    })
    .select()
    .single();

  if (error || !data) {
    if (error?.message.includes("one_open_per_station")) {
      throw new Error(`Une session est deja ouverte pour ${input.stationName}. Ferme-la d'abord.`);
    }
    throw new Error(`Failed to open session: ${error?.message ?? "unknown error"}`);
  }
  return fromDb(data);
}

export async function closeSession(input: {
  sessionId: number;
  counts: Record<string, number>;
  total: number;
}): Promise<ShiftSession> {
  const currentSession = await getSessionById(input.sessionId);

  if (!currentSession || currentSession.status !== "open") {
    throw new Error(
      "Impossible de fermer cette session (déjà fermée ?)",
    );
  }

  const { data, error } = await sessionsTable()
    .update({
      // Reprend automatiquement le nom utilisé à l'ouverture
      close_csr_name: currentSession.csrName,
      close_counts: input.counts,
      close_total: input.total,
      closed_at: new Date().toISOString(),
      status: "closed",
    })
    .eq("id", input.sessionId)
    .eq("status", "open")
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      "Impossible de fermer cette session (déjà fermée ?)",
    );
  }

  return fromDb(data);
}
// --- Supervisor operations (auth handled in sessions.ts wrappers) ---------

export async function listSessionsForReconciliation(isTest: boolean): Promise<ShiftSession[]> {
  const { data, error } = await sessionsTable()
    .select("*")
    .in("status", ["open", "closed"])
    .eq("is_test", isTest)
    .order("opened_at", { ascending: false });
  if (error) throw new Error(`Failed to list sessions: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function getSessionById(id: number): Promise<ShiftSession | null> {
  const { data, error } = await sessionsTable()
    .select("*")
    .eq("id", id)
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to fetch session: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

// The shift session reconciled into a given closure - used to show the
// opening drawer count on the printed receipt.
export async function getSessionByClosureId(closureId: number): Promise<ShiftSession | null> {
  const { data, error } = await sessionsTable()
    .select("*")
    .eq("closure_id", closureId)
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to fetch session by closure: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? fromDb(row) : null;
}

// Batched version of getSessionByClosureId - used by reports that list many
// closures at once and need each one's opening time.
export async function listSessionsByClosureIds(closureIds: number[]): Promise<ShiftSession[]> {
  if (closureIds.length === 0) return [];
  const { data, error } = await sessionsTable()
    .select("*")
    .in("closure_id", closureIds.map(String))
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to fetch sessions by closures: ${error.message}`);
  return (data ?? []).map(fromDb);
}

// Supervisor force-closes a lingering open session (e.g. CSR left without
// closing): it moves to the pending-reconciliation queue with NO final
// count (close_total 0 / empty counts - the drawer gets counted during
// reconciliation), and the station becomes free to open again.
export async function forceCloseSession(id: number, byName: string): Promise<void> {
  const { error } = await sessionsTable()
    .update({
      close_csr_name: `${byName} (fermeture forcee)`,
      close_counts: {},
      close_total: 0,
      closed_at: new Date().toISOString(),
      status: "closed",
    })
    .eq("id", id)
    .eq("status", "open")
    .select()
    .single()
    .then((r) => r)
    .catch((e: Error) => ({ data: null, error: { message: e.message } }));
  if (error) throw new Error("Impossible de forcer la fermeture (session deja fermee ?).");
}

// A supervisor doing a direct "Fermeture de caisse" on a station with an
// open CSR session implicitly ends that shift: close and reconcile the
// session in one step so it doesn't linger in the "shifts en cours" list.
// Returns true if an open session was absorbed.
export async function closeAndReconcileOpenSession(input: {
  stationName: string;
  closureId: number;
  byName: string;
  counts: Record<string, number>;
  total: number;
  isTest: boolean;
}): Promise<boolean> {
  const open = await listOpenSessions(input.isTest);
  const session = open.find((s) => s.stationName === input.stationName);
  if (!session) return false;

  const now = new Date().toISOString();
  const { error } = await sessionsTable()
    .update({
      close_csr_name: input.byName,
      close_counts: input.counts,
      close_total: input.total,
      closed_at: now,
      status: "reconciled",
      closure_id: input.closureId,
      reconciled_by_name: input.byName,
      reconciled_at: now,
    })
    .eq("id", session.id)
    .eq("status", "open")
    .select()
    .single()
    .then((r) => r)
    .catch((e: Error) => ({ data: null, error: { message: e.message } }));
  if (error) return false;
  return true;
}

export async function markSessionReconciled(input: {
  sessionId: number;
  closureId: number;
  reconciledByName: string;
}): Promise<void> {
  const { error } = await sessionsTable()
    .update({
      status: "reconciled",
      closure_id: input.closureId,
      reconciled_by_name: input.reconciledByName,
      reconciled_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .eq("status", "closed")
    .select()
    .single()
    .then((r) => r)
    .catch((e: Error) => ({ data: null, error: { message: e.message } }));
  if (error) throw new Error("Impossible de marquer la session comme reconciliee.");
}

// Reverses markSessionReconciled/closeAndReconcileOpenSession: puts the
// session this closure was reconciled into back into the pending-
// reconciliation queue, detached from the (about to be cancelled) closure.
// A no-op if this closure has no linked session (a direct closure with no
// CSR session behind it never had one).
export async function reopenSessionByClosureId(closureId: number): Promise<void> {
  const session = await getSessionByClosureId(closureId);
  if (!session) return;

  const { error } = await sessionsTable()
    .update({
      status: "closed",
      closure_id: null,
      reconciled_by_name: null,
      reconciled_at: null,
    })
    .eq("id", session.id)
    .eq("status", "reconciled")
    .select()
    .single()
    .then((r) => r)
    .catch((e: Error) => ({ data: null, error: { message: e.message } }));
  if (error) throw new Error("Impossible de reouvrir la session liee a cette fermeture.");
}
