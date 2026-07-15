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
import { Plus, Eye, Archive, UtensilsCrossed, Check } from "lucide-react";
import { toast } from "sonner";
import { createDepositFn, getDepositsFn, getPendingClosuresFn } from "@/lib/deposits";
import { confirmVeloceSaleFn, getPendingVeloceSalesFn } from "@/lib/veloce-sales";
import type { VeloceSaleRow } from "@/lib/veloce-sales.server";
import { getSettingsFn } from "@/lib/settings";
import { localDateString } from "@/lib/dates";
import type { DepositRow, DepositSource } from "@/lib/deposits.server";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/recuperation")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "recuperation")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Récupération — BackOffice" }] }),
  component: RecuperationPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Karting and the restaurant each have their OWN physical drop box, picked
// up separately on their own schedule - so each gets its own independent
// pending total, double-verification form, and recuperation history, even
// though both feed the same coffre-fort.
function ConfirmTransferForm({
  source,
  pendingTotal,
  hasPending,
  blockedReason,
  bankName,
  onConfirmed,
}: {
  source: DepositSource;
  pendingTotal: number;
  hasPending: boolean;
  blockedReason?: string;
  bankName: string;
  onConfirmed: (result: { deposit: DepositRow; closureCount: number; veloceCount: number }) => void;
}) {
  const runCreateDeposit = useServerFn(createDepositFn);
  const [submitting, setSubmitting] = useState(false);
  const [amount1, setAmount1] = useState<number | "">("");
  const [amount2, setAmount2] = useState<number | "">("");
  const [verifiedByName, setVerifiedByName] = useState("");

  const ready = hasPending && !blockedReason;
  const amountsMatch =
    amount1 !== "" && amount2 !== "" && Math.abs(Number(amount1) - Number(amount2)) < 0.005;
  const amountMatchesExpected = amount1 !== "" && Math.abs(Number(amount1) - pendingTotal) < 0.005;
  const canConfirm = ready && amountsMatch && amountMatchesExpected && verifiedByName.trim() !== "";

  const handleConfirm = async () => {
    if (!hasPending) {
      toast.error("Rien en attente dans cette boîte à dépôt.");
      return;
    }
    if (blockedReason) {
      toast.error(blockedReason);
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
        data: {
          bankName,
          confirmedAmount: Number(amount1),
          verifiedByName: verifiedByName.trim(),
          source,
        },
      });
      onConfirmed({
        deposit: result.deposit,
        closureCount: result.closures.length,
        veloceCount: result.veloceSales.length,
      });
      setAmount1("");
      setAmount2("");
      setVerifiedByName("");
    } catch (error) {
      toast.error("Échec de la récupération", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base">Confirmer le transfert vers le coffre-fort</CardTitle>
        <CardDescription>
          Double vérification obligatoire : saisis le montant transféré deux fois (les deux doivent
          correspondre au total attendu de {fmt(pendingTotal)}), puis le nom de la personne qui a
          vérifié le compte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div title="Voir un administrateur pour modifier (Paramètres → Banque de dépôt par défaut)">
            <Label className="mb-1 block">Banque</Label>
            <Input value={bankName} disabled className="w-56 cursor-not-allowed" />
          </div>
          <div>
            <Label className="mb-1 block">Montant transféré</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount1}
              onChange={(e) => setAmount1(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-40 tabular-nums"
              disabled={!ready}
            />
          </div>
          <div>
            <Label className="mb-1 block">Confirme le montant</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount2}
              onChange={(e) => setAmount2(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-40 tabular-nums"
              disabled={!ready}
            />
          </div>
          <div>
            <Label className="mb-1 block">Vérifié par</Label>
            <Input
              value={verifiedByName}
              onChange={(e) => setVerifiedByName(e.target.value)}
              placeholder="Nom de la 2e personne"
              className="w-48"
              disabled={!ready}
            />
          </div>
          <Button onClick={handleConfirm} disabled={submitting || !canConfirm}>
            <Plus /> {submitting ? "Récupération…" : "Confirmer le transfert"}
          </Button>
        </div>
        {blockedReason && <p className="text-sm text-warning">{blockedReason}</p>}
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
  );
}

// One pending resto day: montant supposé (Veloce's own report, auto-synced
// by autoSyncPendingVeloceSales on page load) vs montant réel (a physical
// count of that day's cash, done here at recuperation time). Keyed by
// saleDate in the parent so it remounts - and its local input resets to the
// freshly-confirmed value - whenever the underlying row changes after a
// confirm.
function VeloceDayRow({ sale, onConfirmed }: { sale: VeloceSaleRow; onConfirmed: () => void }) {
  const runConfirm = useServerFn(confirmVeloceSaleFn);
  const [confirming, setConfirming] = useState(false);
  const [realAmount, setRealAmount] = useState<number | "">(
    sale.confirmedAmount ?? sale.cashAmount,
  );

  const isConfirmed = sale.confirmedAmount !== null;
  const ecart = realAmount === "" ? 0 : Number(realAmount) - sale.cashAmount;
  const hasEcart = Math.abs(ecart) >= 0.005;

  const handleConfirm = async () => {
    if (realAmount === "") {
      toast.error("Saisis le montant réel compté.");
      return;
    }
    setConfirming(true);
    try {
      await runConfirm({ data: { saleDate: sale.saleDate, confirmedAmount: Number(realAmount) } });
      onConfirmed();
    } catch (error) {
      toast.error("Échec de la confirmation", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <TableRow>
      <TableCell>{sale.saleDate}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmt(sale.cashAmount)}
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={realAmount}
          onChange={(e) => setRealAmount(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-32 ml-auto tabular-nums"
        />
      </TableCell>
      <TableCell className="text-right">
        <Badge
          variant={hasEcart ? "destructive" : "secondary"}
          className={hasEcart ? "" : "bg-success/15 text-success border-success/30"}
        >
          {hasEcart ? fmt(ecart) : "Aucun"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant={isConfirmed ? "outline" : "default"}
          onClick={handleConfirm}
          disabled={confirming}
        >
          <Check className="h-4 w-4" />
          {confirming ? "…" : isConfirmed ? "Reconfirmer" : "Confirmer"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DepositsHistoryTable({
  deposits,
  isLoading,
}: {
  deposits: DepositRow[];
  isLoading: boolean;
}) {
  return (
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
        {deposits.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              {isLoading ? "Chargement…" : "Aucune récupération enregistrée."}
            </TableCell>
          </TableRow>
        )}
        {deposits.map((d) => (
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
  );
}

function RecuperationPage() {
  const queryClient = useQueryClient();
  const runGetPending = useServerFn(getPendingClosuresFn);
  const runGetPendingVeloce = useServerFn(getPendingVeloceSalesFn);
  const runGetDeposits = useServerFn(getDepositsFn);
  const runGetSettings = useServerFn(getSettingsFn);

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
  const pendingKartingTotal = pending.reduce((sum, c) => sum + c.depositAmount, 0);
  // Once a day is confirmed, its real counted amount is what actually gets
  // swept to the safe - falls back to Veloce's reported cashAmount for days
  // not yet confirmed, so the running total stays meaningful before that.
  const pendingRestoTotal = pendingVeloce.reduce(
    (sum, s) => sum + (s.confirmedAmount ?? s.cashAmount),
    0,
  );
  const allVeloceConfirmed = pendingVeloce.every((s) => s.confirmedAmount !== null);
  const kartingOldestDate = pending[0]?.closureDate;
  const restoOldestDate = pendingVeloce[0]?.saleDate;

  const kartingDeposits = (depositsQuery.data ?? []).filter((d) => d.source === "karting");
  const restoDeposits = (depositsQuery.data ?? []).filter((d) => d.source === "resto");

  const invalidateAfterRecuperation = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-closures"] });
    queryClient.invalidateQueries({ queryKey: ["pending-veloce-sales"] });
    queryClient.invalidateQueries({ queryKey: ["veloce-sales-since-recuperation"] });
    queryClient.invalidateQueries({ queryKey: ["deposits"] });
    queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
  };

  return (
    <div className="p-6 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Récupération</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Karting et resto ont chacun leur propre boîte à dépôt, récupérée séparément — les deux
          montants récupérés s'ajoutent au même coffre-fort.
        </p>
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Archive className="h-5 w-5" /> Boîte à dépôt — Karting
        </h2>

        <Card className="shadow-[var(--shadow-card)] bg-[image:var(--gradient-primary)] text-primary-foreground border-0">
          <CardHeader>
            <CardDescription className="text-primary-foreground/80">
              Boîte à dépôt en cours
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">
              {pendingQuery.isLoading ? "…" : fmt(pendingKartingTotal)}
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">
              {pending.length === 0
                ? "Aucune fermeture en attente."
                : `${pending.length} fermeture(s) — du ${kartingOldestDate} au ${localDateString()}.`}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Fermetures en attente dans la boîte à dépôt</CardTitle>
            <CardDescription>
              Chaque fermeture/session de tiroir depuis la dernière récupération.
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

        <ConfirmTransferForm
          source="karting"
          pendingTotal={pendingKartingTotal}
          hasPending={pending.length > 0}
          bankName={bankName}
          onConfirmed={({ deposit, closureCount }) => {
            toast.success(`Récupération de ${fmt(deposit.totalAmount)} enregistrée`, {
              description: `${closureCount} fermeture(s) incluse(s) — ajouté au coffre-fort.`,
            });
            invalidateAfterRecuperation();
          }}
        />

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Récupérations karting effectuées</CardTitle>
          </CardHeader>
          <CardContent>
            <DepositsHistoryTable deposits={kartingDeposits} isLoading={depositsQuery.isLoading} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 border-t pt-10">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5" /> Boîte à dépôt — Resto (Véloce)
        </h2>

        <Card className="shadow-[var(--shadow-card)] bg-[image:var(--gradient-primary)] text-primary-foreground border-0">
          <CardHeader>
            <CardDescription className="text-primary-foreground/80">
              Boîte à dépôt en cours
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">
              {pendingVeloceQuery.isLoading ? "…" : fmt(pendingRestoTotal)}
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">
              {pendingVeloce.length === 0
                ? "Aucune vente resto en attente."
                : `${pendingVeloce.length} jour(s) — du ${restoOldestDate} au ${localDateString()}.`}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Cash resto en attente dans la boîte à dépôt</CardTitle>
            <CardDescription>
              Pour chaque jour, confirme le montant réel compté dans la boîte à dépôt face au
              montant supposé (synchronisé automatiquement depuis Véloce) avant de pouvoir procéder
              à la récupération.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingVeloce.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Montant supposé</TableHead>
                    <TableHead className="text-right">Montant réel</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead className="text-right">Confirmation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingVeloce.map((s) => (
                    <VeloceDayRow
                      key={s.saleDate}
                      sale={s}
                      onConfirmed={() => {
                        queryClient.invalidateQueries({ queryKey: ["pending-veloce-sales"] });
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ConfirmTransferForm
          source="resto"
          pendingTotal={pendingRestoTotal}
          hasPending={pendingVeloce.length > 0}
          blockedReason={
            pendingVeloce.length > 0 && !allVeloceConfirmed
              ? "Confirme le montant réel de chaque jour ci-dessus avant de procéder à la récupération."
              : undefined
          }
          bankName={bankName}
          onConfirmed={({ deposit, veloceCount }) => {
            toast.success(`Récupération de ${fmt(deposit.totalAmount)} enregistrée`, {
              description: `${veloceCount} jour(s) de vente resto inclus — ajouté au coffre-fort.`,
            });
            invalidateAfterRecuperation();
          }}
        />

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Récupérations resto effectuées</CardTitle>
          </CardHeader>
          <CardContent>
            <DepositsHistoryTable deposits={restoDeposits} isLoading={depositsQuery.isLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
