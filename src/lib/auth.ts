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
      role: "admin" | "superviseur";
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin, createEmployee } = await import("./auth.server");
    await requireAdmin();
    await createEmployee(data);
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
  const { requireAdmin, listEmployees } = await import("./auth.server");
  await requireAdmin();
  return listEmployees();
});
