import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer } from "lucide-react";
import { getBankDepositFn } from "@/lib/bank-deposits";
import { downloadPdf } from "@/lib/pdf";
import type { BankDepositRow } from "@/lib/bank-deposits.server";

export const Route = createFileRoute("/_authenticated/rapport-depot-bancaire/$id")({
  head: () => ({ meta: [{ title: "Rapport de dépôt bancaire — BackOffice" }] }),
  component: RapportDepotBancairePage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function exportPdf(deposit: BankDepositRow) {
  downloadPdf(`rapport-depot-bancaire-${deposit.id}.pdf`, "Rapport de depot bancaire", "", [
    {
      type: "keyvalue",
      pairs: [
        ["Date", deposit.depositDate],
        ["Banque", deposit.bankName || "-"],
        ["Cree par", deposit.createdByName],
        ["Montant", fmt(deposit.totalAmount)],
      ],
    },
    {
      type: "keyvalue",
      pairs: [
        ["Note", "Ce montant a ete retire du coffre-fort et remis physiquement a la banque."],
      ],
    },
  ]);
}

function RapportDepotBancairePage() {
  const { id } = Route.useParams();
  const runGetBankDeposit = useServerFn(getBankDepositFn);

  const query = useQuery({
    queryKey: ["bank-deposit", id],
    queryFn: () => runGetBankDeposit({ data: { id: Number(id) } }),
  });

  const deposit = query.data;

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
        <Button size="sm" onClick={() => exportPdf(deposit)}>
          <Printer /> Télécharger PDF
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
              <div className="text-muted-foreground">Montant</div>
              <div className="font-medium tabular-nums">{fmt(deposit.totalAmount)}</div>
            </div>
          </div>

          <Separator />

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
