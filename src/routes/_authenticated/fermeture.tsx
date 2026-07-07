import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, Lock, RotateCcw, CreditCard, FileBarChart, Store, RefreshCw } from "lucide-react";
import { getRaceFacerSales, syncRaceFacerSales } from "@/lib/racefacer-sync";
import { submitClosure } from "@/lib/closures";

export const Route = createFileRoute("/_authenticated/fermeture")({
  head: () => ({
    meta: [
      { title: "Fermeture de caisse — BackOffice" },
      { name: "description", content: "Comptage et rapprochement de caisse en fin de journée." },
    ],
  }),
  component: FermeturePage,
});

type Denomination = { label: string; value: number; type: "billet" | "piece" };

const DENOMS: Denomination[] = [
  { label: "100 $", value: 100, type: "billet" },
  { label: "50 $", value: 50, type: "billet" },
  { label: "20 $", value: 20, type: "billet" },
  { label: "10 $", value: 10, type: "billet" },
  { label: "5 $", value: 5, type: "billet" },
  { label: "2 $ (Toonie)", value: 2, type: "piece" },
  { label: "1 $ (Loonie)", value: 1, type: "piece" },
  { label: "0,25 $", value: 0.25, type: "piece" },
  { label: "0,10 $", value: 0.1, type: "piece" },
  { label: "0,05 $", value: 0.05, type: "piece" },
];

const FOND_CAISSE = 200.0;
const POS_LIST = ["POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function FermeturePage() {
  const { user } = Route.useRouteContext();
  const [pos, setPos] = useState<string>(POS_LIST[0]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deposit, setDeposit] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  // Clover — montant perçu (terminal POS)
  const [cloverPos, setCloverPos] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const queryClient = useQueryClient();
  const runSync = useServerFn(syncRaceFacerSales);
  const runGetSales = useServerFn(getRaceFacerSales);
  const runSubmitClosure = useServerFn(submitClosure);
  const [syncing, setSyncing] = useState(false);

  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", date],
    queryFn: () => runGetSales({ data: { date } }),
  });

  const stationRow = salesQuery.data?.rows.find((r) => r.station_name === pos);
  const rfCash = stationRow?.cash_delta ?? 0;
  const rfPos = stationRow?.pos_terminal_delta ?? 0;

  const syncRaceFacer = useCallback(
    async (opts?: { silent?: boolean }) => {
      setSyncing(true);
      try {
        const result = await runSync({ data: { date } });
        queryClient.setQueryData(["racefacer-sales", date], { rows: result.rows });
        if (!opts?.silent) {
          toast.success("Données RaceFacer synchronisées", {
            description: `Rapport du ${date} récupéré à ${new Date(result.syncedAt).toLocaleTimeString("fr-CA")}.`,
          });
        }
      } catch (error) {
        toast.error("Échec de la synchronisation RaceFacer", {
          description: error instanceof Error ? error.message : "Erreur inconnue.",
        });
      } finally {
        setSyncing(false);
      }
    },
    [date, runSync, queryClient],
  );

  // Auto-sync whenever this page is opened (arriving from another route/panel)
  // or the selected date changes — no manual click needed.
  useEffect(() => {
    syncRaceFacer({ silent: true });
  }, [syncRaceFacer]);

  const totalCompte = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] || 0) * d.value, 0),
    [counts],
  );
  const cashHorsFond = totalCompte - FOND_CAISSE;
  const ecartCash = cashHorsFond - rfCash;
  const ecartPos = cloverPos - rfPos;
  const restant = cashHorsFond - deposit;

  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setCounts((c) => ({ ...c, [label]: n }));
  };

  const reset = () => {
    setCounts({});
    setDeposit(0);
    setNotes("");
    setCloverPos(0);
  };

  const submit = async () => {
    if (!stationRow) {
      toast.error("Aucune donnée RaceFacer pour ce POS/date — synchronise d'abord.");
      return;
    }
    setSubmitting(true);
    try {
      await runSubmitClosure({
        data: {
          closureDate: date,
          stationName: pos,
          employeeId: user.id,
          employeeName: user.displayName,
          fondCaisse: FOND_CAISSE,
          cashHorsFond,
          rfCashCumulative: stationRow.cash_total,
          rfPosCumulative: stationRow.pos_terminal_total,
          rfCashDelta: rfCash,
          rfPosDelta: rfPos,
          cloverPosAmount: cloverPos,
          ecartCash,
          ecartPos,
          depositAmount: deposit,
          notes,
        },
      });
      toast.success(`Fermeture enregistrée — ${pos} · ${user.displayName}`, {
        description: `Cash ${fmt(cashHorsFond)} (écart ${fmt(ecartCash)}) · POS ${fmt(cloverPos)} (écart ${fmt(ecartPos)})`,
      });
      reset();
      queryClient.invalidateQueries({ queryKey: ["closures"] });
      await syncRaceFacer({ silent: true });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fermeture de caisse</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comptage physique par POS, rapprochement Clover / RaceFacer.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}><RotateCcw /> Réinitialiser</Button>
          <Button onClick={submit} disabled={submitting}>
            <Lock /> {submitting ? "Enregistrement…" : "Clôturer le shift"}
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="flex items-center gap-2 mb-1"><Store className="h-4 w-4" /> Point de vente</Label>
            <Select value={pos} onValueChange={setPos}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POS_LIST.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Employé</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {user.displayName}
            </div>
          </div>
          <div>
            <Label htmlFor="date" className="mb-1 block">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Cash attendu (RaceFacer)" value={fmt(rfCash)} hint="Depuis la dernière fermeture de ce POS" />
        <SummaryCard label="Cash compté" value={fmt(cashHorsFond)} hint={`Fond de caisse ${fmt(FOND_CAISSE)} exclu`} />
        <SummaryCard
          label="Écart cash"
          value={fmt(ecartCash)}
          hint={ecartCash === 0 ? "Équilibré" : ecartCash > 0 ? "Excédent" : "Manquant"}
          tone={ecartCash === 0 ? "success" : Math.abs(ecartCash) < 5 ? "warning" : "destructive"}
        />
        <SummaryCard
          label="Écart POS Terminal"
          value={fmt(ecartPos)}
          hint={`Clover ${fmt(cloverPos)} vs RaceFacer ${fmt(rfPos)}`}
          tone={ecartPos === 0 ? "success" : Math.abs(ecartPos) < 5 ? "warning" : "destructive"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Comptage physique</CardTitle>
            <CardDescription>Saisissez la quantité pour chaque coupure et pièce.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <DenomList title="Billets" items={DENOMS.filter((d) => d.type === "billet")} counts={counts} setCount={setCount} />
              <DenomList title="Pièces" items={DENOMS.filter((d) => d.type === "piece")} counts={counts} setCount={setCount} />
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total physique en caisse</span>
              <span className="text-lg font-semibold tabular-nums">{fmt(totalCompte)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileBarChart className="h-4 w-4" /> RaceFacer</CardTitle>
              <CardDescription>
                Sales Summary Report RaceFacer pour {pos}, {date}. Se synchronise automatiquement à l'ouverture de cette page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stationRow ? (
                <Badge variant="secondary" className="w-full justify-center py-1.5 text-xs">
                  Synchronisé à {new Date(stationRow.fetched_at).toLocaleTimeString("fr-CA")}
                </Badge>
              ) : (
                <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
                  {syncing || salesQuery.isLoading ? "Synchronisation…" : "Aucune donnée pour ce POS/date"}
                </Badge>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => syncRaceFacer()}
                disabled={syncing}
              >
                <RefreshCw className={syncing ? "animate-spin" : ""} />
                {syncing ? "Synchronisation…" : "Resynchroniser maintenant"}
              </Button>
              <div>
                <Label htmlFor="rf-cash">Cash RaceFacer</Label>
                <Input
                  id="rf-cash"
                  value={fmt(rfCash)}
                  disabled
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
              <div>
                <Label htmlFor="rf-pos">POS Terminal RaceFacer</Label>
                <Input
                  id="rf-pos"
                  value={fmt(rfPos)}
                  disabled
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Clover — montant perçu</CardTitle>
              <CardDescription>Total encaissé sur le terminal POS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="clover">Montant Clover</Label>
                <Input
                  id="clover"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={cloverPos || ""}
                  onChange={(e) => setCloverPos(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 tabular-nums"
                />
              </div>
              <Badge
                variant="secondary"
                className="w-full justify-center py-2"
              >
                Écart POS : {fmt(ecartPos)}
              </Badge>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Dépôt bancaire</CardTitle>
              <CardDescription>Montant remis en banque</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="depot">Montant du dépôt</Label>
                <Input
                  id="depot"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={deposit || ""}
                  onChange={(e) => setDeposit(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 tabular-nums"
                />
              </div>
              <Button variant="outline" className="w-full" onClick={() => setDeposit(cashHorsFond)}>
                Déposer la totalité
              </Button>
              <Badge variant="secondary" className="w-full justify-center py-2">
                Restant caisse : {fmt(Math.max(0, restant))}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Commentaire de clôture</CardTitle>
          <CardDescription>Justification en cas d'écart ou remarques.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : écart dû à un rendu-monnaie erroné sur ticket #4521…" rows={3} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function DenomList({
  title,
  items,
  counts,
  setCount,
}: {
  title: string;
  items: Denomination[];
  counts: Record<string, number>;
  setCount: (label: string, v: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div className="space-y-1.5">
        {items.map((d) => {
          const qty = counts[d.label] || 0;
          const sub = qty * d.value;
          return (
            <div key={d.label} className="grid grid-cols-[80px_1fr_110px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
              <span className="text-sm font-medium tabular-nums">{d.label}</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={qty || ""}
                onChange={(e) => setCount(d.label, e.target.value)}
                className="h-8 tabular-nums"
                placeholder="0"
              />
              <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(sub)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
