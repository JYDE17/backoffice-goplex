import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  LayoutDashboard,
  CheckCheck,
  Clock,
  Vault,
  FileBarChart,
  Settings,
  Users,
  LogOut,
  ChevronRight,
  UtensilsCrossed,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { logout } from "@/lib/auth";
import { hasAdminRights } from "@/lib/roles";
import type { AuthedUser } from "@/lib/auth.server";

const mainItems = [
  { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
  { title: "Sessions en cours", url: "/sessions", icon: Clock },
  { title: "Réconciliation", url: "/reconciliation", icon: CheckCheck },
  { title: "Ventes resto (Véloce)", url: "/ventes-resto", icon: UtensilsCrossed },
];

const coffreItems = [
  { title: "Récupération", url: "/recuperation" },
  { title: "Action bancaire (coffre-fort)", url: "/coffre" },
  { title: "Dépôt bancaire", url: "/depots" },
];

// Grouped into sub-sections instead of one long flat list - each group gets
// its own collapsible toggle nested under "Rapports", so e.g. the Véloce
// reports are visually separated from the karting/fermeture ones instead of
// all mixed together.
const reportGroups = [
  {
    label: "Ventes & fermetures",
    items: [
      { title: "Ventes quotidiennes", url: "/rapports/ventes-quotidiennes" },
      { title: "Fermetures", url: "/rapports/fermetures" },
      { title: "Surplus/déficit hebdomadaire", url: "/rapports/hebdomadaire" },
      { title: "Mensuel", url: "/rapports/mensuel" },
    ],
  },
  {
    label: "Véloce",
    items: [
      { title: "Ventes resto (Véloce)", url: "/rapports/ventes-veloce" },
      { title: "Pourboires", url: "/rapports/pourboires" },
    ],
  },
  {
    label: "Coffre-fort & banque",
    items: [
      { title: "Récupérations", url: "/rapports/depots" },
      { title: "Coffre-fort", url: "/rapports/coffre-fort" },
      { title: "Dépôts bancaires", url: "/rapports/depots-bancaires" },
    ],
  },
];

export function AppSidebar({ user }: { user: AuthedUser }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const router = useRouter();
  const runLogout = useServerFn(logout);
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const [reportsOpen, setReportsOpen] = useState(pathname.startsWith("/rapports"));
  const [coffreOpen, setCoffreOpen] = useState(
    pathname.startsWith("/coffre") ||
      pathname.startsWith("/depots") ||
      pathname.startsWith("/recuperation"),
  );
  const [openReportGroups, setOpenReportGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      reportGroups.map((group) => [group.label, group.items.some((item) => pathname === item.url)]),
    ),
  );
  const toggleReportGroup = (label: string) =>
    setOpenReportGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = async () => {
    await runLogout();
    router.navigate({ to: "/login", search: { redirect: "/" } });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img
            src="/assets/png/logo-icon-white.png"
            alt="BackOffice"
            className="h-9 w-9 object-contain shrink-0"
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground">BackOffice</span>
            <span className="text-[11px] text-sidebar-foreground/60">Commerce Suite</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Opérations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActive("/coffre") || isActive("/depots") || isActive("/recuperation")}
                  tooltip="Coffre-fort"
                  onClick={() => setCoffreOpen((v) => !v)}
                >
                  <Vault />
                  <span>Coffre-fort</span>
                  <ChevronRight
                    className={`ml-auto h-4 w-4 transition-transform ${coffreOpen ? "rotate-90" : ""}`}
                  />
                </SidebarMenuButton>
                {coffreOpen && (
                  <SidebarMenuSub>
                    {coffreItems.map((item) => (
                      <SidebarMenuSubItem key={item.url}>
                        <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                          <Link to={item.url}>
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActive("/rapports")}
                  tooltip="Rapports"
                  onClick={() => setReportsOpen((v) => !v)}
                >
                  <FileBarChart />
                  <span>Rapports</span>
                  <ChevronRight
                    className={`ml-auto h-4 w-4 transition-transform ${reportsOpen ? "rotate-90" : ""}`}
                  />
                </SidebarMenuButton>
                {reportsOpen && (
                  <SidebarMenuSub>
                    {reportGroups.map((group) => (
                      <SidebarMenuSubItem key={group.label}>
                        <button
                          type="button"
                          onClick={() => toggleReportGroup(group.label)}
                          className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60 hover:text-sidebar-foreground cursor-pointer"
                        >
                          <span>{group.label}</span>
                          <ChevronRight
                            className={`ml-auto h-3.5 w-3.5 transition-transform ${
                              openReportGroups[group.label] ? "rotate-90" : ""
                            }`}
                          />
                        </button>
                        {openReportGroups[group.label] && (
                          <SidebarMenuSub className="mx-2">
                            {group.items.map((item) => (
                              <SidebarMenuSubItem key={item.url}>
                                <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                                  <Link to={item.url}>
                                    <span>{item.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/parametres")} tooltip="Paramètres">
                  <Link to="/parametres">
                    <Settings />
                    <span>Paramètres</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasAdminRights(user.role) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/employes")} tooltip="Employés">
                    <Link to="/employes">
                      <Users />
                      <span>Employés</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Déconnexion">
              <LogOut />
              <span>{user.displayName} — Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 pb-2 pt-1 text-center text-[11px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">
          © JYDE — 2026
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
