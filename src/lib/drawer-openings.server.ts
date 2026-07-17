import { getSupabaseServerClient } from "./supabase.server";

export type DrawerOpeningRow = {
  id: number;
  stationName: string;
  csrName: string;
  openedAt: string;
  isTest: boolean;
};

type DbDrawerOpeningRow = {
  id: number;
  station_name: string;
  csr_name: string;
  opened_at: string;
  is_test: boolean;
};

function fromDb(row: DbDrawerOpeningRow): DrawerOpeningRow {
  return {
    id: row.id,
    stationName: row.station_name,
    csrName: row.csr_name,
    openedAt: row.opened_at,
    isTest: row.is_test,
  };
}

type DrawerOpeningsQueryResult = Promise<{
  data: DbDrawerOpeningRow[] | null;
  error: { message: string } | null;
}>;

type DrawerOpeningsQueryChain = {
  eq: (column: string, value: string | boolean) => DrawerOpeningsQueryChain;
  gte: (column: string, value: string) => DrawerOpeningsQueryChain;
  order: (column: string, opts: { ascending: boolean }) => DrawerOpeningsQueryResult;
};

function drawerOpeningsTable(): {
  select: (columns: string) => DrawerOpeningsQueryChain;
  insert: (row: Record<string, unknown>) => {
    select: () => {
      single: () => Promise<{ data: DbDrawerOpeningRow | null; error: { message: string } | null }>;
    };
  };
} {
  return (getSupabaseServerClient() as unknown as { from: (table: string) => unknown }).from(
    "backoffice_drawer_openings",
  ) as ReturnType<typeof drawerOpeningsTable>;
}

// Logged after the drawer physically pops (see openCashDrawer in
// qz-print.ts) - a failed print/open never reaches this, so the log stays
// accurate to real openings only.
export async function createDrawerOpening(input: {
  stationName: string;
  csrName: string;
  isTest: boolean;
}): Promise<void> {
  const { error } = await drawerOpeningsTable()
    .insert({
      station_name: input.stationName,
      csr_name: input.csrName,
      is_test: input.isTest,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to log drawer opening: ${error.message}`);
}

export async function listDrawerOpenings(filters: {
  date?: string;
  stationName?: string;
  since?: string;
  isTest: boolean;
}): Promise<DrawerOpeningRow[]> {
  let query = drawerOpeningsTable().select("*").eq("is_test", filters.isTest);
  if (filters.stationName) query = query.eq("station_name", filters.stationName);
  if (filters.since) query = query.gte("opened_at", filters.since);

  const { data, error } = await query.order("opened_at", { ascending: false });
  if (error) throw new Error(`Failed to list drawer openings: ${error.message}`);
  let rows = (data ?? []).map(fromDb);
  // opened_at is a timestamptz, not a date column - filtered here against the
  // same local "business date" (4h cutoff) used everywhere else in the app,
  // not a raw UTC slice which would misfile anything opened in the evening.
  if (filters.date) {
    const { businessDateString } = await import("./dates");
    rows = rows.filter((r) => businessDateString(new Date(r.openedAt)) === filters.date);
  }
  return rows;
}
