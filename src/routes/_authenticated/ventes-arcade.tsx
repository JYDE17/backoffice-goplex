import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Gamepad2, Plus } from "lucide-react";
import { toast } from "sonner";
import { getArcadeSalesSinceLastRecuperationFn, upsertArcadeSaleFn } from "@/lib/arcade-sales";
import { localDateString } from "@/lib/dates";
import { fmt, fmtEcart, ecartTone } from "@/lib/report-format";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/ventes-arcade")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "ventesArcade")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Ventes Arcade — BackOffice" }] }),
  component: VentesArcadePage,
});

type RowState = {
  csrName: string;
  zoutCashPaid: number | "";
  zoutCashRefund: number | "";
  zoutCardPaid: number | "";
  zoutCardRefund: number | "";
  countedCashPaid: number | "";
  countedCashRefund: number | "";
  countedCardPaid: number | "";
  countedCardRefund: number | "";
};
const EMPTY_ROW: RowState = {
  csrName: "",
  zoutCashPaid: "",
  zoutCashRefund: "",
  zoutCardPaid: "",
  zoutCardRefund: "",
  countedCashPaid: "",
  countedCashRefund: "",
  countedCardPaid: "",
  countedCardRefund: "",
};

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 tabular-nums"
        placeholder="0"
      />
    </div>
  );
}

function VentesArcadePage() {
  const queryClient = useQueryClient();
  const runGetSince = useServerFn(getArcadeSalesSinceLastRecuperationFn);
  const runUpsertSale = useServerFn(upsertArcadeSaleFn);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [touchedDates, setTouchedDates] = useState<Set<string>>(new Set());
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState(localDateString());
  const [saving, setSaving] = useState(false);

  const sinceQuery = useQuery({
    queryKey: ["arcade-sales-since-recuperation"],
    queryFn: () => runGetSince(),
  });

  const today = localDateString();
  // A day can only be added if it falls within the current récupération
  // window - the same one this page's auto-generated rows already cover -
  // since that's the only span not yet swept into the safe.
  const earliestDate = sinceQuery.data?.lastRecuperationDate ?? today;

  const dateRange = useMemo(() => {
    const generated = sinceQuery.data?.dates ?? [];
    const merged = new Set([...generated, ...extraDates]);
    return Array.from(merged).sort();
  }, [sinceQuery.data, extraDates]);

  const salesRowByDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof sinceQuery.data>["sales"][number]>();
    for (const s of sinceQuery.data?.sales ?? []) map.set(s.saleDate, s);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceQuery.data]);

  // Prefills each date's fields from whatever's already saved, but only
  // until the user actually types something for that specific date - same
  // pattern as /ventes-resto.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const d of dateRange) {
        if (touchedDates.has(d) || next[d]) continue;
        const existing = salesRowByDate.get(d);
        next[d] = existing
          ? {
              csrName: existing.csrName,
              zoutCashPaid: existing.zoutCashPaid,
              zoutCashRefund: existing.zoutCashRefund,
              zoutCardPaid: existing.zoutCardPaid,
              zoutCardRefund: existing.zoutCardRefund,
              countedCashPaid: existing.countedCashPaid,
              countedCashRefund: existing.countedCashRefund,
              countedCardPaid: existing.countedCardPaid,
              countedCardRefund: existing.countedCardRefund,
            }
          : { ...EMPTY_ROW };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.join(","), salesRowByDate]);

  const setField = (date: string, field: keyof RowState, value: string) => {
    setTouchedDates((s) => new Set(s).add(date));
    setRows((r) => ({
      ...r,
      [date]: {
        ...(r[date] ?? EMPTY_ROW),
        [field]: field === "csrName" ? value : value === "" ? "" : Number(value),
      },
    }));
  };

  const addDate = () => {
    if (!newDate) return;
    if (newDate < earliestDate || newDate > today) {
      toast.error(
        `La date doit être entre ${earliestDate} et ${today} (plage de la récupération en cours).`,
      );
      return;
    }
    if (!dateRange.includes(newDate)) {
      setExtraDates((prev) => [...prev, newDate]);
    }
  };

  const rowTotals = (r: RowState) => {
    const zoutCash = (r.zoutCashPaid || 0) - (r.zoutCashRefund || 0);
    const zoutCard = (r.zoutCardPaid || 0) - (r.zoutCardRefund || 0);
    const countedCash = (r.countedCashPaid || 0) - (r.countedCashRefund || 0);
    const countedCard = (r.countedCardPaid || 0) - (r.countedCardRefund || 0);
    const zoutTotal = zoutCash + zoutCard;
    const countedTotal = countedCash + countedCard;
    return { zoutTotal, countedTotal, ecart: zoutTotal - countedTotal };
  };

  const grandTotals = dateRange.reduce(
    (acc, d) => {
      const t = rowTotals(rows[d] ?? EMPTY_ROW);
      return {
        zout: acc.zout + t.zoutTotal,
        counted: acc.counted + t.countedTotal,
      };
    },
    { zout: 0, counted: 0 },
  );

  const handleSaveAll = async () => {
    for (const d of dateRange) {
      const r = rows[d];
      if (!r) continue;
      const amounts = [
        r.zoutCashPaid,
        r.zoutCashRefund,
        r.zoutCardPaid,
        r.zoutCardRefund,
        r.countedCashPaid,
        r.countedCashRefund,
        r.countedCardPaid,
        r.countedCardRefund,
      ];
      if (amounts.some((a) => a !== "" && a < 0)) {
        toast.error(`Montant négatif invalide pour le ${d}.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const d of dateRange) {
        const r = rows[d] ?? EMPTY_ROW;
        await runUpsertSale({
          data: {
            saleDate: d,
            csrName: r.csrName,
            zoutCashPaid: Number(r.zoutCashPaid || 0),
            zoutCashRefund: Number(r.zoutCashRefund || 0),
            zoutCardPaid: Number(r.zoutCardPaid || 0),
            zoutCardRefund: Number(r.zoutCardRefund || 0),
            countedCashPaid: Number(r.countedCashPaid || 0),
            countedCashRefund: Number(r.countedCashRefund || 0),
            countedCardPaid: Number(r.countedCardPaid || 0),
            countedCardRefund: Number(r.countedCardRefund || 0),
          },
        });
      }
      toast.success(`Ventes arcade enregistrées pour ${dateRange.length} jour(s)`, {
        description: `Total (Z-out) : ${fmt(grandTotals.zout)}`,
      });
      // Clear the local rows too, not just touchedDates/extraDates - the
      // prefill effect below skips any date already present in `rows`, so
      // without this it would keep showing the just-saved values forever
      // instead of re-syncing from the freshly-invalidated query (which
      // matters once the récupération window itself moves).
      setRows({});
      setTouchedDates(new Set());
      setExtraDates([]);
      queryClient.invalidateQueries({ queryKey: ["arcade-sales-since-recuperation"] });
      queryClient.invalidateQueries({ queryKey: ["pending-arcade-sales"] });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventes Arcade</h1>
        <p className="text-sm text-muted-foreground mt-1">Saisie manuelle quotidienne.</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" /> Ventes depuis la dernière récupération CSR
          </CardTitle>
          <CardDescription>
            {sinceQuery.data?.lastRecuperationDate
              ? `Une carte par jour depuis la dernière récupération CSR (${sinceQuery.data.lastRecuperationDate}) jusqu'à aujourd'hui. Z-out = vente attendue (rapport de la machine) ; Compté = montant physiquement compté.`
              : "Aucune récupération CSR enregistrée pour l'instant — affichage d'aujourd'hui seulement."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="new-arcade-date" className="mb-1 block">
                Ajouter une date
              </Label>
              <Input
                id="new-arcade-date"
                type="date"
                value={newDate}
                min={earliestDate}
                max={today}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button type="button" variant="outline" onClick={addDate}>
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>

          {dateRange.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              {sinceQuery.isLoading ? "Chargement…" : "Aucune date à saisir."}
            </div>
          )}

          <div className="space-y-4">
            {dateRange.map((d) => {
              const r = rows[d] ?? EMPTY_ROW;
              const t = rowTotals(r);
              return (
                <Card key={d} className="border">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm">{d}</CardTitle>
                      </div>
                      <div className="w-48">
                        <Label className="mb-1 block text-xs text-muted-foreground">
                          Nom du CSR
                        </Label>
                        <Input
                          value={r.csrName}
                          onChange={(e) => setField(d, "csrName", e.target.value)}
                          placeholder="Nom du CSR"
                          className="h-8"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-md border p-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Z-out (vente attendue)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <AmountField
                            label="Cash"
                            value={r.zoutCashPaid}
                            onChange={(v) => setField(d, "zoutCashPaid", v)}
                          />
                          <AmountField
                            label="Remb. cash"
                            value={r.zoutCashRefund}
                            onChange={(v) => setField(d, "zoutCashRefund", v)}
                          />
                          <AmountField
                            label="Carte"
                            value={r.zoutCardPaid}
                            onChange={(v) => setField(d, "zoutCardPaid", v)}
                          />
                          <AmountField
                            label="Remb. carte"
                            value={r.zoutCardRefund}
                            onChange={(v) => setField(d, "zoutCardRefund", v)}
                          />
                        </div>
                        <div className="text-sm text-right">
                          <span className="text-muted-foreground">Total </span>
                          <span className="font-semibold tabular-nums">{fmt(t.zoutTotal)}</span>
                        </div>
                      </div>

                      <div className="rounded-md border p-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Montant reçu (compté)
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <AmountField
                            label="Cash"
                            value={r.countedCashPaid}
                            onChange={(v) => setField(d, "countedCashPaid", v)}
                          />
                          <AmountField
                            label="Remb. cash"
                            value={r.countedCashRefund}
                            onChange={(v) => setField(d, "countedCashRefund", v)}
                          />
                          <AmountField
                            label="Carte"
                            value={r.countedCardPaid}
                            onChange={(v) => setField(d, "countedCardPaid", v)}
                          />
                          <AmountField
                            label="Remb. carte"
                            value={r.countedCardRefund}
                            onChange={(v) => setField(d, "countedCardRefund", v)}
                          />
                        </div>
                        <div className="text-sm text-right">
                          <span className="text-muted-foreground">Total </span>
                          <span className="font-semibold tabular-nums">{fmt(t.countedTotal)}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Débalancement</span>
                      {Math.abs(t.ecart) < 0.005 ? (
                        <Badge
                          variant="secondary"
                          className="bg-success/15 text-success border-success/30"
                        >
                          Aucun
                        </Badge>
                      ) : (
                        <span className={`font-semibold tabular-nums ${ecartTone(t.ecart)}`}>
                          {fmtEcart(t.ecart)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {dateRange.length > 0 && (
            <div className="rounded-md border p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm font-medium">Total de la période</div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Z-out (attendu) </span>
                  <span className="font-semibold tabular-nums">{fmt(grandTotals.zout)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Compté </span>
                  <span className="font-semibold tabular-nums">{fmt(grandTotals.counted)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Débalancement </span>
                  <span
                    className={`font-semibold tabular-nums ${ecartTone(grandTotals.zout - grandTotals.counted)}`}
                  >
                    {fmtEcart(grandTotals.zout - grandTotals.counted)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSaveAll} disabled={saving || dateRange.length === 0}>
            {saving ? "Enregistrement…" : "Enregistrer tout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
