import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer } from "lucide-react";
import { getClosure } from "@/lib/closures";
import { DENOMS } from "@/lib/denominations";

export const Route = createFileRoute("/_authenticated/rapport/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    print: search.print === true || search.print === "true",
  }),
  head: () => ({ meta: [{ title: "Rapport de réconciliation — BackOffice" }] }),
  component: RapportPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtEcart(n: number) {
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${fmt(n)}` : `-${fmt(Math.abs(n))}`;
}

function RapportPage() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const runGetClosure = useServerFn(getClosure);
  const hasAutoPrinted = useRef(false);

  const query = useQuery({
    queryKey: ["closure", id],
    queryFn: () => runGetClosure({ data: { id: Number(id) } }),
  });

  const r = query.data;

  useEffect(() => {
    if (print && r && !hasAutoPrinted.current) {
      hasAutoPrinted.current = true;
      window.print();
    }
  }, [print, r]);

  if (query.isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement…</div>;
  }
  if (!r) {
    return <div className="p-6 text-muted-foreground">Rapport introuvable.</div>;
  }

  const billets = DENOMS.filter((d) => d.type === "billet");
  const pieces = DENOMS.filter((d) => d.type === "piece");
  const totalCompte = r.cashHorsFond + r.fondCaisse;
  const restant = Math.max(0, r.cashHorsFond - r.depositAmount);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link to="/rapports/fermetures"><ArrowLeft /> Retour aux rapports</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Imprimer
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-xl">Rapport de réconciliation de caisse</CardTitle>
          <div className="text-sm text-muted-foreground">BackOffice — Goplex Brossard</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground">Date</div><div className="font-medium">{r.closureDate}</div></div>
            <div><div className="text-muted-foreground">Point de vente</div><div className="font-medium">{r.stationName}</div></div>
            <div><div className="text-muted-foreground">Employé</div><div className="font-medium">{r.employeeName}</div></div>
            <div><div className="text-muted-foreground">Autorisé par</div><div className="font-medium">{r.authorizedByName}</div></div>
            <div className="col-span-2 sm:col-span-4">
              <div className="text-muted-foreground">Heure de clôture</div>
              <div className="font-medium">{new Date(r.closedAt).toLocaleString("fr-CA")}</div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Comptage physique</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <DenomTable title="Billets" items={billets} counts={r.counts} />
              <DenomTable title="Pièces" items={pieces} counts={r.counts} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm font-medium">
              <span>Total physique compté</span>
              <span className="tabular-nums">{fmt(totalCompte)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Fond de caisse (exclu du dépôt)</span>
              <span className="tabular-nums">{fmt(r.fondCaisse)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total pour dépôt</span>
              <span className="tabular-nums">{fmt(r.cashHorsFond)}</span>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Rapprochement RaceFacer / Clover</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-muted-foreground">Cash RaceFacer (attendu)</td>
                  <td className="py-1 text-right tabular-nums">{fmt(r.rfCashDelta)}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Cash compté (pour dépôt)</td>
                  <td className="py-1 text-right tabular-nums">{fmt(r.cashHorsFond)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1">Écart cash</td>
                  <td className={`py-1 text-right tabular-nums ${r.ecartCash === 0 ? "text-success" : Math.abs(r.ecartCash) < 5 ? "text-warning" : "text-destructive"}`}>
                    {fmtEcart(r.ecartCash)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground pt-3">POS Terminal RaceFacer (attendu)</td>
                  <td className="py-1 text-right tabular-nums pt-3">{fmt(r.rfPosDelta)}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Clover (perçu)</td>
                  <td className="py-1 text-right tabular-nums">{fmt(r.cloverPosAmount)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1">Écart POS Terminal</td>
                  <td className={`py-1 text-right tabular-nums ${r.ecartPos === 0 ? "text-success" : Math.abs(r.ecartPos) < 5 ? "text-warning" : "text-destructive"}`}>
                    {fmtEcart(r.ecartPos)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Dépôt bancaire effectué</span>
            <span className="font-medium tabular-nums">{fmt(r.depositAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Restant en caisse</span>
            <span className="font-medium tabular-nums">{fmt(restant)}</span>
          </div>

          {r.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-1">Commentaire / raison de l'écart</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DenomTable({
  title,
  items,
  counts,
}: {
  title: string;
  items: typeof DENOMS;
  counts: Record<string, number>;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">{title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {items.map((d) => {
            const qty = counts[d.label] || 0;
            return (
              <tr key={d.label}>
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">× {qty}</td>
                <td className="py-0.5 text-right tabular-nums text-muted-foreground">{fmt(qty * d.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
