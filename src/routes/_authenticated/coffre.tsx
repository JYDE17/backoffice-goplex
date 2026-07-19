import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Unlock, ArrowDownToLine, ArrowUpFromLine, Lock } from "lucide-react";
import { toast } from "sonner";
import { getSafeMovementsFn, createSafeMovementFn } from "@/lib/safe";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/coffre")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "coffre")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Action bancaire (coffre-fort) — BackOffice" }] }),
  component: CoffrePage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Thrown by createSafeMovement (safe.server.ts) when a manual amount matches
// a recent recuperation/bank deposit - recognized here so the UI can offer a
// "confirmer quand même" retry instead of a dead-end error. Kept in sync
// with the identical constant there by hand (that file is server-only, so
// it can't be imported directly from this client component).
const DUPLICATE_MARKER = "DUPLICATE_SUSPECTED:";

function CoffrePage() {
  const queryClient = useQueryClient();
  const runGetMovements = useServerFn(getSafeMovementsFn);
  const runCreateMovement = useServerFn(createSafeMovementFn);

  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositReason, setDepositReason] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [withdrawReason, setWithdrawReason] = useState("");
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

  const submitMovement = async (movementType: "depot" | "retrait", confirmDuplicate = false) => {
    const amount = movementType === "depot" ? depositAmount : withdrawAmount;
    const reason = (movementType === "depot" ? depositReason : withdrawReason).trim();
    if (amount <= 0) {
      toast.error("Entre un montant valide.");
      return;
    }
    if (!reason) {
      toast.error(
        "Indique un motif - pourquoi cet ajustement manuel n'est pas déjà couvert par une récupération ou un dépôt bancaire.",
      );
      return;
    }
    const setSubmitting = movementType === "depot" ? setSubmittingDeposit : setSubmittingWithdraw;
    setSubmitting(true);
    try {
      await runCreateMovement({ data: { movementType, amount, reason, confirmDuplicate } });
      toast.success(
        movementType === "depot"
          ? `Dépôt de ${fmt(amount)} enregistré`
          : `Retrait de ${fmt(amount)} enregistré`,
      );
      if (movementType === "depot") {
        setDepositAmount(0);
        setDepositReason("");
      } else {
        setWithdrawAmount(0);
        setWithdrawReason("");
      }
      queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue.";
      if (message.startsWith(DUPLICATE_MARKER)) {
        toast.warning("Doublon possible", {
          description: message.slice(DUPLICATE_MARKER.length).trim(),
          duration: 20_000,
          action: {
            label: "Confirmer quand même",
            onClick: () => submitMovement(movementType, true),
          },
        });
      } else {
        toast.error("Échec de l'enregistrement", { description: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Action bancaire (coffre-fort)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Solde et historique du coffre.{" "}
          <strong>
            Les récupérations (/recuperation) et dépôts bancaires (/depots) alimentent déjà le
            coffre automatiquement
          </strong>{" "}
          — n'utilise les boutons ci-dessous que pour un ajustement manuel exceptionnel qui n'est
          couvert par aucun des deux (jamais pour re-confirmer une récupération déjà faite).
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)] bg-[image:var(--gradient-primary)] text-primary-foreground border-0">
        <CardHeader>
          <CardDescription className="text-primary-foreground/80">
            Solde actuel du coffre
          </CardDescription>
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
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4" /> Ajustement manuel — dépôt
            </CardTitle>
            <CardDescription>
              Exceptionnel seulement — pas pour confirmer une récupération déjà faite
            </CardDescription>
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
            <div>
              <Label>Motif</Label>
              <Input
                className="mt-1"
                placeholder="Pourquoi cet ajustement n'est pas déjà couvert ailleurs ?"
                value={depositReason}
                onChange={(e) => setDepositReason(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={submittingDeposit}
              onClick={() => submitMovement("depot")}
            >
              <Unlock /> {submittingDeposit ? "Enregistrement…" : "Enregistrer l'ajustement"}
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4" /> Ajustement manuel — retrait
            </CardTitle>
            <CardDescription>
              Exceptionnel seulement — pas pour confirmer un dépôt bancaire déjà fait
            </CardDescription>
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
            <div>
              <Label>Motif</Label>
              <Input
                className="mt-1"
                placeholder="Pourquoi cet ajustement n'est pas déjà couvert ailleurs ?"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={submittingWithdraw}
              onClick={() => submitMovement("retrait")}
            >
              {submittingWithdraw ? "Enregistrement…" : "Enregistrer l'ajustement"}
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
                <TableHead>Motif</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Solde après</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withRunningBalance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {movementsQuery.isLoading ? "Chargement…" : "Aucun mouvement enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {withRunningBalance.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.createdAt).toLocaleString("fr-CA")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {m.movementType === "depot" ? "Dépôt" : "Retrait"}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.createdByName}</TableCell>
                  <TableCell className="text-muted-foreground">{m.reason || "—"}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${m.movementType === "depot" ? "text-success" : "text-destructive"}`}
                  >
                    {m.movementType === "depot" ? "+" : "-"}
                    {fmt(m.amount)}
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
