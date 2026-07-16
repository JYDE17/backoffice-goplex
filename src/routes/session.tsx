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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { LogIn, Store, Sunrise, Sunset, Lock } from "lucide-react";
import { getOpenSessionsFn, getCsrNamesFn, openSessionFn, closeSessionFn } from "@/lib/sessions";
import { getStoredStation, setStoredStation, POS_LIST } from "@/lib/station";
import { DENOMS, rollsTotal, explodeRolls } from "@/lib/denominations";
import { CashCountingGrid } from "@/components/cash-counting-grid";
import { openCashDrawer } from "@/lib/qz-print";

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
  const runGetCsrNames = useServerFn(getCsrNamesFn);
  const runOpen = useServerFn(openSessionFn);
  const runClose = useServerFn(closeSessionFn);

  const [station, setStation] = useState("");
  const [csrName, setCsrName] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [openingDrawer, setOpeningDrawer] = useState(false);
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
  const csrNamesQuery = useQuery({
  queryKey: ["csr-names"],
  queryFn: () => runGetCsrNames(),
  staleTime: 5 * 60 * 1000,
  enabled: mode === "ouverture",
});

const csrNames = csrNamesQuery.data ?? [];

  // Carry the CSR's name from opening to closing the same station, so
  // whoever closes doesn't have to retype it. Keyed on the session id (not
  // the session object itself) so the 30s background refetch doesn't wipe
  // out what the CSR is actively typing - only a real station switch or the
  // initial load re-applies the prefill.
  // Deliberately keyed on the session id, not the name, so the 30s
  // background refetch doesn't overwrite text the CSR is actively typing.
  useEffect(() => {
    setCsrName(currentSession?.csrName ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, currentSession?.id]);

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
    if (mode === "ouverture" && !csrName.trim()) {
  toast.error("Sélectionne ton nom avant de soumettre.");
  return;
  }
    setSubmitting(true);
    try {
      // Rolls are exploded into individual coins at save time (TellerMate
      // style) - stored counts contain only plain denominations.
      const finalCounts = explodeRolls(counts, rolls);
      if (mode === "ouverture") {
        await runOpen({
          data: { stationName: station, csrName: csrName.trim(), counts: finalCounts, total },
        });
      } else if (currentSession) {
        await runClose({
          data: {
            sessionId: currentSession.id,
            counts: finalCounts,
            total,
          },
        });
      }
      setDone(mode);
      queryClient.invalidateQueries({ queryKey: ["open-sessions"] });
      if (mode === "ouverture") {
        // Browsers only allow a script to close a tab it opened itself
        // (window.open) - a tab launched via the F9 desktop shortcut
        // (explorer.exe) is a normal user tab, so this is typically a
        // no-op and the confirmation screen below stays as the fallback.
        window.close();
      }
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

  const handleOpenDrawer = async () => {
    setOpeningDrawer(true);
    try {
      await openCashDrawer(`${station} - ${csrName.trim() || "?"}`);
    } catch (error) {
      toast.error("Échec de l'ouverture du tiroir", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setOpeningDrawer(false);
    }
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
            <Button className="w-full" onClick={reset}>
              Nouvelle session
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login" search={{ redirect: "/" }}>
                <LogIn /> Connexion superviseur
              </Link>
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
            <img
              src="/assets/png/logo-icon.png"
              alt="BackOffice"
              className="h-10 w-10 object-contain"
            />
            <h1 className="text-2xl font-semibold tracking-tight">Session de caisse</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            {now.toLocaleDateString("fr-CA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            — {now.toLocaleTimeString("fr-CA")}
          </p>
        </div>

        <Button
          size="lg"
          className="w-full h-16 text-lg"
          onClick={handleOpenDrawer}
          disabled={openingDrawer}
        >
          <Lock className="h-5 w-5" /> {openingDrawer ? "Ouverture…" : "Ouvrir le tiroir-caisse"}
        </Button>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                {mode === "ouverture" ? (
                  <Sunrise className="h-4 w-4" />
                ) : (
                  <Sunset className="h-4 w-4" />
                )}
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
                <Label className="flex items-center gap-2 mb-1">
                  <Store className="h-4 w-4" /> Point de vente
                </Label>
                <Select value={station} onValueChange={changeStation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
  <Label className="mb-1 block">
    Nom du CSR
  </Label>

  {mode === "ouverture" ? (
    <>
      <Select
        value={csrName}
        onValueChange={setCsrName}
      >
        <SelectTrigger
          className="w-full"
          disabled={
            csrNamesQuery.isLoading ||
            csrNames.length === 0
          }
        >
          <SelectValue
            placeholder={
              csrNamesQuery.isLoading
                ? "Chargement des CSR…"
                : "Sélectionne ton nom"
            }
          />
        </SelectTrigger>

        <SelectContent>
          {csrNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {csrNamesQuery.isError && (
        <p className="mt-1 text-xs text-destructive">
          Impossible de charger la liste des CSR.
        </p>
      )}
    </>
  ) : (
    <div className="flex h-10 items-center justify-between rounded-md border bg-muted px-3 text-sm">
      <span className="font-medium">
        {currentSession?.csrName || "CSR inconnu"}
      </span>

      <Lock className="h-4 w-4 text-muted-foreground" />
    </div>
  )}
</div>
            </div>

            <Separator />

            <CashCountingGrid counts={counts} setCount={setCount} rolls={rolls} setRoll={setRoll} />

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total compté</span>
              <span className="text-2xl font-semibold tabular-nums">{fmt(total)}</span>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={submit}
              disabled={submitting || openQuery.isLoading}
            >
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
            <Link to="/login" search={{ redirect: "/" }}>
              <LogIn /> Connexion superviseur / admin
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
