import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { fmtEcart, ecartTone, weekStart, weekEnd, weeksAgo } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/hebdomadaire")({
  head: () => ({ meta: [{ title: "Rapports — Surplus/déficit hebdomadaire — BackOffice" }] }),
  component: HebdomadaireReportPage,
});

const WEEKS_BACK = 12;

function HebdomadaireReportPage() {
  const runGetClosures = useServerFn(getClosures);

  const weeklyQuery = useQuery({
    queryKey: ["closures-weekly"],
    queryFn: () => runGetClosures({ data: { since: weeksAgo(WEEKS_BACK) } }),
  });

  const weeklyGroups = useMemo(() => {
    const source = weeklyQuery.data ?? [];

    // The POS terminal figure on each closure is cumulative-since-midnight
    // (it mirrors what the Clover terminal itself shows), NOT a per-shift
    // delta like cash. So summing ecartPos across every closure of the same
    // day would count the same drift multiple times. Only the day's LAST
    // closure per station reflects the full day's Clover/RaceFacer gap -
    // find that one first, then aggregate by week using only those.
    const lastOfDay = new Map<string, (typeof source)[number]>();
    for (const r of source) {
      const dayKey = `${r.closureDate}|${r.stationName}`;
      const current = lastOfDay.get(dayKey);
      if (!current || r.closedAt > current.closedAt) {
        lastOfDay.set(dayKey, r);
      }
    }

    const groups = new Map<
      string,
      { weekStart: string; stationName: string; ecartCash: number; ecartPos: number; employees: Set<string> }
    >();
    for (const r of source) {
      const ws = weekStart(r.closureDate);
      const key = `${ws}|${r.stationName}`;
      const g = groups.get(key) ?? {
        weekStart: ws,
        stationName: r.stationName,
        ecartCash: 0,
        ecartPos: 0,
        employees: new Set<string>(),
      };
      g.ecartCash += r.ecartCash;
      g.employees.add(r.employeeName);
      groups.set(key, g);
    }
    for (const r of lastOfDay.values()) {
      const ws = weekStart(r.closureDate);
      const key = `${ws}|${r.stationName}`;
      const g = groups.get(key);
      if (g) g.ecartPos += r.ecartPos;
    }

    return Array.from(groups.values()).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  }, [weeklyQuery.data]);

  const exportCsv = () => {
    downloadCsv(
      `surplus-deficit-hebdomadaire-${localDateString()}.csv`,
      ["Semaine debut", "Semaine fin", "POS", "Ecart cash total", "Ecart POS total", "Employes"],
      weeklyGroups.map((g) => [
        g.weekStart,
        weekEnd(g.weekStart),
        g.stationName,
        g.ecartCash,
        g.ecartPos,
        Array.from(g.employees).join(" / "),
      ]),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Surplus / déficit hebdomadaire</h1>
          <p className="text-sm text-muted-foreground mt-1">Dernières {WEEKS_BACK} semaines, par POS.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Exporter CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Imprimer / PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Surplus / déficit par semaine et par POS</CardTitle>
          <CardDescription>Somme des écarts cash et POS terminal par POS, par semaine.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semaine</TableHead>
                <TableHead>POS</TableHead>
                <TableHead className="text-right">Écart cash total</TableHead>
                <TableHead className="text-right">Écart POS total</TableHead>
                <TableHead>Employés</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {weeklyQuery.isLoading ? "Chargement…" : "Aucune fermeture sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {weeklyGroups.map((g) => (
                <TableRow key={`${g.weekStart}|${g.stationName}`}>
                  <TableCell className="font-medium">{g.weekStart} → {weekEnd(g.weekStart)}</TableCell>
                  <TableCell><Badge variant="outline">{g.stationName}</Badge></TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartCash)}`}>{fmtEcart(g.ecartCash)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartPos)}`}>{fmtEcart(g.ecartPos)}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    {Array.from(g.employees).map((name) => (
                      <Badge key={name} variant="secondary">{name}</Badge>
                    ))}
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
