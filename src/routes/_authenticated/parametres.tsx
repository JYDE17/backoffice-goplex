import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getSettingsFn, updateSettingsFn } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — BackOffice" }] }),
  component: ParamsPage,
});

function ParamsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const runGetSettings = useServerFn(getSettingsFn);
  const runUpdateSettings = useServerFn(updateSettingsFn);
  const isAdmin = user.role === "admin";

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runGetSettings(),
  });

  const [fondCaisse, setFondCaisse] = useState("");
  const [ecartThreshold, setEcartThreshold] = useState("");
  const [devise, setDevise] = useState("");
  const [defaultBankName, setDefaultBankName] = useState("");
  const [doubleValidation, setDoubleValidation] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setFondCaisse(String(settingsQuery.data.fondCaisse));
      setEcartThreshold(String(settingsQuery.data.ecartThreshold));
      setDevise(settingsQuery.data.devise);
      setDefaultBankName(settingsQuery.data.defaultBankName);
      setDoubleValidation(settingsQuery.data.doubleValidationCoffre);
    }
  }, [settingsQuery.data]);

  const save = async () => {
    setSaving(true);
    try {
      await runUpdateSettings({
        data: {
          fondCaisse: Math.max(0, Number(fondCaisse) || 0),
          ecartThreshold: Math.max(0, Number(ecartThreshold) || 0),
          devise,
          doubleValidationCoffre: doubleValidation,
          defaultBankName,
        },
      });
      toast.success("Paramètres enregistrés");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (error) {
      toast.error("Échec de l'enregistrement", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration du point de vente.</p>
      </div>
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Caisse</CardTitle>
          <CardDescription>
            Réglages du fond de caisse et des seuils.
            {!isAdmin && " Réservé aux admins pour modification."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Fond de caisse par défaut ($)</Label>
            <Input
              value={fondCaisse}
              onChange={(e) => setFondCaisse(e.target.value)}
              disabled={!isAdmin}
              type="number"
              min={0}
              step="0.01"
              className="mt-1 tabular-nums"
            />
          </div>
          <div>
            <Label>Seuil d'alerte écart ($)</Label>
            <Input
              value={ecartThreshold}
              onChange={(e) => setEcartThreshold(e.target.value)}
              disabled={!isAdmin}
              type="number"
              min={0}
              step="0.01"
              className="mt-1 tabular-nums"
            />
          </div>
          <div>
            <Label>Devise</Label>
            <Input value={devise} onChange={(e) => setDevise(e.target.value)} disabled={!isAdmin} className="mt-1" />
          </div>
          <div>
            <Label>Banque de dépôt par défaut</Label>
            <Input
              value={defaultBankName}
              onChange={(e) => setDefaultBankName(e.target.value)}
              disabled={!isAdmin}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Double validation coffre</div>
              <div className="text-xs text-muted-foreground">Exige un second utilisateur pour ouvrir le coffre.</div>
            </div>
            <Switch checked={doubleValidation} onCheckedChange={setDoubleValidation} disabled={!isAdmin} />
          </div>
          {isAdmin && (
            <div className="sm:col-span-2">
              <Button onClick={save} disabled={saving || settingsQuery.isLoading}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
