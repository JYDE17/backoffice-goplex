import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { getVeloceSaleFn, listVeloceSalesFn, upsertVeloceSaleFn } from "@/lib/veloce-sales";
import { businessDateString, localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/ventes-resto")({
  head: () => ({ meta: [{ title: "Ventes resto (Véloce) — BackOffice" }] }),
  component: VentesRestoPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

const HISTORY_DAYS_BACK = 60;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateString(d);
}

function VentesRestoPage() {
  const queryClient = useQueryClient();
  const runGetSale = useServerFn(getVeloceSaleFn);
  const runUpsertSale = useServerFn(upsertVeloceSaleFn);
  const runListSales = useServerFn(listVeloceSalesFn);

  const [date, setDate] = useState(businessDateString());
  const [cashAmount, setCashAmount] = useState<number | "">("");
  const [cardAmount, setCardAmount] = useState<number | "">("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const saleQuery = useQuery({
    queryKey: ["veloce-sale", date],
    queryFn: () => runGetSale({ data: { saleDate: date } }),
  });
  const historyQuery = useQuery({
    queryKey: ["veloce-sales", HISTORY_DAYS_BACK],
    queryFn: () => runListSales({ data: { since: daysAgo(HISTORY_DAYS_BACK) } }),
  });

  // Loads whatever's already saved for the selected date, but only until the
  // user starts typing new values for it.
  useEffect(() => {
    setAmountTouched(false);
  }, [date]);
  useEffect(() => {
    if (!amountTouched) {
      setCashAmount(saleQuery.data?.cashAmount ?? "");
      setCardAmount(saleQuery.data?.cardAmount ?? "");
    }
  }, [saleQuery.data, amountTouched]);

  const total = (cashAmount || 0) + (cardAmount || 0);

  const handleSave = async () => {
    if (cashAmount === "" && cardAmount === "") {
      toast.error("Entre au moins un montant.");
      return;
    }
    if ((cashAmount !== "" && cashAmount < 0) || (cardAmount !== "" && cardAmount < 0)) {
      toast.error("Les montants ne peuvent pas être négatifs.");
      return;
    }
    setSaving(true);
    try {
      await runUpsertSale({
        data: {
          saleDate: date,
          cashAmount: Number(cashAmount || 0),
          cardAmount: Number(cardAmount || 0),
        },
      });
      toast.success(`Ventes resto du ${date} enregistrées : ${fmt(total)}`);
      queryClient.invalidateQueries({ queryKey: ["veloce-sale", date] });
      queryClient.invalidateQueries({ queryKey: ["veloce-sales", HISTORY_DAYS_BACK] });
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
            <UtensilsCrossed className="h-4 w-4" /> Saisir le total du jour
          </CardTitle>
          <CardDescription>
            Une seule valeur par jour et par mode — ressaisir la même date remplace les montants
            précédents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="veloce-date" className="mb-1 block">
              Date
            </Label>
            <Input
              id="veloce-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="veloce-cash" className="mb-1 block">
              Cash
            </Label>
            <Input
              id="veloce-cash"
              type="number"
              min={0}
              step="0.01"
              value={cashAmount}
              onChange={(e) => {
                setAmountTouched(true);
                setCashAmount(e.target.value === "" ? "" : Number(e.target.value));
              }}
              className="w-36 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="veloce-card" className="mb-1 block">
              Carte
            </Label>
            <Input
              id="veloce-card"
              type="number"
              min={0}
              step="0.01"
              value={cardAmount}
              onChange={(e) => {
                setAmountTouched(true);
                setCardAmount(e.target.value === "" ? "" : Number(e.target.value));
              }}
              className="w-36 tabular-nums"
            />
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold tabular-nums">{fmt(total)}</span>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Historique</CardTitle>
          <CardDescription>Derniers {HISTORY_DAYS_BACK} jours.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Saisi par</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Carte</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historyQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {historyQuery.isLoading ? "Chargement…" : "Aucune vente resto enregistrée."}
                  </TableCell>
                </TableRow>
              )}
              {(historyQuery.data ?? []).map((s) => (
                <TableRow key={s.saleDate}>
                  <TableCell className="font-medium">{s.saleDate}</TableCell>
                  <TableCell>{s.createdByName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.cashAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.cardAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(s.cashAmount + s.cardAmount)}
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
