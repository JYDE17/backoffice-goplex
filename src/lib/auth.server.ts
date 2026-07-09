import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { getServerEnv } from "./env.server";
import { getSupabaseServerClient } from "./supabase.server";

const SESSION_COOKIE = "backoffice_session";
const SESSION_DAYS = 14;
const SYNTHETIC_EMAIL_DOMAIN = "backoffice.internal";

import { hasAdminRights, type EmployeeRole } from "./roles";

export type { EmployeeRole };

export type AuthedUser = {
  id: string;
  username: string;
  displayName: string;
  role: EmployeeRole;
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
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

function readSessionToken(): string | null {
  const header = getRequestHeader("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === SESSION_COOKIE) return part.slice(eq + 1);
  }
  return null;
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

  const { data: authData, error: authError } = await getSupabaseAnonClient().auth.signInWithPassword({
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
              data: { id: string; username: string; display_name: string; role: EmployeeRole } | null;
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
  return {
    id: employee.id,
    username: employee.username,
    displayName: employee.display_name,
    role: employee.role,
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
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (!hasAdminRights(user.role)) throw new Error("Réservé aux administrateurs.");
  return user;
}

export async function requireDev(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  if (user.role !== "dev") throw new Error("Réservé au compte dev.");
  return user;
}

export async function createEmployee(input: {
  username: string;
  password: string;
  displayName: string;
  role: EmployeeRole;
}): Promise<void> {
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
          }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
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
  const currentUser = await requireAdmin();
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
      delete: () => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
    };
  };

  const { data: target } = await db.from("backoffice_employees").select("role").eq("id", employeeId);
  if (!target || target.length === 0) throw new Error("Employé introuvable.");

  if (target[0].role === "admin") {
    const { data: admins } = await db.from("backoffice_employees").select("role").eq("role", "admin");
    if ((admins?.length ?? 0) <= 1) {
      throw new Error("Impossible de supprimer le dernier compte admin.");
    }
  }

  const { error: deleteError } = await db.from("backoffice_employees").delete().eq("id", employeeId);
  if (deleteError) throw new Error(`Employee deletion failed: ${deleteError.message}`);

  await (
    client as unknown as {
      auth: { admin: { deleteUser: (id: string) => Promise<unknown> } };
    }
  ).auth.admin.deleteUser(employeeId);
}

export async function listEmployees(): Promise<
  Array<{ id: string; username: string; displayName: string; role: EmployeeRole; createdAt: string }>
> {
  const db = getSupabaseServerClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{
          data:
            | Array<{ id: string; username: string; display_name: string; role: EmployeeRole; created_at: string }>
            | null;
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

  return (data ?? []).map((e) => ({
    id: e.id,
    username: e.username,
    displayName: e.display_name,
    role: e.role,
    createdAt: e.created_at,
  }));
}
