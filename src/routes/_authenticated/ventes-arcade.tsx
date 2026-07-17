import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Gamepad2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getArcadeSalesSinceLastRecuperationFn,
  createArcadeSaleFn,
  deleteArcadeSaleFn,
} from "@/lib/arcade-sales";
import { localDateString } from "@/lib/dates";
import {
  fmt,
  fmtEcart,
  ecartTone,
  arcadeZoutCashNet,
  arcadeZoutCardNet,
  arcadeCountedCashNet,
  arcadeCountedCardNet,
  arcadeEcart,
} from "@/lib/report-format";
import { canAccessPage } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/ventes-arcade")({
  beforeLoad: ({ context }) => {
    if (!canAccessPage(context.user.role, "ventesArcade")) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Ventes Arcade — BackOffice" }] }),
  component: VentesArcadePage,
});

type FormState = {
  saleDate: string;
  csrName: string;
  zoutCashPaid: number | "";
  zoutCashRefund: number | "";
  zoutCardPaid: number | "";
  zoutCardRefund: number | "";
  countedCashPaid: number | "";
  countedCashRefund: number | "";
  countedCardPaid: number | "";
  countedCardRefund: number | "";
};

function emptyForm(saleDate: string): FormState {
  return {
    saleDate,
    csrName: "",
    zoutCashPaid: "",
    zoutCashRefund: "",
    zoutCardPaid: "",
    zoutCardRefund: "",
    countedCashPaid: "",
    countedCashRefund: "",
    countedCardPaid: "",
    countedCardRefund: "",
  };
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 tabular-nums"
        placeholder="0"
      />
    </div>
  );
}

function VentesArcadePage() {
  const queryClient = useQueryClient();
  const runGetSince = useServerFn(getArcadeSalesSinceLastRecuperationFn);
  const runCreateSale = useServerFn(createArcadeSaleFn);
  const runDeleteSale = useServerFn(deleteArcadeSaleFn);

  const today = localDateString();
  const sinceQuery = useQuery({
    queryKey: ["arcade-sales-since-recuperation"],
    queryFn: () => runGetSince(),
  });
  // A shift entry can only be dated within the current récupération window
  // - anything older is either already swept, or predates arcade cash
  // sharing this drop box.
  const earliestDate = sinceQuery.data?.lastRecuperationDate ?? today;

  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const pendingEntries = useMemo(
    () =>
      (sinceQuery.data?.sales ?? [])
        .slice()
        .sort((a, b) =>
          a.saleDate === b.saleDate ? a.id - b.id : a.saleDate < b.saleDate ? -1 : 1,
        ),
    [sinceQuery.data],
  );

  const pendingTotals = useMemo(
    () =>
      pendingEntries.reduce(
        (acc, s) => ({
          zout: acc.zout + arcadeZoutCashNet(s) + arcadeZoutCardNet(s),
          counted: acc.counted + arcadeCountedCashNet(s) + arcadeCountedCardNet(s),
        }),
        { zout: 0, counted: 0 },
      ),
    [pendingEntries],
  );

  const setField = (field: keyof FormState, value: string) => {
    setForm((f) => ({
      ...f,
      [field]:
        field === "saleDate" || field === "csrName" ? value : value === "" ? "" : Number(value),
    }));
  };

  const formTotals = {
    zout:
      (form.zoutCashPaid || 0) -
      (form.zoutCashRefund || 0) +
      (form.zoutCardPaid || 0) -
      (form.zoutCardRefund || 0),
    counted:
      (form.countedCashPaid || 0) -
      (form.countedCashRefund || 0) +
      (form.countedCardPaid || 0) -
      (form.countedCardRefund || 0),
  };
  const formEcart = formTotals.counted - formTotals.zout;

  const handleSave = async () => {
    if (!form.saleDate || form.saleDate < earliestDate || form.saleDate > today) {
      toast.error(
        `La date doit être entre ${earliestDate} et ${today} (plage de la récupération en cours).`,
      );
      return;
    }
    const amounts = [
      form.zoutCashPaid,
      form.zoutCashRefund,
      form.zoutCardPaid,
      form.zoutCardRefund,
      form.countedCashPaid,
      form.countedCashRefund,
      form.countedCardPaid,
      form.countedCardRefund,
    ];
    if (amounts.some((a) => a !== "" && a < 0)) {
      toast.error("Les montants ne peuvent pas être négatifs.");
      return;
    }
    setSaving(true);
    try {
      await runCreateSale({
        data: {
          saleDate: form.saleDate,
          csrName: form.csrName,
          zoutCashPaid: Number(form.zoutCashPaid || 0),
          zoutCashRefund: Number(form.zoutCashRefund || 0),
          zoutCardPaid: Number(form.zoutCardPaid || 0),
          zoutCardRefund: Number(form.zoutCardRefund || 0),
          countedCashPaid: Number(form.countedCashPaid || 0),
          countedCashRefund: Number(form.countedCashRefund || 0),
          countedCardPaid: Number(form.countedCardPaid || 0),
          countedCardRefund: Number(form.countedCardRefund || 0),
        },
      });
      toast.success(`Entrée enregistrée pour le ${form.saleDate}`, {
        description: `Z-out : ${fmt(formTotals.zout)}`,
      });
      // Keep the same date selected (the next entry is often another shift
      // the same day) but blank every other field for the next entry.
      setForm(emptyForm(form.saleDate));
      queryClient.invalidateQueries({ queryKey: ["arcade-sales-since-recuperation"] });
      queryClient.invalidateQueries({ queryKey: ["pending-arcade-sales"] });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    setDeletingId(id);
    try {
      await runDeleteSale({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["arcade-sales-since-recuperation"] });
      queryClient.invalidateQueries({ queryKey: ["pending-arcade-sales"] });
    } catch (error) {
      toast.error("Échec de la suppression", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventes Arcade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Saisie manuelle par shift — ajoute une entrée à la fois, pour n'importe quelle date encore
          en attente de récupération CSR.
        </p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" /> Ajouter une entrée
          </CardTitle>
          <CardDescription>
            {sinceQuery.data?.lastRecuperationDate
              ? `Date au choix entre ${earliestDate} (dernière récupération CSR) et aujourd'hui. Z-out = vente attendue (rapport de la machine) ; Compté = montant physiquement compté.`
              : "Aucune récupération CSR enregistrée pour l'instant — date limitée à aujourd'hui."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="mb-1 block">Date</Label>
              <Input
                type="date"
                value={form.saleDate}
                min={earliestDate}
                max={today}
                onChange={(e) => setField("saleDate", e.target.value)}
                className="w-44"
              />
            </div>
            <div className="w-48">
              <Label className="mb-1 block">Nom du CSR</Label>
              <Input
                value={form.csrName}
                onChange={(e) => setField("csrName", e.target.value)}
                placeholder="Nom du CSR"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Z-out (vente attendue)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AmountField
                  label="Cash"
                  value={form.zoutCashPaid}
                  onChange={(v) => setField("zoutCashPaid", v)}
                />
                <AmountField
                  label="Remb. cash"
                  value={form.zoutCashRefund}
                  onChange={(v) => setField("zoutCashRefund", v)}
                />
                <AmountField
                  label="Carte"
                  value={form.zoutCardPaid}
                  onChange={(v) => setField("zoutCardPaid", v)}
                />
                <AmountField
                  label="Remb. carte"
                  value={form.zoutCardRefund}
                  onChange={(v) => setField("zoutCardRefund", v)}
                />
              </div>
              <div className="text-sm text-right">
                <span className="text-muted-foreground">Total </span>
                <span className="font-semibold tabular-nums">{fmt(formTotals.zout)}</span>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Montant reçu (compté)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AmountField
                  label="Cash"
                  value={form.countedCashPaid}
                  onChange={(v) => setField("countedCashPaid", v)}
                />
                <AmountField
                  label="Remb. cash"
                  value={form.countedCashRefund}
                  onChange={(v) => setField("countedCashRefund", v)}
                />
                <AmountField
                  label="Carte"
                  value={form.countedCardPaid}
                  onChange={(v) => setField("countedCardPaid", v)}
                />
                <AmountField
                  label="Remb. carte"
                  value={form.countedCardRefund}
                  onChange={(v) => setField("countedCardRefund", v)}
                />
              </div>
              <div className="text-sm text-right">
                <span className="text-muted-foreground">Total </span>
                <span className="font-semibold tabular-nums">{fmt(formTotals.counted)}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Débalancement </span>
              {Math.abs(formEcart) < 0.005 ? (
                <Badge variant="secondary" className="bg-success/15 text-success border-success/30">
                  Aucun
                </Badge>
              ) : (
                <span className={`font-semibold tabular-nums ${ecartTone(formEcart)}`}>
                  {fmtEcart(formEcart)}
                </span>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer cette entrée"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Entrées en attente de récupération CSR</CardTitle>
          <CardDescription>
            Chaque shift saisi depuis la dernière récupération CSR — plusieurs entrées possibles
            pour la même journée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>CSR</TableHead>
                <TableHead className="text-right">Z-out (attendu)</TableHead>
                <TableHead className="text-right">Compté</TableHead>
                <TableHead className="text-right">Débalancement</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {sinceQuery.isLoading ? "Chargement…" : "Aucune entrée en attente."}
                  </TableCell>
                </TableRow>
              )}
              {pendingEntries.map((s) => {
                const ecart = arcadeEcart(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.saleDate}</TableCell>
                    <TableCell>{s.csrName || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {fmt(arcadeZoutCashNet(s) + arcadeZoutCardNet(s))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(arcadeCountedCashNet(s) + arcadeCountedCardNet(s))}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${ecartTone(ecart)}`}>
                      {fmtEcart(ecart)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === s.id}
                        onClick={() => handleDelete(s.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pendingEntries.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(pendingTotals.zout)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(pendingTotals.counted)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${ecartTone(pendingTotals.counted - pendingTotals.zout)}`}
                  >
                    {fmtEcart(pendingTotals.counted - pendingTotals.zout)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
