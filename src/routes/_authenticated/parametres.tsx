import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getSettingsFn, updateSettingsFn } from "@/lib/settings";
import { hasAdminRights } from "@/lib/roles";
import { getStoredPrinterName, setStoredPrinterName, listPrinters, printReceiptHtml } from "@/lib/qz-print";
import { buildClosureReceiptHtml } from "@/lib/receipt-html";
import { getStoredStation, setStoredStation, POS_LIST } from "@/lib/station";
import { localDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — BackOffice" }] }),
  component: ParamsPage,
});

function ParamsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const runGetSettings = useServerFn(getSettingsFn);
  const runUpdateSettings = useServerFn(updateSettingsFn);
  const isAdmin = hasAdminRights(user.role);

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

  const [qzStatus, setQzStatus] = useState<"idle" | "checking" | "connected" | "error">("idle");
  const [qzError, setQzError] = useState("");
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [testPrinting, setTestPrinting] = useState(false);
  const [station, setStation] = useState("");

  useEffect(() => {
    setSelectedPrinter(getStoredPrinterName());
    setStation(getStoredStation());
  }, []);

  const changeStation = (s: string) => {
    setStation(s);
    setStoredStation(s);
  };

  const detectQz = async () => {
    setQzStatus("checking");
    setQzError("");
    try {
      const found = await listPrinters();
      setPrinters(found);
      setQzStatus("connected");
      if (!selectedPrinter && found.length > 0) {
        setSelectedPrinter(found[0]);
        setStoredPrinterName(found[0]);
      }
    } catch (error) {
      setQzStatus("error");
      setQzError(
        error instanceof Error
          ? error.message
          : "Impossible de se connecter a QZ Tray. Verifie qu'il est lance sur ce poste.",
      );
    }
  };

  const choosePrinter = (name: string) => {
    setSelectedPrinter(name);
    setStoredPrinterName(name);
  };

  const testPrint = async () => {
    setTestPrinting(true);
    try {
      // Full-length fake receipt so a test also validates that long
      // receipts print completely (not just the first lines).
      await printReceiptHtml(
        buildClosureReceiptHtml({
          id: 0,
          closureDate: localDateString(),
          stationName: "POS TEST",
          employeeName: "Test",
          authorizedById: "",
          authorizedByName: user.displayName,
          fondCaisse: 300,
          cashHorsFond: 76.5,
          rfCashCumulative: 80,
          rfPosCumulative: 145,
          rfCashDelta: 80,
          rfPosDelta: 145,
          cloverPosAmount: 145,
          ecartCash: -3.5,
          ecartPos: 0,
          depositAmount: 76.5,
          notes: "Ceci est un test d'impression - aucune vraie fermeture.",
          counts: { "100 $": 1, "50 $": 2, "20 $": 5, "10 $": 3, "5 $": 4, "2 $": 6, "1 $": 8 },
          isTest: true,
          closedAt: new Date().toISOString(),
        }),
      );
      toast.success("Test envoye a l'imprimante");
    } catch (error) {
      toast.error("Echec du test d'impression", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setTestPrinting(false);
    }
  };

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

      {user.role === "dev" && (
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4" /> Imprimante reçu (ce poste)</CardTitle>
          <CardDescription>
            Impression automatique et silencieuse via QZ Tray, propre à cet ordinateur. Chaque poste a sa propre imprimante — ce réglage n'est pas partagé. Visible uniquement par le compte dev.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-1 block">Ce poste correspond à</Label>
            <Select value={station} onValueChange={changeStation}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Choisir le POS de ce poste" /></SelectTrigger>
              <SelectContent>
                {POS_LIST.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Utilisé comme POS par défaut sur la page de comptage CSR (touche F9) de cet ordinateur.
            </p>
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={detectQz} disabled={qzStatus === "checking"}>
              <RefreshCw className={qzStatus === "checking" ? "animate-spin" : ""} />
              {qzStatus === "checking" ? "Détection…" : "Détecter QZ Tray"}
            </Button>
            {qzStatus === "connected" && <Badge variant="secondary">QZ Tray connecté — {printers.length} imprimante(s)</Badge>}
            {qzStatus === "error" && <Badge variant="destructive">Non connecté</Badge>}
          </div>
          {qzStatus === "error" && <p className="text-sm text-destructive">{qzError}</p>}

          {printers.length > 0 && (
            <div>
              <Label className="mb-1 block">Imprimante</Label>
              <Select value={selectedPrinter} onValueChange={choosePrinter}>
                <SelectTrigger><SelectValue placeholder="Choisir une imprimante" /></SelectTrigger>
                <SelectContent>
                  {printers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedPrinter && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Imprimante active : {selectedPrinter}</Badge>
              <Button variant="outline" size="sm" onClick={testPrint} disabled={testPrinting}>
                {testPrinting ? "Impression…" : "Imprimer un test"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
