import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/date-range-picker";
import { getClosures } from "@/lib/closures";
import { getRaceFacerSales, syncRaceFacerSales } from "@/lib/racefacer-sync";
import { getCloverSales, syncCloverSales } from "@/lib/clover-sync";
import { getSessionsForClosuresFn } from "@/lib/sessions";
import { syncVeloceSalesFn, getVeloceDaySummaryFn } from "@/lib/veloce-sales";
import { listArcadeSalesFn } from "@/lib/arcade-sales";
import {
  fmt,
  fmtEcart,
  ecartTone,
  arcadeZoutCashNet,
  arcadeZoutCardNet,
  arcadeCountedCashNet,
  arcadeCountedCardNet,
  arcadeEcart,
} from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { printPdf } from "@/lib/pdf";
import { dateRangeInclusive, localDateString } from "@/lib/dates";
import { canAccessPage } from "@/lib/permissions";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

export const Route = createFileRoute("/_authenticated/rapports/ventes-quotidiennes")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "rapportVentesQuotidiennes")) {
      throw redirect({ to: "/" });
    }
  },
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

type Department = "tout" | "csr" | "arcade" | "resto";

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function VentesQuotidiennesPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();

  // Arcade/Resto are coffre-fort-adjacent categories a superviseur isn't
  // meant to see (see /lib/permissions.ts) - reuse the same permission keys
  // their dedicated pages/reports already gate on, rather than exposing them
  // here just because they're now folded into the same report.
  const canSeeArcade = canAccessPage(user.role, "ventesArcade");
  const canSeeResto = canAccessPage(user.role, "rapportVentesVeloce");
  const canFilterDepartments = canSeeArcade || canSeeResto;

  const today = localDateString();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [department, setDepartment] = useState<Department>(canFilterDepartments ? "tout" : "csr");
  const [syncing, setSyncing] = useState(false);

  const selectedDays = useMemo(() => dateRangeInclusive(from, to), [from, to]);
  const rangeLabel = `${from} → ${to}`;

  const runGetSales = useServerFn(getRaceFacerSales);
  const runSyncSales = useServerFn(syncRaceFacerSales);
  const runGetCloverSales = useServerFn(getCloverSales);
  const runSyncCloverSales = useServerFn(syncCloverSales);
  const runGetClosures = useServerFn(getClosures);
  const runGetSessions = useServerFn(getSessionsForClosuresFn);
  const runSyncVeloceSales = useServerFn(syncVeloceSalesFn);
  const runGetVeloceSummary = useServerFn(getVeloceDaySummaryFn);
  const runListArcadeSales = useServerFn(listArcadeSalesFn);

  // --- CSR (RaceFacer + Clover + fermetures) ---------------------------

  const racefacerQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["racefacer-sales", d],
      queryFn: () => runGetSales({ data: { date: d } }),
    })),
  });
  const cloverQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["clover-sales", d],
      queryFn: () => runGetCloverSales({ data: { date: d } }),
    })),
  });
  const closuresQuery = useQuery({
    queryKey: ["closures-range", from],
    queryFn: () => runGetClosures({ data: { since: from } }),
  });
  const closuresInRange = useMemo(
    () => (closuresQuery.data ?? []).filter((c) => c.closureDate <= to),
    [closuresQuery.data, to],
  );
  const closureIds = useMemo(() => closuresInRange.map((c) => c.id), [closuresInRange]);
  const sessionsQuery = useQuery({
    queryKey: ["sessions-for-closures-range", closureIds],
    queryFn: () => runGetSessions({ data: { closureIds } }),
    enabled: closureIds.length > 0,
  });

  const csrLoading =
    racefacerQueries.some((q) => q.isLoading) ||
    cloverQueries.some((q) => q.isLoading) ||
    closuresQuery.isLoading;

  const resync = async () => {
    setSyncing(true);
    try {
      await Promise.all(
        selectedDays.flatMap((d) => [
          runSyncSales({ data: { date: d } }),
          runSyncCloverSales({ data: { date: d } }),
        ]),
      );
      await Promise.all(
        selectedDays.flatMap((d) => [
          queryClient.invalidateQueries({ queryKey: ["racefacer-sales", d] }),
          queryClient.invalidateQueries({ queryKey: ["clover-sales", d] }),
        ]),
      );
      toast.success("RaceFacer et Clover resynchronisés");
    } catch (error) {
      toast.error("Échec de la resynchronisation", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Sales Summary style: each tender summed across every station AND every
  // day of the selected range.
  const tenders = useMemo(() => {
    const rows = racefacerQueries.flatMap((q) => q.data?.rows ?? []);
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
  }, [racefacerQueries]);

  const cloverSummary = useMemo(() => {
    const rows = cloverQueries.flatMap((q) => q.data?.rows ?? []);
    const paid = rows.reduce((acc, r) => acc + r.paid_total, 0);
    const refund = rows.reduce((acc, r) => acc + r.refund_total, 0);
    return { paid, refund, net: paid - refund };
  }, [cloverQueries]);

  const depotComparison = useMemo(() => {
    const depotReel = closuresInRange.reduce((acc, c) => acc + c.cashHorsFond, 0);
    const cashRaceFacer = racefacerQueries
      .flatMap((q) => q.data?.rows ?? [])
      .reduce((acc, r) => acc + r.cash_total, 0);
    return { depotReel, cashRaceFacer, ecart: depotReel - cashRaceFacer };
  }, [closuresInRange, racefacerQueries]);

  const ecartPeriode = useMemo(() => {
    const raceFacerPos = racefacerQueries
      .flatMap((q) => q.data?.rows ?? [])
      .reduce((acc, r) => acc + r.pos_terminal_total, 0);
    return {
      cash: depotComparison.ecart,
      pos: cloverSummary.net - raceFacerPos,
    };
  }, [racefacerQueries, depotComparison, cloverSummary]);

  const sessionRows = useMemo(() => {
    const sessions = sessionsQuery.data ?? [];
    const sorted = closuresInRange
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

    // Clover's terminal reading is cumulative since it was last reset (not
    // per-shift) - each session's own Clover sales = its cumulative reading
    // minus the previous closure's reading for that same station, chained
    // chronologically across the whole range (not reset per day).
    const previousCloverByStation = new Map<string, number>();

    return sorted.map((c) => {
      const session = sessions.find((s) => s.closureId === c.id);
      const previousClover = previousCloverByStation.get(c.stationName) ?? 0;
      const ownClover = c.cloverPosAmount - previousClover;
      previousCloverByStation.set(c.stationName, c.cloverPosAmount);
      return {
        id: c.id,
        date: c.closureDate,
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
  }, [closuresInRange, sessionsQuery.data]);

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

  const csrTotal = tenders.total.total;

  // --- Arcade -----------------------------------------------------------

  const arcadeQuery = useQuery({
    queryKey: ["arcade-sales-range", from],
    queryFn: () => runListArcadeSales({ data: { since: from } }),
    enabled: canSeeArcade,
  });
  const arcadeRows = useMemo(
    () =>
      (arcadeQuery.data ?? [])
        .filter((s) => s.saleDate <= to)
        .slice()
        .sort((a, b) => (a.saleDate < b.saleDate ? -1 : 1)),
    [arcadeQuery.data, to],
  );
  // Headline figure is Z-out (attendu), same "locked to expected" rule CSR
  // (RaceFacer) and Resto (Véloce's own report) already follow - Compté is
  // shown alongside per row for reconciliation, not summed into the total.
  const arcadeTotals = useMemo(
    () =>
      arcadeRows.reduce(
        (acc, s) => ({
          zout: acc.zout + arcadeZoutCashNet(s) + arcadeZoutCardNet(s),
          counted: acc.counted + arcadeCountedCashNet(s) + arcadeCountedCardNet(s),
        }),
        { zout: 0, counted: 0 },
      ),
    [arcadeRows],
  );
  const arcadeTotal = arcadeTotals.zout;

  // --- Resto (Véloce) -----------------------------------------------------

  const veloceDayQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["veloce-sales-live", d],
      queryFn: () => runSyncVeloceSales({ data: { date: d } }),
      enabled: canSeeResto,
    })),
  });
  const veloceSummaryQueries = useQueries({
    queries: selectedDays.map((d) => ({
      queryKey: ["veloce-summary-live", d],
      queryFn: () => runGetVeloceSummary({ data: { date: d } }),
      enabled: canSeeResto,
    })),
  });
  const restoLoading =
    canSeeResto &&
    (veloceDayQueries.some((q) => q.isLoading) || veloceSummaryQueries.some((q) => q.isLoading));

  const restoRows = useMemo(
    () =>
      selectedDays.map((d, i) => ({
        date: d,
        cash: veloceDayQueries[i]?.data?.cashAmount ?? 0,
        card: veloceDayQueries[i]?.data?.cardAmount ?? 0,
      })),
    [selectedDays, veloceDayQueries],
  );
  const restoTotals = useMemo(
    () =>
      restoRows.reduce((acc, r) => ({ cash: acc.cash + r.cash, card: acc.card + r.card }), {
        cash: 0,
        card: 0,
      }),
    [restoRows],
  );
  const restoTotal = restoTotals.cash + restoTotals.card;

  const restoSummary = useMemo(() => {
    const acc = { grossSales: 0, netSales: 0, discounts: 0, taxesTotal: 0 };
    const taxByName = new Map<string, number>();
    const tenderByName = new Map<string, number>();
    for (const q of veloceSummaryQueries) {
      const s = q.data;
      if (!s) continue;
      acc.grossSales += s.grossSales;
      acc.netSales += s.netSales;
      acc.discounts += s.discounts;
      acc.taxesTotal += s.taxesTotal;
      for (const t of s.taxes) taxByName.set(t.taxName, (taxByName.get(t.taxName) ?? 0) + t.amount);
      for (const t of s.tenderTypes)
        tenderByName.set(t.name, (tenderByName.get(t.name) ?? 0) + t.amount);
    }
    const taxes = Array.from(taxByName.entries())
      .map(([taxName, amount]) => ({ taxName, amount }))
      .sort((a, b) => b.amount - a.amount);
    const tenderTypes = Array.from(tenderByName.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { ...acc, taxes, tenderTypes };
  }, [veloceSummaryQueries]);

  const grandTotal = csrTotal + arcadeTotal + restoTotal;

  const showCsr = department === "tout" || department === "csr";
  const showArcade = canSeeArcade && (department === "tout" || department === "arcade");
  const showResto = canSeeResto && (department === "tout" || department === "resto");

  const isLoading = csrLoading || (showArcade && arcadeQuery.isLoading) || restoLoading;

  // --- Export -------------------------------------------------------------

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    if (showCsr) {
      rows.push(
        ["CSR — Tenders", "", "", "", ""],
        ...tenders.lines.map((l) => ["", l.label, l.paid, -l.refund, l.total]),
        ["", "Total", tenders.total.paid, -tenders.total.refund, tenders.total.total],
        ["CSR — Clover", "Vente", cloverSummary.paid, -cloverSummary.refund, cloverSummary.net],
        ["CSR — Écart", "Cash", "", "", ecartPeriode.cash],
        ["CSR — Écart", "POS terminal", "", "", ecartPeriode.pos],
        ["CSR — Dépôt", "Dépôt réel (comptages)", "", "", depotComparison.depotReel],
        ["CSR — Dépôt", "Cash RaceFacer", "", "", depotComparison.cashRaceFacer],
        ["CSR — Dépôt", "Écart", "", "", depotComparison.ecart],
        ...sessionRows.map((r) => [
          "CSR — Sessions",
          `${r.date} ${r.station} ${r.employee}`,
          r.cash,
          r.clover,
          r.total,
        ]),
      );
    }
    if (showArcade) {
      rows.push(
        ["Arcade", "CSR", "Z-out (attendu)", "Compté", "Débalancement"],
        ...arcadeRows.map((r) => [
          r.saleDate,
          r.csrName,
          arcadeZoutCashNet(r) + arcadeZoutCardNet(r),
          arcadeCountedCashNet(r) + arcadeCountedCardNet(r),
          arcadeEcart(r),
        ]),
        [
          "",
          "Total",
          arcadeTotals.zout,
          arcadeTotals.counted,
          arcadeTotals.zout - arcadeTotals.counted,
        ],
      );
    }
    if (showResto) {
      rows.push(
        ["Resto — Résumé", "Ventes brutes", "", "", restoSummary.grossSales],
        ["Resto — Résumé", "Rabais", "", "", restoSummary.discounts],
        ["Resto — Résumé", "Ventes nettes", "", "", restoSummary.netSales],
        ["Resto — Résumé", "Taxes", "", "", restoSummary.taxesTotal],
        ...restoSummary.taxes.map((t) => ["Resto — Taxes", t.taxName, "", "", t.amount]),
        ...restoSummary.tenderTypes.map((t) => [
          "Resto — Modes de paiement",
          t.name,
          "",
          "",
          t.amount,
        ]),
        ...restoRows.map((r) => ["Resto — Cash/Carte", r.date, r.cash, r.card, r.cash + r.card]),
        ["Resto — Cash/Carte", "Total", restoTotals.cash, restoTotals.card, restoTotal],
      );
    }
    if (department === "tout") {
      rows.push(
        ["Total général", "CSR", "", "", csrTotal],
        ["Total général", "Arcade", "", "", arcadeTotal],
        ["Total général", "Resto", "", "", restoTotal],
        ["Total général", "Total", "", "", grandTotal],
      );
    }
    downloadCsv(
      `ventes-quotidiennes-${from}-${to}-${department}.csv`,
      ["Section", "Ligne", "Payé/Cash", "Remboursé/Carte", "Total"],
      rows,
    );
  };

  const exportPdf = () => {
    const sections: Parameters<typeof printPdf>[3] = [];
    if (department === "tout") {
      sections.push({
        type: "keyvalue",
        heading: "Total général",
        pairs: [
          ["CSR", fmt(csrTotal)],
          ["Arcade", fmt(arcadeTotal)],
          ["Resto (Véloce)", fmt(restoTotal)],
          ["Total", fmt(grandTotal)],
        ],
      });
    }
    if (showCsr) {
      sections.push(
        {
          type: "table",
          heading: "CSR — Tenders (toutes stations)",
          headers: ["Mode de paiement", "Payé", "Remboursé", "Total"],
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
          heading: "CSR — Clover (indépendant des fermetures)",
          pairs: [
            ["Vente", fmt(cloverSummary.paid)],
            ["Remboursement", `(${fmt(cloverSummary.refund)})`],
            ["Net", fmt(cloverSummary.net)],
          ],
        },
        {
          type: "keyvalue",
          heading: "CSR — Écart de la période",
          pairs: [
            ["Cash - Écart", fmtEcart(ecartPeriode.cash)],
            ["POS terminal - Écart", fmtEcart(ecartPeriode.pos)],
          ],
        },
        {
          type: "keyvalue",
          heading: "CSR — Dépôt réel vs RaceFacer",
          pairs: [
            ["Dépôt réel (comptages de fermeture)", fmt(depotComparison.depotReel)],
            ["Cash RaceFacer", fmt(depotComparison.cashRaceFacer)],
            ["Écart", fmtEcart(depotComparison.ecart)],
          ],
        },
        {
          type: "table",
          heading: "CSR — Sessions de la période",
          headers: ["Date", "POS", "Employé", "Ouverture", "Fermeture", "Cash", "Clover", "Total"],
          rows: [
            ...sessionRows.map((r) => [
              r.date,
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
                    "",
                    fmt(sessionTotals.cash),
                    fmt(sessionTotals.clover),
                    fmt(sessionTotals.total),
                  ],
                ]
              : []),
          ],
          rightAlign: [5, 6, 7],
        },
      );
    }
    if (showArcade) {
      sections.push({
        type: "table",
        heading: "Arcade — Z-out (attendu) vs compté, par jour",
        headers: ["Date", "CSR", "Z-out (attendu)", "Compté", "Débalancement"],
        rows: [
          ...arcadeRows.map((r) => [
            r.saleDate,
            r.csrName || "-",
            fmt(arcadeZoutCashNet(r) + arcadeZoutCardNet(r)),
            fmt(arcadeCountedCashNet(r) + arcadeCountedCardNet(r)),
            fmtEcart(arcadeEcart(r)),
          ]),
          [
            "Total",
            "",
            fmt(arcadeTotals.zout),
            fmt(arcadeTotals.counted),
            fmtEcart(arcadeTotals.zout - arcadeTotals.counted),
          ],
        ],
        rightAlign: [2, 3, 4],
      });
    }
    if (showResto) {
      sections.push(
        {
          type: "table",
          heading: "Resto — Résumé",
          headers: ["", "Montant"],
          rows: [
            ["Ventes brutes", fmt(restoSummary.grossSales)],
            ["Rabais", fmt(restoSummary.discounts)],
            ["Ventes nettes", fmt(restoSummary.netSales)],
            ["Taxes", fmt(restoSummary.taxesTotal)],
          ],
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Resto — Taxes",
          headers: ["Taxe", "Montant"],
          rows: restoSummary.taxes.map((t) => [t.taxName, fmt(t.amount)]),
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Resto — Tous les modes de paiement",
          headers: ["Type de paiement", "Montant"],
          rows: restoSummary.tenderTypes.map((t) => [t.name, fmt(t.amount)]),
          rightAlign: [1],
        },
        {
          type: "table",
          heading: "Resto — Cash/Carte par jour",
          headers: ["Date", "Cash", "Carte", "Total"],
          rows: [
            ...restoRows.map((r) => [r.date, fmt(r.cash), fmt(r.card), fmt(r.cash + r.card)]),
            ["Total", fmt(restoTotals.cash), fmt(restoTotals.card), fmt(restoTotal)],
          ],
          rightAlign: [1, 2, 3],
        },
      );
    }
    printPdf(
      `ventes-quotidiennes-${from}-${to}-${department}.pdf`,
      `Rapport — Ventes quotidiennes — ${rangeLabel}`,
      "Sommaire des ventes par département, toutes sources confondues.",
      sections,
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Ventes quotidiennes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sommaire des ventes par plage de dates, avec filtre par département.
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
          {canFilterDepartments && (
            <div>
              <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tout">Tout département</SelectItem>
                  <SelectItem value="csr">CSR</SelectItem>
                  {canSeeArcade && <SelectItem value="arcade">Arcade</SelectItem>}
                  {canSeeResto && <SelectItem value="resto">Resto (Véloce)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" onClick={resync} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            {syncing ? "Resynchronisation…" : "Resynchroniser (CSR)"}
          </Button>
          {isLoading && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Chargement…
            </Badge>
          )}
        </CardContent>
      </Card>

      {department === "tout" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="CSR" value={fmt(csrTotal)} />
          {canSeeArcade && <SummaryCard label="Arcade" value={fmt(arcadeTotal)} />}
          {canSeeResto && <SummaryCard label="Resto (Véloce)" value={fmt(restoTotal)} />}
          <SummaryCard label="Total général" value={fmt(grandTotal)} />
        </div>
      )}

      {showCsr && (
        <>
          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">CSR — Écart de la période — {rangeLabel}</CardTitle>
              <CardDescription>
                Cash compté vs RaceFacer, et Clover vs RaceFacer (POS terminal), toutes stations
                confondues — indépendant des fermetures.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-4">
                <div className="text-sm font-medium mb-2">Cash</div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Compté </span>
                    <span className="font-semibold tabular-nums">
                      {fmt(depotComparison.depotReel)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RaceFacer </span>
                    <span className="font-semibold tabular-nums">
                      {fmt(depotComparison.cashRaceFacer)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Écart </span>
                    <span className={`font-semibold tabular-nums ${ecartTone(ecartPeriode.cash)}`}>
                      {fmtEcart(ecartPeriode.cash)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-sm font-medium mb-2">POS terminal</div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Clover </span>
                    <span className="font-semibold tabular-nums">{fmt(cloverSummary.net)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RaceFacer </span>
                    <span className="font-semibold tabular-nums">
                      {fmt(
                        racefacerQueries
                          .flatMap((q) => q.data?.rows ?? [])
                          .reduce((acc, r) => acc + r.pos_terminal_total, 0),
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Écart </span>
                    <span className={`font-semibold tabular-nums ${ecartTone(ecartPeriode.pos)}`}>
                      {fmtEcart(ecartPeriode.pos)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">CSR — Sommaire des ventes — {rangeLabel}</CardTitle>
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
                    <span className="font-semibold tabular-nums">
                      {fmt(depotComparison.depotReel)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cash RaceFacer </span>
                    <span className="font-semibold tabular-nums">
                      {fmt(depotComparison.cashRaceFacer)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Écart </span>
                    <span
                      className={`font-semibold tabular-nums ${ecartTone(depotComparison.ecart)}`}
                    >
                      {fmtEcart(depotComparison.ecart)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">CSR — Clover — {rangeLabel}</CardTitle>
              <CardDescription>
                Toutes stations confondues, indépendant des fermetures — compte les ventes même sur
                un POS jamais fermé (ex : ventes au comptant sans tiroir-caisse).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Vente </span>
                  <span className="font-semibold tabular-nums">{fmt(cloverSummary.paid)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Remboursement </span>
                  <span className="font-semibold tabular-nums">({fmt(cloverSummary.refund)})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Net </span>
                  <span className="font-semibold tabular-nums">{fmt(cloverSummary.net)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">CSR — Sessions de la période</CardTitle>
              <CardDescription>
                Heure d'ouverture et de fermeture, Cash et Clover réellement vendus par session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
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
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {csrLoading ? "Chargement…" : "Aucune session fermée sur cette période."}
                      </TableCell>
                    </TableRow>
                  )}
                  {sessionRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{r.date}</TableCell>
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
                      <TableCell colSpan={5} className="font-semibold">
                        Total de la période
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
        </>
      )}

      {showArcade && (
        <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
          <CardHeader>
            <CardTitle className="text-base">
              Arcade — Z-out (attendu) vs compté, par jour — {rangeLabel}
            </CardTitle>
            <CardDescription>Saisie manuelle sur /ventes-arcade.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>CSR</TableHead>
                  <TableHead className="text-right">Z-out (attendu)</TableHead>
                  <TableHead className="text-right">Compté</TableHead>
                  <TableHead className="text-right">Débalancement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arcadeRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {arcadeQuery.isLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                    </TableCell>
                  </TableRow>
                )}
                {arcadeRows.map((r) => (
                  <TableRow key={r.saleDate}>
                    <TableCell className="font-medium">{r.saleDate}</TableCell>
                    <TableCell>{r.csrName || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmt(arcadeZoutCashNet(r) + arcadeZoutCardNet(r))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(arcadeCountedCashNet(r) + arcadeCountedCardNet(r))}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${ecartTone(arcadeEcart(r))}`}
                    >
                      {fmtEcart(arcadeEcart(r))}
                    </TableCell>
                  </TableRow>
                ))}
                {arcadeRows.length > 0 && (
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold" colSpan={2}>
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(arcadeTotals.zout)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmt(arcadeTotals.counted)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${ecartTone(arcadeTotals.zout - arcadeTotals.counted)}`}
                    >
                      {fmtEcart(arcadeTotals.zout - arcadeTotals.counted)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showResto && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Resto — Ventes brutes" value={fmt(restoSummary.grossSales)} />
            <SummaryCard label="Resto — Rabais" value={fmt(restoSummary.discounts)} />
            <SummaryCard label="Resto — Ventes nettes" value={fmt(restoSummary.netSales)} />
            <SummaryCard label="Resto — Taxes" value={fmt(restoSummary.taxesTotal)} />
          </div>

          {restoSummary.taxes.length > 0 && (
            <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
              <CardHeader>
                <CardTitle className="text-base">Resto — Taxes — {rangeLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Taxe</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restoSummary.taxes.map((t) => (
                      <TableRow key={t.taxName}>
                        <TableCell className="font-medium">{t.taxName}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">
                Resto — Tous les modes de paiement — {rangeLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type de paiement</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restoSummary.tenderTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        {restoLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                      </TableCell>
                    </TableRow>
                  )}
                  {restoSummary.tenderTypes.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(t.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle className="text-base">
                Resto — Cash/Carte par jour — {rangeLabel}
              </CardTitle>
              <CardDescription>
                Le sous-ensemble Cash/Carte utilisé pour la réconciliation du tiroir à dépôt (voir
                /ventes-resto).
              </CardDescription>
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
                  {restoRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {restoLoading ? "Chargement…" : "Aucune donnée sur cette période."}
                      </TableCell>
                    </TableRow>
                  )}
                  {restoRows.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="font-medium">{r.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.cash)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.card)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(r.cash + r.card)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {restoRows.length > 0 && (
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(restoTotals.cash)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(restoTotals.card)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(restoTotal)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
