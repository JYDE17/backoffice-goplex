import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lock, Unlock, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/coffre")({
  head: () => ({ meta: [{ title: "Coffre-fort — Vision Caisse" }] }),
  component: CoffrePage,
});

function CoffrePage() {
  const [amount, setAmount] = useState<number>(0);
  const solde = 8950;
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coffre-fort</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestion des dépôts, retraits et fermeture du coffre.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-[var(--shadow-card)] md:col-span-2 bg-[var(--gradient-primary)] text-primary-foreground border-0">
          <CardHeader>
            <CardDescription className="text-primary-foreground/80">Solde actuel du coffre</CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">{solde.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4" />
              <span>Scellé — Dernière ouverture 06/07 à 19:32</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="pb-2">
            <CardDescription>État</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge className="bg-success text-success-foreground">Verrouillé</Badge>
            <div className="text-xs text-muted-foreground">Prochaine collecte : 08/07/2026</div>
          </CardContent>
        </Card>
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
            <Button className="w-full" onClick={() => toast.success(`Dépôt de ${amount.toFixed(2)} € enregistré`)}>
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
              {[
                { d: "06/07 19:32", t: "Dépôt", u: "M. Durand", m: "+1 240,00 €", s: "8 950,00 €" },
                { d: "05/07 19:15", t: "Dépôt", u: "M. Durand", m: "+1 100,00 €", s: "7 710,00 €" },
                { d: "04/07 18:50", t: "Collecte", u: "Brinks", m: "-4 500,00 €", s: "6 610,00 €" },
                { d: "03/07 19:22", t: "Dépôt", u: "Mme Leroy", m: "+980,00 €", s: "11 110,00 €" },
              ].map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.d}</TableCell>
                  <TableCell><Badge variant="outline">{r.t}</Badge></TableCell>
                  <TableCell>{r.u}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.m.startsWith("-") ? "text-destructive" : "text-success"}`}>{r.m}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.s}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}