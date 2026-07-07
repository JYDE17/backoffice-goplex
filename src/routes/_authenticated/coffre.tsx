import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Unlock, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/coffre")({
  head: () => ({ meta: [{ title: "Coffre-fort — BackOffice" }] }),
  component: CoffrePage,
});

function CoffrePage() {
  const [amount, setAmount] = useState<number>(0);
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coffre-fort</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestion des dépôts et retraits du coffre.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Dépôt au coffre</CardTitle>
            <CardDescription>Ajouter un montant au coffre-fort</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Montant</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 tabular-nums" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
            </div>
            <Button className="w-full" onClick={() => toast.success(`Dépôt de ${amount.toFixed(2)} $ enregistré`)}>
              <Unlock /> Ouvrir & déposer
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4" /> Retrait / collecte</CardTitle>
            <CardDescription>Retirer un montant du coffre-fort</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Montant</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 tabular-nums" />
            </div>
            <Button variant="outline" className="w-full" onClick={() => toast.info("Retrait enregistré")}>Retirer</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Mouvements récents</CardTitle>
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
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucun mouvement enregistré.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}