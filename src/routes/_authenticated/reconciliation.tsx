import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { getSessionsForReconciliationFn } from "@/lib/sessions";
import { getRaceFacerSales } from "@/lib/racefacer-sync";
import { getSettingsFn } from "@/lib/settings";
import { businessDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/reconciliation")({
  head: () => ({ meta: [{ title: "Réconciliation — BackOffice" }] }),
  component: ReconciliationPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

const TODAY = businessDateString();

function ReconciliationPage() {
  const runGetSessions = useServerFn(getSessionsForReconciliationFn);
  const runGetSales = useServerFn(getRaceFacerSales);
  const runGetSettings = useServerFn(getSettingsFn);

  const sessionsQuery = useQuery({
    queryKey: ["reconciliation-sessions"],
    queryFn: () => runGetSessions(),
    refetchInterval: 30_000,
  });

  // RaceFacer data for today, used to estimate each pending session's
  // surplus/deficit before the supervisor even opens the reconciliation:
  // ecart = comptage CSR - fond de caisse - cash RaceFacer attendu.
  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", TODAY],
    queryFn: () => runGetSales({ data: { date: TODAY } }),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runGetSettings(),
  });
  const fondCaisse = settingsQuery.data?.fondCaisse ?? 300;

  const estimatedEcart = (s: { stationName: string; closeTotal: number; closedAt: string }): number | null => {
    // closeTotal 0 = force-closed without a count; nothing to estimate yet.
    if (s.closeTotal === 0) return null;
    if (!s.closedAt || businessDateString(new Date(s.closedAt)) !== TODAY) return null;
    const row = salesQuery.data?.rows.find((r) => r.station_name === s.stationName);
    if (!row) return null;
    return s.closeTotal - fondCaisse - row.cash_delta;
  };

  const closedSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "closed");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Réconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comptages de shift fermés par les CSR — réconcilie pour créer la clôture officielle.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">En attente de réconciliation ({closedSessions.length})</CardTitle>
          <CardDescription>Shifts fermés par un CSR — à valider avec RaceFacer et Clover.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead>Ouvert par</TableHead>
                <TableHead className="text-right">Comptage initial</TableHead>
                <TableHead>Fermé par</TableHead>
                <TableHead className="text-right">Comptage final</TableHead>
                <TableHead className="text-right">Écart estimé (RaceFacer)</TableHead>
                <TableHead>Heure fermeture</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {closedSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {sessionsQuery.isLoading ? "Chargement…" : "Aucun comptage en attente."}
                  </TableCell>
                </TableRow>
              )}
              {closedSessions.map((s) => {
                const ecart = estimatedEcart(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="outline">{s.stationName}</Badge></TableCell>
                    <TableCell>{s.csrName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.openTotal)}</TableCell>
                    <TableCell>{s.closeCsrName}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {s.closeTotal === 0 ? <span className="text-muted-foreground font-normal">à compter</span> : fmt(s.closeTotal)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        ecart === null
                          ? "text-muted-foreground"
                          : ecart === 0
                            ? "text-success"
                            : Math.abs(ecart) < 1
                              ? "text-warning"
                              : "text-destructive"
                      }`}
                    >
                      {ecart === null ? "—" : `${ecart > 0 ? "+" : ""}${fmt(ecart)}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.closedAt ? new Date(s.closedAt).toLocaleString("fr-CA") : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm">
                        <Link to="/fermeture" search={{ sessionId: s.id }}>
                          <CheckCheck /> Réconcilier
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
