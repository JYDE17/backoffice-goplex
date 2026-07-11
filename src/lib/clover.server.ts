// Server-only client for the Clover REST API (api.clover.com) — fetches
// payment totals per physical terminal (device) for a given day, so they can
// be matched to the right POS station via clover-terminals.ts. Unlike
// RaceFacer, Clover is cloud-hosted — no local network restriction.
import { getServerEnv } from "./env.server";

export type CloverDevice = {
  id: string;
  name?: string;
  serial?: string;
  model?: string;
};

export type CloverDeviceSales = {
  deviceId: string;
  paidTotal: number;
  count: number;
};

export type CloverSalesReport = {
  reportDate: string;
  devices: CloverDeviceSales[];
};

const VENUE_TIME_ZONE = "America/Toronto";

// Offset (ms) to add to a UTC instant to get that same instant's wall-clock
// reading in `timeZone` — used below to turn "YYYY-MM-DD" into the actual
// UTC start/end of that calendar day at the venue, DST-safe.
function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - utcMs;
}

function dayRangeMs(isoDate: string): { start: number; end: number } {
  const naiveUtc = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  const offset = getTimeZoneOffsetMs(naiveUtc, VENUE_TIME_ZONE);
  const start = naiveUtc - offset;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function cloverConfig() {
  return {
    baseUrl: getServerEnv("CLOVER_API_BASE_URL").replace(/\/$/, ""),
    merchantId: getServerEnv("CLOVER_MERCHANT_ID"),
    token: getServerEnv("CLOVER_API_TOKEN"),
  };
}

function cloverHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

export async function fetchCloverDevices(): Promise<CloverDevice[]> {
  const { baseUrl, merchantId, token } = cloverConfig();

  const res = await fetch(`${baseUrl}/v3/merchants/${merchantId}/devices`, {
    headers: cloverHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Clover devices request failed with status ${res.status}.`);
  }
  const json = (await res.json()) as { elements?: CloverDevice[] };
  return json.elements ?? [];
}

export async function fetchCloverSalesByDevice(isoDate: string): Promise<CloverSalesReport> {
  const { baseUrl, merchantId, token } = cloverConfig();
  const { start, end } = dayRangeMs(isoDate);

  const totals = new Map<string, { paidTotal: number; count: number }>();
  let offset = 0;
  const limit = 100;

  for (;;) {
    const url = new URL(`${baseUrl}/v3/merchants/${merchantId}/payments`);
    url.searchParams.append("filter", `createdTime>=${start}`);
    url.searchParams.append("filter", `createdTime<${end}`);
    url.searchParams.set("expand", "device");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { headers: cloverHeaders(token) });
    if (!res.ok) {
      throw new Error(`Clover payments request failed with status ${res.status}.`);
    }
    const json = (await res.json()) as {
      elements?: Array<{ amount: number; device?: { id: string }; result?: string }>;
    };
    const elements = json.elements ?? [];

    for (const payment of elements) {
      if (payment.result && payment.result !== "SUCCESS") continue;
      const deviceId = payment.device?.id;
      if (!deviceId) continue;
      const entry = totals.get(deviceId) ?? { paidTotal: 0, count: 0 };
      entry.paidTotal += payment.amount / 100;
      entry.count += 1;
      totals.set(deviceId, entry);
    }

    if (elements.length < limit) break;
    offset += limit;
  }

  const devices: CloverDeviceSales[] = [...totals.entries()].map(([deviceId, v]) => ({
    deviceId,
    paidTotal: v.paidTotal,
    count: v.count,
  }));

  return { reportDate: isoDate, devices };
}
