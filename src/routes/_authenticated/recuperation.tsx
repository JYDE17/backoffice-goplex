import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Eye, Archive, UtensilsCrossed, Check } from "lucide-react";
import { toast } from "sonner";
import { createDepositFn, getDepositsFn, getPendingClosuresFn } from "@/lib/deposits";
import { confirmVeloceSaleFn, getPendingVeloceSalesFn } from "@/lib/veloce-sales";
import { getPendingArcadeSalesFn } from "@/lib/arcade-sales";
import type { VeloceSaleRow } from "@/lib/veloce-sales.server";
import type { ClosureRow } from "@/lib/closures.server";
import type { ArcadeSaleRow } from "@/lib/arcade-sales.server";
import { getSettingsFn } from "@/lib/settings";
import { localDateString } from "@/lib/dates";
import type { DepositRow, DepositSource } from "@/lib/deposits.server";
import { canAccessPage } from "@/lib/permissions";
import { arcadeZoutCashNet } from "@/lib/report-format";

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
  selectedDates,
  onConfirmed,
}: {
  source: DepositSource;
  pendingTotal: number;
  hasPending: boolean;
  blockedReason?: string;
  bankName: string;
  // Karting only - which pending days were checked off; omitted for
  // "resto", which always sweeps everything pending (no day selection).
  selectedDates?: string[];
  onConfirmed: (result: {
    deposit: DepositRow;
    closureCount: number;
    veloceCount: number;
    arcadeCount: number;
  }) => void;
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
          selectedDates,
        },
      });
      onConfirmed({
        deposit: result.deposit,
        closureCount: result.closures.length,
        veloceCount: result.veloceSales.length,
        arcadeCount: result.arcadeSales.length,
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

// One calendar day of the karting drop box - one or more closures (one per
// POS) plus every arcade shift entry logged that day (there can be several -
// a CSR batches a week's worth of shifts at once), pooled together since
// both share the same physical box. Recuperation now picks up a whole day
// at a time (not individual sessions/shifts), so this is the row/checkbox
// unit in the pending table below.
type KartingDayGroup = {
  date: string;
  closures: ClosureRow[];
  arcade: ArcadeSaleRow[];
  total: number;
};

function buildKartingDayGroups(
  closures: ClosureRow[],
  arcadeSales: ArcadeSaleRow[],
): KartingDayGroup[] {
  const byDate = new Map<string, KartingDayGroup>();
  for (const c of closures) {
    const g = byDate.get(c.closureDate) ?? {
      date: c.closureDate,
      closures: [],
      arcade: [],
      total: 0,
    };
    g.closures.push(c);
    g.total += c.depositAmount;
    byDate.set(c.closureDate, g);
  }
  for (const a of arcadeSales) {
    const g = byDate.get(a.saleDate) ?? {
      date: a.saleDate,
      closures: [],
      arcade: [],
      total: 0,
    };
    g.arcade.push(a);
    g.total += arcadeZoutCashNet(a);
    byDate.set(a.saleDate, g);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function RecuperationPage() {
  const queryClient = useQueryClient();
  const runGetPending = useServerFn(getPendingClosuresFn);
  const runGetPendingArcade = useServerFn(getPendingArcadeSalesFn);
  const runGetPendingVeloce = useServerFn(getPendingVeloceSalesFn);
  const runGetDeposits = useServerFn(getDepositsFn);
  const runGetSettings = useServerFn(getSettingsFn);

  // Days explicitly unchecked from the karting pending table - empty means
  // "everything selected" so newly-appearing pending days start checked
  // without needing a sync effect.
  const [deselectedDates, setDeselectedDates] = useState<Set<string>>(new Set());

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
  const pendingArcadeQuery = useQuery({
    queryKey: ["pending-arcade-sales"],
    queryFn: () => runGetPendingArcade(),
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
  const pendingArcade = pendingArcadeQuery.data ?? [];
  const pendingVeloce = pendingVeloceQuery.data ?? [];

  const kartingDayGroups = useMemo(
    () => buildKartingDayGroups(pendingQuery.data ?? [], pendingArcadeQuery.data ?? []),
    [pendingQuery.data, pendingArcadeQuery.data],
  );
  const selectedKartingGroups = kartingDayGroups.filter((g) => !deselectedDates.has(g.date));
  const selectedKartingTotal = selectedKartingGroups.reduce((sum, g) => sum + g.total, 0);
  const pendingKartingTotal = kartingDayGroups.reduce((sum, g) => sum + g.total, 0);
  const toggleKartingDate = (date: string) =>
    setDeselectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  // Locked to Veloce's reported cashAmount (the expected figure), same as
  // karting closures are locked to RaceFacer's expected cash rather than
  // what was physically counted - see "Le dépôt... est verrouillé au cash
  // attendu" in the README. The physical count (confirmedAmount) still has
  // to happen for every day before recuperating (see allVeloceConfirmed
  // below) so a real shortfall gets noticed via the écart badge, but it no
  // longer changes what's actually swept into the safe.
  const pendingRestoTotal = pendingVeloce.reduce((sum, s) => sum + s.cashAmount, 0);
  const allVeloceConfirmed = pendingVeloce.every((s) => s.confirmedAmount !== null);
  const kartingOldestDate = kartingDayGroups[0]?.date;
  const restoOldestDate = pendingVeloce[0]?.saleDate;

  const kartingDeposits = (depositsQuery.data ?? []).filter((d) => d.source === "karting");
  const restoDeposits = (depositsQuery.data ?? []).filter((d) => d.source === "resto");

  const invalidateAfterRecuperation = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-closures"] });
    queryClient.invalidateQueries({ queryKey: ["pending-arcade-sales"] });
    queryClient.invalidateQueries({ queryKey: ["arcade-sales-since-recuperation"] });
    queryClient.invalidateQueries({ queryKey: ["pending-veloce-sales"] });
    queryClient.invalidateQueries({ queryKey: ["veloce-sales-since-recuperation"] });
    queryClient.invalidateQueries({ queryKey: ["deposits"] });
    queryClient.invalidateQueries({ queryKey: ["safe-movements"] });
    setDeselectedDates(new Set());
  };

  return (
    <div className="p-6 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Récupération</h1>
        <p className="text-sm text-muted-foreground mt-1">
          CSR et resto ont chacun leur propre boîte à dépôt, récupérée séparément — les deux
          montants récupérés s'ajoutent au même coffre-fort.
        </p>
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Archive className="h-5 w-5" /> Boîte à dépôt — CSR
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
              {kartingDayGroups.length === 0
                ? "Aucune fermeture en attente."
                : `${kartingDayGroups.length} jour(s) — du ${kartingOldestDate} au ${localDateString()}.`}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Ramassage en attente dans la boîte à dépôt</CardTitle>
            <CardDescription>
              Un ramassage par jour (fermetures + ventes arcade de ce jour-là) — décoche un jour
              pour l'exclure de cette récupération et le laisser dans la boîte pour la prochaine
              fois.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kartingDayGroups.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Date</TableHead>
                    <TableHead>Fermetures</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kartingDayGroups.map((g) => (
                    <TableRow key={g.date}>
                      <TableCell>
                        <Checkbox
                          checked={!deselectedDates.has(g.date)}
                          onCheckedChange={() => toggleKartingDate(g.date)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{g.date}</TableCell>
                      <TableCell>
                        {g.closures.length === 0 && g.arcade.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {g.closures.map((c) => (
                              <Badge key={c.id} variant="outline">
                                {c.stationName} · {fmt(c.depositAmount)}
                              </Badge>
                            ))}
                            {g.arcade.map((a) => (
                              <Badge key={a.id} variant="outline">
                                Arcade{a.csrName ? ` (${a.csrName})` : ""} ·{" "}
                                {fmt(arcadeZoutCashNet(a))}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(g.total)}
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
          pendingTotal={selectedKartingTotal}
          hasPending={selectedKartingGroups.length > 0}
          selectedDates={selectedKartingGroups.map((g) => g.date)}
          bankName={bankName}
          onConfirmed={({ deposit, closureCount, arcadeCount }) => {
            toast.success(`Récupération de ${fmt(deposit.totalAmount)} enregistrée`, {
              description: `${closureCount} fermeture(s)${arcadeCount > 0 ? ` + ${arcadeCount} jour(s) d'arcade` : ""} incluse(s) — ajouté au coffre-fort.`,
            });
            invalidateAfterRecuperation();
          }}
        />

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Récupérations CSR effectuées</CardTitle>
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
