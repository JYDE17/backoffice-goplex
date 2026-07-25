import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Calculator,
  Wallet,
  TrendingUp,
  Globe,
  ArrowRight,
  Landmark,
  UtensilsCrossed,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { getDashboardStatsFn } from "@/lib/dashboard";
import { listVeloceSalesFn } from "@/lib/veloce-sales";
import { businessDateString, localDateString } from "@/lib/dates";
import { canAccessPage, isRestoOnlyRole } from "@/lib/permissions";
import { effectiveRole } from "@/lib/roles";
import { fmtEcart, ecartTone } from "@/lib/report-format";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

const TODAY = businessDateString();

function Index() {
  const { user } = Route.useRouteContext();
  return isRestoOnlyRole(effectiveRole(user)) ? <RestoDashboard /> : <OperationsDashboard />;
}

// direction_cuisine / front_of_house have nothing to do with karting,
// RaceFacer, Clover, or POS anomalies - a dedicated dashboard instead of a
// cut-down version of the operational one, focused on Véloce sales with an
// actual day-by-day preview (not just a single lump today's-total figure).
function RestoDashboard() {
  const { user } = Route.useRouteContext();
  const role = effectiveRole(user);
  const runListVeloceSales = useServerFn(listVeloceSalesFn);

  const since = (() => {
    const d = new Date(`${TODAY}T00:00:00`);
    d.setDate(d.getDate() - 6);
    return localDateString(d);
  })();

  const salesQuery = useQuery({
    queryKey: ["resto-dashboard-veloce-sales", since],
    queryFn: () => runListVeloceSales({ data: { since } }),
  });
  const sales = salesQuery.data ?? [];
  const todaySale = sales.find((s) => s.saleDate === TODAY);
  const todayTotal = (todaySale?.cashAmount ?? 0) + (todaySale?.cardAmount ?? 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord — Resto</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ventes Véloce —{" "}
          {new Date().toLocaleDateString("fr-CA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Ventes resto aujourd'hui</CardDescription>
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {salesQuery.isLoading ? "…" : fmt(todayTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {salesQuery.isLoading
                ? ""
                : `Cash ${fmt(todaySale?.cashAmount ?? 0)} · Carte ${fmt(todaySale?.cardAmount ?? 0)}`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Ventes des 7 derniers jours</CardTitle>
          <CardDescription>Aperçu jour par jour, pas juste le total du jour.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Carte</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {salesQuery.isLoading ? "Chargement…" : "Aucune vente."}
                  </TableCell>
                </TableRow>
              )}
              {sales.map((s) => (
                <TableRow key={s.saleDate}>
                  <TableCell>{s.saleDate}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.cashAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.cardAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(s.cashAmount + s.cardAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="max-w-md shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Accès rapide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {canAccessPage(role, "ventesResto") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/ventes-resto">
                Ventes resto <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "recuperation") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/recuperation">
                Récupération <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "rapportVentesVeloce") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/rapports/ventes-veloce">
                Rapport ventes resto <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "rapportPourboires") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/rapports/pourboires">
                Pourboires <ArrowRight />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OperationsDashboard() {
  const { user } = Route.useRouteContext();
  const role = effectiveRole(user);
  const runGetStats = useServerFn(getDashboardStatsFn);

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats", TODAY],
    queryFn: () => runGetStats({ data: { today: TODAY } }),
  });

  const d = statsQuery.data;
  const loading = statsQuery.isLoading;

  const cloverRfEcart = d?.ecartCloverRacefacer ?? 0;
  const noCloverRfEcart = Math.abs(cloverRfEcart) < 0.005;

  const posSwapAlerts = d?.posSwapAlerts ?? [];
  const noPosSwap = posSwapAlerts.length === 0;

  const stats = [
    {
      label: "Ventes du jour",
      value: loading ? "…" : fmt(d?.ventesDuJour ?? 0),
      change: "Cash + POS terminal (Clover)",
      icon: TrendingUp,
    },
    {
      label: "Écart Clover / RaceFacer",
      value: loading ? "…" : noCloverRfEcart ? "Aucun écart" : fmtEcart(cloverRfEcart),
      valueClassName: loading
        ? undefined
        : noCloverRfEcart
          ? "text-success"
          : ecartTone(cloverRfEcart),
      change: loading
        ? ""
        : `Clover ${fmt(d?.cloverPosTotal ?? 0)} · RaceFacer ${fmt(d?.racefacerPosTotal ?? 0)}`,
      icon: Scale,
    },
    {
      label: "Ventes en ligne",
      value: loading ? "…" : fmt(d?.onlineSales ?? 0),
      change: "Bank wire + Bambora",
      icon: Globe,
    },
    canAccessPage(role, "ventesResto") && {
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
    canAccessPage(role, "recuperation") && {
      label: "En attente de récupération",
      value: loading ? "…" : fmt(d?.depotEnAttente ?? 0),
      change: "Boîte à dépôt, depuis la dernière récupération",
      icon: Wallet,
    },
    {
      label: "Anomalies POS (jour)",
      value: loading
        ? "…"
        : noPosSwap
          ? "Aucune"
          : `${posSwapAlerts.length} détectée${posSwapAlerts.length > 1 ? "s" : ""}`,
      valueClassName: loading ? undefined : noPosSwap ? "text-success" : "text-destructive",
      change: loading
        ? ""
        : noPosSwap
          ? "Paiement probablement pris sur le mauvais terminal"
          : posSwapAlerts.map((a) => `${a.stationA} ↔ ${a.stationB} (${fmt(a.amount)})`).join(", "),
      icon: AlertTriangle,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    valueClassName?: string;
    change: string;
    icon: typeof TrendingUp;
  }>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d'ensemble des opérations système —{" "}
            {new Date().toLocaleDateString("fr-CA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        {canAccessPage(role, "reconciliation") && (
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
              <div className={`text-2xl font-semibold tabular-nums ${s.valueClassName ?? ""}`}>
                {s.value}
              </div>
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
          {canAccessPage(role, "reconciliation") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/reconciliation">
                Réconciliation <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "recuperation") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/recuperation">
                Récupération <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "coffre") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/coffre">
                Coffre-fort <ArrowRight />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "depots") && (
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/depots">
                Dépôt à la banque <Landmark className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {canAccessPage(role, "rapportFermetures") && (
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
