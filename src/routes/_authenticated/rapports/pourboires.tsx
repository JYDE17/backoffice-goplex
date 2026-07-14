import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Printer, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncVeloceTipsFn, listVeloceTipsFn } from "@/lib/veloce-tips";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/pourboires")({
  head: () => ({ meta: [{ title: "Rapports — Pourboires (Véloce) — BackOffice" }] }),
  component: PourboiresReportPage,
});

const MONTHS_BACK = 12;

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

function monthBounds(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const today = localDateString();
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${key}-${String(lastDay).padStart(2, "0")}`;
  return { from: `${key}-01`, to: to > today ? today : to };
}

// Every calendar day in a given YYYY-MM month, capped at today - Veloce has
// nothing to report for future dates.
function daysInMonth(key: string): string[] {
  const { from, to } = monthBounds(key);
  const days: string[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    const d = new Date(`${cur}T00:00:00`);
    d.setDate(d.getDate() + 1);
    cur = localDateString(d);
  }
  return days;
}

function PourboiresReportPage() {
  const queryClient = useQueryClient();
  const runSyncTips = useServerFn(syncVeloceTipsFn);
  const runListTips = useServerFn(listVeloceTipsFn);
  const [syncing, setSyncing] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < MONTHS_BACK; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      opts.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]);
  const { from, to } = useMemo(() => monthBounds(selectedMonth), [selectedMonth]);

  const tipsQuery = useQuery({
    queryKey: ["veloce-tips", from, to],
    queryFn: () => runListTips({ data: { from, to } }),
  });
  const rows = useMemo(() => tipsQuery.data ?? [], [tipsQuery.data]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.employeeName, (map.get(r.employeeName) ?? 0) + r.tipsAmount);
    return Array.from(map.entries())
      .map(([employeeName, tips]) => ({ employeeName, tips }))
      .sort((a, b) => b.tips - a.tips);
  }, [rows]);

  const grandTotal = rows.reduce((sum, r) => sum + r.tipsAmount, 0);

  const syncMonth = useCallback(async () => {
    setSyncing(true);
    try {
      const days = daysInMonth(selectedMonth);
      for (const d of days) {
        await runSyncTips({ data: { date: d } });
      }
      await queryClient.invalidateQueries({ queryKey: ["veloce-tips", from, to] });
      toast.success(`${days.length} jour(s) synchronisé(s)`);
    } catch (error) {
      toast.error("Échec de la synchronisation des pourboires", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSyncing(false);
    }
  }, [selectedMonth, from, to, runSyncTips, queryClient]);

  const exportCsv = () => {
    downloadCsv(
      `pourboires-${selectedMonth}.csv`,
      ["Date", "Employé", "Pourboires"],
      [...rows.map((r) => [r.saleDate, r.employeeName, r.tipsAmount]), ["Total", "", grandTotal]],
    );
  };

  const exportPdf = () => {
    printPdf(
      `pourboires-${selectedMonth}.pdf`,
      "Rapport — Pourboires (Véloce)",
      `Par jour et par employé — ${monthLabel(selectedMonth)}.`,
      [
        {
          type: "table",
          heading: "Total par employé",
          headers: ["Employé", "Pourboires"],
          rows: [
            ...totalsByEmployee.map((t) => [t.employeeName, fmt(t.tips)]),
            ["Total", fmt(grandTotal)],
          ],
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Détail par jour",
          headers: ["Date", "Employé", "Pourboires"],
          rows: rows.map((r) => [r.saleDate, r.employeeName, fmt(r.tipsAmount)]),
          rightAlign: [2],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Pourboires (Véloce)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Par jour et par employé — synchronisé depuis Véloce, enregistré dans BackOffice.
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
          <div>
            <Label className="mb-1 block">Mois</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={syncMonth} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            {syncing ? "Synchronisation…" : "Synchroniser le mois"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base capitalize">
            Total par employé — {monthLabel(selectedMonth)}
          </CardTitle>
          <CardDescription>Somme des pourboires du mois, par employé.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Pourboires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalsByEmployee.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    {tipsQuery.isLoading
                      ? "Chargement…"
                      : "Aucune donnée — clique « Synchroniser le mois »."}
                  </TableCell>
                </TableRow>
              )}
              {totalsByEmployee.map((t) => (
                <TableRow key={t.employeeName}>
                  <TableCell className="font-medium">{t.employeeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(t.tips)}</TableCell>
                </TableRow>
              ))}
              {totalsByEmployee.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(grandTotal)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base capitalize">
            Détail par jour — {monthLabel(selectedMonth)}
          </CardTitle>
          <CardDescription>Une ligne par jour et par employé.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Pourboires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {tipsQuery.isLoading ? "Chargement…" : "Aucune donnée sur ce mois."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={`${r.saleDate}|${r.employeeName}`}>
                  <TableCell className="font-medium">{r.saleDate}</TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.tipsAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
