import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { getSessionsForReconciliationFn, forceCloseSessionFn } from "@/lib/sessions";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Sessions en cours — BackOffice" }] }),
  component: SessionsPage,
});

function fmt(n: number) {
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function SessionsPage() {
  const queryClient = useQueryClient();
  const runGetSessions = useServerFn(getSessionsForReconciliationFn);
  const runForceClose = useServerFn(forceCloseSessionFn);

  const sessionsQuery = useQuery({
    queryKey: ["reconciliation-sessions"],
    queryFn: () => runGetSessions(),
    refetchInterval: 30_000,
  });

  const openSessions = (sessionsQuery.data ?? []).filter((s) => s.status === "open");

  const forceClose = async (id: number) => {
    if (!window.confirm("Forcer la fermeture de cette session ? Elle tombera dans la file de réconciliation (comptage à faire) et le POS sera libre pour une nouvelle ouverture.")) return;
    try {
      await runForceClose({ data: { id } });
      toast.success("Session fermée — en attente de réconciliation");
      queryClient.invalidateQueries({ queryKey: ["reconciliation-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["open-sessions"] });
    } catch (error) {
      toast.error("Échec de la fermeture forcée", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions en cours</h1>
        <p className="text-sm text-muted-foreground mt-1">Caisses ouvertes par un CSR (touche F9), pas encore fermées.</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Sessions en cours ({openSessions.length})</CardTitle>
          <CardDescription>Une fois fermées (par le CSR ou forcées ici), elles apparaissent dans Réconciliation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS</TableHead>
                <TableHead>Ouvert par</TableHead>
                <TableHead className="text-right">Comptage initial</TableHead>
                <TableHead>Heure d'ouverture</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {openSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {sessionsQuery.isLoading ? "Chargement…" : "Aucune session en cours."}
                  </TableCell>
                </TableRow>
              )}
              {openSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Badge variant="secondary">{s.stationName}</Badge></TableCell>
                  <TableCell>{s.csrName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.openTotal)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.openedAt).toLocaleString("fr-CA")}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => forceClose(s.id)}>
                      <Lock /> Forcer la fermeture de session
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
