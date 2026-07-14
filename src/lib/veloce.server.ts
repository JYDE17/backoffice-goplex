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

// Not a real employee - Veloce's own code for tips left on group/party
// bookings with no server assigned (see rapports/pourboires.tsx).
const GROUP_TIP_CODE = "GOPLEX";
const TIP_TENDER_TYPE_NAME = "POURBOIRE";

async function fetchVeloceTenderTypeAmount(
  token: string,
  locationId: string,
  start: number,
  end: number,
  tenderTypeName: string,
): Promise<number> {
  const url = new URL(`${API_BASE}/sales/tenderTypes`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("currency", "CAD");
  url.searchParams.set("from", new Date(start).toISOString());
  url.searchParams.set("to", new Date(end).toISOString());
  url.searchParams.set("groupBy", "tenderTypeName");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`La requete de types de paiement Veloce a echoue (statut ${res.status}).`);
  }
  const json = (await res.json()) as TenderTypeSalesResponse;
  const match = (json.content?.sales ?? []).find((s) => s.groupKeys?.name === tenderTypeName);
  return match?.amount ?? 0;
}

// /sales/net is the only endpoint that can group by employee (/sales/tenderTypes
// only groups by location/date/revenueCenter/tenderTypeName) - each group's
// `tips` field is the tip amount for that employee, that day. But its `tips`
// field is documented by Veloce as always >= 0, so it can't reflect a
// negative correction the way /sales/tenderTypes' own POURBOIRE line can -
// confirmed empirically on 2026-07-09, where the raw GOPLEX (group-tip)
// value came back as exactly double the true amount after a duplicate-tip
// correction. So the group total isn't trusted directly: it's derived as
// (that day's total POURBOIRE amount, correctly signed) minus (the real
// employees' sum, which held up as reliable) - reproduced the true
// corrected figure exactly against that same day.
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
  let realEmployeesSum = 0;
  for (const sale of json.content?.sales ?? []) {
    const employeeName = sale.groupKeys?.employeeName;
    const tips = sale.tips ?? 0;
    if (!employeeName || tips === 0 || employeeName === GROUP_TIP_CODE) continue;
    results.push({ employeeName, tips });
    realEmployeesSum += tips;
  }

  const dayTotalTips = Math.abs(
    await fetchVeloceTenderTypeAmount(token, locationId, start, end, TIP_TENDER_TYPE_NAME),
  );
  const groupTips = dayTotalTips - realEmployeesSum;
  if (groupTips !== 0) results.push({ employeeName: GROUP_TIP_CODE, tips: groupTips });

  return results;
}

export type VeloceDaySummary = {
  grossSales: number;
  netSales: number;
  discounts: number;
  taxes: { taxName: string; amount: number }[];
  taxesTotal: number;
  tenderTypes: { name: string; amount: number }[];
};

type NetSalesTotalsResponse = {
  content?: {
    totals?: {
      grossSales?: number;
      netSales?: number;
      discounts?: number;
      taxSales?: { taxName?: string | null; amount?: number }[] | null;
    } | null;
  };
};

// A full daily "sommaire des ventes" - gross/net sales, discounts, taxes
// (from /sales/net, ungrouped so `totals` carries the whole day) and every
// tender type with sales that day (from /sales/tenderTypes, unfiltered -
// unlike fetchVeloceSalesByTenderType above, which only keeps Cash/Carte
// for the /ventes-resto reconciliation flow).
export async function fetchVeloceDaySummary(isoDate: string): Promise<VeloceDaySummary> {
  const token = await authenticateVeloce();
  const locationId = getServerEnv("VELOCE_LOCATION_ID");
  const { start, end } = getUtcDayRange(isoDate, VENUE_TIME_ZONE);
  const from = new Date(start).toISOString();
  const to = new Date(end).toISOString();

  const netUrl = new URL(`${API_BASE}/sales/net`);
  netUrl.searchParams.set("locationId", locationId);
  netUrl.searchParams.set("currency", "CAD");
  netUrl.searchParams.set("from", from);
  netUrl.searchParams.set("to", to);
  netUrl.searchParams.set("includeTotals", "true");
  netUrl.searchParams.set("includeTaxSales", "true");

  const netRes = await fetch(netUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!netRes.ok) {
    throw new Error(`La requete de ventes nettes Veloce a echoue (statut ${netRes.status}).`);
  }
  const netJson = (await netRes.json()) as NetSalesTotalsResponse;
  const totals = netJson.content?.totals;
  const taxes = (totals?.taxSales ?? [])
    .map((t) => ({ taxName: t.taxName ?? "", amount: t.amount ?? 0 }))
    .filter((t) => t.taxName);
  const taxesTotal = taxes.reduce((sum, t) => sum + t.amount, 0);

  const tenderUrl = new URL(`${API_BASE}/sales/tenderTypes`);
  tenderUrl.searchParams.set("locationId", locationId);
  tenderUrl.searchParams.set("currency", "CAD");
  tenderUrl.searchParams.set("from", from);
  tenderUrl.searchParams.set("to", to);
  tenderUrl.searchParams.set("groupBy", "tenderTypeName");

  const tenderRes = await fetch(tenderUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!tenderRes.ok) {
    throw new Error(
      `La requete de types de paiement Veloce a echoue (statut ${tenderRes.status}).`,
    );
  }
  const tenderJson = (await tenderRes.json()) as TenderTypeSalesResponse;
  const tenderTypes = (tenderJson.content?.sales ?? [])
    .map((s) => ({ name: s.groupKeys?.name ?? "", amount: s.amount ?? 0 }))
    .filter((t) => t.name);

  return {
    grossSales: totals?.grossSales ?? 0,
    netSales: totals?.netSales ?? 0,
    discounts: totals?.discounts ?? 0,
    taxes,
    taxesTotal,
    tenderTypes,
  };
}
