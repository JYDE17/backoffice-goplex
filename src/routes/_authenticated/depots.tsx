import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, Eye } from "lucide-react";
import { toast } from "sonner";
import { createBankDepositFn, getBankDepositsFn } from "@/lib/bank-deposits";
import { getSafeMovementsFn } from "@/lib/safe";
import { getSettingsFn } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/depots")({
  head: () => ({ meta: [{ title: "Dépôt bancaire — BackOffice" }] }),
  component: DepotsPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function DepotsPage() {
  const queryClient = useQueryClient();
  const runGetSafeMovements = useServerFn(getSafeMovementsFn);
  const runGetSettings = useServerFn(getSettingsFn);
  const runCreateBankDeposit = useServerFn(createBankDepositFn);
  const runGetBankDeposits = useServerFn(getBankDepositsFn);

  const [amount, setAmount] = useState<number>(0);
  const [bankName, setBankName] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const safeQuery = useQuery({
    queryKey: ["safe-movements"],
    queryFn: () => runGetSafeMovements(),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runGetSettings(),
  });
  const bankDepositsQuery = useQuery({
    queryKey: ["bank-deposits"],
    queryFn: () => runGetBankDeposits(),
  });

  const balance = safeQuery.data?.balance ?? 0;

  // Prefill amount with the full safe balance once it's loaded, but only
  // until the user actually edits it (so a refetch doesn't stomp on a
  // partial withdrawal they're mid-typing).
  useEffect(() => {
    if (safeQuery.data && !amountTouched) {
      setAmount(safeQuery.data.balance);
    }
  }, [safeQuery.data, amountTouched]);

  useEffect(() => {
    if (settingsQuery.data && !bankName) {
      setBankName(settingsQuery.data.defaultBankName);
    }
  }, [settingsQuery.data, bankName]);

  const handleDeposit = async () => {
    if (amount <= 0) {
      toast.error("Entre un montant valide.");
      return;
    }
    if (amount > balance) {
      toast.error(`Le montant dépasse le solde du coffre-fort (${fmt(balance)}).`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await runCreateBankDeposit({ data: { amount, bankName } });
      toast.success(`Dépôt bancaire de ${fmt(result.totalAmount)} enregistré`, {
        description: `Retiré du coffre-fort — nouveau solde ${fmt(balance - result.totalAmount)}.`,
      });
      setAmountTouched(false);
      queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposits"] });
    } catch (error) {
      toast.error("Échec du dépôt bancaire", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dépôt bancaire</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Argent qui sort réellement du coffre-fort pour être déposé à la banque.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)] bg-[var(--gradient-primary)] text-primary-foreground border-0">
        <CardHeader>
          <CardDescription className="text-primary-foreground/80">Solde actuel du coffre-fort</CardDescription>
          <CardTitle className="text-4xl font-semibold tabular-nums">
            {safeQuery.isLoading ? "…" : fmt(balance)}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> Confirmer un dépôt à la banque</CardTitle>
          <CardDescription>Le montant est retiré du coffre-fort dès la confirmation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="deposit-amount" className="mb-1 block">Montant</Label>
              <Input
                id="deposit-amount"
                type="number"
                min={0}
                max={balance}
                step="0.01"
                value={amount || ""}
                onChange={(e) => {
                  setAmountTouched(true);
                  setAmount(Math.max(0, Number(e.target.value) || 0));
                }}
                className="w-40 tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="deposit-bank" className="mb-1 block">Banque</Label>
              <Input
                id="deposit-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-56"
              />
            </div>
            <Button onClick={handleDeposit} disabled={submitting || balance <= 0}>
              {submitting ? "Enregistrement…" : `Confirmer le dépôt de ${fmt(amount)}`}
            </Button>
          </div>
          {balance <= 0 && !safeQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Le coffre-fort est vide — rien à déposer pour l'instant.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Dépôts bancaires effectués</CardTitle>
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
              {(bankDepositsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {bankDepositsQuery.isLoading ? "Chargement…" : "Aucun dépôt bancaire enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {(bankDepositsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || <Badge variant="outline">—</Badge>}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport-depot-bancaire/$id" params={{ id: String(d.id) }}><Eye className="h-4 w-4" /></Link>
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
