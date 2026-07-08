// Shared between client and server (no server-only imports here).
export type EmployeeRole = "admin" | "superviseur" | "dev";

// "dev" is a sandbox role with full admin rights - its data is isolated
// (see isTestUser in auth.server.ts) but it can access every screen.
export function hasAdminRights(role: EmployeeRole): boolean {
  return role === "admin" || role === "dev";
}

export function roleLabel(role: EmployeeRole): string {
  if (role === "admin") return "Admin";
  if (role === "dev") return "Dev";
  return "Superviseur";
}
