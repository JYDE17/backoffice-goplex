// Per-page access control, layered on top of roles.ts. Admin/dev/super_admin
// keep unrestricted access to every screen (unchanged pre-existing
// behaviour); "superviseur" and "comptable" are each limited to a fixed
// allow-list of pages below.
import type { EmployeeRole } from "./roles";

export type PageKey =
  | "sessions"
  | "reconciliation"
  | "fermeture"
  | "ventesResto"
  | "ventesArcade"
  | "recuperation"
  | "coffre"
  | "depots"
  | "rapportVentesQuotidiennes"
  | "rapportFermetures"
  | "rapportOuverturesTiroir"
  | "rapportHebdomadaire"
  | "rapportMensuel"
  | "rapportVentesVeloce"
  | "rapportPourboires"
  | "rapportDepots"
  | "rapportCoffreFort"
  | "rapportDepotsBancaires";

// Superviseur: réconciliation, sessions en cours, rapport de fermeture, vente arcade,
// vente quotidienne, surplus/déficit - nothing coffre-fort/banque, no
// pourboires.
const SUPERVISEUR_PAGES: readonly PageKey[] = [
  "sessions",
  "reconciliation",
  "fermeture",
  "ventesArcade",
  "rapportVentesQuotidiennes",
  "rapportFermetures",
  "rapportOuverturesTiroir",
  "rapportHebdomadaire",
];

// Comptable: every report, plus everything coffre-fort/banque and resto -
// no session/réconciliation/fermeture (cash-handling operations stay with
// superviseur/admin).
const COMPTABLE_PAGES: readonly PageKey[] = [
  "ventesResto",
  "ventesArcade",
  "recuperation",
  "coffre",
  "depots",
  "rapportVentesQuotidiennes",
  "rapportFermetures",
  "rapportHebdomadaire",
  "rapportMensuel",
  "rapportVentesVeloce",
  "rapportPourboires",
  "rapportDepots",
  "rapportCoffreFort",
  "rapportDepotsBancaires",
];

export function canAccessPage(role: EmployeeRole, page: PageKey): boolean {
  if (role === "admin" || role === "dev" || role === "super_admin") return true;
  if (role === "superviseur") return SUPERVISEUR_PAGES.includes(page);
  if (role === "comptable") return COMPTABLE_PAGES.includes(page);
  return false;
}

// The "$id" detail routes below aren't in the sidebar directly - they're
// reached from whichever list page linked to them, so they're gated on
// access to either of that page's sources instead of their own key.
export function canAccessFermetureDetail(role: EmployeeRole): boolean {
  return canAccessPage(role, "reconciliation") || canAccessPage(role, "rapportFermetures");
}

export function canAccessDepotDetail(role: EmployeeRole): boolean {
  return canAccessPage(role, "recuperation") || canAccessPage(role, "rapportDepots");
}

export function canAccessDepotBancaireDetail(role: EmployeeRole): boolean {
  return canAccessPage(role, "depots") || canAccessPage(role, "rapportDepotsBancaires");
}
