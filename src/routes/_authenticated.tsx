import { createFileRoute, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getSessionUser, logout } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import { syncRaceFacerSales } from "@/lib/racefacer-sync";
import { syncCloverSales } from "@/lib/clover-sync";
import { businessDateString } from "@/lib/dates";

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

// Pages that show RaceFacer/Clover-derived sales figures - the only ones
// worth an automatic live resync on login/tab switch. Other tabs (employés,
// paramètres, coffre-fort...) don't read this data, so syncing there would
// just be unnecessary LAN calls to RaceFacer/Clover.
const SALES_SYNC_PATHS = [
  "/",
  "/sessions",
  "/reconciliation",
  "/fermeture",
  "/rapports/ventes-quotidiennes",
  "/rapports/mensuel",
];

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const runLogout = useServerFn(logout);
  const runSyncRaceFacer = useServerFn(syncRaceFacerSales);
  const runSyncClover = useServerFn(syncCloverSales);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Auto-resync on login and every tab switch, so a page's cached RaceFacer/
  // Clover figures (read via getRaceFacerSales/getCloverSales) never show
  // stale data just because nobody hit the manual "Resynchroniser" button.
  useEffect(() => {
    if (!SALES_SYNC_PATHS.includes(pathname)) return;
    let cancelled = false;
    const today = businessDateString();
    (async () => {
      try {
        await Promise.all([
          runSyncRaceFacer({ data: { date: today } }),
          runSyncClover({ data: { date: today } }),
        ]);
      } catch {
        // Best-effort - pages fall back to the last successfully synced data.
      } finally {
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["racefacer-sales", today] });
          queryClient.invalidateQueries({ queryKey: ["clover-sales", today] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // runSyncRaceFacer/runSyncClover are useServerFn wrappers, not stable
    // across renders - only re-sync when the tab (pathname) actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, queryClient]);

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
