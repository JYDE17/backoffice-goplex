import { createFileRoute } from "@tanstack/react-router";
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
import { syncVeloceSalesFn } from "@/lib/veloce-sales";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { dateRangeInclusive, localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/ventes-veloce")({
  head: () => ({ meta: [{ title: "Rapports — Ventes resto (Véloce) — BackOffice" }] }),
  component: VentesVeloceReportPage,
});

function VentesVeloceReportPage() {
  const queryClient = useQueryClient();
  const runGetSales = useServerFn(syncVeloceSalesFn);

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
  const isLoading = dayQueries.some((q) => q.isLoading);

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

  const refresh = () => {
    for (const d of selectedDays) {
      queryClient.invalidateQueries({ queryKey: ["veloce-sales-live", d] });
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
  };

  const exportPdf = () => {
    printPdf(
      `ventes-veloce-${from}-${to}.pdf`,
      "Rapport — Ventes resto (Véloce)",
      `Ventes en direct depuis Véloce, par jour — ${rangeLabel}.`,
      [
        {
          type: "table",
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
            Ventes en direct depuis Véloce, par jour — indépendant de ce qui a été saisi/synchronisé
            sur /ventes-resto.
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
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Ventes par jour — {rangeLabel}</CardTitle>
          <CardDescription>Cash et carte, tirés directement de l'API Véloce.</CardDescription>
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
          {isLoading && (
            <Badge variant="outline" className="gap-1 mt-3">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement depuis Véloce…
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
