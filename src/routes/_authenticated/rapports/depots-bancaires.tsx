import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { Eye, Printer, Download } from "lucide-react";
import { getBankDepositsFn } from "@/lib/bank-deposits";
import { fmt } from "@/lib/report-format";
import { downloadCsv } from "@/lib/csv";
import { downloadPdf } from "@/lib/pdf";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/depots-bancaires")({
  head: () => ({ meta: [{ title: "Rapports — Dépôts bancaires — BackOffice" }] }),
  component: DepotsBancairesReportPage,
});

function DepotsBancairesReportPage() {
  const runGetBankDeposits = useServerFn(getBankDepositsFn);

  const query = useQuery({
    queryKey: ["bank-deposits"],
    queryFn: () => runGetBankDeposits(),
  });

  const rows = query.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      `depots-bancaires-${localDateString()}.csv`,
      ["Date", "Banque", "Cree par", "Montant"],
      rows.map((d) => [d.depositDate, d.bankName || "", d.createdByName, d.totalAmount]),
    );
  };

  const exportPdf = () => {
    downloadPdf(
      `depots-bancaires-${localDateString()}.pdf`,
      "Rapport — Depots bancaires",
      "Argent reellement sorti du coffre-fort vers la banque.",
      [
        {
          type: "table",
          headers: ["Date", "Banque", "Cree par", "Montant"],
          rows: rows.map((d) => [
            d.depositDate,
            d.bankName || "-",
            d.createdByName,
            fmt(d.totalAmount),
          ]),
          rightAlign: [3],
        },
      ],
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Dépôts bancaires</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Argent réellement sorti du coffre-fort vers la banque.
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

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-base">Dépôts bancaires</CardTitle>
          <CardDescription>Chaque dépôt bancaire a son rapport détaillé.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Créé par</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {query.isLoading ? "Chargement…" : "Aucun dépôt bancaire enregistré."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.depositDate}</TableCell>
                  <TableCell>{d.bankName || "—"}</TableCell>
                  <TableCell>{d.createdByName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                  <TableCell className="print:hidden">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport-depot-bancaire/$id" params={{ id: String(d.id) }}>
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
