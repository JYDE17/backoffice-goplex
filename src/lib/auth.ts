import { createServerFn } from "@tanstack/react-start";

export const login = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { loginEmployee } = await import("./auth.server");
    return loginEmployee(data.username, data.password);
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutEmployee } = await import("./auth.server");
  await logoutEmployee();
  return { ok: true };
});

export const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("./auth.server");
  return getCurrentUser();
});

export const addEmployee = createServerFn({ method: "POST" })
  .validator(
    (data: {
      username: string;
      password: string;
      displayName: string;
      role: import("./roles").EmployeeRole;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireEmployeeManager, createEmployee } = await import("./auth.server");
    const currentUser = await requireEmployeeManager();
    await createEmployee(data, currentUser.role);
    return { ok: true };
  });

export const removeEmployeeFn = createServerFn({ method: "POST" })
  .validator((data: { employeeId: string }) => data)
  .handler(async ({ data }) => {
    const { removeEmployee } = await import("./auth.server");
    await removeEmployee(data.employeeId);
    return { ok: true };
  });

export const getEmployees = createServerFn({ method: "GET" }).handler(async () => {
  const { requireEmployeeManager, listEmployees } = await import("./auth.server");
  await requireEmployeeManager();
  return listEmployees();
});

// Available to any logged-in user (not just admins) — used to populate the
// "who worked this POS shift" picker when closing a register.
export const getEmployeeNames = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser, listEmployees } = await import("./auth.server");
  const user = await getCurrentUser();
  if (!user) throw new Error("Non authentifié.");
  const employees = await listEmployees();
  return employees.map((e) => ({ id: e.id, displayName: e.displayName }));
});

// Dev-only "view as" preview - see auth.server.ts's setViewAsRole/AuthedUser.viewAsRole.
export const setViewAsRoleFn = createServerFn({ method: "POST" })
  .validator((data: { role: import("./roles").EmployeeRole }) => data)
  .handler(async ({ data }) => {
    const { setViewAsRole } = await import("./auth.server");
    await setViewAsRole(data.role);
    return { ok: true };
  });

export const clearViewAsRoleFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearViewAsRole } = await import("./auth.server");
  await clearViewAsRole();
  return { ok: true };
});
