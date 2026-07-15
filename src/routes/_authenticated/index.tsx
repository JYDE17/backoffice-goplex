import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calculator,
  Wallet,
  TrendingUp,
  Globe,
  ArrowRight,
  Landmark,
  UtensilsCrossed,
} from "lucide-react";
import { getDashboardStatsFn } from "@/lib/dashboard";
import { businessDateString } from "@/lib/dates";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

const TODAY = businessDateString();

function Index() {
  const { user } = Route.useRouteContext();
  const runGetStats = useServerFn(getDashboardStatsFn);

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats", TODAY],
    queryFn: () => runGetStats({ data: { today: TODAY } }),
  });

  const d = statsQuery.data;
  const loading = statsQuery.isLoading;

  const stats = [
    {
      label: "Ventes du jour",
      value: loading ? "…" : fmt(d?.ventesDuJour ?? 0),
      change: "Cash + POS terminal (Clover)",
      icon: TrendingUp,
    },
    {
      label: "Ventes en ligne",
      value: loading ? "…" : fmt(d?.onlineSales ?? 0),
      change: "Bank wire + Bambora",
      icon: Globe,
    },
    canAccessPage(user.role, "ventesResto") && {
      label: "Ventes resto",
      value: loading ? "…" : fmt(d?.restoSales ?? 0),
      change: "Véloce (saisie manuelle)",
      icon: UtensilsCrossed,
    },
    {
      label: "Cash attendu",
      value: loading ? "…" : fmt(d?.cashAttendu ?? 0),
      change: "Espèces (RaceFacer)",
      icon: Calculator,
    },
    canAccessPage(user.role, "recuperation") && {
      label: "En attente de récupération",
      value: loading ? "…" : fmt(d?.depotEnAttente ?? 0),
      change: "Boîte à dépôt, depuis la dernière récupération",
      icon: Wallet,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    change: string;
    icon: typeof TrendingUp;
  }>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d'ensemble des opérations de caisse —{" "}
            {new Date().toLocaleDateString("fr-CA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        {canAccessPage(user.role, "reconciliation") && (
          <Button asChild className="shadow-[var(--shadow-card)]">
            <Link to="/reconciliation">
              Réconciliation <ArrowRight className="ml-1" />
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.change}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="max-w-md shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Accès rapide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {canAccessPage(user.role, "reconciliation") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/reconciliation">
                Réconciliation <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(user.role, "recuperation") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/recuperation">
                Récupération <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(user.role, "coffre") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/coffre">
                Coffre-fort <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(user.role, "depots") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/depots">
                Dépôt à la banque <Landmark className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canAccessPage(user.role, "ventesResto") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/ventes-resto">
                Ventes resto (Véloce) <UtensilsCrossed className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canAccessPage(user.role, "rapportFermetures") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/rapports/fermetures">
                Rapports <ArrowRight />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
