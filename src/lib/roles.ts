// Shared between client and server (no server-only imports here).
// "super_admin" is intentionally NOT one of the roles offered by the
// /employes "add employee" form (see employes.tsx) - it can only ever be
// set directly in the database. Reserved for capabilities too sensitive for
// a regular admin, e.g. manual-entry overrides that bypass RaceFacer/Clover
// sync entirely (see fermeture.tsx).
export type EmployeeRole = "admin" | "superviseur" | "dev" | "super_admin";

// "dev" is a sandbox role with full admin rights - its data is isolated
// (see isTestUser in auth.server.ts) but it can access every screen.
export function hasAdminRights(role: EmployeeRole): boolean {
  return role === "admin" || role === "dev" || role === "super_admin";
}

export function roleLabel(role: EmployeeRole): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "dev") return "Dev";
  return "Superviseur";
}
