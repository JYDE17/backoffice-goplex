import { createFileRoute } from "@tanstack/react-router";
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
import { Printer, Download, RefreshCw } from "lucide-react";
import { getClosures } from "@/lib/closures";
import { getRaceFacerSales } from "@/lib/racefacer-sync";
import { getSessionsForClosuresFn } from "@/lib/sessions";
import { fmt, fmtEcart, ecartTone } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

export const Route = createFileRoute("/_authenticated/rapports/ventes-quotidiennes")({
  head: () => ({ meta: [{ title: "Rapports — Ventes quotidiennes — BackOffice" }] }),
  component: VentesQuotidiennesPage,
});

const TENDER_LABELS = [
  { key: "cash", label: "Cash" },
  { key: "pos_terminal", label: "POS terminal" },
  { key: "bank_wire", label: "Bank wire" },
  { key: "voucher", label: "Voucher" },
  { key: "bambora", label: "Bambora" },
] as const;

function VentesQuotidiennesPage() {
  const [date, setDate] = useState(localDateString());
  const runGetClosures = useServerFn(getClosures);
  const runGetSales = useServerFn(getRaceFacerSales);
  const runGetSessions = useServerFn(getSessionsForClosuresFn);

  const closuresQuery = useQuery({
    queryKey: ["closures", date],
    queryFn: () => runGetClosures({ data: { date } }),
  });
  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", date],
    queryFn: () => runGetSales({ data: { date } }),
  });

  const closureIds = useMemo(
    () => (closuresQuery.data ?? []).map((c) => c.id),
    [closuresQuery.data],
  );
  const sessionsQuery = useQuery({
    queryKey: ["sessions-for-closures", closureIds],
    queryFn: () => runGetSessions({ data: { closureIds } }),
    enabled: closureIds.length > 0,
  });

  // Sales Summary style: each tender summed across every station for the day.
  const tenders = useMemo(() => {
    const rows = salesQuery.data?.rows ?? [];
    const sum = (field: string) =>
      rows.reduce((acc, r) => acc + ((r as unknown as Record<string, number>)[field] ?? 0), 0);
    const lines = TENDER_LABELS.map((t) => ({
      label: t.label,
      paid: sum(`${t.key}_paid`),
      refund: sum(`${t.key}_refund`),
      total: sum(`${t.key}_total`),
    }));
    const total = lines.reduce(
      (acc, l) => ({
        paid: acc.paid + l.paid,
        refund: acc.refund + l.refund,
        total: acc.total + l.total,
      }),
      { paid: 0, refund: 0, total: 0 },
    );
    return { lines, total };
  }, [salesQuery.data]);

  // Global line: what physically went to the drop box (sum of counted cash
  // hors fond across the day's closures) vs what RaceFacer says the cash
  // sales were.
  const depotComparison = useMemo(() => {
    const closures = closuresQuery.data ?? [];
    const depotReel = closures.reduce((acc, c) => acc + c.cashHorsFond, 0);
    const cashRaceFacer = (salesQuery.data?.rows ?? []).reduce((acc, r) => acc + r.cash_total, 0);
    return { depotReel, cashRaceFacer, ecart: depotReel - cashRaceFacer };
  }, [closuresQuery.data, salesQuery.data]);

  const sessionRows = useMemo(() => {
    const closures = closuresQuery.data ?? [];
    const sessions = sessionsQuery.data ?? [];

    const sorted = closures
      .slice()
      .sort((a, b) =>
        a.stationName === b.stationName
          ? a.closedAt < b.closedAt
            ? -1
            : 1
          : a.stationName < b.stationName
            ? -1
            : 1,
      );

    // The Clover terminal display is cumulative since it was last reset (not
    // per-shift), so cloverPosAmount as typed in by staff is a running total
    // for that station that day - same shape as rf_pos_delta elsewhere in
    // the app. Each session's *own* Clover sales = its cumulative reading
    // minus the previous closure's reading for that same station.
    const previousCloverByStation = new Map<string, number>();

    return sorted.map((c) => {
      const session = sessions.find((s) => s.closureId === c.id);
      const previousClover = previousCloverByStation.get(c.stationName) ?? 0;
      const ownClover = c.cloverPosAmount - previousClover;
      previousCloverByStation.set(c.stationName, c.cloverPosAmount);
      return {
        id: c.id,
        station: c.stationName,
        employee: c.employeeName,
        openedAt: session?.openedAt ?? null,
        closedAt: c.closedAt,
        cash: c.cashHorsFond,
        clover: ownClover,
        total: c.cashHorsFond + ownClover,
        hasEcart: c.ecartCash !== 0 || c.ecartPos !== 0,
      };
    });
  }, [closuresQuery.data, sessionsQuery.data]);

  const sessionTotals = useMemo(
    () =>
      sessionRows.reduce(
        (acc, r) => ({
          cash: acc.cash + r.cash,
          clover: acc.clover + r.clover,
          total: acc.total + r.total,
        }),
        { cash: 0, clover: 0, total: 0 },
      ),
    [sessionRows],
  );

  const isLoading = closuresQuery.isLoading || salesQuery.isLoading;

  const exportCsv = () => {
    downloadCsv(
      `ventes-quotidiennes-${date}.csv`,
      ["Section", "Ligne", "Paye", "Rembourse", "Total"],
      [
        ...tenders.lines.map((l) => ["Tenders", l.label, l.paid, -l.refund, l.total]),
        ["Tenders", "Total", tenders.total.paid, -tenders.total.refund, tenders.total.total],
        ["Depot", "Depot reel (comptages)", "", "", depotComparison.depotReel],
        ["Depot", "Cash RaceFacer", "", "", depotComparison.cashRaceFacer],
        ["Depot", "Ecart", "", "", depotComparison.ecart],
        ...sessionRows.map((r) => [
          "Sessions",
          `${r.station} ${r.employee} ${r.openedAt ? fmtTime(r.openedAt) : ""}-${fmtTime(r.closedAt)}`,
          r.cash,
          r.clover,
          r.total,
        ]),
      ],
    );
  };

  const exportPdf = () => {
    printPdf(
      `ventes-quotidiennes-${date}.pdf`,
      `Rapport — Ventes du ${date}`,
      "Sommaire des ventes par mode de paiement (RaceFacer), depot reel et sessions.",
      [
        {
          type: "table",
          heading: "Tenders (toutes stations)",
          headers: ["Mode de paiement", "Paye", "Rembourse", "Total"],
          rows: [
            ...tenders.lines.map((l) => [l.label, fmt(l.paid), `(${fmt(l.refund)})`, fmt(l.total)]),
            [
              "Total",
              fmt(tenders.total.paid),
              `(${fmt(tenders.total.refund)})`,
              fmt(tenders.total.total),
            ],
          ],
          rightAlign: [1, 2, 3],
        },
        {
          type: "keyvalue",
          heading: "Depot reel vs RaceFacer",
          pairs: [
            ["Depot reel (comptages de fermeture)", fmt(depotComparison.depotReel)],
            ["Cash RaceFacer", fmt(depotComparison.cashRaceFacer)],
            ["Ecart", fmtEcart(depotComparison.ecart)],
          ],
        },
        {
          type: "table",
          heading: "Sessions de la journee",
          headers: ["POS", "Employe", "Ouverture", "Fermeture", "Cash", "Clover", "Total"],
          rows: [
            ...sessionRows.map((r) => [
              r.station,
              r.employee,
              r.openedAt ? fmtTime(r.openedAt) : "-",
              fmtTime(r.closedAt),
              fmt(r.cash),
              fmt(r.clover),
              fmt(r.total),
            ]),
            ...(sessionRows.length > 0
              ? [
                  [
                    "Total",
                    "",
                    "",
                    "",
                    fmt(sessionTotals.cash),
                    fmt(sessionTotals.clover),
                    fmt(sessionTotals.total),
                  ],
                ]
              : []),
          ],
          rightAlign: [4, 5, 6],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Ventes quotidiennes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sommaire des ventes par mode de paiement, dépôt réel et sessions.
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
            <Label htmlFor="vq-date" className="mb-1 block">
              Date
            </Label>
            <Input
              id="vq-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          {isLoading && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement…
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Sommaire des ventes — {date}</CardTitle>
          <CardDescription>
            Modes de paiement RaceFacer, toutes stations confondues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mode de paiement</TableHead>
                <TableHead className="text-right">Payé</TableHead>
                <TableHead className="text-right">Remboursé</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenders.lines.map((l) => (
                <TableRow key={l.label}>
                  <TableCell className="font-medium">{l.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(l.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    ({fmt(l.refund)})
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(l.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(tenders.total.paid)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  ({fmt(tenders.total.refund)})
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(tenders.total.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4 rounded-md border p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm font-medium">Dépôt réel vs RaceFacer</div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Dépôt réel (comptages) </span>
                <span className="font-semibold tabular-nums">{fmt(depotComparison.depotReel)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cash RaceFacer </span>
                <span className="font-semibold tabular-nums">
                  {fmt(depotComparison.cashRaceFacer)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Écart </span>
                <span className={`font-semibold tabular-nums ${ecartTone(depotComparison.ecart)}`}>
                  {fmtEcart(depotComparison.ecart)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Sessions de la journée</CardTitle>
          <CardDescription>
            Heure d'ouverture et de fermeture, Cash et Clover réellement vendus par session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Ouverture</TableHead>
                <TableHead>Fermeture</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Clover</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {isLoading ? "Chargement…" : "Aucune session fermée cette journée."}
                  </TableCell>
                </TableRow>
              )}
              {sessionRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="outline">{r.station}</Badge>
                  </TableCell>
                  <TableCell>{r.employee}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.openedAt ? fmtTime(r.openedAt) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtTime(r.closedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.cash)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.clover)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmt(r.total)}
                  </TableCell>
                  <TableCell>
                    {r.hasEcart ? (
                      <Badge variant="destructive">Oui</Badge>
                    ) : (
                      <Badge variant="secondary">Non</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {sessionRows.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell colSpan={4} className="font-semibold">
                    Total de la journée
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(sessionTotals.cash)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(sessionTotals.clover)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(sessionTotals.total)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
