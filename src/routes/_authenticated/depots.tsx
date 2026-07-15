import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
import { Landmark, Eye, Calculator, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { DenomList } from "@/components/cash-counting-grid";
import { createBankDepositFn, getBankDepositsFn } from "@/lib/bank-deposits";
import { getLatestChangeBoxCountFn } from "@/lib/change-box";
import { getSafeMovementsFn } from "@/lib/safe";
import { getSettingsFn } from "@/lib/settings";
import {
  DENOMS,
  CHANGE_BOX_ITEMS,
  CHANGE_BOX_IDEAL_TOTAL,
  bankDepositAmount,
} from "@/lib/denominations";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/depots")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "depots")) {
      throw redirect({ to: "/" });
    }
  },
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
  const runGetLatestChangeBoxCount = useServerFn(getLatestChangeBoxCountFn);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmAmount, setConfirmAmount] = useState<number | "">("");
  const [bankName, setBankName] = useState("");
  const [verifiedByName, setVerifiedByName] = useState("");
  const [changeBoxCounts, setChangeBoxCounts] = useState<Record<string, number>>({});
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
  const lastChangeBoxQuery = useQuery({
    queryKey: ["latest-change-box-count"],
    queryFn: () => runGetLatestChangeBoxCount(),
  });

  const balance = safeQuery.data?.balance ?? 0;
  const bankNameValue = bankName || settingsQuery.data?.defaultBankName || "";

  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setCounts((c) => ({ ...c, [label]: n }));
  };
  const setChangeBoxCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setChangeBoxCounts((c) => ({ ...c, [label]: n }));
  };

  const amount = bankDepositAmount(counts);
  const changeBoxTotal = CHANGE_BOX_ITEMS.reduce(
    (sum, item) => sum + (changeBoxCounts[item.label] ?? 0) * item.value,
    0,
  );

  const amountsMatch = confirmAmount !== "" && Math.abs(amount - Number(confirmAmount)) < 0.005;
  const canConfirm =
    amount > 0 && amount <= balance && amountsMatch && verifiedByName.trim() !== "";

  const handleDeposit = async () => {
    if (amount <= 0) {
      toast.error("Compte au moins un billet ou une pièce.");
      return;
    }
    if (amount > balance) {
      toast.error(`Le montant dépasse le solde du coffre-fort (${fmt(balance)}).`);
      return;
    }
    if (!amountsMatch) {
      toast.error("Les deux montants saisis ne correspondent pas.");
      return;
    }
    if (!verifiedByName.trim()) {
      toast.error("Indique le nom de la personne qui a vérifié.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await runCreateBankDeposit({
        data: {
          counts,
          confirmedAmount: Number(confirmAmount),
          bankName: bankNameValue,
          verifiedByName: verifiedByName.trim(),
          changeBoxCounts,
        },
      });
      toast.success(`Dépôt bancaire de ${fmt(result.totalAmount)} enregistré`, {
        description: `Retiré du coffre-fort — nouveau solde ${fmt(balance - result.totalAmount)}.`,
      });
      setCounts({});
      setConfirmAmount("");
      setVerifiedByName("");
      setChangeBoxCounts({});
      queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
      queryClient.invalidateQueries({ queryKey: ["bank-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["latest-change-box-count"] });
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
          <CardDescription className="text-primary-foreground/80">
            Solde actuel du coffre-fort
          </CardDescription>
          <CardTitle className="text-4xl font-semibold tabular-nums">
            {safeQuery.isLoading ? "…" : fmt(balance)}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Sommaire du dépôt
          </CardTitle>
          <CardDescription>
            Compte chaque coupure et pièce de l'argent qui s'en va à la banque — le montant se
            calcule automatiquement, il ne se tape jamais à la main.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <DenomList
              title="Pièces"
              items={DENOMS.filter((d) => d.type === "piece")}
              counts={counts}
              setCount={setCount}
            />
            <div className="sm:border-l sm:pl-6">
              <DenomList
                title="Billets"
                items={DENOMS.filter((d) => d.type === "billet")}
                counts={counts}
                setCount={setCount}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-md border p-4">
            <span className="text-sm font-medium">Total compté</span>
            <span className="text-xl font-semibold tabular-nums">{fmt(amount)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PiggyBank className="h-4 w-4" /> Boîte de change ({fmt(CHANGE_BOX_IDEAL_TOTAL)})
          </CardTitle>
          <CardDescription>
            Compte ce qui reste dans la boîte de change avant le dépôt — ce qui manque pour revenir
            à {fmt(CHANGE_BOX_IDEAL_TOTAL)} est à demander à la banque.
            {lastChangeBoxQuery.data && (
              <>
                {" "}
                Dernier compte : {lastChangeBoxQuery.data.countDate} —{" "}
                {fmt(
                  CHANGE_BOX_ITEMS.reduce(
                    (sum, item) =>
                      sum + (lastChangeBoxQuery.data!.counts[item.label] ?? 0) * item.value,
                    0,
                  ),
                )}
                .
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pièce</TableHead>
                <TableHead className="text-right">Valeur</TableHead>
                <TableHead className="text-right">Quantité idéale</TableHead>
                <TableHead className="text-right">Quantité actuelle</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">À recevoir de la banque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CHANGE_BOX_ITEMS.map((item) => {
                const qty = changeBoxCounts[item.label] ?? 0;
                const toReceive = Math.max(0, item.idealQty - qty);
                return (
                  <TableRow key={item.label}>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(item.value)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.idealQty} ({fmt(item.idealQty * item.value)})
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={qty || ""}
                        onChange={(e) => setChangeBoxCount(item.label, e.target.value)}
                        className="h-8 w-20 ml-auto tabular-nums"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(qty * item.value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {toReceive > 0 ? toReceive : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold" colSpan={4}>
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(changeBoxTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Confirmer un dépôt à la banque
          </CardTitle>
          <CardDescription>
            Le montant est retiré du coffre-fort dès la confirmation. Double vérification
            obligatoire : confirme le montant compté ci-dessus, plus le nom de la personne qui a
            vérifié.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="deposit-amount-confirm" className="mb-1 block">
                Confirme le montant ({fmt(amount)})
              </Label>
              <Input
                id="deposit-amount-confirm"
                type="number"
                min={0}
                step="0.01"
                value={confirmAmount}
                onChange={(e) =>
                  setConfirmAmount(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-40 tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="deposit-bank" className="mb-1 block">
                Banque
              </Label>
              <Input
                id="deposit-bank"
                value={bankNameValue}
                onChange={(e) => setBankName(e.target.value)}
                className="w-56"
              />
            </div>
            <div>
              <Label htmlFor="deposit-verified-by" className="mb-1 block">
                Vérifié par
              </Label>
              <Input
                id="deposit-verified-by"
                value={verifiedByName}
                onChange={(e) => setVerifiedByName(e.target.value)}
                placeholder="Nom de la 2e personne"
                className="w-48"
              />
            </div>
            <Button onClick={handleDeposit} disabled={submitting || !canConfirm}>
              {submitting ? "Enregistrement…" : `Confirmer le dépôt de ${fmt(amount)}`}
            </Button>
          </div>
          {confirmAmount !== "" && !amountsMatch && (
            <p className="text-sm text-destructive">Les deux montants ne correspondent pas.</p>
          )}
          {amount > balance && (
            <p className="text-sm text-destructive">
              Le montant compté dépasse le solde du coffre-fort ({fmt(balance)}).
            </p>
          )}
          {balance <= 0 && !safeQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              Le coffre-fort est vide — rien à déposer pour l'instant.
            </p>
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
                <TableHead>Vérifié par</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bankDepositsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {bankDepositsQuery.isLoading
                      ? "Chargement…"
                      : "Aucun dépôt bancaire enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {(bankDepositsQuery.data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || <Badge variant="outline">—</Badge>}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell>{d.verifiedByName || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport-depot-bancaire/$id" params={{ id: String(d.id) }}>
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
