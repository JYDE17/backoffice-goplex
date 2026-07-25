import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { getServerEnv } from "./env.server";
import { getSupabaseServerClient } from "./supabase.server";

const SESSION_COOKIE = "backoffice_session";
const SESSION_DAYS = 14;
const SYNTHETIC_EMAIL_DOMAIN = "backoffice.internal";

import {
  hasAdminRights,
  canManageEmployees,
  canCreateOrRemoveRole,
  roleLabel,
  VIEWABLE_ROLES,
  type EmployeeRole,
} from "./roles";

export type { EmployeeRole };

export type AuthedUser = {
  id: string;
  username: string;
  displayName: string;
  role: EmployeeRole;
  // Set only for the "dev" role, when it has an active "view as" preview
  // (see setViewAsRole/clearViewAsRole below). Everywhere page access or
  // navigation is decided, use effectiveRole(user) from roles.ts instead of
  // .role directly, so the preview actually changes what's visible/
  // reachable. Mutations keep checking .role (the real role) so the dev
  // account never loses its real, sandboxed abilities while previewing.
  viewAsRole?: EmployeeRole;
};

// A "dev"-role account is a sandbox: everything it creates (closures,
// deposits) is flagged is_test and invisible to real accounts, and it only
// ever sees its own test data. Lets the full flow be exercised in
// production without polluting reports, pending deposits, or stats.
export function isTestUser(user: AuthedUser): boolean {
  return user.role === "dev";
}

function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

let anonClient: ReturnType<typeof createClient> | undefined;
function getSupabaseAnonClient() {
  if (!anonClient) {
    anonClient = createClient(getServerEnv("SUPABASE_URL"), getServerEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

// --- Cookie helpers -------------------------------------------------------

export function setSessionCookie(token: string) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  setResponseHeader(
    "Set-Cookie",
    [`${SESSION_COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`].join(
      "; ",
    ),
  );
}

export function clearSessionCookie() {
  setResponseHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function readCookie(name: string): string | null {
  const header = getRequestHeader("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

function readSessionToken(): string | null {
  return readCookie(SESSION_COOKIE);
}

// --- "View as" cookie (dev-only UI preview, see AuthedUser.viewAsRole) ----

const VIEW_AS_COOKIE = "backoffice_view_as_role";

function setViewAsRoleCookie(role: EmployeeRole) {
  setResponseHeader(
    "Set-Cookie",
    [`${VIEW_AS_COOKIE}=${role}`, "HttpOnly", "SameSite=Lax", "Path=/"].join("; "),
  );
}

function clearViewAsRoleCookie() {
  setResponseHeader("Set-Cookie", `${VIEW_AS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// --- Rate limiting (in-memory, per-username) -------------------------------

const attempts = new Map<string, { count: number; windowStart: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new Error("Trop de tentatives. Réessaie dans quelques minutes.");
  }
}

// --- Core auth operations ---------------------------------------------------

export async function loginEmployee(username: string, password: string): Promise<AuthedUser> {
  const normalizedUsername = username.trim().toLowerCase();
  checkRateLimit(normalizedUsername);

  const { data: authData, error: authError } =
    await getSupabaseAnonClient().auth.signInWithPassword({
      email: usernameToEmail(normalizedUsername),
      password,
    });

  if (authError || !authData.user) {
    throw new Error("Identifiant ou mot de passe invalide.");
  }

  const { data: employee, error: employeeError } = await (
    getSupabaseServerClient() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            single: () => Promise<{
              data: {
                id: string;
                username: string;
                display_name: string;
                role: EmployeeRole;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from("backoffice_employees")
    .select("id, username, display_name, role")
    .eq("id", authData.user.id)
    .single();

  if (employeeError || !employee) {
    throw new Error("Identifiant ou mot de passe invalide.");
  }

  // Rotate: destroy any existing sessions for this employee, then issue a fresh one.
  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      delete: () => { eq: (column: string, value: string) => Promise<unknown> };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  await db.from("backoffice_sessions").delete().eq("employee_id", employee.id);

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await db.from("backoffice_sessions").insert({
    token,
    employee_id: employee.id,
    expires_at: expiresAt,
  });
  if (insertError) throw new Error(`Session creation failed: ${insertError.message}`);

  setSessionCookie(token);

  return {
    id: employee.id,
    username: employee.username,
    displayName: employee.display_name,
    role: employee.role,
  };
}

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const token = readSessionToken();
  if (!token) return null;

  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          single: () => Promise<{
            data: {
              expires_at: string;
              backoffice_employees: {
                id: string;
                username: string;
                display_name: string;
                role: EmployeeRole;
              } | null;
            } | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data } = await db
    .from("backoffice_sessions")
    .select("expires_at, backoffice_employees(id, username, display_name, role)")
    .eq("token", token)
    .single();

  if (!data || !data.backoffice_employees) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const employee = data.backoffice_employees;

  let viewAsRole: EmployeeRole | undefined;
  if (employee.role === "dev") {
    const raw = readCookie(VIEW_AS_COOKIE);
    if (raw && (VIEWABLE_ROLES as string[]).includes(raw)) {
      viewAsRole = raw as EmployeeRole;
    }
  }

  return {
    id: employee.id,
    username: employee.username,
    displayName: employee.display_name,
    role: employee.role,
    viewAsRole,
  };
}

export async function logoutEmployee(): Promise<void> {
  const token = readSessionToken();
  if (token) {
    const db = getSupabaseServerClient() as unknown as {
      from: (table: string) => {
        delete: () => { eq: (column: string, value: string) => Promise<unknown> };
      };
    };
    await db.from("backoffice_sessions").delete().eq("token", token);
  }
  clearSessionCookie();
  clearViewAsRoleCookie();
}

// Dev-only UI preview: lets the dev account browse the app as if it were
// another role, to check what each role actually sees, without touching
// its real permissions - see AuthedUser.viewAsRole above. Checks the real
// .role (never the current preview), so this can't be used to lock the dev
// account out of its own switcher, and mutations elsewhere keep using the
// real role too.
export async function setViewAsRole(role: EmployeeRole): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (user.role !== "dev") throw new Error("Réservé au compte dev.");
  if (!(VIEWABLE_ROLES as EmployeeRole[]).includes(role)) throw new Error("Rôle invalide.");
  setViewAsRoleCookie(role);
}

export async function clearViewAsRole(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (user.role !== "dev") throw new Error("Réservé au compte dev.");
  clearViewAsRoleCookie();
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (!hasAdminRights(user.role)) throw new Error("Réservé aux administrateurs.");
  return user;
}

// Narrower than requireAdmin - direction_cuisine can manage employees
// (scoped to front_of_house, enforced separately via canCreateOrRemoveRole)
// without having hasAdminRights' full page access, and manager has
// hasAdminRights but explicitly CANNOT manage employee accounts at all
// (its only employee-adjacent capability is the CSR roster).
export async function requireEmployeeManager(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (!canManageEmployees(user.role)) throw new Error("Réservé à la gestion des employés.");
  return user;
}

export async function requireDev(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (user.role !== "dev") throw new Error("Réservé au compte dev.");
  return user;
}

export async function createEmployee(
  input: {
    username: string;
    password: string;
    displayName: string;
    role: EmployeeRole;
  },
  creatorRole: EmployeeRole,
): Promise<void> {
  if (!canCreateOrRemoveRole(creatorRole, input.role)) {
    throw new Error(`Tu ne peux pas créer un compte "${roleLabel(input.role)}".`);
  }
  const normalizedUsername = input.username.trim().toLowerCase();
  const client = getSupabaseServerClient();

  const { data: created, error: createError } = await (
    client as unknown as {
      auth: {
        admin: {
          createUser: (opts: {
            email: string;
            password: string;
            email_confirm: boolean;
          }) => Promise<{
            data: { user: { id: string } | null };
            error: { message: string } | null;
          }>;
        };
      };
    }
  ).auth.admin.createUser({
    email: usernameToEmail(normalizedUsername),
    password: input.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Impossible de créer le compte.");
  }

  const db = client as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error: insertError } = await db.from("backoffice_employees").insert({
    id: created.user.id,
    username: normalizedUsername,
    display_name: input.displayName,
    role: input.role,
  });

  if (insertError) throw new Error(`Employee record creation failed: ${insertError.message}`);
}

export async function removeEmployee(employeeId: string): Promise<void> {
  const currentUser = await requireEmployeeManager();
  if (currentUser.id === employeeId) {
    throw new Error("Tu ne peux pas supprimer ton propre compte.");
  }

  const client = getSupabaseServerClient();
  const db = client as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: { role: EmployeeRole }[] | null; error: { message: string } | null }>;
      };
      delete: () => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data: target } = await db
    .from("backoffice_employees")
    .select("role")
    .eq("id", employeeId);
  if (!target || target.length === 0) throw new Error("Employé introuvable.");

  if (!canCreateOrRemoveRole(currentUser.role, target[0].role)) {
    throw new Error(`Tu ne peux pas supprimer un compte "${roleLabel(target[0].role)}".`);
  }

  if (target[0].role === "admin") {
    const { data: admins } = await db
      .from("backoffice_employees")
      .select("role")
      .eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) {
      throw new Error("Impossible de supprimer le dernier compte admin.");
    }
  }

  const { error: deleteError } = await db
    .from("backoffice_employees")
    .delete()
    .eq("id", employeeId);
  if (deleteError) throw new Error(`Employee deletion failed: ${deleteError.message}`);

  await (
    client as unknown as {
      auth: { admin: { deleteUser: (id: string) => Promise<unknown> } };
    }
  ).auth.admin.deleteUser(employeeId);
}

// Changing a role is checked both ways against the same hierarchy as
// create/delete (canCreateOrRemoveRole): the actor needs authority over the
// employee's CURRENT role (so e.g. direction_cuisine can't touch a
// superviseur account at all) AND over the NEW role being granted (so e.g.
// directeur_general can promote a manager to comptable but never to
// directeur_general or admin - manager itself has no authority here, since
// canCreateOrRemoveRole never returns true for it). "dev"/"super_admin" are
// never valid on either side - both stay database-only, same as they're
// never offered in the "add employee" role dropdown (creatableRoles).
export async function changeEmployeeRole(employeeId: string, newRole: EmployeeRole): Promise<void> {
  const currentUser = await requireEmployeeManager();
  if (currentUser.id === employeeId) {
    throw new Error("Tu ne peux pas changer ton propre rôle.");
  }
  if (newRole === "dev" || newRole === "super_admin") {
    throw new Error(`Le rôle "${roleLabel(newRole)}" ne peut être attribué qu'en base de données.`);
  }

  const client = getSupabaseServerClient();
  const db = client as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: { role: EmployeeRole }[] | null; error: { message: string } | null }>;
      };
      update: (row: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data: target } = await db
    .from("backoffice_employees")
    .select("role")
    .eq("id", employeeId);
  if (!target || target.length === 0) throw new Error("Employé introuvable.");
  const currentRole = target[0].role;

  if (currentRole === "dev" || currentRole === "super_admin") {
    throw new Error("Ce compte ne peut être modifié qu'en base de données.");
  }
  if (!canCreateOrRemoveRole(currentUser.role, currentRole)) {
    throw new Error(`Tu ne peux pas modifier un compte "${roleLabel(currentRole)}".`);
  }
  if (!canCreateOrRemoveRole(currentUser.role, newRole)) {
    throw new Error(`Tu ne peux pas attribuer le rôle "${roleLabel(newRole)}".`);
  }
  if (currentRole === newRole) return;

  if (currentRole === "admin") {
    const { data: admins } = await db
      .from("backoffice_employees")
      .select("role")
      .eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) {
      throw new Error("Impossible de changer le rôle du dernier compte admin.");
    }
  }

  const { error: updateError } = await db
    .from("backoffice_employees")
    .update({ role: newRole })
    .eq("id", employeeId);
  if (updateError) throw new Error(`Employee role update failed: ${updateError.message}`);
}

export async function listEmployees(): Promise<
  Array<{
    id: string;
    username: string;
    displayName: string;
    role: EmployeeRole;
    createdAt: string;
  }>
> {
  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{
          data: Array<{
            id: string;
            username: string;
            display_name: string;
            role: EmployeeRole;
            created_at: string;
          }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const { data, error } = await db
    .from("backoffice_employees")
    .select("id, username, display_name, role, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list employees: ${error.message}`);

  // super_admin is a hidden system-level account (see roles.ts) - it never
  // appears in the employee directory, the /employes list, or the "who
  // worked this shift" picker (getEmployeeNames, which is built from this
  // same list), regardless of who's asking.
  return (data ?? [])
    .filter((e) => e.role !== "super_admin")
    .map((e) => ({
      id: e.id,
      username: e.username,
      displayName: e.display_name,
      role: e.role,
      createdAt: e.created_at,
    }));
}
