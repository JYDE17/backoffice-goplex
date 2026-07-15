import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueries, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, RefreshCw } from "lucide-react";
import { DateRangePicker } from "@/components/date-range-picker";
import { syncVeloceSalesFn, getVeloceDaySummaryFn } from "@/lib/veloce-sales";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { dateRangeInclusive, localDateString } from "@/lib/dates";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/rapports/ventes-veloce")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "rapportVentesVeloce")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Rapports — Ventes resto (Véloce) — BackOffice" }] }),
  component: VentesVeloceReportPage,
});

function VentesVeloceReportPage() {
  const queryClient = useQueryClient();
  const runGetSales = useServerFn(syncVeloceSalesFn);
  const runGetSummary = useServerFn(getVeloceDaySummaryFn);

  const today = localDateString();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const selectedDays = useMemo(() => dateRangeInclusive(from, to), [from, to]);

  // Always live from Veloce, one call per day of the selected range - no
  // local table backs this report, so there's nothing to sync/save first.
  const dayQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["veloce-sales-live", d],
      queryFn: () => runGetSales({ data: { date: d } }),
    })),
  });
  const summaryQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["veloce-summary-live", d],
      queryFn: () => runGetSummary({ data: { date: d } }),
    })),
  });
  const isLoading = dayQueries.some((q) => q.isLoading) || summaryQueries.some((q) => q.isLoading);

  const rows = useMemo(
    () =>
      selectedDays.map((d, i) => ({
        date: d,
        cash: dayQueries[i]?.data?.cashAmount ?? 0,
        card: dayQueries[i]?.data?.cardAmount ?? 0,
      })),
    [selectedDays, dayQueries],
  );

  const totals = useMemo(
    () =>
      rows.reduce((acc, r) => ({ cash: acc.cash + r.cash, card: acc.card + r.card }), {
        cash: 0,
        card: 0,
      }),
    [rows],
  );

  // Period-level résumé (gross/net/discounts/taxes) and a full tender-type
  // breakdown - every payment method Véloce sees, not just Cash/Carte.
  const summaryTotals = useMemo(() => {
    const acc = { grossSales: 0, netSales: 0, discounts: 0, taxesTotal: 0 };
    const taxByName = new Map<string, number>();
    const tenderByName = new Map<string, number>();
    for (const q of summaryQueries) {
      const s = q.data;
      if (!s) continue;
      acc.grossSales += s.grossSales;
      acc.netSales += s.netSales;
      acc.discounts += s.discounts;
      acc.taxesTotal += s.taxesTotal;
      for (const t of s.taxes) taxByName.set(t.taxName, (taxByName.get(t.taxName) ?? 0) + t.amount);
      for (const t of s.tenderTypes)
        tenderByName.set(t.name, (tenderByName.get(t.name) ?? 0) + t.amount);
    }
    const taxes = Array.from(taxByName.entries())
      .map(([taxName, amount]) => ({ taxName, amount }))
      .sort((a, b) => b.amount - a.amount);
    const tenderTypes = Array.from(tenderByName.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { ...acc, taxes, tenderTypes };
  }, [summaryQueries]);

  const refresh = () => {
    for (const d of selectedDays) {
      queryClient.invalidateQueries({ queryKey: ["veloce-sales-live", d] });
      queryClient.invalidateQueries({ queryKey: ["veloce-summary-live", d] });
    }
  };

  const rangeLabel = `${from} → ${to}`;

  const exportCsv = () => {
    downloadCsv(
      `ventes-veloce-${from}-${to}.csv`,
      ["Date", "Cash", "Carte", "Total"],
      [
        ...rows.map((r) => [r.date, r.cash, r.card, r.cash + r.card]),
        ["Total", totals.cash, totals.card, totals.cash + totals.card],
      ],
    );
    downloadCsv(
      `ventes-veloce-${from}-${to}-modes-de-paiement.csv`,
      ["Type de paiement", "Montant"],
      summaryTotals.tenderTypes.map((t) => [t.name, t.amount]),
    );
  };

  const exportPdf = () => {
    printPdf(
      `ventes-veloce-${from}-${to}.pdf`,
      "Rapport — Ventes resto (Véloce)",
      `Ventes en direct depuis Véloce — ${rangeLabel}.`,
      [
        {
          type: "table",
          heading: "Résumé",
          headers: ["", "Montant"],
          rows: [
            ["Ventes brutes", fmt(summaryTotals.grossSales)],
            ["Rabais", fmt(summaryTotals.discounts)],
            ["Ventes nettes", fmt(summaryTotals.netSales)],
            ["Taxes", fmt(summaryTotals.taxesTotal)],
          ],
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Taxes",
          headers: ["Taxe", "Montant"],
          rows: summaryTotals.taxes.map((t) => [t.taxName, fmt(t.amount)]),
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Tous les modes de paiement",
          headers: ["Type de paiement", "Montant"],
          rows: summaryTotals.tenderTypes.map((t) => [t.name, fmt(t.amount)]),
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Cash / Carte par jour",
          headers: ["Date", "Cash", "Carte", "Total"],
          rows: [
            ...rows.map((r) => [r.date, fmt(r.cash), fmt(r.card), fmt(r.cash + r.card)]),
            ["Total", fmt(totals.cash), fmt(totals.card), fmt(totals.cash + totals.card)],
          ],
          rightAlign: [1, 2, 3],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rapports — Ventes resto (Véloce)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ventes en direct depuis Véloce — indépendant de ce qui a été saisi/synchronisé sur
            /ventes-resto.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Exporter CSV
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            <Printer /> Imprimer PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <DateRangePicker
            from={from}
            to={to}
            onChange={(r) => {
              setFrom(r.from);
              setTo(r.to);
            }}
          />
          <Button variant="outline" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Chargement…" : "Actualiser"}
          </Button>
          {isLoading && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement depuis Véloce…
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Ventes brutes" value={fmt(summaryTotals.grossSales)} />
        <SummaryCard label="Rabais" value={fmt(summaryTotals.discounts)} />
        <SummaryCard label="Ventes nettes" value={fmt(summaryTotals.netSales)} />
        <SummaryCard label="Taxes" value={fmt(summaryTotals.taxesTotal)} />
      </div>

      {summaryTotals.taxes.length > 0 && (
        <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
          <CardHeader>
            <CardTitle className="text-base">Taxes — {rangeLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Taxe</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryTotals.taxes.map((t) => (
                  <TableRow key={t.taxName}>
                    <TableCell className="font-medium">{t.taxName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Tous les modes de paiement — {rangeLabel}</CardTitle>
          <CardDescription>
            Chaque type de paiement configuré dans Véloce, pas seulement Cash/Carte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type de paiement</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryTotals.tenderTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    {isLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {summaryTotals.tenderTypes.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(t.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Cash / Carte par jour — {rangeLabel}</CardTitle>
          <CardDescription>
            Le sous-ensemble Cash/Carte utilisé pour la réconciliation du tiroir à dépôt (voir
            /ventes-resto).
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {isLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="font-medium">{r.date}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.cash)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.card)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(r.cash + r.card)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(totals.cash)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(totals.card)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(totals.cash + totals.card)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
