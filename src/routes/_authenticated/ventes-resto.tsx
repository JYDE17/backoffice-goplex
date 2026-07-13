import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { getVeloceSalesSinceLastRecuperationFn, upsertVeloceSaleFn } from "@/lib/veloce-sales";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/ventes-resto")({
  head: () => ({ meta: [{ title: "Ventes resto (Véloce) — BackOffice" }] }),
  component: VentesRestoPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

type RowState = { cash: number | ""; card: number | "" };

function VentesRestoPage() {
  const queryClient = useQueryClient();
  const runGetSince = useServerFn(getVeloceSalesSinceLastRecuperationFn);
  const runUpsertSale = useServerFn(upsertVeloceSaleFn);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [touchedDates, setTouchedDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const sinceQuery = useQuery({
    queryKey: ["veloce-sales-since-recuperation"],
    queryFn: () => runGetSince(),
  });

  const dateRange = sinceQuery.data?.dates ?? [];
  const salesByDate = useMemo(() => {
    const map = new Map<string, { cashAmount: number; cardAmount: number }>();
    for (const s of sinceQuery.data?.sales ?? []) map.set(s.saleDate, s);
    return map;
  }, [sinceQuery.data]);

  // Prefills each date's fields from whatever's already saved, but only
  // until the user actually types something for that specific date - a
  // background refetch shouldn't stomp on a value mid-entry for another day
  // in the same batch.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      for (const d of dateRange) {
        if (touchedDates.has(d) || next[d]) continue;
        const existing = salesByDate.get(d);
        next[d] = { cash: existing?.cashAmount ?? "", card: existing?.cardAmount ?? "" };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.join(","), salesByDate]);

  const setCell = (date: string, field: "cash" | "card", value: string) => {
    setTouchedDates((s) => new Set(s).add(date));
    setRows((r) => ({
      ...r,
      [date]: {
        ...(r[date] ?? { cash: "", card: "" }),
        [field]: value === "" ? "" : Number(value),
      },
    }));
  };

  const grandTotal = dateRange.reduce((sum, d) => {
    const r = rows[d];
    return sum + (r ? (r.cash || 0) + (r.card || 0) : 0);
  }, 0);

  const handleSaveAll = async () => {
    for (const d of dateRange) {
      const r = rows[d];
      if (r && ((r.cash !== "" && r.cash < 0) || (r.card !== "" && r.card < 0))) {
        toast.error(`Montant négatif invalide pour le ${d}.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const d of dateRange) {
        const r = rows[d] ?? { cash: "", card: "" };
        await runUpsertSale({
          data: {
            saleDate: d,
            cashAmount: Number(r.cash || 0),
            cardAmount: Number(r.card || 0),
          },
        });
      }
      toast.success(`Ventes resto enregistrées pour ${dateRange.length} jour(s)`, {
        description: `Total : ${fmt(grandTotal)}`,
      });
      setTouchedDates(new Set());
      queryClient.invalidateQueries({ queryKey: ["veloce-sales-since-recuperation"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
        <h1 className="text-2xl font-semibold tracking-tight">Ventes resto (Véloce)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Totaux quotidiens saisis manuellement, par mode de paiement — Véloce n'est pas branché à
          l'app, contrairement à RaceFacer/Clover.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" /> Ventes depuis la dernière récupération
          </CardTitle>
          <CardDescription>
            {sinceQuery.data?.lastRecuperationDate
              ? `Une ligne par jour depuis la dernière récupération de la boîte à dépôt (${sinceQuery.data.lastRecuperationDate}) jusqu'à aujourd'hui (${localDateString()}).`
              : "Aucune récupération enregistrée pour l'instant — affichage d'aujourd'hui seulement."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Carte</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateRange.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {sinceQuery.isLoading ? "Chargement…" : "Aucune date à saisir."}
                  </TableCell>
                </TableRow>
              )}
              {dateRange.map((d) => {
                const r = rows[d] ?? { cash: "", card: "" };
                return (
                  <TableRow key={d}>
                    <TableCell className="font-medium">{d}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.cash}
                        onChange={(e) => setCell(d, "cash", e.target.value)}
                        className="h-8 w-28 ml-auto tabular-nums"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.card}
                        onChange={(e) => setCell(d, "card", e.target.value)}
                        className="h-8 w-28 ml-auto tabular-nums"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt((r.cash || 0) + (r.card || 0))}
                    </TableCell>
                  </TableRow>
                );
              })}
              {dateRange.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(grandTotal)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Button onClick={handleSaveAll} disabled={saving || dateRange.length === 0}>
            {saving ? "Enregistrement…" : "Enregistrer tout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
