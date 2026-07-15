import { createFileRoute, redirect } from "@tanstack/react-router";
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
import { DateRangePicker } from "@/components/date-range-picker";
import { syncVeloceTipsFn, listVeloceTipsFn } from "@/lib/veloce-tips";
import { fmt, weekStart, weekEnd } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { dateRangeInclusive, localDateString } from "@/lib/dates";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/rapports/pourboires")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "rapportPourboires")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Rapports — Pourboires (Véloce) — BackOffice" }] }),
  component: PourboiresReportPage,
});

// Not a real employee - a code Véloce uses for tips left on group/party
// bookings rather than tied to a specific server. Kept out of the
// per-employee tables (payroll needs those to only list real employees)
// and shown as its own separate total instead.
const GROUP_TIP_CODE = "GOPLEX";

function PourboiresReportPage() {
  const queryClient = useQueryClient();
  const runSyncTips = useServerFn(syncVeloceTipsFn);
  const runListTips = useServerFn(listVeloceTipsFn);
  const [syncing, setSyncing] = useState(false);

  const today = localDateString();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [view, setView] = useState<"jour" | "semaine">("jour");

  const tipsQuery = useQuery({
    queryKey: ["veloce-tips", from, to],
    queryFn: () => runListTips({ data: { from, to } }),
  });
  const allRows = useMemo(() => tipsQuery.data ?? [], [tipsQuery.data]);
  const rows = useMemo(() => allRows.filter((r) => r.employeeName !== GROUP_TIP_CODE), [allRows]);
  const groupTipTotal = useMemo(
    () =>
      allRows
        .filter((r) => r.employeeName === GROUP_TIP_CODE)
        .reduce((sum, r) => sum + r.tipsAmount, 0),
    [allRows],
  );

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.employeeName, (map.get(r.employeeName) ?? 0) + r.tipsAmount);
    return Array.from(map.entries())
      .map(([employeeName, tips]) => ({ employeeName, tips }))
      .sort((a, b) => b.tips - a.tips);
  }, [rows]);

  const grandTotal = rows.reduce((sum, r) => sum + r.tipsAmount, 0);

  // "Jour" is just the raw rows; "semaine" re-groups the same rows by
  // week-start + employee, same grouping logic as rapports/hebdomadaire.tsx.
  const detailRows = useMemo(() => {
    if (view === "jour") {
      return rows
        .slice()
        .sort((a, b) =>
          a.saleDate === b.saleDate
            ? a.employeeName.localeCompare(b.employeeName)
            : a.saleDate < b.saleDate
              ? -1
              : 1,
        )
        .map((r) => ({
          key: `${r.saleDate}|${r.employeeName}`,
          period: r.saleDate,
          employeeName: r.employeeName,
          tips: r.tipsAmount,
        }));
    }
    const map = new Map<string, { weekStart: string; employeeName: string; tips: number }>();
    for (const r of rows) {
      const ws = weekStart(r.saleDate);
      const key = `${ws}|${r.employeeName}`;
      const entry = map.get(key) ?? { weekStart: ws, employeeName: r.employeeName, tips: 0 };
      entry.tips += r.tipsAmount;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .sort((a, b) =>
        a.weekStart === b.weekStart
          ? a.employeeName.localeCompare(b.employeeName)
          : a.weekStart < b.weekStart
            ? -1
            : 1,
      )
      .map((g) => ({
        key: `${g.weekStart}|${g.employeeName}`,
        period: `${g.weekStart} → ${weekEnd(g.weekStart)}`,
        employeeName: g.employeeName,
        tips: g.tips,
      }));
  }, [rows, view]);

  const syncRange = useCallback(async () => {
    setSyncing(true);
    try {
      const days = dateRangeInclusive(from, to);
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
  }, [from, to, runSyncTips, queryClient]);

  const periodHeader = view === "jour" ? "Date" : "Semaine";
  const rangeLabel = `${from} → ${to}`;

  const exportCsv = () => {
    downloadCsv(
      `pourboires-${from}-${to}-${view}.csv`,
      [periodHeader, "Employé", "Pourboires"],
      [
        [`Total par employé — ${rangeLabel}`, "", ""],
        ...totalsByEmployee.map((t) => ["", t.employeeName, t.tips]),
        ["", "Total employés", grandTotal],
        ["", `Pourboire groupe (${GROUP_TIP_CODE})`, groupTipTotal],
        ["", "Total (Groupe compris)", grandTotal + groupTipTotal],
        ["", "", ""],
        [view === "jour" ? "Détail par jour" : "Détail par semaine", "", ""],
        ...detailRows.map((r) => [r.period, r.employeeName, r.tips]),
      ],
    );
  };

  const exportPdf = () => {
    printPdf(
      `pourboires-${from}-${to}-${view}.pdf`,
      "Rapport — Pourboires (Véloce)",
      `Par ${view} et par employé — ${rangeLabel}.`,
      [
        {
          type: "table",
          heading: "Total par employé",
          headers: ["Employé", "Pourboires"],
          rows: [
            ...totalsByEmployee.map((t) => [t.employeeName, fmt(t.tips)]),
            ["Total employés", fmt(grandTotal)],
            ["Pourboire groupe (GOPLEX)", fmt(groupTipTotal)],
            ["Total (Groupe compris)", fmt(grandTotal + groupTipTotal)],
          ],
          rightAlign: [1],
        },
        {
          type: "table",
          heading: view === "jour" ? "Détail par jour" : "Détail par semaine",
          headers: [periodHeader, "Employé", "Pourboires"],
          rows: detailRows.map((r) => [r.period, r.employeeName, fmt(r.tips)]),
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
          <DateRangePicker
            from={from}
            to={to}
            onChange={(r) => {
              setFrom(r.from);
              setTo(r.to);
            }}
          />
          <div>
            <Label className="mb-1 block">Détail par</Label>
            <Select value={view} onValueChange={(v) => setView(v as "jour" | "semaine")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jour">Jour</SelectItem>
                <SelectItem value="semaine">Semaine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={syncRange} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            {syncing ? "Synchronisation…" : "Synchroniser la période"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Pourboire groupe ({GROUP_TIP_CODE})</div>
            <div className="text-xs text-muted-foreground">
              Pas un employé — pourboires sur réservations de groupe, non assignés à une personne.
            </div>
          </div>
          <div className="text-lg font-semibold tabular-nums">{fmt(groupTipTotal)}</div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Total par employé — {rangeLabel}</CardTitle>
          <CardDescription>Somme des pourboires de la période, par employé.</CardDescription>
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
                      : "Aucune donnée — clique « Synchroniser la période »."}
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
                <>
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total employés</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(grandTotal)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Total (Groupe compris)</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(grandTotal + groupTipTotal)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">
            {view === "jour" ? "Détail par jour" : "Détail par semaine"} — {rangeLabel}
          </CardTitle>
          <CardDescription>
            {view === "jour"
              ? "Une ligne par jour et par employé."
              : "Une ligne par semaine et par employé."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{periodHeader}</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Pourboires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {tipsQuery.isLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {detailRows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.tips)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
