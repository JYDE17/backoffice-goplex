import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Download, ChevronRight, Eye } from "lucide-react";
import { getClosures } from "@/lib/closures";
import type { ClosureRow } from "@/lib/closures.server";
import { fmtEcart, ecartTone, weekStart, weekEnd, weeksAgo } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { downloadPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/hebdomadaire")({
  head: () => ({ meta: [{ title: "Rapports — Surplus/déficit hebdomadaire — BackOffice" }] }),
  component: HebdomadaireReportPage,
});

const WEEKS_BACK = 12;
const ALL_WEEKS = "all";

type WeeklyGroup = {
  weekStart: string;
  employeeName: string;
  ecartCash: number;
  ecartPos: number;
  stations: Set<string>;
};

type ClosureWithOwnEcartPos = ClosureRow & { ownEcartPos: number };

function HebdomadaireReportPage() {
  const runGetClosures = useServerFn(getClosures);
  const [selectedWeek, setSelectedWeek] = useState<string>(ALL_WEEKS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const weeklyQuery = useQuery({
    queryKey: ["closures-weekly"],
    queryFn: () => runGetClosures({ data: { since: weeksAgo(WEEKS_BACK) } }),
  });

  const { weeklyGroups, closuresByGroupKey, availableWeeks } = useMemo(() => {
    const source = (weeklyQuery.data ?? []) as ClosureRow[];

    // The POS terminal figure on each closure (ecartPos) is a cumulative
    // écart since midnight (it mirrors what the Clover terminal itself
    // shows - it never resets per shift like cash does), and that counter
    // belongs to the physical station, not whoever is working it. So the
    // per-closure delta still has to be computed grouped by day+STATION
    // (first closure of the day contributes its écart as-is, later ones
    // only the change since the previous one on that station) - only the
    // final aggregation below groups by employee instead.
    const byDayStation = new Map<string, ClosureRow[]>();
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

    const groups = new Map<string, WeeklyGroup>();
    const closuresByGroupKey = new Map<string, ClosureWithOwnEcartPos[]>();
    for (const r of source) {
      const ws = weekStart(r.closureDate);
      const key = `${ws}|${r.employeeName}`;
      const g = groups.get(key) ?? {
        weekStart: ws,
        employeeName: r.employeeName,
        ecartCash: 0,
        ecartPos: 0,
        stations: new Set<string>(),
      };
      const ownEcartPos = ownPosDeltaByClosureId.get(r.id) ?? 0;
      g.ecartCash += r.ecartCash;
      g.ecartPos += ownEcartPos;
      g.stations.add(r.stationName);
      groups.set(key, g);

      const closureList = closuresByGroupKey.get(key) ?? [];
      closureList.push({ ...r, ownEcartPos });
      closuresByGroupKey.set(key, closureList);
    }

    const weeklyGroups = Array.from(groups.values()).sort((a, b) =>
      a.weekStart < b.weekStart ? 1 : -1,
    );
    const availableWeeks = Array.from(new Set(weeklyGroups.map((g) => g.weekStart))).sort((a, b) =>
      a < b ? 1 : -1,
    );

    return { weeklyGroups, closuresByGroupKey, availableWeeks };
  }, [weeklyQuery.data]);

  // Default to the most recent week once data loads, instead of always
  // dumping all 12 weeks at once.
  useEffect(() => {
    if (availableWeeks.length > 0 && selectedWeek === ALL_WEEKS) {
      setSelectedWeek(availableWeeks[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableWeeks.length]);

  const visibleGroups =
    selectedWeek === ALL_WEEKS
      ? weeklyGroups
      : weeklyGroups.filter((g) => g.weekStart === selectedWeek);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCsv = () => {
    downloadCsv(
      `surplus-deficit-hebdomadaire-${localDateString()}.csv`,
      [
        "Semaine debut",
        "Semaine fin",
        "Employe",
        "Ecart cash total",
        "Ecart POS total",
        "POS travailles",
      ],
      visibleGroups.map((g) => [
        g.weekStart,
        weekEnd(g.weekStart),
        g.employeeName,
        g.ecartCash,
        g.ecartPos,
        Array.from(g.stations).join(" / "),
      ]),
    );
  };

  const exportPdf = () => {
    downloadPdf(
      `surplus-deficit-hebdomadaire-${localDateString()}.pdf`,
      "Rapport — Surplus / deficit hebdomadaire",
      `Dernieres ${WEEKS_BACK} semaines, par employe.`,
      [
        {
          type: "table",
          headers: ["Semaine", "Employe", "Ecart cash total", "Ecart POS total", "POS travailles"],
          rows: visibleGroups.map((g) => [
            `${g.weekStart} -> ${weekEnd(g.weekStart)}`,
            g.employeeName,
            fmtEcart(g.ecartCash),
            fmtEcart(g.ecartPos),
            Array.from(g.stations).join(" / "),
          ]),
          rightAlign: [2, 3],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rapports — Surplus / déficit hebdomadaire
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dernières {WEEKS_BACK} semaines, par employé.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download /> Exporter CSV
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            <Printer /> Télécharger PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label className="mb-1 block">Semaine</Label>
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WEEKS}>Toutes les semaines</SelectItem>
                {availableWeeks.map((ws) => (
                  <SelectItem key={ws} value={ws}>
                    {ws} → {weekEnd(ws)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Surplus / déficit par semaine et par employé</CardTitle>
          <CardDescription>
            Somme des écarts cash et POS terminal par employé, par semaine. Clique une ligne pour
            voir les fermetures en cause.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 print:hidden" />
                <TableHead>Semaine</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Écart cash total</TableHead>
                <TableHead className="text-right">Écart POS total</TableHead>
                <TableHead>POS travaillés</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {weeklyQuery.isLoading ? "Chargement…" : "Aucune fermeture sur cette période."}
                  </TableCell>
                </TableRow>
              )}
              {visibleGroups.map((g) => {
                const key = `${g.weekStart}|${g.employeeName}`;
                const isOpen = expanded.has(key);
                const closures = (closuresByGroupKey.get(key) ?? []).filter(
                  (c) => c.ecartCash !== 0 || c.ownEcartPos !== 0,
                );
                return (
                  <Fragment key={key}>
                    <TableRow
                      className={closures.length > 0 ? "cursor-pointer" : ""}
                      onClick={() => closures.length > 0 && toggleExpanded(key)}
                    >
                      <TableCell className="print:hidden">
                        {closures.length > 0 && (
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {g.weekStart} → {weekEnd(g.weekStart)}
                      </TableCell>
                      <TableCell>{g.employeeName}</TableCell>
                      <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartCash)}`}>
                        {fmtEcart(g.ecartCash)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartPos)}`}>
                        {fmtEcart(g.ecartPos)}
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-1">
                        {Array.from(g.stations).map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </TableCell>
                    </TableRow>
                    {isOpen && closures.length > 0 && (
                      <TableRow className="print:hidden">
                        <TableCell />
                        <TableCell colSpan={5} className="bg-muted/30 py-3">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                            Fermetures avec écart ({closures.length})
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>POS</TableHead>
                                <TableHead className="text-right">Écart cash</TableHead>
                                <TableHead className="text-right">Écart POS</TableHead>
                                <TableHead>Heure</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {closures.map((c) => (
                                <TableRow key={c.id}>
                                  <TableCell>{c.closureDate}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{c.stationName}</Badge>
                                  </TableCell>
                                  <TableCell
                                    className={`text-right tabular-nums ${ecartTone(c.ecartCash)}`}
                                  >
                                    {fmtEcart(c.ecartCash)}
                                  </TableCell>
                                  <TableCell
                                    className={`text-right tabular-nums ${ecartTone(c.ownEcartPos)}`}
                                  >
                                    {fmtEcart(c.ownEcartPos)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {new Date(c.closedAt).toLocaleTimeString("fr-CA", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <Button asChild variant="ghost" size="sm">
                                      <Link
                                        to="/rapport/$id"
                                        params={{ id: String(c.id) }}
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
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
