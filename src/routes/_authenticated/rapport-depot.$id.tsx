import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { getDepositFn } from "@/lib/deposits";
import { getStoredPrinterName, printReceiptHtml } from "@/lib/qz-print";
import { buildDepositReceiptHtml } from "@/lib/receipt-html";
import { printPdf, type PdfSection } from "@/lib/pdf";
import type { DepositRow } from "@/lib/deposits.server";
import type { ClosureRow } from "@/lib/closures.server";
import type { VeloceSaleRow } from "@/lib/veloce-sales.server";
import type { ArcadeSaleRow } from "@/lib/arcade-sales.server";
import { canAccessDepotDetail } from "@/lib/permissions";
import { effectiveRole } from "@/lib/roles";
import {
  arcadeZoutCashNet,
  arcadeCountedCashNet,
  arcadeEcart,
  fmtEcart,
  ecartTone,
} from "@/lib/report-format";
import { roundToNickel } from "@/lib/denominations";

// One POS closure line inside a day group - montant attendu = the cash
// RaceFacer expected, perçu = the cash physically counted at closing.
// Débalancement is always perçu - attendu (same convention as the arcade
// section this mirrors).
type RecupLine = { key: string; label: string; attendu: number; percu: number };
type RecupDayGroup = { date: string; lines: RecupLine[]; totalAttendu: number; totalPercu: number };

// Groups the deposit's POS closures by day, so the "Fermetures" section reads
// like the arcade section below it: attendu vs perçu per line, then a per-day
// total with the débalancement between the two. A day usually holds several
// closures (one per POS), which is why this rolls them up instead of a flat
// one-row-per-closure table.
function buildRecupDayGroups(closures: ClosureRow[]): RecupDayGroup[] {
  const byDate = new Map<string, RecupDayGroup>();
  for (const c of closures) {
    let g = byDate.get(c.closureDate);
    if (!g) {
      g = { date: c.closureDate, lines: [], totalAttendu: 0, totalPercu: 0 };
      byDate.set(c.closureDate, g);
    }
    // Cash only ever lands on a nickel, so round both the attendu (RaceFacer
    // expected cash) and the perçu (physically counted) for display - covers
    // closures saved before the fetch-level rounding was added.
    const attendu = roundToNickel(c.rfCashDelta);
    const percu = roundToNickel(c.cashHorsFond);
    g.lines.push({
      key: `c-${c.id}`,
      label: `${c.stationName} · ${c.employeeName}`,
      attendu,
      percu,
    });
    g.totalAttendu += attendu;
    g.totalPercu += percu;
  }
  return Array.from(byDate.values()).sort((x, y) => x.date.localeCompare(y.date));
}

export const Route = createFileRoute("/_authenticated/rapport-depot/$id")({
  beforeLoad: ({ context }) => {
    if (!canAccessDepotDetail(effectiveRole(context.user))) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Rapport de recuperation - BackOffice" }] }),
  component: RapportDepotPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

async function printReceipt(
  deposit: DepositRow,
  closures: {
    closureDate: string;
    stationName: string;
    employeeName: string;
    depositAmount: number;
  }[],
  veloceSales: VeloceSaleRow[],
  arcadeSales: ArcadeSaleRow[],
) {
  try {
    await printReceiptHtml(buildDepositReceiptHtml(deposit, closures, veloceSales, arcadeSales));
    toast.success("Reçu envoyé à l'imprimante");
  } catch (error) {
    toast.error("Échec de l'impression du reçu", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
}

function exportPdf(
  deposit: DepositRow,
  closures: ClosureRow[],
  veloceSales: VeloceSaleRow[],
  arcadeSales: ArcadeSaleRow[],
) {
  const sections: PdfSection[] = [
    {
      type: "keyvalue",
      pairs: [
        ["Date de recuperation", deposit.depositDate],
        ["Banque", deposit.bankName || "-"],
        ["Cree par", deposit.createdByName],
        ["Verifie par", deposit.verifiedByName || "-"],
        ["Montant total", fmt(deposit.totalAmount)],
      ] as [string, string][],
    },
  ];
  // Fermetures grouped by day, same attendu / perçu / débalancement layout as
  // the arcade section below - one table per day, ending with a "Total du
  // jour" row.
  const dayGroups = buildRecupDayGroups(closures);
  for (const g of dayGroups) {
    const debal = g.totalPercu - g.totalAttendu;
    sections.push({
      type: "table",
      heading: `Fermetures - ${g.date}`,
      headers: ["Detail (POS - nom)", "Attendu", "Percu", "Debalancement"],
      rows: [
        ...g.lines.map((l) => [
          l.label,
          fmt(l.attendu),
          fmt(l.percu),
          fmtEcart(l.percu - l.attendu),
        ]),
        ["Total du jour", fmt(g.totalAttendu), fmt(g.totalPercu), fmtEcart(debal)],
      ],
      rightAlign: [1, 2, 3],
    });
  }
  if (veloceSales.length > 0) {
    sections.push({
      type: "table" as const,
      heading: `Ventes resto (Veloce) incluses (${veloceSales.length})`,
      headers: ["Date", "Montant supposé", "Montant réel"],
      rows: veloceSales.map((s) => [
        s.saleDate,
        fmt(roundToNickel(s.cashAmount)),
        fmt(roundToNickel(s.confirmedAmount ?? s.cashAmount)),
      ]),
      rightAlign: [1, 2],
    });
  }
  if (arcadeSales.length > 0) {
    sections.push({
      type: "table" as const,
      heading: `Ventes arcade incluses (${arcadeSales.length})`,
      headers: ["Date", "CSR", "Z-out (attendu)", "Compté", "Débalancement"],
      rows: arcadeSales.map((s) => [
        s.saleDate,
        s.csrName || "-",
        fmt(arcadeZoutCashNet(s)),
        fmt(arcadeCountedCashNet(s)),
        fmtEcart(arcadeEcart(s)),
      ]),
      rightAlign: [2, 3, 4],
    });
  }
  sections.push({
    type: "keyvalue" as const,
    pairs: [["Total depose", fmt(deposit.totalAmount)]] as [string, string][],
  });
  printPdf(`rapport-recuperation-${deposit.id}.pdf`, "Rapport de recuperation", "", sections);
}

function RapportDepotPage() {
  const { id } = Route.useParams();
  const runGetDeposit = useServerFn(getDepositFn);

  const query = useQuery({
    queryKey: ["deposit", id],
    queryFn: () => runGetDeposit({ data: { id: Number(id) } }),
  });

  const result = query.data;

  if (query.isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }
  if (!result) {
    return <div className="p-6 text-muted-foreground">Depot introuvable.</div>;
  }

  const { deposit, closures, veloceSales, arcadeSales } = result;
  const dayGroups = buildRecupDayGroups(closures);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link to="/recuperation">
            <ArrowLeft /> Retour aux récupérations
          </Link>
        </Button>
        <div className="flex gap-2">
          {getStoredPrinterName() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => printReceipt(deposit, closures, veloceSales, arcadeSales)}
            >
              <Printer /> Imprimer le reçu
            </Button>
          )}
          <Button size="sm" onClick={() => exportPdf(deposit, closures, veloceSales, arcadeSales)}>
            <Printer /> Imprimer PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-xl">Rapport de récupération</CardTitle>
          <div className="text-sm text-muted-foreground">BackOffice - Goplex Brossard</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Date de recuperation</div>
              <div className="font-medium">{deposit.depositDate}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Banque</div>
              <div className="font-medium">{deposit.bankName || "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cree par</div>
              <div className="font-medium">{deposit.createdByName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Verifie par</div>
              <div className="font-medium">{deposit.verifiedByName || "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Montant total</div>
              <div className="font-medium tabular-nums">{fmt(deposit.totalAmount)}</div>
            </div>
          </div>

          {dayGroups.length > 0 && (
            <>
              <Separator />
              <div className="space-y-6">
                <h3 className="text-sm font-semibold">Fermetures incluses ({closures.length})</h3>
                {dayGroups.map((g) => {
                  const debal = g.totalPercu - g.totalAttendu;
                  return (
                    <div key={g.date} className="space-y-2">
                      <div className="text-sm font-medium">{g.date}</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Détail (POS · nom)</TableHead>
                            <TableHead className="text-right">Attendu</TableHead>
                            <TableHead className="text-right">Perçu</TableHead>
                            <TableHead className="text-right">Débalancement</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.lines.map((l) => {
                            const d = l.percu - l.attendu;
                            return (
                              <TableRow key={l.key}>
                                <TableCell>{l.label}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {fmt(l.attendu)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmt(l.percu)}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums ${ecartTone(d)}`}>
                                  {fmtEcart(d)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="border-t-2">
                            <TableCell className="font-semibold">Total du jour</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-muted-foreground">
                              {fmt(g.totalAttendu)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {fmt(g.totalPercu)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold tabular-nums ${ecartTone(debal)}`}
                            >
                              {fmtEcart(debal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {veloceSales.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Ventes resto (Véloce) incluses ({veloceSales.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Montant supposé</TableHead>
                      <TableHead className="text-right">Montant réel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {veloceSales.map((s) => (
                      <TableRow key={s.saleDate}>
                        <TableCell>{s.saleDate}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmt(roundToNickel(s.cashAmount))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(roundToNickel(s.confirmedAmount ?? s.cashAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {arcadeSales.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Ventes arcade incluses ({arcadeSales.length})
                </h3>
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
                    {arcadeSales.map((s) => (
                      <TableRow key={s.saleDate}>
                        <TableCell>{s.saleDate}</TableCell>
                        <TableCell>{s.csrName || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmt(arcadeZoutCashNet(s))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(arcadeCountedCashNet(s))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtEcart(arcadeEcart(s))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total deposé</span>
            <span className="tabular-nums">{fmt(deposit.totalAmount)}</span>
          </div>

          <Separator />

          <div className="text-center text-xs text-muted-foreground">
            <div>Merci d'utiliser BackOffice</div>
            <div>Jeremy Dionne - 2026</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
