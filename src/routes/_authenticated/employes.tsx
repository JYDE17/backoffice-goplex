import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addEmployee, getEmployees, removeEmployeeFn } from "@/lib/auth";
import { hasAdminRights, roleLabel } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/employes")({
  beforeLoad: ({ context }) => {
    if (!hasAdminRights(context.user.role)) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Employés — BackOffice" }] }),
  component: EmployesPage,
});

function EmployesPage() {
  const { user: currentUser } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const runGetEmployees = useServerFn(getEmployees);
  const runAddEmployee = useServerFn(addEmployee);
  const runRemoveEmployee = useServerFn(removeEmployeeFn);

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => runGetEmployees(),
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "superviseur">("superviseur");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await runAddEmployee({ data: { username, password, displayName, role } });
      toast.success(`Employé "${displayName}" créé`);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("superviseur");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      toast.error("Échec de la création", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (employeeId: string, name: string) => {
    if (!confirm(`Supprimer le compte de "${name}" ? Cette action est irréversible.`)) return;
    setRemovingId(employeeId);
    try {
      await runRemoveEmployee({ data: { employeeId } });
      toast.success(`Compte "${name}" supprimé`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      toast.error("Échec de la suppression", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employés</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestion des accès à BackOffice.</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Ajouter un employé
          </CardTitle>
          <CardDescription>Crée un nouveau compte de connexion à BackOffice.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-username">Identifiant</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-display-name">Nom affiché</Label>
              <Input
                id="new-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="new-password">Mot de passe</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
                minLength={8}
              />
            </div>
            <div>
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "superviseur")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="superviseur">Superviseur</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création…" : "Créer le compte"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Comptes existants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identifiant</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(employeesQuery.data ?? []).map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.username}</TableCell>
                  <TableCell>{emp.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={hasAdminRights(emp.role) ? "secondary" : "outline"}>
                      {roleLabel(emp.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(emp.createdAt).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell className="text-right">
                    {emp.id !== currentUser.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removingId === emp.id}
                        onClick={() => handleRemove(emp.id, emp.displayName)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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
