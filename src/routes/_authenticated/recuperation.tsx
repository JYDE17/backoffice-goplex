import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Eye, Archive } from "lucide-react";
import { toast } from "sonner";
import { createDepositFn, getDepositsFn, getPendingClosuresFn } from "@/lib/deposits";
import { getPendingVeloceSalesFn } from "@/lib/veloce-sales";
import { getSettingsFn } from "@/lib/settings";
import { localDateString } from "@/lib/dates";

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
  const runGetPendingVeloce = useServerFn(getPendingVeloceSalesFn);
  const runCreateDeposit = useServerFn(createDepositFn);
  const runGetDeposits = useServerFn(getDepositsFn);
  const runGetSettings = useServerFn(getSettingsFn);

  const [submitting, setSubmitting] = useState(false);
  const [amount1, setAmount1] = useState<number | "">("");
  const [amount2, setAmount2] = useState<number | "">("");
  const [verifiedByName, setVerifiedByName] = useState("");

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
  const pendingVeloceQuery = useQuery({
    queryKey: ["pending-veloce-sales"],
    queryFn: () => runGetPendingVeloce(),
  });

  const depositsQuery = useQuery({
    queryKey: ["deposits"],
    queryFn: () => runGetDeposits(),
  });

  const pending = pendingQuery.data ?? [];
  const pendingVeloce = pendingVeloceQuery.data ?? [];
  const pendingClosuresTotal = pending.reduce((sum, c) => sum + c.depositAmount, 0);
  const pendingVeloceTotal = pendingVeloce.reduce((sum, s) => sum + s.cashAmount, 0);
  const pendingTotal = pendingClosuresTotal + pendingVeloceTotal;
  const hasPending = pending.length > 0 || pendingVeloce.length > 0;
  const oldestDate = [pending[0]?.closureDate, pendingVeloce[0]?.saleDate]
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  const amountsMatch =
    amount1 !== "" && amount2 !== "" && Math.abs(Number(amount1) - Number(amount2)) < 0.005;
  const amountMatchesExpected = amount1 !== "" && Math.abs(Number(amount1) - pendingTotal) < 0.005;
  const canConfirm =
    hasPending && amountsMatch && amountMatchesExpected && verifiedByName.trim() !== "";

  const handleRecuperation = async () => {
    if (!hasPending) {
      toast.error("Aucune fermeture ou vente resto en attente dans la boîte à dépôt.");
      return;
    }
    if (!amountsMatch) {
      toast.error("Les deux montants saisis ne correspondent pas.");
      return;
    }
    if (!amountMatchesExpected) {
      toast.error(`Le montant saisi ne correspond pas au total attendu (${fmt(pendingTotal)}).`);
      return;
    }
    if (!verifiedByName.trim()) {
      toast.error("Indique le nom de la personne qui a vérifié.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await runCreateDeposit({
        data: { bankName, confirmedAmount: Number(amount1), verifiedByName: verifiedByName.trim() },
      });
      const veloceCount = result.veloceSales.length;
      toast.success(`Récupération de ${fmt(result.deposit.totalAmount)} enregistrée`, {
        description: `${result.closures.length} fermeture(s)${veloceCount > 0 ? ` + ${veloceCount} jour(s) de vente resto` : ""} incluse(s) — ajouté au coffre-fort.`,
      });
      setAmount1("");
      setAmount2("");
      setVerifiedByName("");
      queryClient.invalidateQueries({ queryKey: ["pending-closures"] });
      queryClient.invalidateQueries({ queryKey: ["pending-veloce-sales"] });
      queryClient.invalidateQueries({ queryKey: ["veloce-sales-since-recuperation"] });
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
          Cumul des fermetures de caisse depuis la dernière récupération de la boîte à dépôt. Le
          montant récupéré est ajouté automatiquement au coffre-fort.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)] bg-[var(--gradient-primary)] text-primary-foreground border-0">
        <CardHeader>
          <CardDescription className="text-primary-foreground/80 flex items-center gap-2">
            <Archive className="h-4 w-4" /> Boîte à dépôt en cours
          </CardDescription>
          <CardTitle className="text-4xl font-semibold tabular-nums">
            {pendingQuery.isLoading ? "…" : fmt(pendingTotal)}
          </CardTitle>
          <CardDescription className="text-primary-foreground/80">
            {!hasPending
              ? "Aucune fermeture ou vente resto en attente."
              : `${pending.length} fermeture(s)${pendingVeloce.length > 0 ? ` + ${pendingVeloce.length} jour(s) resto` : ""} — du ${oldestDate} au ${localDateString()}.`}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Fermetures en attente dans la boîte à dépôt</CardTitle>
          <CardDescription>
            Chaque fermeture/session de tiroir, plus le cash resto (Véloce) saisi depuis la dernière
            récupération — à confirmer avant le transfert.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(pending.length > 0 || pendingVeloce.length > 0) && (
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
                {pendingVeloce.map((s) => (
                  <TableRow key={`veloce-${s.saleDate}`}>
                    <TableCell>{s.saleDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">Resto (Véloce)</Badge>
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.cashAmount)}</TableCell>
                  </TableRow>
                ))}
                {pending.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.closureDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.stationName}</Badge>
                    </TableCell>
                    <TableCell>{c.employeeName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(c.depositAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Confirmer le transfert vers le coffre-fort</CardTitle>
          <CardDescription>
            Double vérification obligatoire : saisis le montant transféré deux fois (les deux
            doivent correspondre au total attendu de {fmt(pendingTotal)}), puis le nom de la
            personne qui a vérifié le compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div title="Voir un administrateur pour modifier (Paramètres → Banque de dépôt par défaut)">
              <Label htmlFor="bank-name" className="mb-1 block">
                Banque
              </Label>
              <Input id="bank-name" value={bankName} disabled className="w-56 cursor-not-allowed" />
            </div>
            <div>
              <Label htmlFor="amount-1" className="mb-1 block">
                Montant transféré
              </Label>
              <Input
                id="amount-1"
                type="number"
                min={0}
                step="0.01"
                value={amount1}
                onChange={(e) => setAmount1(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-40 tabular-nums"
                disabled={pending.length === 0}
              />
            </div>
            <div>
              <Label htmlFor="amount-2" className="mb-1 block">
                Confirme le montant
              </Label>
              <Input
                id="amount-2"
                type="number"
                min={0}
                step="0.01"
                value={amount2}
                onChange={(e) => setAmount2(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-40 tabular-nums"
                disabled={pending.length === 0}
              />
            </div>
            <div>
              <Label htmlFor="verified-by" className="mb-1 block">
                Vérifié par
              </Label>
              <Input
                id="verified-by"
                value={verifiedByName}
                onChange={(e) => setVerifiedByName(e.target.value)}
                placeholder="Nom de la 2e personne"
                className="w-48"
                disabled={pending.length === 0}
              />
            </div>
            <Button onClick={handleRecuperation} disabled={submitting || !canConfirm}>
              <Plus /> {submitting ? "Récupération…" : "Confirmer le transfert"}
            </Button>
          </div>
          {amount1 !== "" && amount2 !== "" && !amountsMatch && (
            <p className="text-sm text-destructive">Les deux montants ne correspondent pas.</p>
          )}
          {amount1 !== "" && amountsMatch && !amountMatchesExpected && (
            <p className="text-sm text-destructive">
              Le montant ne correspond pas au total attendu ({fmt(pendingTotal)}).
            </p>
          )}
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
                <TableHead>Vérifié par</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(depositsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {depositsQuery.isLoading ? "Chargement…" : "Aucune récupération enregistrée."}
                  </TableCell>
                </TableRow>
              )}
              {(depositsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || "—"}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell>{d.verifiedByName || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport-depot/$id" params={{ id: String(d.id) }}>
                        <Eye className="h-4 w-4" />
                      </Link>
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
