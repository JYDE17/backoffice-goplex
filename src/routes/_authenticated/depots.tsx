import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/depots")({
  head: () => ({ meta: [{ title: "Dépôts bancaires — BackOffice" }] }),
  component: DepotsPage,
});

const rows = [
  { id: "DEP-2041", date: "07/07/2026", montant: "1 800,00 $", banque: "Banque Nationale", statut: "En attente" },
  { id: "DEP-2040", date: "06/07/2026", montant: "2 450,00 $", banque: "Banque Nationale", statut: "Confirmé" },
  { id: "DEP-2039", date: "05/07/2026", montant: "3 120,50 $", banque: "Desjardins", statut: "Confirmé" },
  { id: "DEP-2038", date: "04/07/2026", montant: "980,00 $", banque: "Banque Nationale", statut: "Confirmé" },
];

function DepotsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dépôts bancaires</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des remises espèces en banque.</p>
        </div>
        <Button><Plus /> Nouveau dépôt</Button>
      </div>
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Derniers dépôts</CardTitle>
          <CardDescription>Les 30 derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.id}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.banque}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.montant}</TableCell>
                  <TableCell>
                    <Badge variant={r.statut === "Confirmé" ? "secondary" : "outline"}>{r.statut}</Badge>
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