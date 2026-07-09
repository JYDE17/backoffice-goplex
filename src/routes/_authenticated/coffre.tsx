import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Unlock, ArrowDownToLine, ArrowUpFromLine, Lock } from "lucide-react";
import { toast } from "sonner";
import { getSafeMovementsFn, createSafeMovementFn } from "@/lib/safe";

export const Route = createFileRoute("/_authenticated/coffre")({
  head: () => ({ meta: [{ title: "Coffre-fort — BackOffice" }] }),
  component: CoffrePage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function CoffrePage() {
  const queryClient = useQueryClient();
  const runGetMovements = useServerFn(getSafeMovementsFn);
  const runCreateMovement = useServerFn(createSafeMovementFn);

  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  const movementsQuery = useQuery({
    queryKey: ["safe-movements"],
    queryFn: () => runGetMovements(),
  });

  const balance = movementsQuery.data?.balance ?? 0;

  // movements arrive newest-first; compute a running balance for the
  // "solde apres" column by walking them oldest-to-newest.
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

  const submitMovement = async (movementType: "depot" | "retrait") => {
    const amount = movementType === "depot" ? depositAmount : withdrawAmount;
    if (amount <= 0) {
      toast.error("Entre un montant valide.");
      return;
    }
    const setSubmitting = movementType === "depot" ? setSubmittingDeposit : setSubmittingWithdraw;
    setSubmitting(true);
    try {
      await runCreateMovement({ data: { movementType, amount } });
      toast.success(
        movementType === "depot" ? `Dépôt de ${fmt(amount)} enregistré` : `Retrait de ${fmt(amount)} enregistré`,
      );
      if (movementType === "depot") setDepositAmount(0);
      else setWithdrawAmount(0);
      queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coffre-fort</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solde et historique du coffre. Les récupérations et dépôts bancaires normaux se font via les pages dédiées — les boutons ci-dessous sont pour un ajustement manuel exceptionnel.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)] bg-[var(--gradient-primary)] text-primary-foreground border-0">
        <CardHeader>
          <CardDescription className="text-primary-foreground/80">Solde actuel du coffre</CardDescription>
          <CardTitle className="text-4xl font-semibold tabular-nums">
            {movementsQuery.isLoading ? "…" : fmt(balance)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4" />
            <span>{withRunningBalance.length} mouvement(s) enregistré(s)</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Dépôt au coffre</CardTitle>
            <CardDescription>Ajouter un montant au coffre-fort</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Montant</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 tabular-nums"
                value={depositAmount || ""}
                onChange={(e) => setDepositAmount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <Button className="w-full" disabled={submittingDeposit} onClick={() => submitMovement("depot")}>
              <Unlock /> {submittingDeposit ? "Enregistrement…" : "Ouvrir & déposer"}
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
              <Input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 tabular-nums"
                value={withdrawAmount || ""}
                onChange={(e) => setWithdrawAmount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={submittingWithdraw}
              onClick={() => submitMovement("retrait")}
            >
              {submittingWithdraw ? "Enregistrement…" : "Retirer"}
            </Button>
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
