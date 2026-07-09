import { createServerFn } from "@tanstack/react-start";

export const cleanupTestDataFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireDev } = await import("./auth.server");
  await requireDev();

  const { cleanupTestData } = await import("./dev-tools.server");
  return cleanupTestData();
});
