import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/historique")({
  head: () => ({ meta: [{ title: "Historique — BackOffice" }] }),
  component: HistoriquePage,
});

const rows = [
  { date: "06/07/2026", attendu: "3 120,50 €", compte: "3 118,00 €", ecart: "-2,50 €", depot: "1 800,00 €", coffre: "1 118,00 €", statut: "Clôturé" },
  { date: "05/07/2026", attendu: "2 980,00 €", compte: "2 985,00 €", ecart: "+5,00 €", depot: "1 500,00 €", coffre: "1 285,00 €", statut: "Clôturé" },
  { date: "04/07/2026", attendu: "4 210,20 €", compte: "4 200,00 €", ecart: "-10,20 €", depot: "3 000,00 €", coffre: "1 000,00 €", statut: "Clôturé" },
  { date: "03/07/2026", attendu: "1 850,00 €", compte: "1 850,00 €", ecart: "0,00 €", depot: "980,00 €", coffre: "670,00 €", statut: "Clôturé" },
];

function HistoriquePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historique des fermetures</h1>
        <p className="text-sm text-muted-foreground mt-1">Consultez les journées clôturées.</p>
      </div>
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Journées récentes</CardTitle>
          <CardDescription>Rapprochement cash, dépôts et coffre.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Cash attendu</TableHead>
                <TableHead className="text-right">Cash compté</TableHead>
                <TableHead className="text-right">Écart</TableHead>
                <TableHead className="text-right">Dépôt</TableHead>
                <TableHead className="text-right">Coffre</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="font-medium">{r.date}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.attendu}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.compte}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.ecart.startsWith("-") ? "text-destructive" : r.ecart.startsWith("+") ? "text-warning" : "text-success"}`}>{r.ecart}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.depot}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.coffre}</TableCell>
                  <TableCell><Badge variant="secondary">{r.statut}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}