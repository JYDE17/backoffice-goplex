import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { createDepositFn, getDepositsFn, getPendingClosuresFn } from "@/lib/deposits";
import { getSettingsFn } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/recuperation")({
  head: () => ({ meta: [{ title: "Récupération — BackOffice" }] }),
  component: RecuperationPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function RecuperationPage() {
  const queryClient = useQueryClient();
  const runGetPending = useServerFn(getPendingClosuresFn);
  const runCreateDeposit = useServerFn(createDepositFn);
  const runGetDeposits = useServerFn(getDepositsFn);
  const runGetSettings = useServerFn(getSettingsFn);

  const [submitting, setSubmitting] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runGetSettings(),
  });

  // Locked field - the bank always comes from the shared settings
  // (Parametres), editable only by admins there.
  const bankName = settingsQuery.data?.defaultBankName ?? "";

  const pendingQuery = useQuery({
    queryKey: ["pending-closures"],
    queryFn: () => runGetPending(),
  });

  const depositsQuery = useQuery({
    queryKey: ["deposits"],
    queryFn: () => runGetDeposits(),
  });

  const pending = pendingQuery.data ?? [];
  const pendingTotal = pending.reduce((sum, c) => sum + c.depositAmount, 0);

  const handleRecuperation = async () => {
    if (pending.length === 0) {
      toast.error("Aucune fermeture en attente dans la boîte à dépôt.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await runCreateDeposit({ data: { bankName } });
      toast.success(`Récupération de ${fmt(result.deposit.totalAmount)} enregistrée`, {
        description: `${result.closures.length} fermeture(s) incluse(s) — ajouté au coffre-fort.`,
      });
      queryClient.invalidateQueries({ queryKey: ["pending-closures"] });
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
    } catch (error) {
      toast.error("Échec de la récupération", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Récupération</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cumul des fermetures de caisse depuis la dernière récupération de la boîte à dépôt. Le montant récupéré est ajouté automatiquement au coffre-fort.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Fermetures en attente dans la boîte à dépôt</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "Aucune fermeture en attente."
              : `${pending.length} fermeture(s) depuis la dernière récupération — total ${fmt(pendingTotal)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>POS</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.closureDate}</TableCell>
                    <TableCell><Badge variant="outline">{c.stationName}</Badge></TableCell>
                    <TableCell>{c.employeeName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.depositAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div title="Voir un administrateur pour modifier (Paramètres → Banque de dépôt par défaut)">
              <Label htmlFor="bank-name" className="mb-1 block">Banque</Label>
              <Input
                id="bank-name"
                value={bankName}
                disabled
                className="w-56 cursor-not-allowed"
              />
            </div>
            <Button onClick={handleRecuperation} disabled={submitting || pending.length === 0}>
              <Plus /> {submitting ? "Récupération…" : `Confirmer la récupération de ${fmt(pendingTotal)}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Récupérations effectuées</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Créé par</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(depositsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {depositsQuery.isLoading ? "Chargement…" : "Aucune récupération enregistrée."}
                  </TableCell>
                </TableRow>
              )}
              {(depositsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || "—"}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell>
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
