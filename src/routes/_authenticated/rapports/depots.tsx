import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Printer } from "lucide-react";
import { getDepositsFn } from "@/lib/deposits";
import { fmt } from "@/lib/report-format";

export const Route = createFileRoute("/_authenticated/rapports/depots")({
  head: () => ({ meta: [{ title: "Rapports — Dépôts — BackOffice" }] }),
  component: DepotsReportPage,
});

function DepotsReportPage() {
  const runGetDeposits = useServerFn(getDepositsFn);

  const depositsQuery = useQuery({
    queryKey: ["deposits"],
    queryFn: () => runGetDeposits(),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Dépôts</h1>
          <p className="text-sm text-muted-foreground mt-1">Tous les dépôts effectués.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Imprimer / PDF
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Dépôts bancaires</CardTitle>
          <CardDescription>Chaque dépôt a son rapport détaillé (fermetures incluses).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Créé par</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(depositsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {depositsQuery.isLoading ? "Chargement…" : "Aucun dépôt enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {(depositsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || "—"}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell className="print:hidden">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport-depot/$id" params={{ id: String(d.id) }}><Eye className="h-4 w-4" /></Link>
                    </Button>
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
