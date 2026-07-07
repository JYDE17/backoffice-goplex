import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClosures } from "@/lib/closures";

export const Route = createFileRoute("/_authenticated/historique")({
  head: () => ({ meta: [{ title: "Historique — BackOffice" }] }),
  component: HistoriquePage,
});

const POS_LIST = ["Tous", "POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function fmtEcart(n: number) {
  const s = fmt(Math.abs(n));
  if (n === 0) return "0,00 $";
  return n > 0 ? `+${s}` : `-${s}`;
}

function HistoriquePage() {
  const runGetClosures = useServerFn(getClosures);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [station, setStation] = useState<(typeof POS_LIST)[number]>("Tous");
  const [showAllDates, setShowAllDates] = useState(false);

  const closuresQuery = useQuery({
    queryKey: ["closures", showAllDates ? undefined : date, station],
    queryFn: () =>
      runGetClosures({
        data: {
          date: showAllDates ? undefined : date,
          stationName: station === "Tous" ? undefined : station,
        },
      }),
  });

  const rows = closuresQuery.data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historique des fermetures</h1>
        <p className="text-sm text-muted-foreground mt-1">Consultez les fermetures de caisse par date et par POS.</p>
      </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {closuresQuery.isLoading ? "Chargement…" : "Aucune fermeture pour ces critères."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.closureDate}</TableCell>
                  <TableCell><Badge variant="outline">{r.stationName}</Badge></TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.rfCashDelta)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.cashHorsFond)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.ecartCash === 0 ? "text-success" : Math.abs(r.ecartCash) < 5 ? "text-warning" : "text-destructive"}`}>
                    {fmtEcart(r.ecartCash)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.ecartPos === 0 ? "text-success" : Math.abs(r.ecartPos) < 5 ? "text-warning" : "text-destructive"}`}>
                    {fmtEcart(r.ecartPos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.depositAmount)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
