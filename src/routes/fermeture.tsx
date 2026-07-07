import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calculator, Lock, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/fermeture")({
  head: () => ({
    meta: [
      { title: "Fermeture de caisse — Vision Caisse" },
      { name: "description", content: "Comptage et rapprochement de caisse en fin de journée." },
    ],
  }),
  component: FermeturePage,
});

type Denomination = { label: string; value: number; type: "billet" | "piece" };

const DENOMS: Denomination[] = [
  { label: "500 €", value: 500, type: "billet" },
  { label: "200 €", value: 200, type: "billet" },
  { label: "100 €", value: 100, type: "billet" },
  { label: "50 €", value: 50, type: "billet" },
  { label: "20 €", value: 20, type: "billet" },
  { label: "10 €", value: 10, type: "billet" },
  { label: "5 €", value: 5, type: "billet" },
  { label: "2 €", value: 2, type: "piece" },
  { label: "1 €", value: 1, type: "piece" },
  { label: "0,50 €", value: 0.5, type: "piece" },
  { label: "0,20 €", value: 0.2, type: "piece" },
  { label: "0,10 €", value: 0.1, type: "piece" },
  { label: "0,05 €", value: 0.05, type: "piece" },
  { label: "0,02 €", value: 0.02, type: "piece" },
  { label: "0,01 €", value: 0.01, type: "piece" },
];

const CASH_ATTENDU = 3240.0;
const FOND_CAISSE = 200.0;

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function FermeturePage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [deposit, setDeposit] = useState<number>(0);
  const [coffre, setCoffre] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const totalCompte = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] || 0) * d.value, 0),
    [counts],
  );
  const cashHorsFond = totalCompte - FOND_CAISSE;
  const ecart = cashHorsFond - CASH_ATTENDU;
  const restant = cashHorsFond - deposit - coffre;

  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setCounts((c) => ({ ...c, [label]: n }));
  };

  const reset = () => {
    setCounts({});
    setDeposit(0);
    setCoffre(0);
    setNotes("");
  };

  const submit = () => {
    toast.success("Fermeture enregistrée", {
      description: `Total compté ${fmt(totalCompte)} · Écart ${fmt(ecart)}`,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fermeture de caisse</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comptage physique, dépôt bancaire et scellement du coffre-fort.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}><RotateCcw /> Réinitialiser</Button>
          <Button onClick={submit}><Lock /> Clôturer la journée</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Cash attendu" value={fmt(CASH_ATTENDU)} hint="Selon les ventes espèces" />
        <SummaryCard label="Cash compté" value={fmt(cashHorsFond)} hint={`Fond de caisse ${fmt(FOND_CAISSE)} exclu`} />
        <SummaryCard
          label="Écart"
          value={fmt(ecart)}
          hint={ecart === 0 ? "Équilibré" : ecart > 0 ? "Excédent" : "Manquant"}
          tone={ecart === 0 ? "success" : Math.abs(ecart) < 5 ? "warning" : "destructive"}
        />
        <SummaryCard label="Restant caisse" value={fmt(Math.max(0, restant))} hint="Après dépôt et coffre" />
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
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Coffre-fort</CardTitle>
              <CardDescription>Montant scellé au coffre</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="coffre">Montant coffre</Label>
                <Input
                  id="coffre"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={coffre || ""}
                  onChange={(e) => setCoffre(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 tabular-nums"
                />
              </div>
              <Badge variant="secondary" className="w-full justify-center py-2">
                Solde après scellement : {fmt(Math.max(0, restant))}
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