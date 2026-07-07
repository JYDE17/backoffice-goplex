import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, Wallet, TrendingUp, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

const stats = [
  { label: "Ventes du jour", value: "12 480,50 $", change: "+8,2%", icon: TrendingUp, tone: "success" as const },
  { label: "Cash attendu", value: "3 240,00 $", change: "Espèces", icon: Calculator, tone: "muted" as const },
  { label: "Dépôt en attente", value: "1 800,00 $", change: "À valider", icon: Wallet, tone: "warning" as const },
];

function Index() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d'ensemble des opérations de caisse — {new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button asChild className="shadow-[var(--shadow-card)]">
          <Link to="/fermeture">Démarrer la fermeture <ArrowRight className="ml-1" /></Link>
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-[var(--shadow-card)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>{s.label}</CardDescription>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.change}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="max-w-md shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Accès rapide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/fermeture">Fermeture de caisse <ArrowRight /></Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/depots">Nouveau dépôt bancaire <ArrowRight /></Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/coffre">Coffre-fort <ArrowRight /></Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to="/historique">Rapports <ArrowRight /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
