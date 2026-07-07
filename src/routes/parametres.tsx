import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Vision Caisse" }] }),
  component: ParamsPage,
});

function ParamsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration du point de vente.</p>
      </div>
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Caisse</CardTitle>
          <CardDescription>Réglages du fond de caisse et des seuils.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Fond de caisse par défaut</Label>
            <Input defaultValue="200,00" className="mt-1" />
          </div>
          <div>
            <Label>Seuil d'alerte écart (€)</Label>
            <Input defaultValue="5,00" className="mt-1" />
          </div>
          <div>
            <Label>Devise</Label>
            <Input defaultValue="EUR (€)" className="mt-1" />
          </div>
          <div>
            <Label>Banque de dépôt</Label>
            <Input defaultValue="Crédit Agricole" className="mt-1" />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Double validation coffre</div>
              <div className="text-xs text-muted-foreground">Exige un second utilisateur pour ouvrir le coffre.</div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="sm:col-span-2">
            <Button>Enregistrer</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}