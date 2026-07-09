import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, Printer, Download } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { fmtEcart, ecartTone } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/ecarts")({
  head: () => ({ meta: [{ title: "Rapports — Écarts — BackOffice" }] }),
  component: EcartsReportPage,
});

const DAYS_BACK = 90;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateString(d);
}

function EcartsReportPage() {
  const runGetClosures = useServerFn(getClosures);
  const [since, setSince] = useState(daysAgo(DAYS_BACK));

  const closuresQuery = useQuery({
    queryKey: ["closures-ecarts", since],
    queryFn: () => runGetClosures({ data: { since } }),
  });

  // ecartPos on a closure is a cumulative écart since midnight for that
  // station (not a per-shift figure - see hebdomadaire.tsx). A closure can
  // show a non-zero ecartPos just because an EARLIER shift that day caused
  // it, without this shift itself contributing anything new. Compute each
  // closure's own slice (day+station, chronological difference) so this
  // report - meant to pinpoint who/when a problem actually occurred - only
  // flags the shift(s) that actually moved the needle.
  const rows = useMemo(() => {
    const source = closuresQuery.data ?? [];
    const byDayStation = new Map<string, typeof source>();
    for (const r of source) {
      const key = `${r.closureDate}|${r.stationName}`;
      const list = byDayStation.get(key);
      if (list) list.push(r);
      else byDayStation.set(key, [r]);
    }
    const ownPosDeltaByClosureId = new Map<number, number>();
    for (const list of byDayStation.values()) {
      const sorted = [...list].sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1));
      let previousEcart = 0;
      for (const r of sorted) {
        ownPosDeltaByClosureId.set(r.id, r.ecartPos - previousEcart);
        previousEcart = r.ecartPos;
      }
    }
    return source
      .map((r) => ({ ...r, ownEcartPos: ownPosDeltaByClosureId.get(r.id) ?? 0 }))
      .filter((r) => r.ecartCash !== 0 || r.ownEcartPos !== 0);
  }, [closuresQuery.data]);

  const exportCsv = () => {
    downloadCsv(
      `ecarts-depuis-${since}.csv`,
      ["Date", "POS", "Employe", "Autorise par", "Ecart cash", "Ecart POS", "Heure", "Notes"],
      rows.map((r) => [
        r.closureDate,
        r.stationName,
        r.employeeName,
        r.authorizedByName,
        r.ecartCash,
        r.ownEcartPos,
        new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }),
        r.notes,
      ]),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Écarts</h1>
          <p className="text-sm text-muted-foreground mt-1">Seulement les fermetures avec un écart cash ou POS.</p>
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

      <Card className="shadow-[var(--shadow-card)] print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="ecarts-since" className="mb-1 block">Depuis</Label>
            <Input id="ecarts-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-44" />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">{rows.length} fermeture(s) avec écart</CardTitle>
          <CardDescription>Depuis le {since}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>POS</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Autorisé par</TableHead>
                <TableHead className="text-right">Écart cash</TableHead>
                <TableHead className="text-right">Écart POS</TableHead>
                <TableHead>Heure</TableHead>
                <TableHead className="print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {closuresQuery.isLoading ? "Chargement…" : "Aucun écart sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.closureDate}</TableCell>
                  <TableCell><Badge variant="outline">{r.stationName}</Badge></TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell>{r.authorizedByName}</TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartCash)}`}>{fmtEcart(r.ecartCash)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(r.ownEcartPos)}`}>{fmtEcart(r.ownEcartPos)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport/$id" params={{ id: String(r.id) }} search={{ print: false }}><Eye className="h-4 w-4" /></Link>
                    </Button>
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
