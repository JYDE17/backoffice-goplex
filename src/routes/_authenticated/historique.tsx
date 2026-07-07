import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye } from "lucide-react";
import { getClosures } from "@/lib/closures";
import type { ClosureRow } from "@/lib/closures.server";
import { getDepositsFn } from "@/lib/deposits";

export const Route = createFileRoute("/_authenticated/historique")({
  head: () => ({ meta: [{ title: "Rapports — BackOffice" }] }),
  component: RapportsPage,
});

const POS_LIST = ["Tous", "POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;
const WEEKS_BACK = 12;

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtEcart(n: number) {
  const s = fmt(Math.abs(n));
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${s}` : `-${s}`;
}

function ecartTone(n: number) {
  if (n === 0) return "text-success";
  return Math.abs(n) < 5 ? "text-warning" : "text-destructive";
}

function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekEnd(startStr: string): string {
  const d = new Date(`${startStr}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

function RapportsPage() {
  const runGetClosures = useServerFn(getClosures);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [station, setStation] = useState<(typeof POS_LIST)[number]>("Tous");
  const [showAllDates, setShowAllDates] = useState(false);
  const [view, setView] = useState<"fermetures" | "hebdo" | "depots">("fermetures");
  const runGetDeposits = useServerFn(getDepositsFn);

  const depositsQuery = useQuery({
    queryKey: ["deposits"],
    queryFn: () => runGetDeposits(),
    enabled: view === "depots",
  });

  const closuresQuery = useQuery({
    queryKey: ["closures", showAllDates ? undefined : date, station],
    queryFn: () =>
      runGetClosures({
        data: {
          date: showAllDates ? undefined : date,
          stationName: station === "Tous" ? undefined : station,
        },
      }),
    enabled: view === "fermetures",
  });

  const weeklyQuery = useQuery({
    queryKey: ["closures-weekly"],
    queryFn: () => runGetClosures({ data: { since: weeksAgo(WEEKS_BACK) } }),
    enabled: view === "hebdo",
  });

  const rows = closuresQuery.data ?? [];

  const weeklyGroups = useMemo(() => {
    const source = weeklyQuery.data ?? [];
    const groups = new Map<
      string,
      { weekStart: string; stationName: string; ecartCash: number; ecartPos: number; employees: Set<string> }
    >();
    for (const r of source) {
      const ws = weekStart(r.closureDate);
      const key = `${ws}|${r.stationName}`;
      const g = groups.get(key) ?? {
        weekStart: ws,
        stationName: r.stationName,
        ecartCash: 0,
        ecartPos: 0,
        employees: new Set<string>(),
      };
      g.ecartCash += r.ecartCash;
      g.ecartPos += r.ecartPos;
      g.employees.add(r.employeeName);
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  }, [weeklyQuery.data]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
          <p className="text-sm text-muted-foreground mt-1">Fermetures de caisse et écarts, par date, par POS et par semaine.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "fermetures" ? "default" : "outline"} onClick={() => setView("fermetures")}>
            Fermetures
          </Button>
          <Button variant={view === "hebdo" ? "default" : "outline"} onClick={() => setView("hebdo")}>
            Surplus/déficit hebdomadaire
          </Button>
          <Button variant={view === "depots" ? "default" : "outline"} onClick={() => setView("depots")}>
            Dépôts
          </Button>
        </div>
      </div>

      {view === "fermetures" && (
        <>
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="pt-6 flex flex-wrap items-end gap-4">
              <div>
                <Label htmlFor="hist-date" className="mb-1 block">Date</Label>
                <Input
                  id="hist-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={showAllDates}
                  className="w-44"
                />
              </div>
              <div>
                <Label className="mb-1 block">Point de vente</Label>
                <Select value={station} onValueChange={(v) => setStation(v as (typeof POS_LIST)[number])}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POS_LIST.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={showAllDates ? "default" : "outline"}
                onClick={() => setShowAllDates((v) => !v)}
              >
                {showAllDates ? "Revenir à une date" : "Toutes les dates"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-base">
                {showAllDates ? "Toutes les fermetures" : `Fermetures du ${date}`}
              </CardTitle>
              <CardDescription>Rapprochement cash et POS terminal, par employé et par POS.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>POS</TableHead>
                    <TableHead>Employé</TableHead>
                    <TableHead className="text-right">Cash RaceFacer</TableHead>
                    <TableHead className="text-right">Cash compté</TableHead>
                    <TableHead className="text-right">Écart cash</TableHead>
                    <TableHead className="text-right">Écart POS</TableHead>
                    <TableHead className="text-right">Dépôt</TableHead>
                    <TableHead>Heure</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        {closuresQuery.isLoading ? "Chargement…" : "Aucune fermeture pour ces critères."}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r: ClosureRow) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.closureDate}</TableCell>
                      <TableCell><Badge variant="outline">{r.stationName}</Badge></TableCell>
                      <TableCell>{r.employeeName}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.rfCashDelta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.cashHorsFond)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartCash)}`}>
                        {fmtEcart(r.ecartCash)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${ecartTone(r.ecartPos)}`}>
                        {fmtEcart(r.ecartPos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.depositAmount)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/rapport/$id" params={{ id: String(r.id) }}><Eye className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {view === "hebdo" && (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Surplus / déficit par semaine et par POS</CardTitle>
            <CardDescription>Dernières {WEEKS_BACK} semaines — somme des écarts cash et POS terminal par POS.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semaine</TableHead>
                  <TableHead>POS</TableHead>
                  <TableHead className="text-right">Écart cash total</TableHead>
                  <TableHead className="text-right">Écart POS total</TableHead>
                  <TableHead>Employés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {weeklyQuery.isLoading ? "Chargement…" : "Aucune fermeture sur cette période."}
                    </TableCell>
                  </TableRow>
                )}
                {weeklyGroups.map((g) => (
                  <TableRow key={`${g.weekStart}|${g.stationName}`}>
                    <TableCell className="font-medium">{g.weekStart} → {weekEnd(g.weekStart)}</TableCell>
                    <TableCell><Badge variant="outline">{g.stationName}</Badge></TableCell>
                    <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartCash)}`}>{fmtEcart(g.ecartCash)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${ecartTone(g.ecartPos)}`}>{fmtEcart(g.ecartPos)}</TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {Array.from(g.employees).map((name) => (
                        <Badge key={name} variant="secondary">{name}</Badge>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {view === "depots" && (
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">Dépôts bancaires</CardTitle>
            <CardDescription>Tous les dépôts effectués, avec le rapport détaillé de chacun.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Banque</TableHead>
                  <TableHead>Créé par</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(depositsQuery.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {depositsQuery.isLoading ? "Chargement…" : "Aucun dépôt enregistré."}
                    </TableCell>
                  </TableRow>
                )}
                {(depositsQuery.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.depositDate}</TableCell>
                    <TableCell>{d.bankName || "—"}</TableCell>
                    <TableCell>{d.createdByName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(d.totalAmount)}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/rapport-depot/$id" params={{ id: String(d.id) }}><Eye className="h-4 w-4" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
