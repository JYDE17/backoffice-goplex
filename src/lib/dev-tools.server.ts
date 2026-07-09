import { getSupabaseServerClient } from "./supabase.server";

export type CleanupResult = {
  sessionsDeleted: number;
  closuresDeleted: number;
  depositsDeleted: number;
};

// Deletes everything the dev role has created (is_test = true), plus any
// shift session that got reconciled into one of those test closures. Real
// data (is_test = false) is never touched - the filters below are the only
// thing standing between this and deleting production records, so keep
// them explicit rather than "delete all, re-insert real ones".
export async function cleanupTestData(): Promise<CleanupResult> {
  const client = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: boolean) => Promise<{ data: { id: number }[] | null; error: { message: string } | null }>;
      };
      delete: () => {
        select: () => {
          in: (column: string, values: number[]) => Promise<{ data: { id: number }[] | null; error: { message: string } | null }>;
          eq: (column: string, value: boolean) => Promise<{ data: { id: number }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data: testClosures, error: selectError } = await client
    .from("backoffice_closures")
    .select("id")
    .eq("is_test", true);
  if (selectError) throw new Error(`Failed to list test closures: ${selectError.message}`);
  const testClosureIds = (testClosures ?? []).map((c) => c.id);

  let sessionsDeleted = 0;
  if (testClosureIds.length > 0) {
    const { data: deletedSessions, error: sessionsError } = await client
      .from("backoffice_shift_sessions")
      .delete()
      .select()
      .in("closure_id", testClosureIds);
    if (sessionsError) throw new Error(`Failed to delete test sessions: ${sessionsError.message}`);
    sessionsDeleted = deletedSessions?.length ?? 0;
  }

  const { data: deletedClosures, error: closuresError } = await client
    .from("backoffice_closures")
    .delete()
    .select()
    .eq("is_test", true);
  if (closuresError) throw new Error(`Failed to delete test closures: ${closuresError.message}`);

  const { data: deletedDeposits, error: depositsError } = await client
    .from("backoffice_deposits")
    .delete()
    .select()
    .eq("is_test", true);
  if (depositsError) throw new Error(`Failed to delete test deposits: ${depositsError.message}`);

  return {
    sessionsDeleted,
    closuresDeleted: deletedClosures?.length ?? 0,
    depositsDeleted: deletedDeposits?.length ?? 0,
  };
}
