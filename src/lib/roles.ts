// Shared between client and server (no server-only imports here).
// "super_admin" is intentionally NOT one of the roles offered by the
// /employes "add employee" form (see employes.tsx) - it can only ever be
// set directly in the database. Reserved for capabilities too sensitive for
// a regular admin, e.g. manual-entry overrides that bypass RaceFacer/Clover
// sync entirely (see fermeture.tsx).
//
// "directeur_general" and "manager" have the same page access as admin
// (see hasAdminRights below) but a narrower ability to manage OTHER
// employee accounts - see canCreateOrRemoveRole. "direction_cuisine" and
// "front_of_house" are scoped to the restaurant (Véloce) side of the
// business only - see permissions.ts's RESTO_PAGES and isRestoOnlyRole.
export type EmployeeRole =
  | "admin"
  | "directeur_general"
  | "manager"
  | "superviseur"
  | "comptable"
  | "direction_cuisine"
  | "front_of_house"
  | "dev"
  | "super_admin";

// "dev" is a sandbox role with full admin rights - its data is isolated
// (see isTestUser in auth.server.ts) but it can access every screen.
// "directeur_general" and "manager" get the exact same page-level access as
// admin (including the coffre-fort manual adjustment) - what sets them
// apart from admin is a narrower ability to manage employee accounts, see
// canCreateOrRemoveRole below.
export function hasAdminRights(role: EmployeeRole): boolean {
  return (
    role === "admin" ||
    role === "dev" ||
    role === "super_admin" ||
    role === "directeur_general" ||
    role === "manager"
  );
}

// Who can post a MANUAL coffre-fort adjustment on /coffre (action bancaire) -
// the admin-tier roles plus comptable. Automatic movements (récupérations,
// dépôts bancaires) never go through this check; this only gates the manual
// deposit/withdrawal form. Enforced both client-side (coffre.tsx) and
// server-side (createSafeMovementFn).
export function canAdjustSafe(role: EmployeeRole): boolean {
  return hasAdminRights(role) || role === "comptable";
}

export function roleLabel(role: EmployeeRole): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "directeur_general") return "Directeur général";
  if (role === "manager") return "Manager";
  if (role === "dev") return "Dev";
  if (role === "comptable") return "Comptable";
  if (role === "direction_cuisine") return "Direction cuisine";
  if (role === "front_of_house") return "Front of house";
  return "Superviseur";
}

// Everyone above can view/manage employee ACCOUNTS to some degree - manager
// is deliberately excluded even though it has admin-level page access via
// hasAdminRights. "comptable" can manage accounts at the same level as a
// directeur général (see canCreateOrRemoveRole below).
export function canManageEmployees(role: EmployeeRole): boolean {
  return (
    role === "admin" ||
    role === "dev" ||
    role === "super_admin" ||
    role === "directeur_general" ||
    role === "comptable" ||
    role === "direction_cuisine"
  );
}

// Who can create/remove an account of a given target role - the hierarchy
// from the org chart: admin-tier creates anyone; directeur_general and
// comptable each create anyone that isn't admin-tier or another directeur
// général; direction_cuisine only creates front_of_house. Everyone else
// (superviseur, manager, front_of_house) can't create or remove any account.
export function canCreateOrRemoveRole(creator: EmployeeRole, target: EmployeeRole): boolean {
  if (creator === "admin" || creator === "dev" || creator === "super_admin") return true;
  // Comptable is granted the same account-management authority as a directeur
  // général: the exact same set of creatable/removable roles (manager,
  // superviseur, comptable, direction_cuisine, front_of_house), never an
  // admin-tier account or a directeur général. Adding comptable here does not
  // change what a directeur général can already do.
  if (creator === "directeur_general" || creator === "comptable") {
    return (
      target !== "admin" &&
      target !== "dev" &&
      target !== "super_admin" &&
      target !== "directeur_general"
    );
  }
  if (creator === "direction_cuisine") return target === "front_of_house";
  return false;
}

// Roles a given user is allowed to assign when creating a new account -
// drives the role dropdown on /employes (see employes.tsx).
export function creatableRoles(creator: EmployeeRole): EmployeeRole[] {
  const all: EmployeeRole[] = [
    "admin",
    "directeur_general",
    "manager",
    "superviseur",
    "comptable",
    "direction_cuisine",
    "front_of_house",
  ];
  return all.filter((r) => canCreateOrRemoveRole(creator, r));
}

// Roles the dev account can preview via "view as" (see auth.server.ts's
// viewAsRole) - every real login role except super_admin, which stays
// hidden from the dev account just like it's hidden everywhere else
// (listEmployees).
export const VIEWABLE_ROLES: EmployeeRole[] = [
  "admin",
  "directeur_general",
  "manager",
  "superviseur",
  "comptable",
  "direction_cuisine",
  "front_of_house",
];

// The role to use for page-access and navigation decisions. The dev
// account's viewAsRole (if set) overrides its real role for this purpose
// only, so "view as" changes what's visible/reachable in the UI without
// touching what the account can actually do server-side - mutations keep
// checking the real role (requireAdmin, requireEmployeeManager,
// canCreateOrRemoveRole, isTestUser...) so a preview can never lose the
// dev account its real, sandboxed abilities. For every other role this is
// always just role, since only "dev" ever gets a viewAsRole.
export function effectiveRole(user: {
  role: EmployeeRole;
  viewAsRole?: EmployeeRole;
}): EmployeeRole {
  return user.viewAsRole ?? user.role;
}
