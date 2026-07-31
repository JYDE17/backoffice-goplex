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
  TrendingUp,
  Globe,
  ArrowRight,
  Landmark,
  UtensilsCrossed,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { getDashboardStatsFn } from "@/lib/dashboard";
import type { PosBreakdown } from "@/lib/dashboard.server";
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
  const runListVeloceSales = useServerFn(listVeloceSalesFn);

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats", TODAY],
    queryFn: () => runGetStats({ data: { today: TODAY } }),
  });

  const showResto = canAccessPage(role, "ventesResto");
  const restoSince = (() => {
    const dt = new Date(`${TODAY}T00:00:00`);
    dt.setDate(dt.getDate() - 6);
    return localDateString(dt);
  })();
  const restoSalesQuery = useQuery({
    queryKey: ["dashboard-veloce-sales", restoSince],
    queryFn: () => runListVeloceSales({ data: { since: restoSince } }),
    enabled: showResto,
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

      <PosBreakdownSection breakdown={d?.posBreakdown ?? []} loading={loading} />

      {showResto && (
        <VeloceSalesChart
          sales={restoSalesQuery.data ?? []}
          since={restoSince}
          loading={restoSalesQuery.isLoading}
        />
      )}

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

// A single-station card's écart worth flagging in red - same $1 threshold the
// rest of the app uses for "this débalancement matters" (ECART_ALERT_THRESHOLD
// in report-format.ts, mirrored here so the tile border and the text tone agree).
const POS_ECART_THRESHOLD = 1;

// One tile per POS: RaceFacer's own cash/carte figures next to what Clover
// actually processed, with the écart between the terminal figure and Clover.
// The whole tile turns red when that écart crosses the alert threshold so a
// débalancement on a specific station is obvious at a glance.
function PosBreakdownSection({
  breakdown,
  loading,
}: {
  breakdown: PosBreakdown[];
  loading: boolean;
}) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base">POS — aujourd'hui</CardTitle>
        <CardDescription>
          RaceFacer vs Clover par terminal. Une tuile passe au rouge en cas de débalancement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : breakdown.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucune activité POS aujourd'hui.</div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {breakdown.map((p) => (
              <PosTile key={p.station} pos={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PosTile({ pos }: { pos: PosBreakdown }) {
  const unbalanced = Math.abs(pos.ecart) >= POS_ECART_THRESHOLD;
  return (
    <div
      className={`rounded-lg border p-4 ${
        unbalanced ? "border-destructive/60 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{pos.station}</div>
        {unbalanced && <AlertTriangle className="h-4 w-4 text-destructive" />}
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <div className="text-muted-foreground">RaceFacer</div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground">Argent</span>
          <span className="tabular-nums">{fmt(pos.rfCash)}</span>
        </div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground">Carte</span>
          <span className="tabular-nums">{fmt(pos.rfCard)}</span>
        </div>

        <div className="text-muted-foreground pt-1">Perçu</div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground">Clover</span>
          <span className="tabular-nums">{fmt(pos.clover)}</span>
        </div>

        <div className="flex justify-between pt-2 border-t mt-2">
          <span className="font-medium">Écart</span>
          <span
            className={`tabular-nums font-semibold ${unbalanced ? "text-destructive" : ecartTone(pos.ecart)}`}
          >
            {fmtEcart(pos.ecart)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Last-7-days Véloce sales as day-total bars (cash + carte), not just cash -
// the drop-box cash figure already lives on /recuperation, so this shows the
// restaurant's full daily take instead.
function VeloceSalesChart({
  sales,
  since,
  loading,
}: {
  sales: Array<{ saleDate: string; cashAmount: number; cardAmount: number }>;
  since: string;
  loading: boolean;
}) {
  const byDate = new Map(sales.map((s) => [s.saleDate, s.cashAmount + s.cardAmount]));
  const days: Array<{ date: string; total: number }> = [];
  const cursor = new Date(`${since}T00:00:00`);
  const end = new Date(`${TODAY}T00:00:00`);
  while (cursor <= end) {
    const key = localDateString(cursor);
    days.push({ date: key, total: byDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const max = Math.max(1, ...days.map((d) => d.total));

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base">Ventes resto — 7 derniers jours</CardTitle>
        <CardDescription>Total du jour (cash + carte), Véloce.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <div className="flex items-end gap-2 sm:gap-3 h-40">
            {days.map((day) => {
              const heightPct = day.total > 0 ? Math.max(4, (day.total / max) * 100) : 0;
              const label = new Date(`${day.date}T00:00:00`).toLocaleDateString("fr-CA", {
                weekday: "short",
              });
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                >
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {day.total > 0 ? fmt(day.total) : "—"}
                  </div>
                  <div
                    className="w-full rounded-t bg-[var(--chart-1)]"
                    style={{ height: `${heightPct}%` }}
                    title={`${day.date} · ${fmt(day.total)}`}
                  />
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
