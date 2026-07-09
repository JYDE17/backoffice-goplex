import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CashCountingGrid } from "@/components/cash-counting-grid";
import { getOpenTestSessionsFn, openTestSessionFn, closeTestSessionFn } from "@/lib/sessions";
import { POS_LIST } from "@/lib/station";
import { DENOMS, rollsTotal, explodeRolls } from "@/lib/denominations";

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Dev-only: exercises the exact same kiosk flow as the public F9 page, but
// always saves is_test=true (see sessions.ts) - never visible to or mixed
// with real CSR sessions.
export function KioskTestDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: "ouverture" | "fermeture";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const runGetOpenTest = useServerFn(getOpenTestSessionsFn);
  const runOpenTest = useServerFn(openTestSessionFn);
  const runCloseTest = useServerFn(closeTestSessionFn);

  const [station, setStation] = useState<string>(POS_LIST[0]);
  const [csrName, setCsrName] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const openTestQuery = useQuery({
    queryKey: ["open-test-sessions"],
    queryFn: () => runGetOpenTest(),
    enabled: open,
  });
  const openTestSessions = useMemo(() => openTestQuery.data ?? [], [openTestQuery.data]);

  // Fermeture mode can only target a station with an open test session;
  // ouverture mode only makes sense on a station without one.
  const eligibleStations =
    mode === "fermeture"
      ? openTestSessions.map((s) => s.stationName)
      : POS_LIST.filter((p) => !openTestSessions.some((s) => s.stationName === p));

  const currentTestSession = openTestSessions.find((s) => s.stationName === station);

  // Reset the form each time the dialog opens, and default to the first
  // eligible station once the open-test-sessions list has loaded.
  useEffect(() => {
    if (!open) return;
    setCounts({});
    setRolls({});
    if (eligibleStations.length > 0) setStation(eligibleStations[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openTestQuery.data]);

  useEffect(() => {
    setCsrName(mode === "fermeture" ? (currentTestSession?.csrName ?? "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, mode, currentTestSession?.id]);

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

  const submit = async () => {
    if (!csrName.trim()) {
      toast.error("Entre un nom avant de soumettre.");
      return;
    }
    setSubmitting(true);
    try {
      const finalCounts = explodeRolls(counts, rolls);
      if (mode === "ouverture") {
        await runOpenTest({ data: { stationName: station, csrName: csrName.trim(), counts: finalCounts, total } });
        toast.success(`Session de test ouverte — ${station}`);
      } else if (currentTestSession) {
        await runCloseTest({
          data: { sessionId: currentTestSession.id, csrName: csrName.trim(), counts: finalCounts, total },
        });
        toast.success(`Session de test fermée — ${station}`);
      }
      queryClient.invalidateQueries({ queryKey: ["open-test-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["reconciliation-sessions"] });
      onOpenChange(false);
    } catch (error) {
      toast.error("Échec du test", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "ouverture" ? "Tester une ouverture" : "Tester une fermeture"}</DialogTitle>
          <DialogDescription>
            Même formulaire que le kiosque F9, mais sauvegardé comme donnée de test — invisible dans les vraies sessions/rapports.
          </DialogDescription>
        </DialogHeader>

        {mode === "fermeture" && eligibleStations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Aucune session de test ouverte. Utilise d'abord « Tester une ouverture ».
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block">Point de vente</Label>
                <Select value={station} onValueChange={setStation}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {eligibleStations.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="test-csr-name" className="mb-1 block">Nom</Label>
                <Input
                  id="test-csr-name"
                  value={csrName}
                  onChange={(e) => setCsrName(e.target.value)}
                  placeholder="Prénom / identifiant"
                />
              </div>
            </div>

            <CashCountingGrid counts={counts} setCount={setCount} rolls={rolls} setRoll={setRoll} />

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Total compté</span>
              <span className="text-xl font-semibold tabular-nums">{fmt(total)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={submitting || (mode === "fermeture" && eligibleStations.length === 0)}
          >
            {submitting ? "Enregistrement…" : mode === "ouverture" ? "Ouvrir (test)" : "Fermer (test)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
