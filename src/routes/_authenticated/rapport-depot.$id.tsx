import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Printer } from "lucide-react";
import { getDepositFn } from "@/lib/deposits";

export const Route = createFileRoute("/_authenticated/rapport-depot/$id")({
  head: () => ({ meta: [{ title: "Rapport de dépôt — BackOffice" }] }),
  component: RapportDepotPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function RapportDepotPage() {
  const { id } = Route.useParams();
  const runGetDeposit = useServerFn(getDepositFn);

  const query = useQuery({
    queryKey: ["deposit", id],
    queryFn: () => runGetDeposit({ data: { id: Number(id) } }),
  });

  const result = query.data;

  if (query.isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement…</div>;
  }
  if (!result) {
    return <div className="p-6 text-muted-foreground">Dépôt introuvable.</div>;
  }

  const { deposit, closures } = result;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link to="/depots"><ArrowLeft /> Retour aux dépôts</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Imprimer
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-xl">Rapport de dépôt bancaire</CardTitle>
          <div className="text-sm text-muted-foreground">BackOffice — Goplex Brossard</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground">Date du dépôt</div><div className="font-medium">{deposit.depositDate}</div></div>
            <div><div className="text-muted-foreground">Banque</div><div className="font-medium">{deposit.bankName || "—"}</div></div>
            <div><div className="text-muted-foreground">Créé par</div><div className="font-medium">{deposit.createdByName}</div></div>
            <div><div className="text-muted-foreground">Montant total</div><div className="font-medium tabular-nums">{fmt(deposit.totalAmount)}</div></div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Fermetures incluses ({closures.length})</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>POS</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead>Autorisé par</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.closureDate}</TableCell>
                    <TableCell>{c.stationName}</TableCell>
                    <TableCell>{c.employeeName}</TableCell>
                    <TableCell>{c.authorizedByName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.depositAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-sm font-semibold">
              <span>Total déposé</span>
              <span className="tabular-nums">{fmt(deposit.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
