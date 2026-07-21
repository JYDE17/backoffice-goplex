import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { getDrawerOpeningsFn } from "@/lib/drawer-openings";
import { businessDateString } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/rapports/ouvertures-tiroir")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "rapportOuverturesTiroir")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Rapports — Ouvertures tiroir-caisse — BackOffice" }] }),
  component: OuverturesTiroirReportPage,
});

const POS_LIST = ["Tous", "POS 1", "POS 2", "POS 3", "POS 4", "POS 5"] as const;

function OuverturesTiroirReportPage() {
  const runGetOpenings = useServerFn(getDrawerOpeningsFn);
  const [date, setDate] = useState<string>(businessDateString());
  const [station, setStation] = useState<(typeof POS_LIST)[number]>("Tous");
  const [showAllDates, setShowAllDates] = useState(false);

  const openingsQuery = useQuery({
    queryKey: ["drawer-openings", showAllDates ? undefined : date, station],
    queryFn: () =>
      runGetOpenings({
        data: {
          date: showAllDates ? undefined : date,
          stationName: station === "Tous" ? undefined : station,
        },
      }),
  });

  const rows = openingsQuery.data ?? [];

  const exportCsv = () => {
    downloadCsv(
      `ouvertures-tiroir-${showAllDates ? "toutes-dates" : date}.csv`,
      ["Date", "Heure", "POS", "CSR"],
      rows.map((r) => [
        new Date(r.openedAt).toLocaleDateString("fr-CA"),
        new Date(r.openedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }),
        r.stationName,
        r.csrName,
      ]),
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rapports — Ouvertures tiroir-caisse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Historique des ouvertures du tiroir-caisse depuis le kiosk /session, par date et par
            POS.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download /> Exporter CSV
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="tiroir-date" className="mb-1 block">
              Date
            </Label>
            <Input
              id="tiroir-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={showAllDates}
              className="w-44"
            />
          </div>
          <div>
            <Label className="mb-1 block">Point de vente</Label>
            <Select
              value={station}
              onValueChange={(v) => setStation(v as (typeof POS_LIST)[number])}
            >
              <SelectTrigger className="w-40">
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
            {showAllDates ? "Toutes les ouvertures" : `Ouvertures du ${date}`} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Heure</TableHead>
                <TableHead>POS</TableHead>
                <TableHead>CSR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {openingsQuery.isLoading
                      ? "Chargement…"
                      : "Aucune ouverture pour ces critères."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {new Date(r.openedAt).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.openedAt).toLocaleTimeString("fr-CA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.stationName}</Badge>
                  </TableCell>
                  <TableCell>{r.csrName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
