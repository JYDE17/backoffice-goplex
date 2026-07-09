import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { getClosure, getClosures } from "@/lib/closures";
import { getSessionForClosureFn } from "@/lib/sessions";
import { DENOMS } from "@/lib/denominations";
import { getStoredPrinterName, printReceiptHtml } from "@/lib/qz-print";
import { buildClosureReceiptHtml } from "@/lib/receipt-html";
import type { ClosureRow } from "@/lib/closures.server";

export const Route = createFileRoute("/_authenticated/rapport/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    print: search.print === true || search.print === "true",
  }),
  head: () => ({ meta: [{ title: "Rapport de reconciliation - BackOffice" }] }),
  component: RapportPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtEcart(n: number) {
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${fmt(n)}` : `-${fmt(Math.abs(n))}`;
}

// Reprint the thermal receipt via QZ Tray (used by the manual button;
// only shown when this station has a printer configured).
async function printReceipt(r: ClosureRow, openingTotal?: number, ownClover?: number) {
  try {
    await printReceiptHtml(buildClosureReceiptHtml(r, openingTotal, ownClover));
    toast.success("Reçu envoyé à l'imprimante");
  } catch (error) {
    toast.error("Échec de l'impression du reçu", {
      description: error instanceof Error ? error.message : undefined,
    });
  }
}

// Auto-print right after a closure: silent thermal receipt via QZ Tray when
// this station has a printer configured, otherwise the browser's print
// dialog (full-page report).
async function autoPrint(r: ClosureRow, openingTotal?: number, ownClover?: number) {
  if (getStoredPrinterName()) {
    try {
      await printReceiptHtml(buildClosureReceiptHtml(r, openingTotal, ownClover));
      toast.success("Reçu imprimé automatiquement");
      return;
    } catch (error) {
      toast.error("Échec de l'impression QZ Tray, ouverture de l'impression navigateur", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  } else {
    toast.info("Aucune imprimante reçu configurée sur ce poste", {
      description:
        "Compte dev → Paramètres → Imprimante reçu pour l'impression automatique du reçu.",
    });
  }
  window.print();
}

function RapportPage() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const runGetClosure = useServerFn(getClosure);
  const runGetSessionForClosure = useServerFn(getSessionForClosureFn);
  const runGetClosures = useServerFn(getClosures);
  const hasAutoPrinted = useRef(false);

  const query = useQuery({
    queryKey: ["closure", id],
    queryFn: () => runGetClosure({ data: { id: Number(id) } }),
  });

  // Shift session reconciled into this closure (if any) - its opening
  // drawer count goes on the receipt.
  const sessionQuery = useQuery({
    queryKey: ["closure-session", id],
    queryFn: () => runGetSessionForClosure({ data: { closureId: Number(id) } }),
  });

  const r = query.data;
  const session = sessionQuery.data;
  const openingTotal = session ? session.openTotal : undefined;

  // The Clover terminal is never reset mid-day, so cloverPosAmount as typed
  // in is cumulative for that station/date (see racefacer-sync.ts). This
  // session's own Clover sales = its cumulative reading minus the previous
  // closure's reading for the same station/date - same "own delta" trick
  // used by the weekly/monthly/ecarts reports.
  const stationClosuresQuery = useQuery({
    queryKey: ["closures-for-station-date", r?.closureDate, r?.stationName],
    queryFn: () => runGetClosures({ data: { date: r!.closureDate, stationName: r!.stationName } }),
    enabled: !!r,
  });

  const ownClover = useMemo(() => {
    if (!r) return undefined;
    const sorted = (stationClosuresQuery.data ?? [])
      .slice()
      .sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1));
    let previous = 0;
    for (const c of sorted) {
      const own = c.cloverPosAmount - previous;
      previous = c.cloverPosAmount;
      if (c.id === r.id) return own;
    }
    return undefined;
  }, [stationClosuresQuery.data, r]);

  useEffect(() => {
    if (
      print &&
      r &&
      !hasAutoPrinted.current &&
      !sessionQuery.isLoading &&
      !stationClosuresQuery.isLoading
    ) {
      hasAutoPrinted.current = true;
      autoPrint(r, sessionQuery.data ? sessionQuery.data.openTotal : undefined, ownClover);
    }
  }, [
    print,
    r,
    sessionQuery.isLoading,
    sessionQuery.data,
    stationClosuresQuery.isLoading,
    ownClover,
  ]);

  if (query.isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
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
          <Link to="/rapports/fermetures">
            <ArrowLeft /> Retour aux rapports
          </Link>
        </Button>
        <div className="flex gap-2">
          {getStoredPrinterName() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => printReceipt(r, openingTotal, ownClover)}
            >
              <Printer /> Réimprimer le reçu
            </Button>
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Imprimer / PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
        <CardHeader>
          <CardTitle className="text-xl">Rapport de reconciliation de caisse</CardTitle>
          <div className="text-sm text-muted-foreground">BackOffice - Goplex Brossard</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Date</div>
              <div className="font-medium">{r.closureDate}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Point de vente</div>
              <div className="font-medium">{r.stationName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Employe</div>
              <div className="font-medium">{r.employeeName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Autorise par</div>
              <div className="font-medium">{r.authorizedByName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Heure de cloture</div>
              <div className="font-medium">{new Date(r.closedAt).toLocaleString("fr-CA")}</div>
            </div>
            {session && (
              <div>
                <div className="text-muted-foreground">Heure d'ouverture</div>
                <div className="font-medium">
                  {new Date(session.openedAt).toLocaleString("fr-CA")}
                </div>
              </div>
            )}
          </div>

          {session && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Comptage a l'ouverture (par {session.csrName})
                </h3>
                <div className="grid sm:grid-cols-2 gap-6">
                  <DenomTable title="Billets" items={billets} counts={session.openCounts} />
                  <DenomTable title="Pieces" items={pieces} counts={session.openCounts} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm font-medium">
                  <span>Total a l'ouverture</span>
                  <span className="tabular-nums">{fmt(session.openTotal)}</span>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-2">Comptage physique (fermeture)</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <DenomTable title="Billets" items={billets} counts={r.counts} />
              <DenomTable title="Pieces" items={pieces} counts={r.counts} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm font-medium">
              <span>Total physique compte</span>
              <span className="tabular-nums">{fmt(totalCompte)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Fond de caisse (exclu du depot)</span>
              <span className="tabular-nums">{fmt(r.fondCaisse)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total pour depot</span>
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
                  <td className="py-1 text-muted-foreground">Cash compte (pour depot)</td>
                  <td className="py-1 text-right tabular-nums">{fmt(r.cashHorsFond)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1">Ecart cash</td>
                  <td
                    className={`py-1 text-right tabular-nums ${r.ecartCash === 0 ? "text-success" : Math.abs(r.ecartCash) < 1 ? "text-warning" : "text-destructive"}`}
                  >
                    {fmtEcart(r.ecartCash)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground pt-3">
                    POS Terminal RaceFacer (cumulatif jour)
                  </td>
                  <td className="py-1 text-right tabular-nums pt-3">{fmt(r.rfPosDelta)}</td>
                </tr>
                <tr>
                  <td className="py-1 text-muted-foreground">Clover (cumulatif jour)</td>
                  <td className="py-1 text-right tabular-nums">{fmt(r.cloverPosAmount)}</td>
                </tr>
                <tr className="font-medium">
                  <td className="py-1">Ecart POS Terminal (cumulatif jour)</td>
                  <td
                    className={`py-1 text-right tabular-nums ${r.ecartPos === 0 ? "text-success" : Math.abs(r.ecartPos) < 1 ? "text-warning" : "text-destructive"}`}
                  >
                    {fmtEcart(r.ecartPos)}
                  </td>
                </tr>
                {ownClover !== undefined && (
                  <tr className="font-medium">
                    <td className="py-1 pt-3">Clover - vente de ce shift</td>
                    <td className="py-1 text-right tabular-nums pt-3">{fmt(ownClover)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Depot bancaire effectue</span>
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
                <h3 className="text-sm font-semibold mb-1">Commentaire / raison de l'ecart</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.notes}</p>
              </div>
            </>
          )}

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
      <h4 className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">
        {title}
      </h4>
      <table className="w-full text-sm">
        <tbody>
          {items.map((d) => {
            const qty = counts[d.label] || 0;
            return (
              <tr key={d.label}>
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">x {qty}</td>
                <td className="py-0.5 text-right tabular-nums text-muted-foreground">
                  {fmt(qty * d.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
