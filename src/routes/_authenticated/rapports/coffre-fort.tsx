import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { getSafeMovementsFn } from "@/lib/safe";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/coffre-fort")({
  head: () => ({ meta: [{ title: "Rapports — Coffre-fort — BackOffice" }] }),
  component: CoffreFortReportPage,
});

function CoffreFortReportPage() {
  const runGetMovements = useServerFn(getSafeMovementsFn);

  const movementsQuery = useQuery({
    queryKey: ["safe-movements"],
    queryFn: () => runGetMovements(),
  });

  const balance = movementsQuery.data?.balance ?? 0;

  // movements arrive newest-first; walk oldest-to-newest to compute the
  // running balance, same approach as the /coffre page itself.
  const withRunningBalance = useMemo(() => {
    const movements = movementsQuery.data?.movements ?? [];
    const chronological = [...movements].reverse();
    let running = 0;
    const balances = new Map<number, number>();
    for (const m of chronological) {
      running += m.movementType === "depot" ? m.amount : -m.amount;
      balances.set(m.id, running);
    }
    return movements.map((m) => ({ ...m, balanceAfter: balances.get(m.id) ?? 0 }));
  }, [movementsQuery.data]);

  const exportCsv = () => {
    downloadCsv(
      `coffre-fort-${localDateString()}.csv`,
      ["Date", "Type", "Utilisateur", "Montant", "Solde apres"],
      withRunningBalance.map((m) => [
        new Date(m.createdAt).toLocaleString("fr-CA"),
        m.movementType === "depot" ? "Depot" : "Retrait",
        m.createdByName,
        m.movementType === "depot" ? m.amount : -m.amount,
        m.balanceAfter,
      ]),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Coffre-fort</h1>
          <p className="text-sm text-muted-foreground mt-1">Historique complet des dépôts et retraits du coffre.</p>
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

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Solde actuel : {fmt(balance)}</CardTitle>
          <CardDescription>{withRunningBalance.length} mouvement(s) au total.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Solde après</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withRunningBalance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {movementsQuery.isLoading ? "Chargement…" : "Aucun mouvement enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {withRunningBalance.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.createdAt).toLocaleString("fr-CA")}</TableCell>
                  <TableCell><Badge variant="outline">{m.movementType === "depot" ? "Dépôt" : "Retrait"}</Badge></TableCell>
                  <TableCell>{m.createdByName}</TableCell>
                  <TableCell className={`text-right tabular-nums ${m.movementType === "depot" ? "text-success" : "text-destructive"}`}>
                    {m.movementType === "depot" ? "+" : "-"}{fmt(m.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(m.balanceAfter)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
