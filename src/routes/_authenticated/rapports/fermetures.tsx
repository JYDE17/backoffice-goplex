import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Eye, Printer } from "lucide-react";
import { getClosures } from "@/lib/closures";
import type { ClosureRow } from "@/lib/closures.server";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/rapports/fermetures")({
  head: () => ({ meta: [{ title: "Rapports — Fermetures — BackOffice" }] }),
  component: FermeturesReportPage,
});

const POS_LIST = ["Tous", "POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;

function FermeturesReportPage() {
  const runGetClosures = useServerFn(getClosures);
  const [date, setDate] = useState<string>(localDateString());
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
      <div className="flex items-start justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports — Fermetures</h1>
          <p className="text-sm text-muted-foreground mt-1">Fermetures de caisse et écarts, par date et par POS.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Imprimer / PDF
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)] print:hidden">
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

      <Card className="shadow-[var(--shadow-card)] print:shadow-none print:border-0">
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
                <TableHead>Autorisé par</TableHead>
                <TableHead>Heure</TableHead>
                <TableHead className="print:hidden" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {closuresQuery.isLoading ? "Chargement…" : "Aucune fermeture pour ces critères."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r: ClosureRow) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.closureDate}</TableCell>
                  <TableCell><Badge variant="outline">{r.stationName}</Badge></TableCell>
                  <TableCell>{r.employeeName}</TableCell>
                  <TableCell>{r.authorizedByName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.closedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/rapport/$id" params={{ id: String(r.id) }} search={{ print: false }}><Eye className="h-4 w-4" /></Link>
                    </Button>
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
