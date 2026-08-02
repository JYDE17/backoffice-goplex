import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  addEmployee,
  getEmployees,
  removeEmployeeFn,
  changeEmployeeRoleFn,
  resetEmployeePasswordFn,
} from "@/lib/auth";
import {
  hasAdminRights,
  canManageEmployees,
  canCreateOrRemoveRole,
  creatableRoles,
  roleLabel,
  effectiveRole,
  type EmployeeRole,
} from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/employes")({
  beforeLoad: ({ context }) => {
    if (!canManageEmployees(effectiveRole(context.user))) {
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
  const runChangeEmployeeRole = useServerFn(changeEmployeeRoleFn);
  const runResetPassword = useServerFn(resetEmployeePasswordFn);

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => runGetEmployees(),
  });

  // Only the roles this account is actually allowed to create (see
  // roles.ts's canCreateOrRemoveRole) - e.g. direction_cuisine only ever
  // sees "front_of_house" here, admin/directeur_general see everyone below
  // their own level. Uses effectiveRole so a dev previewing another role
  // sees the same dropdown that role would.
  const assignableRoles = creatableRoles(effectiveRole(currentUser));

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EmployeeRole>(assignableRoles[0]);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Force-reset dialog: which employee it targets, plus the two new-password
  // inputs. Authorization is enforced server-side (resetEmployeePassword);
  // the button is only shown when canManageRole is already true.
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword !== resetConfirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setResetting(true);
    try {
      await runResetPassword({ data: { employeeId: resetTarget.id, newPassword: resetPassword } });
      toast.success(`Mot de passe de "${resetTarget.name}" réinitialisé`);
      setResetTarget(null);
      setResetPassword("");
      setResetConfirm("");
    } catch (error) {
      toast.error("Échec de la réinitialisation", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setResetting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await runAddEmployee({ data: { username, password, displayName, role } });
      toast.success(`Employé "${displayName}" créé`);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole(assignableRoles[0]);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      toast.error("Échec de la création", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (employeeId: string, name: string, newRole: EmployeeRole) => {
    setChangingRoleId(employeeId);
    try {
      await runChangeEmployeeRole({ data: { employeeId, role: newRole } });
      toast.success(`Rôle de "${name}" changé pour ${roleLabel(newRole)}`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      toast.error("Échec du changement de rôle", {
        description: error instanceof Error ? error.message : "Erreur inconnue.",
      });
    } finally {
      setChangingRoleId(null);
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
                minLength={4}
              />
            </div>
            <div>
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as EmployeeRole)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
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
              {(employeesQuery.data ?? []).map((emp) => {
                // Same hierarchy as create/delete (canCreateOrRemoveRole) -
                // "dev"/"super_admin" accounts are never editable here (both
                // stay database-only, same as they're never offered in the
                // "add employee" dropdown).
                const canManageRole =
                  emp.id !== currentUser.id &&
                  emp.role !== "dev" &&
                  emp.role !== "super_admin" &&
                  canCreateOrRemoveRole(effectiveRole(currentUser), emp.role);
                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.username}</TableCell>
                    <TableCell>{emp.displayName}</TableCell>
                    <TableCell>
                      {canManageRole ? (
                        <Select
                          value={emp.role}
                          disabled={changingRoleId === emp.id}
                          onValueChange={(v) =>
                            handleChangeRole(emp.id, emp.displayName, v as EmployeeRole)
                          }
                        >
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((r) => (
                              <SelectItem key={r} value={r}>
                                {roleLabel(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={hasAdminRights(emp.role) ? "secondary" : "outline"}>
                          {roleLabel(emp.role)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(emp.createdAt).toLocaleDateString("fr-CA")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageRole && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Réinitialiser le mot de passe"
                            onClick={() => {
                              setResetPassword("");
                              setResetConfirm("");
                              setResetTarget({ id: emp.id, name: emp.displayName });
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Supprimer le compte"
                            disabled={removingId === emp.id}
                            onClick={() => handleRemove(emp.id, emp.displayName)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <form onSubmit={handleResetPassword}>
            <DialogHeader>
              <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
              <DialogDescription>
                Nouveau mot de passe pour « {resetTarget?.name} ». Ses sessions ouvertes seront
                déconnectées et il devra se reconnecter avec ce mot de passe.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="reset-password">Nouveau mot de passe</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reset-confirm">Confirmer le mot de passe</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={resetting}>
                {resetting ? "Réinitialisation…" : "Réinitialiser"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
