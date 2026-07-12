import { createFileRoute, Link } from "@tanstack/react-router";
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
import { getBankDepositFn } from "@/lib/bank-deposits";
import { getChangeBoxCountByBankDepositFn } from "@/lib/change-box";
import { printPdf } from "@/lib/pdf";
import type { BankDepositRow } from "@/lib/bank-deposits.server";
import { DENOMS, CHANGE_BOX_ITEMS } from "@/lib/denominations";

export const Route = createFileRoute("/_authenticated/rapport-depot-bancaire/$id")({
  head: () => ({ meta: [{ title: "Rapport de dépôt bancaire — BackOffice" }] }),
  component: RapportDepotBancairePage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function exportPdf(deposit: BankDepositRow, changeBoxCounts: Record<string, number> | undefined) {
  const denomRows = DENOMS.filter((d) => (deposit.counts[d.label] ?? 0) > 0).map((d) => [
    d.label,
    deposit.counts[d.label] ?? 0,
    fmt((deposit.counts[d.label] ?? 0) * d.value),
  ]);
  const sections = [
    {
      type: "keyvalue" as const,
      pairs: [
        ["Date", deposit.depositDate],
        ["Banque", deposit.bankName || "-"],
        ["Cree par", deposit.createdByName],
        ["Verifie par", deposit.verifiedByName || "-"],
        ["Montant", fmt(deposit.totalAmount)],
      ] as [string, string][],
    },
    {
      type: "table" as const,
      heading: "Sommaire du depot",
      headers: ["Coupure", "Quantite", "Montant"],
      rows: denomRows,
      rightAlign: [1, 2],
    },
  ];
  if (changeBoxCounts) {
    sections.push({
      type: "table" as const,
      heading: "Boite de change au moment du depot",
      headers: ["Piece", "Quantite", "Montant"],
      rows: CHANGE_BOX_ITEMS.map((item) => [
        item.label,
        changeBoxCounts[item.label] ?? 0,
        fmt((changeBoxCounts[item.label] ?? 0) * item.value),
      ]),
      rightAlign: [1, 2],
    });
  }
  printPdf(`rapport-depot-bancaire-${deposit.id}.pdf`, "Rapport de depot bancaire", "", sections);
}

function RapportDepotBancairePage() {
  const { id } = Route.useParams();
  const runGetBankDeposit = useServerFn(getBankDepositFn);
  const runGetChangeBoxCount = useServerFn(getChangeBoxCountByBankDepositFn);

  const query = useQuery({
    queryKey: ["bank-deposit", id],
    queryFn: () => runGetBankDeposit({ data: { id: Number(id) } }),
  });
  const changeBoxQuery = useQuery({
    queryKey: ["change-box-count", id],
    queryFn: () => runGetChangeBoxCount({ data: { bankDepositId: Number(id) } }),
  });

  const deposit = query.data;
  const changeBox = changeBoxQuery.data;

  if (query.isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }
  if (!deposit) {
    return <div className="p-6 text-muted-foreground">Dépôt bancaire introuvable.</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link to="/depots">
            <ArrowLeft /> Retour aux dépôts bancaires
          </Link>
        </Button>
        <Button size="sm" onClick={() => exportPdf(deposit, changeBox?.counts)}>
          <Printer /> Imprimer PDF
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-xl">Rapport de dépôt bancaire</CardTitle>
          <div className="text-sm text-muted-foreground">BackOffice — Goplex Brossard</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Date</div>
              <div className="font-medium">{deposit.depositDate}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Banque</div>
              <div className="font-medium">{deposit.bankName || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Créé par</div>
              <div className="font-medium">{deposit.createdByName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Vérifié par</div>
              <div className="font-medium">{deposit.verifiedByName || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Montant</div>
              <div className="font-medium tabular-nums">{fmt(deposit.totalAmount)}</div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Sommaire du dépôt</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coupure</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DENOMS.filter((d) => (deposit.counts[d.label] ?? 0) > 0).map((d) => (
                  <TableRow key={d.label}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {deposit.counts[d.label]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt((deposit.counts[d.label] ?? 0) * d.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {changeBox && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">Boîte de change au moment du dépôt</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pièce</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CHANGE_BOX_ITEMS.map((item) => (
                      <TableRow key={item.label}>
                        <TableCell>{item.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {changeBox.counts[item.label] ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt((changeBox.counts[item.label] ?? 0) * item.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <p className="text-sm text-muted-foreground">
            Ce montant a été retiré du coffre-fort et remis physiquement à la banque.
          </p>

          <Separator />

          <div className="text-center text-xs text-muted-foreground">
            <div>Merci d'utiliser BackOffice</div>
            <div>Jeremy Dionne — 2026</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
