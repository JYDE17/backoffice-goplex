import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Printer, Download, RefreshCw } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { getRaceFacerSales } from "@/lib/racefacer-sync";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { localDateString } from "@/lib/dates";
import { POS_LIST } from "@/lib/station";

export const Route = createFileRoute("/_authenticated/rapports/ventes-quotidiennes")({
  head: () => ({ meta: [{ title: "Rapports — Ventes quotidiennes — BackOffice" }] }),
  component: VentesQuotidiennesPage,
});

function VentesQuotidiennesPage() {
  const [date, setDate] = useState(localDateString());
  const runGetClosures = useServerFn(getClosures);
  const runGetSales = useServerFn(getRaceFacerSales);

  const closuresQuery = useQuery({
    queryKey: ["closures", date],
    queryFn: () => runGetClosures({ data: { date } }),
  });
  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", date],
    queryFn: () => runGetSales({ data: { date } }),
  });

  const rows = useMemo(() => {
    const closures = closuresQuery.data ?? [];
    const salesRows = salesQuery.data?.rows ?? [];

    return POS_LIST.map((station) => {
      const stationClosures = closures
        .filter((c) => c.stationName === station)
        .sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1));
      const sales = salesRows.find((r) => r.station_name === station);
      // "Montant" = the day's actual sales for this POS (RaceFacer's raw
      // cumulative cash + POS terminal total) - independent of how many
      // times it was closed or reconciled.
      const montant = (sales?.cash_total ?? 0) + (sales?.pos_terminal_total ?? 0);
      const employees = [...new Set(stationClosures.map((c) => c.employeeName))];
      const hasEcart = stationClosures.some((c) => c.ecartCash !== 0 || c.ecartPos !== 0);
      return {
        station,
        montant,
        employees,
        closureCount: stationClosures.length,
        hasEcart,
      };
    });
  }, [closuresQuery.data, salesQuery.data]);

  const isLoading = closuresQuery.isLoading || salesQuery.isLoading;

  const exportCsv = () => {
    downloadCsv(
      `ventes-quotidiennes-${date}.csv`,
      ["Date", "POS", "Montant", "Employe(s)", "Nombre de fermetures", "Ecart"],
      rows.map((r) => [
        date,
        r.station,
        r.montant,
        r.employees.join(" / ") || "Pas ferme",
        r.closureCount,
        r.hasEcart ? "Oui" : "Non",
      ]),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Ventes quotidiennes</h1>
          <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble de tous les POS pour une journée.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Exporter CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimer / PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="vq-date" className="mb-1 block">Date</Label>
            <Input id="vq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          {isLoading && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement…
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Ventes du {date}</CardTitle>
          <CardDescription>Montant total RaceFacer (cash + terminal) par POS, employé(s) et présence d'écart.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Employé(s)</TableHead>
                <TableHead>Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.station}>
                  <TableCell><Badge variant="outline">{r.station}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmt(r.montant)}</TableCell>
                  <TableCell>
                    {r.employees.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.employees.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Pas fermé</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.closureCount === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.hasEcart ? (
                      <Badge variant="destructive">Oui</Badge>
                    ) : (
                      <Badge variant="secondary">Non</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
