import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getSessionUser, logout } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  component: AuthenticatedLayout,
});

// Auto-logout after this much inactivity (no mouse/keyboard/touch) on
// authenticated pages. The public CSR kiosk (/session) is not affected.
const IDLE_LOGOUT_MS = 5 * 60 * 1000;

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const runLogout = useServerFn(logout);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const logoutNow = async () => {
      try {
        await runLogout();
      } finally {
        toast.info("Session fermée après 5 minutes d'inactivité.");
        router.navigate({ to: "/login", search: { redirect: "/" } });
      }
    };

    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(logoutNow, IDLE_LOGOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    // Best-effort logout when the tab/window closes. Browsers can cancel an
    // in-flight request mid-unload, so this isn't a hard guarantee (a
    // force-quit browser process can skip it entirely) - the 5-minute idle
    // timeout above is the actual backstop.
    const onPageHide = () => {
      runLogout();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [router, runLogout]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className="print:hidden">
          <AppSidebar user={user} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-card px-4 sticky top-0 z-10 print:hidden">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="text-sm text-muted-foreground hidden sm:block">
              Session : <span className="font-medium text-foreground">{user.displayName}</span>
              <span className="text-xs ml-1">({roleLabel(user.role)})</span>
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
