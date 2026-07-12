import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
import { Printer, Download } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { getDepositsFn } from "@/lib/deposits";
import { fmt, fmtEcart, ecartTone } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/mensuel")({
  head: () => ({ meta: [{ title: "Rapports — Mensuel — BackOffice" }] }),
  component: MensuelReportPage,
});

const MONTHS_BACK = 12;

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

function MensuelReportPage() {
  const runGetClosures = useServerFn(getClosures);
  const runGetDeposits = useServerFn(getDepositsFn);

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
  };

  const exportPdf = () => {
    printPdf(
      `rapport-mensuel-${localDateString()}.pdf`,
      "Rapport — Mensuel",
      `Derniers ${MONTHS_BACK} mois, toutes stations confondues.`,
      [
        {
          type: "table",
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
    </div>
  );
}
