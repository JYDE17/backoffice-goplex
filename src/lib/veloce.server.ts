// Server-only client for the Veloce POS API (api.posveloce.com) - fetches
// the restaurant's own sales totals by payment type, so /ventes-resto can be
// synced automatically instead of typed in by hand. Unlike RaceFacer, Veloce
// is cloud-hosted - no local network restriction.
import { getServerEnv } from "./env.server";
import { getUtcDayRange } from "./dates";

const API_BASE = "https://api.posveloce.com/v2";

// Same reasoning as clover.server.ts's VENUE_TIME_ZONE - Veloce's own report
// window has to match RaceFacer/Clover's midnight-to-midnight exactly, or a
// day's total would double-count or drop transactions at the boundary.
const VENUE_TIME_ZONE = "America/Toronto";

// Tender type names configured in Veloce for this location (GET
// /tenderTypes), confirmed against a real pull on 2026-07-14. Anything not
// listed here is neither cash nor card revenue landing in the physical drop
// box/terminal - tips (POURBOIRE), delivery apps settled directly by the
// platform (SKIP/UBER/DOORDASH), house accounts, gift cards, till
// adjustments, etc. - and is deliberately excluded from both totals.
const CASH_TENDER_TYPES = new Set(["COMPTANT"]);
const CARD_TENDER_TYPES = new Set([
  "VISA",
  "MASTERCARD",
  "AMEX",
  "INTERAC",
  "VISA MANUEL",
  "MASTERCARD MANUEL",
  "INTERAC MANUEL",
  "DEBIT CREDIT",
]);

async function authenticateVeloce(): Promise<string> {
  const email = getServerEnv("VELOCE_EMAIL");
  const password = getServerEnv("VELOCE_PASSWORD");

  const res = await fetch(`${API_BASE}/users/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`L'authentification Veloce a echoue (statut ${res.status}).`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token)
    throw new Error("La reponse d'authentification Veloce ne contenait pas de token.");
  return json.token;
}

export type VeloceSalesTotals = { cashAmount: number; cardAmount: number };

type TenderTypeSalesResponse = {
  content?: {
    sales?: { groupKeys?: { name?: string | null }; amount?: number }[];
  };
};

export async function fetchVeloceSalesByTenderType(isoDate: string): Promise<VeloceSalesTotals> {
  const token = await authenticateVeloce();
  const locationId = getServerEnv("VELOCE_LOCATION_ID");
  const { start, end } = getUtcDayRange(isoDate, VENUE_TIME_ZONE);

  const url = new URL(`${API_BASE}/sales/tenderTypes`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("currency", "CAD");
  url.searchParams.set("from", new Date(start).toISOString());
  url.searchParams.set("to", new Date(end).toISOString());
  url.searchParams.set("groupBy", "tenderTypeName");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`La requete de ventes Veloce a echoue (statut ${res.status}).`);
  }
  const json = (await res.json()) as TenderTypeSalesResponse;

  let cashAmount = 0;
  let cardAmount = 0;
  for (const sale of json.content?.sales ?? []) {
    const name = sale.groupKeys?.name;
    const amount = sale.amount ?? 0;
    if (!name) continue;
    if (CASH_TENDER_TYPES.has(name)) cashAmount += amount;
    else if (CARD_TENDER_TYPES.has(name)) cardAmount += amount;
  }
  return { cashAmount, cardAmount };
}

export type VeloceEmployeeTips = { employeeName: string; tips: number };

type NetSalesResponse = {
  content?: {
    sales?: { groupKeys?: { employeeName?: string | null }; tips?: number }[];
  };
};

// /sales/net is the only endpoint that can group by employee (/sales/tenderTypes
// only groups by location/date/revenueCenter/tenderTypeName) - each group's
// `tips` field is the tip amount for that employee, that day.
export async function fetchVeloceTipsByEmployee(isoDate: string): Promise<VeloceEmployeeTips[]> {
  const token = await authenticateVeloce();
  const locationId = getServerEnv("VELOCE_LOCATION_ID");
  const { start, end } = getUtcDayRange(isoDate, VENUE_TIME_ZONE);

  const url = new URL(`${API_BASE}/sales/net`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("currency", "CAD");
  url.searchParams.set("from", new Date(start).toISOString());
  url.searchParams.set("to", new Date(end).toISOString());
  url.searchParams.set("groupBy", "employeeName");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`La requete de pourboires Veloce a echoue (statut ${res.status}).`);
  }
  const json = (await res.json()) as NetSalesResponse;

  const results: VeloceEmployeeTips[] = [];
  for (const sale of json.content?.sales ?? []) {
    const employeeName = sale.groupKeys?.employeeName;
    const tips = sale.tips ?? 0;
    if (!employeeName || tips === 0) continue;
    results.push({ employeeName, tips });
  }
  return results;
}
