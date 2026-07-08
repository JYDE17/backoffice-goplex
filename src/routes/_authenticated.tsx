import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getSessionUser } from "@/lib/auth";
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

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

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
