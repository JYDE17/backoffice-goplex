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
  };
}

type QueryResult = Promise<{ data: DbShiftSessionRow[] | null; error: { message: string } | null }>;
type SingleResult = Promise<{ data: DbShiftSessionRow | null; error: { message: string } | null }>;

type Chain = {
  eq: (column: string, value: string | number) => Chain;
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

// --- Kiosk operations (no auth - called from the public /session page) ----

export async function listOpenSessions(): Promise<ShiftSession[]> {
  const { data, error } = await sessionsTable()
    .select("*")
    .eq("status", "open")
    .order("opened_at", { ascending: true });
  if (error) throw new Error(`Failed to list open sessions: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function openSession(input: {
  stationName: string;
  csrName: string;
  counts: Record<string, number>;
  total: number;
}): Promise<ShiftSession> {
  const { data, error } = await sessionsTable()
    .insert({
      station_name: input.stationName,
      csr_name: input.csrName,
      open_counts: input.counts,
      open_total: input.total,
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
  csrName: string;
  counts: Record<string, number>;
  total: number;
}): Promise<ShiftSession> {
  const { data, error } = await sessionsTable()
    .update({
      close_csr_name: input.csrName,
      close_counts: input.counts,
      close_total: input.total,
      closed_at: new Date().toISOString(),
      status: "closed",
    })
    .eq("id", input.sessionId)
    // status guard: only an open session can be closed (prevents double
    // submits or racing another kiosk).
    .eq("status", "open")
    .select()
    .single();

  if (error || !data) {
    throw new Error("Impossible de fermer cette session (deja fermee ?).");
  }
  return fromDb(data);
}

// --- Supervisor operations (auth handled in sessions.ts wrappers) ---------

export async function listSessionsForReconciliation(): Promise<ShiftSession[]> {
  const { data, error } = await sessionsTable()
    .select("*")
    .in("status", ["open", "closed"])
    .order("opened_at", { ascending: false });
  if (error) throw new Error(`Failed to list sessions: ${error.message}`);
  return (data ?? []).map(fromDb);
}

export async function getSessionById(id: number): Promise<ShiftSession | null> {
  const { data, error } = await sessionsTable().select("*").eq("id", id).order("id", { ascending: true });
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

export async function cancelSession(id: number): Promise<void> {
  const { error } = await sessionsTable()
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "closed")
    .select()
    .single()
    .then((r) => r)
    .catch((e: Error) => ({ data: null, error: { message: e.message } }));
  if (error) {
    // Also allow cancelling a session still open (e.g. opened by mistake).
    const { error: openError } = await sessionsTable()
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "open")
      .select()
      .single()
      .then((r) => r)
      .catch((e: Error) => ({ data: null, error: { message: e.message } }));
    if (openError) throw new Error("Impossible d'annuler cette session.");
  }
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
}): Promise<boolean> {
  const open = await listOpenSessions();
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
