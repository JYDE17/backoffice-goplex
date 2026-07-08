import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calculator, LogIn, Store, Sunrise, Sunset } from "lucide-react";
import { getOpenSessionsFn, openSessionFn, closeSessionFn } from "@/lib/sessions";
import { getStoredStation, setStoredStation, POS_LIST } from "@/lib/station";
import { DENOMS, ROLLS, rollsTotal, explodeRolls, type Denomination } from "@/lib/denominations";

export const Route = createFileRoute("/session")({
  head: () => ({ meta: [{ title: "Session de caisse — BackOffice" }] }),
  component: SessionPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function SessionPage() {
  const queryClient = useQueryClient();
  const runGetOpen = useServerFn(getOpenSessionsFn);
  const runOpen = useServerFn(openSessionFn);
  const runClose = useServerFn(closeSessionFn);

  const [station, setStation] = useState("");
  const [csrName, setCsrName] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"" | "ouverture" | "fermeture">("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setStation(getStoredStation() || POS_LIST[0]);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openQuery = useQuery({
    queryKey: ["open-sessions"],
    queryFn: () => runGetOpen(),
    refetchInterval: 30_000,
  });

  const openSessions = openQuery.data ?? [];
  const currentSession = openSessions.find((s) => s.stationName === station);
  // Auto-detected mode: a station with an open session can only be closed;
  // a station without one can only be opened.
  const mode: "ouverture" | "fermeture" = currentSession ? "fermeture" : "ouverture";

  const total = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] || 0) * d.value, 0) + rollsTotal(rolls),
    [counts, rolls],
  );

  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setCounts((c) => ({ ...c, [label]: n }));
  };

  const setRoll = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setRolls((c) => ({ ...c, [label]: n }));
  };

  const changeStation = (s: string) => {
    setStation(s);
    setStoredStation(s);
  };

  const submit = async () => {
    if (!csrName.trim()) {
      toast.error("Entre ton nom avant de soumettre.");
      return;
    }
    setSubmitting(true);
    try {
      // Rolls are exploded into individual coins at save time (TellerMate
      // style) - stored counts contain only plain denominations.
      const finalCounts = explodeRolls(counts, rolls);
      if (mode === "ouverture") {
        await runOpen({ data: { stationName: station, csrName: csrName.trim(), counts: finalCounts, total } });
      } else if (currentSession) {
        await runClose({ data: { sessionId: currentSession.id, csrName: csrName.trim(), counts: finalCounts, total } });
      }
      setDone(mode);
      queryClient.invalidateQueries({ queryKey: ["open-sessions"] });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setCsrName("");
    setCounts({});
    setRolls({});
    setDone("");
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-xl">
              {done === "ouverture" ? "Caisse ouverte ✓" : "Comptage de fermeture enregistré ✓"}
            </CardTitle>
            <CardDescription>
              {done === "ouverture"
                ? `${station} — bon shift !`
                : `${station} — remis au superviseur pour réconciliation.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={reset}>Nouvelle session</Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login" search={{ redirect: "/" }}><LogIn /> Connexion superviseur</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <img src="/assets/png/logo-icon.png" alt="BackOffice" className="h-10 w-10 object-contain" />
            <h1 className="text-2xl font-semibold tracking-tight">Session de caisse</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            {now.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} — {now.toLocaleTimeString("fr-CA")}
          </p>
        </div>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                {mode === "ouverture" ? <Sunrise className="h-4 w-4" /> : <Sunset className="h-4 w-4" />}
                {mode === "ouverture" ? "Ouverture de shift" : "Fermeture de shift"}
              </CardTitle>
              <Badge variant={mode === "ouverture" ? "secondary" : "default"}>
                {mode === "ouverture" ? "Début de journée / shift" : "Fin de shift"}
              </Badge>
            </div>
            <CardDescription>
              {mode === "ouverture"
                ? "Compte le tiroir avant de commencer ton shift."
                : currentSession
                  ? `Session ouverte par ${currentSession.csrName} à ${new Date(currentSession.openedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} — compte le tiroir pour fermer.`
                  : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="flex items-center gap-2 mb-1"><Store className="h-4 w-4" /> Point de vente</Label>
                <Select value={station} onValueChange={changeStation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POS_LIST.map((p) => {
                      const open = openSessions.some((s) => s.stationName === p);
                      return (
                        <SelectItem key={p} value={p}>
                          {p} {open ? "— session ouverte" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="csr-name" className="mb-1 block">Ton nom</Label>
                <Input
                  id="csr-name"
                  value={csrName}
                  onChange={(e) => setCsrName(e.target.value)}
                  placeholder="Prénom / identifiant"
                  autoFocus
                />
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Comptage du tiroir
              </h3>
              <div className="grid gap-6 sm:grid-cols-2">
                <DenomList title="Billets" items={DENOMS.filter((d) => d.type === "billet")} counts={counts} setCount={setCount} />
                <DenomList title="Pièces" items={DENOMS.filter((d) => d.type === "piece")} counts={counts} setCount={setCount} />
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Rouleaux</h4>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ROLLS.map((r) => {
                    const qty = rolls[r.label] || 0;
                    return (
                      <div key={r.label} className="grid grid-cols-[110px_1fr_100px] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40">
                        <span className="text-sm font-medium tabular-nums">{r.label.replace("Rouleau ", "")} <span className="text-muted-foreground font-normal">({fmt(r.value)})</span></span>
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={qty || ""}
                          onChange={(e) => setRoll(r.label, e.target.value)}
                          className="h-8 tabular-nums"
                          placeholder="0"
                        />
                        <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(qty * r.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total compté</span>
              <span className="text-2xl font-semibold tabular-nums">{fmt(total)}</span>
            </div>

            <Button className="w-full" size="lg" onClick={submit} disabled={submitting || openQuery.isLoading}>
              {submitting
                ? "Enregistrement…"
                : mode === "ouverture"
                  ? `Ouvrir ${station}`
                  : `Fermer ${station}`}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/login" search={{ redirect: "/" }}><LogIn /> Connexion superviseur / admin</Link>
          </Button>
        </div>
      </div>
    </div>
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
      <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">{title}</h4>
      <div className="space-y-1.5">
        {items.map((d) => {
          const qty = counts[d.label] || 0;
          return (
            <div key={d.label} className="grid grid-cols-[70px_1fr_100px] items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40">
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
              <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(qty * d.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
