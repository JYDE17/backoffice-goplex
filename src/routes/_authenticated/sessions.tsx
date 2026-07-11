import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Lock, FileBarChart, CreditCard } from "lucide-react";
import { getSessionsForReconciliationFn, forceCloseSessionFn } from "@/lib/sessions";
import type { ShiftSession } from "@/lib/sessions.server";
import { DENOMS } from "@/lib/denominations";
import { syncRaceFacerSales } from "@/lib/racefacer-sync";
import { syncCloverSales } from "@/lib/clover-sync";
import { businessDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions en cours — BackOffice" }] }),
  component: SessionsPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function SessionsPage() {
  const queryClient = useQueryClient();
  const runGetSessions = useServerFn(getSessionsForReconciliationFn);
  const runForceClose = useServerFn(forceCloseSessionFn);
  const runSyncSales = useServerFn(syncRaceFacerSales);
  const runSyncCloverSales = useServerFn(syncCloverSales);
  const [viewing, setViewing] = useState<ShiftSession | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["reconciliation-sessions"],
    queryFn: () => runGetSessions(),
    refetchInterval: 30_000,
  });

  const today = businessDateString();
  // Live sync on open, not a cache read - a session viewed before /fermeture
  // has run for this POS today would otherwise show stale or empty data.
  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", today],
    queryFn: () => runSyncSales({ data: { date: today } }),
    enabled: viewing !== null,
  });
  const stationSales = salesQuery.data?.rows.find((r) => r.station_name === viewing?.stationName);

  // Same reasoning as the RaceFacer sync above: a live fetch, not a cache read.
  const cloverSalesQuery = useQuery({
    queryKey: ["clover-sales", today],
    queryFn: () => runSyncCloverSales({ data: { date: today } }),
    enabled: viewing !== null,
  });
  const cloverStationSales = cloverSalesQuery.data?.rows.find(
    (r) => r.station_name === viewing?.stationName,
  );

  const openSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "open");

  const forceClose = async (id: number) => {
    if (
      !window.confirm(
        "Forcer la fermeture de cette session ? Elle tombera dans la file de réconciliation (comptage à faire) et le POS sera libre pour une nouvelle ouverture.",
      )
    )
      return;
    try {
      await runForceClose({ data: { id } });
      toast.success("Session fermée — en attente de réconciliation");
      queryClient.invalidateQueries({ queryKey: ["reconciliation-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["open-sessions"] });
    } catch (error) {
      toast.error("Échec de la fermeture forcée", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions en cours</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Caisses ouvertes par un CSR (touche F9), pas encore fermées.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Sessions en cours ({openSessions.length})</CardTitle>
          <CardDescription>
            Une fois fermées (par le CSR ou forcées ici), elles apparaissent dans Réconciliation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead>Ouvert par</TableHead>
                <TableHead className="text-right">Comptage initial</TableHead>
                <TableHead>Heure d'ouverture</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {openSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {sessionsQuery.isLoading ? "Chargement…" : "Aucune session en cours."}
                  </TableCell>
                </TableRow>
              )}
              {openSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Badge variant="secondary">{s.stationName}</Badge>
                  </TableCell>
                  <TableCell>{s.csrName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.openTotal)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(s.openedAt).toLocaleString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => setViewing(s)}>
                      <Eye /> Voir
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => forceClose(s.id)}>
                      <Lock /> Forcer la fermeture de session
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.stationName} — comptage d'ouverture</DialogTitle>
            <DialogDescription>
              {viewing &&
                `Ouvert par ${viewing.csrName} à ${new Date(viewing.openedAt).toLocaleString("fr-CA")}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <Table>
              <TableBody>
                {DENOMS.filter((d) => (viewing.openCounts[d.label] || 0) > 0).map((d) => {
                  const qty = viewing.openCounts[d.label] || 0;
                  return (
                    <TableRow key={d.label}>
                      <TableCell className="font-medium">{d.label}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        × {qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(qty * d.value)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(viewing.openTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          {viewing && (
            <div className="border-t pt-3 mt-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileBarChart className="h-3.5 w-3.5" /> Aperçu RaceFacer — {viewing.stationName}
              </div>
              {salesQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Chargement…</div>
              ) : stationSales ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Cash attendu (depuis dernière fermeture)
                    </span>
                    <span className="tabular-nums font-medium">{fmt(stationSales.cash_delta)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">POS Terminal (cumulatif jour)</span>
                    <span className="tabular-nums font-medium">
                      {fmt(stationSales.pos_terminal_delta)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-1">
                    Synchronisé à {new Date(stationSales.fetched_at).toLocaleTimeString("fr-CA")}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Aucune donnée RaceFacer pour ce POS aujourd'hui.
                </div>
              )}
            </div>
          )}

          {viewing && (
            <div className="border-t pt-3 mt-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Aperçu Clover — {viewing.stationName}
              </div>
              {cloverSalesQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Chargement…</div>
              ) : cloverStationSales ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Montant Clover (cumulatif jour)</span>
                    <span className="tabular-nums font-medium">
                      {fmt(cloverStationSales.paid_total)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-1">
                    Synchronisé à{" "}
                    {new Date(cloverStationSales.fetched_at).toLocaleTimeString("fr-CA")}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Aucune donnée Clover pour ce POS aujourd'hui.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
