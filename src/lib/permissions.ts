// Per-page access control, layered on top of roles.ts. Admin/dev/super_admin/
// directeur_general/manager keep unrestricted access to every screen
// (hasAdminRights roles); "superviseur", "comptable", "direction_cuisine"
// and "front_of_house" are each limited to a fixed allow-list of pages
// below.
import { hasAdminRights, type EmployeeRole } from "./roles";

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
// no session/réconciliation/fermeture/ventes arcade (any "closing" action
// stays with superviseur/admin - comptable is read/finance access only).
const COMPTABLE_PAGES: readonly PageKey[] = [
  "ventesResto",
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

// Direction cuisine & front of house: restaurant (Véloce) side only - sales
// entry, the resto reports, and the resto half of récupération (see
// isRestoOnlyRole, used by recuperation.tsx to hide the karting drop-box
// section for these two roles specifically).
const RESTO_PAGES: readonly PageKey[] = [
  "ventesResto",
  "recuperation",
  "rapportVentesVeloce",
  "rapportPourboires",
];

export function canAccessPage(role: EmployeeRole, page: PageKey): boolean {
  if (hasAdminRights(role)) return true;
  if (role === "superviseur") return SUPERVISEUR_PAGES.includes(page);
  if (role === "comptable") return COMPTABLE_PAGES.includes(page);
  if (role === "direction_cuisine" || role === "front_of_house") return RESTO_PAGES.includes(page);
  return false;
}

// direction_cuisine and front_of_house are scoped to the restaurant only -
// used to swap in the dedicated resto dashboard (index.tsx) and to hide the
// karting drop-box section of /recuperation for them.
export function isRestoOnlyRole(role: EmployeeRole): boolean {
  return role === "direction_cuisine" || role === "front_of_house";
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
