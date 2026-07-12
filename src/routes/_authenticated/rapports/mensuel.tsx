import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Printer, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getClosures } from "@/lib/closures";
import { getDepositsFn } from "@/lib/deposits";
import { getRaceFacerSales, syncRaceFacerSales } from "@/lib/racefacer-sync";
import { getCloverSales, syncCloverSales } from "@/lib/clover-sync";
import { fmt, fmtEcart, ecartTone } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/mensuel")({
  head: () => ({ meta: [{ title: "Rapports — Mensuel — BackOffice" }] }),
  component: MensuelReportPage,
});

const MONTHS_BACK = 12;

const TENDER_LABELS = [
  { key: "cash", label: "Cash" },
  { key: "pos_terminal", label: "POS terminal" },
  { key: "bank_wire", label: "Bank wire" },
  { key: "voucher", label: "Voucher" },
  { key: "bambora", label: "Bambora" },
] as const;

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return localDateString(d);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

// Every calendar day in a given YYYY-MM month, capped at today (never queries
// future dates - RaceFacer/Clover have nothing to report for those anyway).
function daysInMonth(key: string): string[] {
  const [y, m] = key.split("-").map(Number);
  const today = localDateString();
  const lastDay = new Date(y, m, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${key}-${String(d).padStart(2, "0")}`;
    if (dateStr > today) break;
    days.push(dateStr);
  }
  return days;
}

function MensuelReportPage() {
  const queryClient = useQueryClient();
  const runGetClosures = useServerFn(getClosures);
  const runGetDeposits = useServerFn(getDepositsFn);
  const runGetSales = useServerFn(getRaceFacerSales);
  const runSyncSales = useServerFn(syncRaceFacerSales);
  const runGetCloverSales = useServerFn(getCloverSales);
  const runSyncCloverSales = useServerFn(syncCloverSales);
  const [monthSyncing, setMonthSyncing] = useState(false);

  const closuresQuery = useQuery({
    queryKey: ["closures-monthly"],
    queryFn: () => runGetClosures({ data: { since: monthsAgo(MONTHS_BACK) } }),
  });
  const depositsQuery = useQuery({
    queryKey: ["deposits"],
    queryFn: () => runGetDeposits(),
  });

  const monthlyGroups = useMemo(() => {
    const source = closuresQuery.data ?? [];

    // ecartPos is now already a per-shift delta at the source (fermeture.tsx
    // computes it from rf_pos_delta/clover deltas directly, not cumulative
    // totals) - summing it straight per closure is correct. This used to
    // need an extra "own slice since the previous closure that day/station"
    // step because ecartPos was cumulative-since-midnight; that's no longer
    // true for closures created after the per-shift-delta fix. Closures from
    // before that fix still carry the old cumulative-style ecartPos, so a
    // multi-closure day/station from that era can double-count here - a
    // narrower issue than double-subtracting on every read, and one that
    // self-resolves as old closures age out of reports.
    const groups = new Map<
      string,
      {
        month: string;
        closureCount: number;
        cashCompte: number;
        ecartCash: number;
        ecartPos: number;
        depots: number;
      }
    >();
    for (const r of source) {
      const key = monthKey(r.closureDate);
      const g = groups.get(key) ?? {
        month: key,
        closureCount: 0,
        cashCompte: 0,
        ecartCash: 0,
        ecartPos: 0,
        depots: 0,
      };
      g.closureCount += 1;
      g.cashCompte += r.cashHorsFond;
      g.ecartCash += r.ecartCash;
      g.ecartPos += r.ecartPos;
      groups.set(key, g);
    }

    for (const d of depositsQuery.data ?? []) {
      const key = monthKey(d.depositDate);
      const g = groups.get(key) ?? {
        month: key,
        closureCount: 0,
        cashCompte: 0,
        ecartCash: 0,
        ecartPos: 0,
        depots: 0,
      };
      g.depots += d.totalAmount;
      groups.set(key, g);
    }

    return Array.from(groups.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [closuresQuery.data, depositsQuery.data]);

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

  const selectedDays = useMemo(() => daysInMonth(selectedMonth), [selectedMonth]);

  // One read-only query per day of the selected month - cheap (Supabase reads
  // of already-synced data), unlike the "Resynchroniser le mois" button below
  // which actually contacts RaceFacer/Clover.
  const racefacerDayQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["racefacer-sales", d],
      queryFn: () => runGetSales({ data: { date: d } }),
    })),
  });
  const cloverDayQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["clover-sales", d],
      queryFn: () => runGetCloverSales({ data: { date: d } }),
    })),
  });
  const daysLoading =
    racefacerDayQueries.some((q) => q.isLoading) || cloverDayQueries.some((q) => q.isLoading);

  // Backfills every day of the selected month that was never opened in
  // /fermeture, /sessions or Ventes quotidiennes since its last real sale -
  // without this, days nobody happened to visit stay at whatever partial
  // totals (or zero) were last stored, understating the month.
  const resyncMonth = useCallback(async () => {
    setMonthSyncing(true);
    try {
      for (const d of selectedDays) {
        await Promise.all([
          runSyncSales({ data: { date: d } }),
          runSyncCloverSales({ data: { date: d } }),
        ]);
      }
      await Promise.all(
        selectedDays.flatMap((d) => [
          queryClient.invalidateQueries({ queryKey: ["racefacer-sales", d] }),
          queryClient.invalidateQueries({ queryKey: ["clover-sales", d] }),
        ]),
      );
      toast.success(`${selectedDays.length} jour(s) resynchronisés`);
    } catch (error) {
      toast.error("Échec de la resynchronisation du mois", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setMonthSyncing(false);
    }
  }, [selectedDays, runSyncSales, runSyncCloverSales, queryClient]);

  const dailyRows = useMemo(() => {
    const closures = closuresQuery.data ?? [];
    const deposits = depositsQuery.data ?? [];
    const sum = (rows: Record<string, number>[], field: string) =>
      rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);

    return selectedDays.map((d, i) => {
      const rf = (racefacerDayQueries[i]?.data?.rows ?? []) as unknown as Record<string, number>[];
      const clover = cloverDayQueries[i]?.data?.rows ?? [];
      const cloverPaid = clover.reduce((acc, r) => acc + r.paid_total, 0);
      const cloverRefund = clover.reduce((acc, r) => acc + r.refund_total, 0);
      const dayClosures = closures.filter((c) => c.closureDate === d);
      const dayDeposits = deposits.filter((dep) => dep.depositDate === d);
      return {
        date: d,
        cash: sum(rf, "cash_total"),
        posTerminal: sum(rf, "pos_terminal_total"),
        bankWire: sum(rf, "bank_wire_total"),
        voucher: sum(rf, "voucher_total"),
        bambora: sum(rf, "bambora_total"),
        cloverNet: cloverPaid - cloverRefund,
        closureCount: dayClosures.length,
        cashCompte: dayClosures.reduce((acc, c) => acc + c.cashHorsFond, 0),
        ecartCash: dayClosures.reduce((acc, c) => acc + c.ecartCash, 0),
        ecartPos: dayClosures.reduce((acc, c) => acc + c.ecartPos, 0),
        depots: dayDeposits.reduce((acc, dep) => acc + dep.totalAmount, 0),
      };
    });
  }, [selectedDays, racefacerDayQueries, cloverDayQueries, closuresQuery.data, depositsQuery.data]);

  const monthTotals = useMemo(
    () =>
      dailyRows.reduce(
        (acc, r) => ({
          cash: acc.cash + r.cash,
          posTerminal: acc.posTerminal + r.posTerminal,
          bankWire: acc.bankWire + r.bankWire,
          voucher: acc.voucher + r.voucher,
          bambora: acc.bambora + r.bambora,
          cloverNet: acc.cloverNet + r.cloverNet,
          closureCount: acc.closureCount + r.closureCount,
          cashCompte: acc.cashCompte + r.cashCompte,
          ecartCash: acc.ecartCash + r.ecartCash,
          ecartPos: acc.ecartPos + r.ecartPos,
          depots: acc.depots + r.depots,
        }),
        {
          cash: 0,
          posTerminal: 0,
          bankWire: 0,
          voucher: 0,
          bambora: 0,
          cloverNet: 0,
          closureCount: 0,
          cashCompte: 0,
          ecartCash: 0,
          ecartPos: 0,
          depots: 0,
        },
      ),
    [dailyRows],
  );

  // Same tender breakdown as Ventes quotidiennes' "Sommaire des ventes", just
  // summed across every day of the month instead of a single one.
  const monthlyTenders = useMemo(() => {
    const map: Record<string, keyof typeof monthTotals> = {
      cash: "cash",
      pos_terminal: "posTerminal",
      bank_wire: "bankWire",
      voucher: "voucher",
      bambora: "bambora",
    };
    const lines = TENDER_LABELS.map((t) => ({ label: t.label, total: monthTotals[map[t.key]] }));
    const total = lines.reduce((acc, l) => acc + l.total, 0);
    return { lines, total };
  }, [monthTotals]);

  const isLoading = closuresQuery.isLoading || depositsQuery.isLoading;

  const exportCsv = () => {
    downloadCsv(
      `rapport-mensuel-${localDateString()}.csv`,
      [
        "Mois",
        "Nombre de fermetures",
        "Cash compte total",
        "Ecart cash total",
        "Ecart POS total",
        "Depots totaux",
      ],
      monthlyGroups.map((g) => [
        monthLabel(g.month),
        g.closureCount,
        g.cashCompte,
        g.ecartCash,
        g.ecartPos,
        g.depots,
      ]),
    );
    downloadCsv(
      `ventes-${selectedMonth}.csv`,
      [
        "Date",
        "Cash",
        "POS terminal",
        "Bank wire",
        "Voucher",
        "Bambora",
        "Clover net",
        "Fermetures",
        "Cash compte",
        "Ecart cash",
        "Ecart POS",
        "Depots",
      ],
      [
        ...dailyRows.map((r) => [
          r.date,
          r.cash,
          r.posTerminal,
          r.bankWire,
          r.voucher,
          r.bambora,
          r.cloverNet,
          r.closureCount,
          r.cashCompte,
          r.ecartCash,
          r.ecartPos,
          r.depots,
        ]),
        [
          "Total",
          monthTotals.cash,
          monthTotals.posTerminal,
          monthTotals.bankWire,
          monthTotals.voucher,
          monthTotals.bambora,
          monthTotals.cloverNet,
          monthTotals.closureCount,
          monthTotals.cashCompte,
          monthTotals.ecartCash,
          monthTotals.ecartPos,
          monthTotals.depots,
        ],
      ],
    );
  };

  const exportPdf = () => {
    printPdf(
      `rapport-mensuel-${localDateString()}.pdf`,
      "Rapport — Mensuel",
      `Derniers ${MONTHS_BACK} mois, toutes stations confondues.`,
      [
        {
          type: "table",
          heading: "Resume mensuel",
          headers: ["Mois", "Fermetures", "Cash compte", "Ecart cash", "Ecart POS", "Depots"],
          rows: monthlyGroups.map((g) => [
            monthLabel(g.month),
            g.closureCount,
            fmt(g.cashCompte),
            fmtEcart(g.ecartCash),
            fmtEcart(g.ecartPos),
            fmt(g.depots),
          ]),
          rightAlign: [1, 2, 3, 4, 5],
        },
        {
          type: "table",
          heading: `Detail journalier — ${monthLabel(selectedMonth)}`,
          headers: [
            "Date",
            "Cash",
            "POS terminal",
            "Bank wire",
            "Bambora",
            "Clover net",
            "Cash compte",
            "Ecart cash",
            "Ecart POS",
            "Depots",
          ],
          rows: [
            ...dailyRows.map((r) => [
              r.date,
              fmt(r.cash),
              fmt(r.posTerminal),
              fmt(r.bankWire),
              fmt(r.bambora),
              fmt(r.cloverNet),
              fmt(r.cashCompte),
              fmtEcart(r.ecartCash),
              fmtEcart(r.ecartPos),
              fmt(r.depots),
            ]),
            [
              "Total",
              fmt(monthTotals.cash),
              fmt(monthTotals.posTerminal),
              fmt(monthTotals.bankWire),
              fmt(monthTotals.bambora),
              fmt(monthTotals.cloverNet),
              fmt(monthTotals.cashCompte),
              fmtEcart(monthTotals.ecartCash),
              fmtEcart(monthTotals.ecartPos),
              fmt(monthTotals.depots),
            ],
          ],
          rightAlign: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Mensuel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Derniers {MONTHS_BACK} mois, toutes stations confondues.
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

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Résumé mensuel</CardTitle>
          <CardDescription>Cash compté, écarts et dépôts, par mois.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Fermetures</TableHead>
                <TableHead className="text-right">Cash compté</TableHead>
                <TableHead className="text-right">Écart cash</TableHead>
                <TableHead className="text-right">Écart POS</TableHead>
                <TableHead className="text-right">Dépôts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {isLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {monthlyGroups.map((g) => (
                <TableRow key={g.month}>
                  <TableCell className="font-medium capitalize">{monthLabel(g.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.closureCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(g.cashCompte)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartCash)}`}>
                    {fmtEcart(g.ecartCash)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartPos)}`}>
                    {fmtEcart(g.ecartPos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(g.depots)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label className="mb-1 block">Mois à détailler</Label>
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
          <Button variant="outline" onClick={resyncMonth} disabled={monthSyncing}>
            <RefreshCw className={monthSyncing ? "animate-spin" : ""} />
            {monthSyncing ? "Resynchronisation…" : "Resynchroniser le mois"}
          </Button>
          {daysLoading && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement…
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base capitalize">
            Ventes cumulées — {monthLabel(selectedMonth)}
          </CardTitle>
          <CardDescription>
            Modes de paiement RaceFacer et Clover, toutes stations confondues, indépendant des
            fermetures — un POS qui vend toute la journée sans jamais avoir de fermeture compte
            quand même ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mode de paiement</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyTenders.lines.map((l) => (
                <TableRow key={l.label}>
                  <TableCell className="font-medium">{l.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total RaceFacer</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(monthlyTenders.total)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Clover (net)</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(monthTotals.cloverNet)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base capitalize">
            Détail journalier — {monthLabel(selectedMonth)}
          </CardTitle>
          <CardDescription>Chaque jour du mois, ventes et écarts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">POS terminal</TableHead>
                  <TableHead className="text-right">Bank wire</TableHead>
                  <TableHead className="text-right">Bambora</TableHead>
                  <TableHead className="text-right">Clover net</TableHead>
                  <TableHead className="text-right">Fermetures</TableHead>
                  <TableHead className="text-right">Cash compté</TableHead>
                  <TableHead className="text-right">Écart cash</TableHead>
                  <TableHead className="text-right">Écart POS</TableHead>
                  <TableHead className="text-right">Dépôts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Aucune donnée sur ce mois.
                    </TableCell>
                  </TableRow>
                )}
                {dailyRows.map((r) => (
                  <TableRow key={r.date}>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.cash)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.posTerminal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.bankWire)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.bambora)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.cloverNet)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.closureCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.cashCompte)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartCash)}`}>
                      {fmtEcart(r.ecartCash)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartPos)}`}>
                      {fmtEcart(r.ecartPos)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.depots)}</TableCell>
                  </TableRow>
                ))}
                {dailyRows.length > 0 && (
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.cash)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.posTerminal)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.bankWire)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.bambora)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.cloverNet)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {monthTotals.closureCount}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.cashCompte)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${ecartTone(monthTotals.ecartCash)}`}
                    >
                      {fmtEcart(monthTotals.ecartCash)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${ecartTone(monthTotals.ecartPos)}`}
                    >
                      {fmtEcart(monthTotals.ecartPos)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(monthTotals.depots)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
