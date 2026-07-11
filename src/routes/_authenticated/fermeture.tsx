import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Calculator,
  Lock,
  RotateCcw,
  CreditCard,
  FileBarChart,
  Store,
  RefreshCw,
  PenLine,
} from "lucide-react";
import { getRaceFacerSales, syncRaceFacerSales } from "@/lib/racefacer-sync";
import { getCloverSales, syncCloverSales } from "@/lib/clover-sync";
import { submitClosure, getLastClosureSnapshot } from "@/lib/closures";
import { getSettingsFn } from "@/lib/settings";
import { getSessionFn, reconcileSessionFn, getOpenSessionsFn } from "@/lib/sessions";
import { DENOMS, ROLLS, rollsTotal, explodeRolls, type Denomination } from "@/lib/denominations";
import { businessDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/fermeture")({
  validateSearch: (search: Record<string, unknown>): { sessionId?: number } =>
    typeof search.sessionId === "number" ? { sessionId: search.sessionId } : {},
  head: () => ({
    meta: [
      { title: "Fermeture de caisse — BackOffice" },
      { name: "description", content: "Comptage et rapprochement de caisse en fin de journée." },
    ],
  }),
  component: FermeturePage,
});

const POS_LIST = ["POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;
const TODAY = businessDateString();

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function FermeturePage() {
  const { user } = Route.useRouteContext();
  const { sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const [pos, setPos] = useState<string>(POS_LIST[0]);
  const [employeeName, setEmployeeName] = useState<string>("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // super_admin-only escape hatch (deliberately NOT a regular admin
  // capability - see roles.ts): type in the RaceFacer/Clover figures
  // directly from the operator's own reports instead of trusting the live
  // sync, for catching up closures from before this integration existed or
  // was reliable, without waiting on Clover/RaceFacer at all.
  const canUseManualEntry = user.role === "super_admin";
  const [manualEntry, setManualEntry] = useState(false);
  const [manualRfCash, setManualRfCash] = useState(0);
  const [manualRfPos, setManualRfPos] = useState(0);
  const [manualCloverVente, setManualCloverVente] = useState(0);
  const [manualCloverRemb, setManualCloverRemb] = useState(0);

  const queryClient = useQueryClient();
  const runSync = useServerFn(syncRaceFacerSales);
  const runGetSales = useServerFn(getRaceFacerSales);
  const runSyncClover = useServerFn(syncCloverSales);
  const runGetCloverSales = useServerFn(getCloverSales);
  const runSubmitClosure = useServerFn(submitClosure);
  const runGetSettings = useServerFn(getSettingsFn);
  const runGetSession = useServerFn(getSessionFn);
  const runReconcileSession = useServerFn(reconcileSessionFn);
  const runGetLastSnapshot = useServerFn(getLastClosureSnapshot);
  const [syncing, setSyncing] = useState(false);
  const [syncingClover, setSyncingClover] = useState(false);

  // Arriving from /reconciliation: prefill the form with the CSR's
  // end-of-shift count so the supervisor only validates and adds the
  // Clover amount.
  const sessionQuery = useQuery({
    queryKey: ["shift-session", sessionId],
    queryFn: () => runGetSession({ data: { id: sessionId as number } }),
    enabled: sessionId !== undefined,
  });
  const session = sessionQuery.data;

  // A reopened/reconciled-late session (e.g. closed at 00h15, corrected the
  // next day) belongs to ITS OWN business day, not whatever "today" happens
  // to be when a supervisor gets around to redoing it - otherwise RaceFacer
  // and Clover would show the wrong day's totals entirely. Only a fresh
  // closure with no session context uses the current business day.
  const date =
    session && session.status === "closed" ? businessDateString(new Date(session.closedAt)) : TODAY;

  useEffect(() => {
    if (session && session.status === "closed") {
      setPos(session.stationName);
      setEmployeeName(session.closeCsrName || session.csrName);
      setCounts(session.closeCounts);
    }
  }, [session]);

  const runGetOpenSessions = useServerFn(getOpenSessionsFn);
  const openSessionsQuery = useQuery({
    queryKey: ["open-sessions"],
    queryFn: () => runGetOpenSessions(),
  });
  const openSessionOnPos = (openSessionsQuery.data ?? []).find((s) => s.stationName === pos);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runGetSettings(),
  });
  const FOND_CAISSE = settingsQuery.data?.fondCaisse ?? 300;
  const ECART_ALERT_THRESHOLD = settingsQuery.data?.ecartThreshold ?? 1;

  // A superviseur sometimes runs card-only Clover sales on a POS with no
  // cash drawer at all (no CSR session ever opened for it) - subtracting
  // the usual float would otherwise manufacture a fake cash écart every
  // time. Stored as this closure's own fondCaisse (0), not a global setting.
  const [noCashDrawer, setNoCashDrawer] = useState(false);
  const effectiveFondCaisse = noCashDrawer ? 0 : FOND_CAISSE;

  const salesQuery = useQuery({
    queryKey: ["racefacer-sales", date],
    queryFn: () => runGetSales({ data: { date } }),
    enabled: !manualEntry,
  });

  const stationRow = salesQuery.data?.rows.find((r) => r.station_name === pos);
  const rfCash = manualEntry ? manualRfCash : (stationRow?.cash_delta ?? 0);
  const rfPos = manualEntry ? manualRfPos : (stationRow?.pos_terminal_delta ?? 0);

  const cloverQuery = useQuery({
    queryKey: ["clover-sales", date],
    queryFn: () => runGetCloverSales({ data: { date } }),
    enabled: !manualEntry,
  });
  const cloverStationRow = cloverQuery.data?.rows.find((r) => r.station_name === pos);
  // Delta since the last closure of this POS (matches rfCash/rfPos above) -
  // paid_total/refund_total on the row are cumulative for the whole business
  // day, so using them directly here would repeat the same sales at every
  // closure of a POS closed more than once a day.
  const cloverVenteDelta = manualEntry ? manualCloverVente : (cloverStationRow?.paid_delta ?? 0);
  const cloverRembDelta = manualEntry ? manualCloverRemb : (cloverStationRow?.refund_delta ?? 0);
  const cloverPos = cloverVenteDelta - cloverRembDelta;

  // Only meaningful in manual mode - lets a manually-typed delta be turned
  // back into a cumulative snapshot for the NEXT closure's delta to chain
  // off (see getLastClosureSnapshot).
  const lastSnapshotQuery = useQuery({
    queryKey: ["last-closure-snapshot", date, pos],
    queryFn: () => runGetLastSnapshot({ data: { date, stationName: pos } }),
    enabled: manualEntry,
  });

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

  const syncClover = useCallback(
    async (opts?: { silent?: boolean }) => {
      setSyncingClover(true);
      try {
        const result = await runSyncClover({ data: { date } });
        queryClient.setQueryData(["clover-sales", date], { rows: result.rows });
        if (!opts?.silent) {
          toast.success("Données Clover synchronisées", {
            description: `Rapport du ${date} récupéré à ${new Date(result.syncedAt).toLocaleTimeString("fr-CA")}.`,
          });
        }
        if (result.unmatchedDeviceIds.length > 0) {
          toast.warning("Terminal(aux) Clover non reconnu(s)", {
            description: `Ajoute-le(s) à CLOVER_DEVICE_POS_MAP: ${result.unmatchedDeviceIds.join(", ")}`,
          });
        }
      } catch (error) {
        toast.error("Échec de la synchronisation Clover", {
          description: error instanceof Error ? error.message : "Erreur inconnue.",
        });
      } finally {
        setSyncingClover(false);
      }
    },
    [date, runSyncClover, queryClient],
  );

  // Auto-sync whenever this page is opened (arriving from another route/panel)
  // - skipped entirely in manual entry mode, which never touches RaceFacer/Clover.
  useEffect(() => {
    if (manualEntry) return;
    syncRaceFacer({ silent: true });
    syncClover({ silent: true });
  }, [manualEntry, syncRaceFacer, syncClover]);

  const totalCompte = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] || 0) * d.value, 0) + rollsTotal(rolls),
    [counts, rolls],
  );
  const cashHorsFond = totalCompte - effectiveFondCaisse;
  const ecartCash = cashHorsFond - rfCash;
  const ecartPos = cloverPos - rfPos;
  // Deposit is locked to the counted cash (fond excluded) - not editable.
  const deposit = Math.max(0, cashHorsFond);
  const restant = cashHorsFond - deposit;

  const setCount = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setCounts((c) => ({ ...c, [label]: n }));
  };

  const setRoll = (label: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setRolls((c) => ({ ...c, [label]: n }));
  };

  const reset = () => {
    setCounts({});
    setRolls({});
    setNotes("");
    setEmployeeName("");
    setManualRfCash(0);
    setManualRfPos(0);
    setManualCloverVente(0);
    setManualCloverRemb(0);
    setNoCashDrawer(false);
  };

  const submit = async () => {
    if (!manualEntry && !stationRow) {
      toast.error("Aucune donnée RaceFacer pour ce POS/date — synchronise d'abord.");
      return;
    }
    if (!manualEntry && !cloverStationRow) {
      toast.error("Aucune donnée Clover pour ce POS/date — synchronise d'abord.");
      return;
    }
    if (!employeeName) {
      toast.error("Sélectionne l'employé qui a travaillé ce POS avant de clôturer.");
      return;
    }

    let finalNotes = notes;
    const worstEcart = Math.max(Math.abs(ecartCash), Math.abs(ecartPos));
    if (worstEcart > ECART_ALERT_THRESHOLD && !finalNotes.trim()) {
      const reason = window.prompt(
        `Écart de ${fmt(worstEcart)} détecté (supérieur à ${fmt(ECART_ALERT_THRESHOLD)}). Indique la raison de ce débalancement pour continuer :`,
      );
      if (!reason || !reason.trim()) {
        toast.error(
          `Clôture annulée — une raison est obligatoire pour un écart de plus de ${fmt(ECART_ALERT_THRESHOLD)}.`,
        );
        return;
      }
      finalNotes = reason.trim();
      setNotes(finalNotes);
    }

    // Cumulative snapshots for the NEXT closure's delta to chain off. In sync
    // mode these come straight from the live cumulative totals; in manual
    // mode there's no live cumulative to read, so the typed-in delta is added
    // to whatever the previous closure for this station/date already had.
    const lastSnapshot = lastSnapshotQuery.data;
    const rfCashCumulative = manualEntry
      ? manualRfCash + (lastSnapshot?.rfCashCumulative ?? 0)
      : stationRow!.cash_total;
    const rfPosCumulative = manualEntry
      ? manualRfPos + (lastSnapshot?.rfPosCumulative ?? 0)
      : stationRow!.pos_terminal_total;
    const cloverPaidCumulative = manualEntry
      ? manualCloverVente + (lastSnapshot?.cloverPaidCumulative ?? 0)
      : (cloverStationRow?.paid_total ?? 0);
    const cloverRefundCumulative = manualEntry
      ? manualCloverRemb + (lastSnapshot?.cloverRefundCumulative ?? 0)
      : (cloverStationRow?.refund_total ?? 0);

    setSubmitting(true);
    try {
      const result = await runSubmitClosure({
        data: {
          sessionId,
          closureDate: date,
          stationName: pos,
          employeeName,
          fondCaisse: effectiveFondCaisse,
          cashHorsFond,
          rfCashCumulative,
          rfPosCumulative,
          rfCashDelta: rfCash,
          rfPosDelta: rfPos,
          cloverPosAmount: cloverPaidCumulative - cloverRefundCumulative,
          cloverPaidCumulative,
          cloverRefundCumulative,
          ecartCash,
          ecartPos,
          depositAmount: deposit,
          notes: finalNotes,
          counts: explodeRolls(counts, rolls),
        },
      });
      if (sessionId !== undefined) {
        try {
          await runReconcileSession({ data: { sessionId, closureId: result.id } });
          queryClient.invalidateQueries({ queryKey: ["reconciliation-sessions"] });
        } catch {
          toast.error(
            "Fermeture enregistrée, mais la session CSR n'a pas pu être marquée réconciliée.",
          );
        }
      }
      toast.success(`Fermeture enregistrée — ${pos} · ${employeeName}`, {
        description: `Cash ${fmt(cashHorsFond)} (écart ${fmt(ecartCash)}) · POS ${fmt(cloverPos)} (écart ${fmt(ecartPos)}) · Autorisé par ${user.displayName}`,
      });
      reset();
      queryClient.invalidateQueries({ queryKey: ["closures"] });
      await navigate({
        to: "/rapport/$id",
        params: { id: String(result.id) },
        search: { print: true },
      });
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
          {session && session.status === "closed" && (
            <Badge variant="secondary" className="mt-2">
              Réconciliation du shift de {session.closeCsrName || session.csrName} —{" "}
              {session.stationName} · comptage CSR {fmt(session.closeTotal)}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {canUseManualEntry && (
            <Button
              variant={manualEntry ? "default" : "outline"}
              onClick={() => setManualEntry((v) => !v)}
            >
              <PenLine /> {manualEntry ? "Saisie manuelle (activée)" : "Saisie manuelle"}
            </Button>
          )}
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Réinitialiser
          </Button>
          <Button onClick={submit} disabled={submitting}>
            <Lock /> {submitting ? "Enregistrement…" : "Clôturer le shift"}
          </Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="flex items-center gap-2 mb-1">
              <Store className="h-4 w-4" /> Point de vente
            </Label>
            <Select value={pos} onValueChange={setPos}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POS_LIST.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="employe" className="mb-1 block">
              Employé (POS)
            </Label>
            <Input
              id="employe"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Nom de l'employé"
            />
          </div>
          <div>
            <Label className="mb-1 block">Autorisé par</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {user.displayName}
            </div>
          </div>
          <div>
            <Label htmlFor="date" className="mb-1 block">
              Date
            </Label>
            <Input id="date" type="date" value={date} disabled className="tabular-nums" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Aucun tiroir-caisse pour cette fermeture</div>
              <div className="text-xs text-muted-foreground">
                Ventes Clover sans session CSR (ex : superviseur qui vend au comptant sans compter
                de tiroir) — met le fond de caisse à 0 $ pour éviter un faux écart cash.
              </div>
            </div>
            <Switch checked={noCashDrawer} onCheckedChange={setNoCashDrawer} />
          </div>
          {openSessionOnPos && !sessionId && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Badge variant="secondary">
                Session CSR en cours sur {pos} (ouverte par {openSessionOnPos.csrName} à{" "}
                {new Date(openSessionOnPos.openedAt).toLocaleTimeString("fr-CA", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                ) — cette clôture la fermera automatiquement.
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Cash attendu (RaceFacer)"
          value={fmt(rfCash)}
          hint="Depuis la dernière fermeture de ce POS"
        />
        <SummaryCard
          label="Cash compté"
          value={fmt(cashHorsFond)}
          hint={noCashDrawer ? "Aucun tiroir-caisse" : `Fond de caisse ${fmt(FOND_CAISSE)} exclu`}
        />
        <SummaryCard
          label="Écart cash"
          value={fmt(ecartCash)}
          hint={ecartCash === 0 ? "Équilibré" : ecartCash > 0 ? "Excédent" : "Manquant"}
          tone={
            ecartCash === 0
              ? "success"
              : Math.abs(ecartCash) < ECART_ALERT_THRESHOLD
                ? "warning"
                : "destructive"
          }
        />
        <SummaryCard
          label="Écart POS Terminal"
          value={fmt(ecartPos)}
          hint={`Clover ${fmt(cloverPos)} vs RaceFacer ${fmt(rfPos)}`}
          tone={
            ecartPos === 0
              ? "success"
              : Math.abs(ecartPos) < ECART_ALERT_THRESHOLD
                ? "warning"
                : "destructive"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Comptage physique
            </CardTitle>
            <CardDescription>Saisissez la quantité pour chaque coupure et pièce.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <DenomList
                title="Pièces"
                items={DENOMS.filter((d) => d.type === "piece")}
                counts={counts}
                setCount={setCount}
              />
              <div className="sm:border-l sm:pl-6">
                <DenomList
                  title="Billets"
                  items={DENOMS.filter((d) => d.type === "billet")}
                  counts={counts}
                  setCount={setCount}
                />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                Rouleaux
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {ROLLS.map((r) => {
                  const qty = rolls[r.label] || 0;
                  return (
                    <div
                      key={r.label}
                      className="grid grid-cols-[110px_1fr_110px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                    >
                      <span className="text-sm font-medium tabular-nums">
                        {r.label.replace("Rouleau ", "")}{" "}
                        <span className="text-muted-foreground font-normal">({fmt(r.value)})</span>
                      </span>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={qty || ""}
                        onChange={(e) => setRoll(r.label, e.target.value)}
                        className="h-8 tabular-nums"
                        placeholder="0"
                      />
                      <span className="text-sm text-right tabular-nums text-muted-foreground">
                        {fmt(qty * r.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Separator className="my-4" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total physique en caisse</span>
                <span className="text-lg font-semibold tabular-nums">{fmt(totalCompte)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Total pour dépôt (fond {fmt(effectiveFondCaisse)} exclu)
                </span>
                <span className="text-lg font-semibold tabular-nums">{fmt(cashHorsFond)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileBarChart className="h-4 w-4" /> RaceFacer
              </CardTitle>
              <CardDescription>
                {manualEntry
                  ? "Saisie manuelle activée — aucune synchronisation RaceFacer."
                  : `Sales Summary Report RaceFacer pour ${pos}, ${date}. Se synchronise automatiquement à l'ouverture de cette page.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!manualEntry &&
                (stationRow ? (
                  <Badge variant="secondary" className="w-full justify-center py-1.5 text-xs">
                    Synchronisé à {new Date(stationRow.fetched_at).toLocaleTimeString("fr-CA")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
                    {syncing || salesQuery.isLoading
                      ? "Synchronisation…"
                      : "Aucune donnée pour ce POS/date"}
                  </Badge>
                ))}
              {!manualEntry && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => syncRaceFacer()}
                  disabled={syncing}
                >
                  <RefreshCw className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Synchronisation…" : "Resynchroniser maintenant"}
                </Button>
              )}
              <div>
                <Label htmlFor="rf-cash">Cash RaceFacer</Label>
                <Input
                  id="rf-cash"
                  type={manualEntry ? "number" : "text"}
                  step="0.01"
                  inputMode="decimal"
                  value={manualEntry ? manualRfCash || "" : fmt(rfCash)}
                  disabled={!manualEntry}
                  onChange={(e) => setManualRfCash(Number(e.target.value) || 0)}
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
              <div>
                <Label htmlFor="rf-pos">POS Terminal RaceFacer</Label>
                <Input
                  id="rf-pos"
                  type={manualEntry ? "number" : "text"}
                  step="0.01"
                  inputMode="decimal"
                  value={manualEntry ? manualRfPos || "" : fmt(rfPos)}
                  disabled={!manualEntry}
                  onChange={(e) => setManualRfPos(Number(e.target.value) || 0)}
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Clover — montant perçu
              </CardTitle>
              <CardDescription>
                {manualEntry
                  ? "Saisie manuelle activée — aucune synchronisation Clover."
                  : `Total encaissé sur le terminal Clover de ${pos}, ${date}. Se synchronise automatiquement à l'ouverture de cette page.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!manualEntry &&
                (cloverStationRow ? (
                  <Badge variant="secondary" className="w-full justify-center py-1.5 text-xs">
                    Synchronisé à{" "}
                    {new Date(cloverStationRow.fetched_at).toLocaleTimeString("fr-CA")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
                    {syncingClover || cloverQuery.isLoading
                      ? "Synchronisation…"
                      : "Aucune donnée pour ce POS/date"}
                  </Badge>
                ))}
              {!manualEntry && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => syncClover()}
                  disabled={syncingClover}
                >
                  <RefreshCw className={syncingClover ? "animate-spin" : ""} />
                  {syncingClover ? "Synchronisation…" : "Resynchroniser maintenant"}
                </Button>
              )}
              <div>
                <Label htmlFor="clover-vente">Vente</Label>
                <Input
                  id="clover-vente"
                  type={manualEntry ? "number" : "text"}
                  step="0.01"
                  inputMode="decimal"
                  value={manualEntry ? manualCloverVente || "" : fmt(cloverVenteDelta)}
                  disabled={!manualEntry}
                  onChange={(e) => setManualCloverVente(Number(e.target.value) || 0)}
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
              <div>
                <Label htmlFor="clover-remboursement">Remboursement</Label>
                <Input
                  id="clover-remboursement"
                  type={manualEntry ? "number" : "text"}
                  step="0.01"
                  inputMode="decimal"
                  value={manualEntry ? manualCloverRemb || "" : fmt(cloverRembDelta)}
                  disabled={!manualEntry}
                  onChange={(e) => setManualCloverRemb(Number(e.target.value) || 0)}
                  className="mt-1 tabular-nums font-medium"
                />
              </div>
              <div>
                <Label htmlFor="clover-collecte">Montant Collecté</Label>
                <Input
                  id="clover-collecte"
                  value={fmt(cloverPos)}
                  disabled
                  className="mt-1 tabular-nums font-semibold"
                />
              </div>
              <Badge variant="secondary" className="w-full justify-center py-2">
                Écart POS : {fmt(ecartPos)}
              </Badge>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">Boîte à dépôt</CardTitle>
              <CardDescription>
                Bloqué automatiquement au cash compté (fond exclu). Sera ajouté au coffre-fort à la
                prochaine récupération.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div title="Montant verrouillé — égal au total pour dépôt">
                <Label htmlFor="depot">Montant pour la boîte à dépôt</Label>
                <Input
                  id="depot"
                  value={fmt(deposit)}
                  disabled
                  className="mt-1 tabular-nums cursor-not-allowed font-medium"
                />
              </div>
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
          <CardDescription>
            Justification en cas d'écart ou remarques. Obligatoire si l'écart dépasse{" "}
            {fmt(ECART_ALERT_THRESHOLD)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex : écart dû à un rendu-monnaie erroné sur ticket #4521…"
            rows={3}
          />
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
      <h3 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-1.5">
        {items.map((d) => {
          const qty = counts[d.label] || 0;
          const sub = qty * d.value;
          return (
            <div
              key={d.label}
              className="grid grid-cols-[80px_1fr_110px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
            >
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
              <span className="text-sm text-right tabular-nums text-muted-foreground">
                {fmt(sub)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
