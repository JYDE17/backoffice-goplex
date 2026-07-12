import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, Printer, Download } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { fmtEcart, ecartTone } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
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

  // ecartPos is now already a per-shift delta at the source (fermeture.tsx
  // computes it from rf_pos_delta/clover deltas directly, not cumulative
  // totals), so each closure's own figure can be used as-is - no more
  // re-deriving an "own slice" by diffing against the previous closure for
  // that day/station. Closures from before that fix still carry the old
  // cumulative-style ecartPos, so a multi-closure day/station from that era
  // can overstate its écart here; a narrower issue than double-subtracting
  // on every read.
  const rows = useMemo(() => {
    const source = closuresQuery.data ?? [];
    return source
      .map((r) => ({ ...r, ownEcartPos: r.ecartPos }))
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

  const exportPdf = () => {
    printPdf(
      `ecarts-depuis-${since}.pdf`,
      `Rapport — Ecarts depuis le ${since}`,
      `${rows.length} fermeture(s) avec ecart cash ou POS.`,
      [
        {
          type: "table",
          headers: ["Date", "POS", "Employe", "Autorise par", "Ecart cash", "Ecart POS", "Heure"],
          rows: rows.map((r) => [
            r.closureDate,
            r.stationName,
            r.employeeName,
            r.authorizedByName,
            fmtEcart(r.ecartCash),
            fmtEcart(r.ownEcartPos),
            new Date(r.closedAt).toLocaleTimeString("fr-CA", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          ]),
          rightAlign: [4, 5],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Écarts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seulement les fermetures avec un écart cash ou POS.
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
            <Label htmlFor="ecarts-since" className="mb-1 block">
              Depuis
            </Label>
            <Input
              id="ecarts-since"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-44"
            />
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
                  <TableCell>
                    <Badge variant="outline">{r.stationName}</Badge>
                  </TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell>{r.authorizedByName}</TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartCash)}`}>
                    {fmtEcart(r.ecartCash)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${ecartTone(r.ownEcartPos)}`}>
                    {fmtEcart(r.ownEcartPos)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.closedAt).toLocaleTimeString("fr-CA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to="/rapport/$id"
                        params={{ id: String(r.id) }}
                        search={{ print: false }}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
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
